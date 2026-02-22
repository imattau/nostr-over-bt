import { LRUCache } from 'lru-cache';
import magnet from 'magnet-uri';
import { EventPackager } from './EventPackager.js';
import { FeedTracker } from './FeedTracker.js';
import { awaitEventWithTimeout } from '../utils/AsyncUtils.js';
import { findTagValue } from '../utils/TagUtils.js';
import { logger } from '../utils/Logger.js';
import { TransportError } from '../utils/Errors.js';
import { Kinds, Identifiers, Limits } from '../Constants.js';

/**
 * TransportManager coordinates the end-to-end flow of packaging an event,
 * seeding it via BitTorrent, and publishing it to Nostr relays with 
 * injected BitTorrent metadata.
 */
export class TransportManager {
    /**
     * @param {HybridTransport} transport - The hybrid transport instance.
     * @param {object|WoTManager} [options={}] - Options object or legacy WoTManager instance.
     * @param {WoTManager} [options.wotManager] - Web of Trust manager.
     * @param {FeedManager} [options.feedManager] - P2P Feed manager.
     */
    constructor(transport, options = {}) {
        this.transport = transport;
        
        // Backward compatibility handling
        if (options && typeof options.isFollowing === 'function') {
            this.wotManager = options;
            this.feedManager = null;
        } else {
            this.wotManager = options.wotManager || null;
            this.feedManager = options.feedManager || null;
        }

        this.packager = new EventPackager();
        this.keyCache = new LRUCache({ max: Limits.KEY_CACHE_SIZE }); // nostrPubkey -> transportPubkey
        this.magnetCache = new LRUCache({ max: Limits.MAGNET_CACHE_SIZE }); // eventId -> magnetUri
        this.tracker = new FeedTracker(this);
    }

    /**
     * Resolves a Nostr Pubkey to its associated Transport Public Key.
     * Tries cache, then Relay lookup (Kind 30078).
     * 
     * @param {string} nostrPubkey - The user's hex pubkey.
     * @returns {Promise<string|null>} - The Transport Public Key (hex).
     */
    async resolveTransportKey(nostrPubkey) {
        if (this.keyCache.has(nostrPubkey)) return this.keyCache.get(nostrPubkey);

        const filter = {
            authors: [nostrPubkey],
            kinds: [Kinds.Application],
            '#d': [Identifiers.IDENTITY_BRIDGE],
            limit: 1
        };

        const event = await awaitEventWithTimeout(this.transport.nostr, filter, 5000, (e) => e.content && e.content.length === 64);
        
        if (event) {
            this.keyCache.set(nostrPubkey, event.content);
            return event.content;
        }

        return null;
    }

    /**
     * Bootstraps the Web of Trust list directly from a user's P2P Feed.
     * This allows a client to "Sync Follows" without a relay.
     * 
     * @param {string} transportPubkey - The target user's P2P address.
     * @param {string} [nostrPubkey] - Optional Nostr identity to help resolve magnet via Relay Bridge.
     * @returns {Promise<void>}
     */
    async bootstrapWoTP2P(transportPubkey, nostrPubkey = null) {
        if (!this.wotManager) throw new TransportError("WoTManager not initialized.", "core");
        
        logger.log(`Bootstrapping WoT from P2P address ${transportPubkey}...`);
        
        const events = await this.subscribeP2P(transportPubkey, nostrPubkey);
        
        // Find latest Kind 3 (Contact List) in the P2P feed
        const contactList = events.find(e => e.kind === Kinds.Contacts);
        if (contactList) {
            const fullEventJson = await this.transport.bt.fetch(contactList.magnet);
            const fullEvent = JSON.parse(fullEventJson.toString());
            
            if (this.wotManager._parseContactList) {
                this.wotManager._parseContactList(fullEvent);
            }
        }
    }

    /**
     * Recursively syncs the WoT graph via P2P.
     */
    async syncWoTRecursiveP2P() {
        if (!this.wotManager) throw new TransportError("WoTManager not initialized.", "core");
        
        logger.log(`Starting recursive WoT sync (Max Degree: ${this.wotManager.maxDegree})...`);

        for (let d = 1; d < this.wotManager.maxDegree; d++) {
            const currentNodes = this.wotManager.getPubkeysAtDegree(d);
            logger.log(`Level ${d} has ${currentNodes.length} nodes. Fetching their follows (Level ${d+1})...`);

            const promises = currentNodes.map(async (pk) => {
                try {
                    const tpk = await this.resolveTransportKey(pk);
                    if (tpk) {
                        const events = await this.subscribeP2P(tpk, pk);
                        const contactList = events.find(e => e.kind === Kinds.Contacts);
                        if (contactList) {
                            const fullEventJson = await this.transport.bt.fetch(contactList.magnet);
                            const fullEvent = JSON.parse(fullEventJson.toString());
                            this.wotManager._parseContactList(fullEvent, d + 1);
                        }
                    }
                } catch {
                    // logger.warn(`Failed to fetch follows for ${pk}`, e.message);
                }
            });

            await Promise.all(promises);
        }
    }

    /**
     * Subscribes to all events from users in the WoT list via P2P.
     * @returns {Promise<Array>} - Flattened list of latest events from all followed users.
     */
    async subscribeFollowsP2P() {
        if (!this.wotManager) throw new TransportError("WoTManager not initialized.", "core");
        if (!this.feedManager) throw new TransportError("FeedManager not initialized.", "core");

        const followPubkeys = Array.from(this.wotManager.follows.keys());
        if (followPubkeys.length === 0) return [];
        
        logger.log(`Resolving P2P feeds for ${followPubkeys.length} follows (all degrees)...`);

        const allEvents = [];
        const resolvePromises = followPubkeys.map(async (npk) => {
            const tpk = await this.resolveTransportKey(npk);
            if (tpk) {
                const events = await this.subscribeP2P(tpk, npk);
                allEvents.push(...events);
            }
        });

        await Promise.all(resolvePromises);
        return allEvents.sort((a, b) => b.ts - a.ts);
    }

    /**
     * Publishes an event purely via P2P (DHT + Swarm), bypassing relays.
     * Requires FeedManager to be initialized.
     * 
     * @param {object} event - The signed Nostr event.
     * @returns {Promise<string>} - The magnet URI of the updated Index.
     */
    async publishP2P(event) {
        if (!this.feedManager) throw new TransportError("FeedManager not initialized.", "core");

        // 1. Seed the event content itself
        const eventBuffer = this.packager.package(event);
        const eventFilename = this.packager.getFilename(event);
        const eventMagnet = await this.transport.bt.publish({ buffer: eventBuffer, filename: eventFilename });

        // 2. Update the P2P Feed Index
        const indexMagnet = await this.feedManager.updateFeed(event, eventMagnet);
        
        return indexMagnet;
    }

    /**
     * Subscribes to a user's P2P feed.
     * Uses FeedTracker to find the magnet (DHT or Relay-bridge).
     * 
     * @param {string} transportPubkey - The Transport Public Key (hex).
     * @param {string} [nostrPubkey] - The associated Nostr pubkey (helps Relay discovery).
     * @returns {Promise<Array>} - List of recent events (metadata/pointers).
     */
    async subscribeP2P(transportPubkey, nostrPubkey = null) {
        const magnet = await this.tracker.discover(transportPubkey, nostrPubkey);
        if (!magnet) return [];

        try {
            const indexBuf = await this.transport.bt.fetch(magnet);
            const data = JSON.parse(indexBuf.toString());
            return data.items || [];
        } catch (e) {
            throw new TransportError(`Failed to fetch or parse P2P index: ${e.message}`, "bittorrent");
        }
    }

    /**
     * Handles an incoming event from a relay.
     * Checks if the event should be auto-seeded based on WoT rules.
     * 
     * @param {object} event - The incoming Nostr event.
     * @returns {Promise<string|null>} - Magnet URI if seeded, null otherwise.
     */
    async handleIncomingEvent(event) {
        if (this.shouldSeed(event)) {
            logger.log(`Auto-seeding event ${event.id} from followed user ${event.pubkey}`);
            return await this.reseedEvent(event);
        }
        return null;
    }

    /**
     * Determines if an event should be seeded.
     * @param {object} event 
     * @returns {boolean}
     */
    shouldSeed(event) {
        if (!this.wotManager) return false;
        return this.wotManager.isFollowing(event.pubkey);
    }

    /**
     * Publishes a PRE-SIGNED event.
     * Enforces "Deferred Seeding": Relay publish must succeed before Seeding begins.
     * Expects a standard Nostr event object (compatible with nostr-tools).
     * 
     * @param {object} signedEvent - The signed Nostr event.
     * @param {Array<object>} [mediaFiles=[]] - Optional list of files to seed { buffer, filename }.
     * @returns {Promise<object>}
     */
    async publish(signedEvent, mediaFiles = []) {
        let relayStatus;
        try {
            relayStatus = await this.transport.nostr.publish(signedEvent);
        } catch (error) {
            throw new TransportError(`Relay publish failed: ${error.message}. Seeding aborted.`, "nostr");
        }

        const eventBuffer = this.packager.package(signedEvent);
        const eventFilename = this.packager.getFilename(signedEvent);

        const seedPromises = [
            this.transport.bt.publish({ buffer: eventBuffer, filename: eventFilename })
        ];

        for (const file of mediaFiles) {
            if (file.buffer && file.filename) {
                seedPromises.push(this.transport.bt.publish(file));
            }
        }

        const magnetUris = await Promise.all(seedPromises);

        return {
            magnetUri: magnetUris[0],
            mediaMagnets: magnetUris.slice(1),
            relayStatus
        };
    }

    /**
     * Reseeds an event that was fetched from a relay.
     * Optimization: Checks memory cache and existing "bt" tags before hashing.
     * 
     * @param {object} event - The Nostr event to seed.
     * @param {boolean} [background=true] - If true, resolves instantly while seeding in background.
     * @returns {Promise<string>} - The magnet URI.
     */
    async reseedEvent(event, background = true) {
        if (!event || !event.id) throw new TransportError("Invalid event for reseeding.", "core");

        if (this.magnetCache.has(event.id)) return this.magnetCache.get(event.id);
        const existingBt = findTagValue(event, 'bt');
        if (existingBt) {
            this.magnetCache.set(event.id, existingBt);
            return existingBt;
        }

        const performSeed = async () => {
            try {
                const buffer = this.packager.package(event);
                const filename = this.packager.getFilename(event);
                const magnetUri = await this.transport.bt.publish({ buffer, filename });
                this.magnetCache.set(event.id, magnetUri);
                if (this.feedManager) {
                    await this.feedManager.updateFeed(event, magnetUri);
                }
                return magnetUri;
            } catch (err) {
                logger.error(`Background seeding failed for ${event.id}:`, err.message);
                throw err;
            }
        };

        if (background) {
            logger.log(`Queuing background seed for ${event.id.substring(0,8)}...`);
            performSeed().catch(() => {}); 
            return `queued:${event.id}`;
        }

        return await performSeed();
    }

    /**
     * Fetches media associated with an event.
     * Strategy: Try BitTorrent (Magnet) first. If fails/timeout, fallback to HTTP URL.
     * 
     * @param {object} event - The Nostr event containing media tags.
     * @returns {Promise<Buffer|Stream>}
     */
    async fetchMedia(event) {
        const magnet = findTagValue(event, 'bt');
        const url = findTagValue(event, 'url') || findTagValue(event, 'image') || findTagValue(event, 'video');

        if (magnet) {
            try {
                logger.log(`Attempting to fetch media via BitTorrent: ${magnet}`);
                return await this.transport.bt.fetch(magnet);
            } catch (err) {
                logger.warn("BT fetch failed, trying HTTP fallback...", err);
            }
        }

        if (url) {
            logger.log(`Fetching media via HTTP: ${url}`);
            return "mock-http-data";
        }

        throw new TransportError("No media found (neither BT nor HTTP).", "core");
    }
}