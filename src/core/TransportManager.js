import { EventPackager } from './EventPackager.js';

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
        this.keyCache = new Map(); // nostrPubkey -> transportPubkey
        this.magnetCache = new Map(); // eventId -> magnetUri
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

        return new Promise((resolve) => {
            const filter = {
                authors: [nostrPubkey],
                kinds: [30078],
                '#d': ['nostr-over-bt-identity'],
                limit: 1
            };

            const timeout = setTimeout(() => resolve(null), 5000);

            this.transport.nostr.subscribe(filter, (event) => {
                if (event.content && event.content.length === 64) {
                    clearTimeout(timeout);
                    this.keyCache.set(nostrPubkey, event.content);
                    resolve(event.content);
                }
            });
        });
    }

    /**
     * Bootstraps the Web of Trust list directly from a user's P2P Feed.
     * This allows a client to "Sync Follows" without a relay.
     * 
     * @param {string} transportPubkey - The target user's P2P address.
     * @returns {Promise<void>}
     */
    async bootstrapWoTP2P(transportPubkey) {
        if (!this.wotManager) throw new Error("WoTManager not initialized.");
        
        console.log(`TransportManager: Bootstrapping WoT from P2P address ${transportPubkey}...`);
        
        const events = await this.subscribeP2P(transportPubkey);
        
        // Find latest Kind 3 (Contact List) in the P2P feed
        const contactList = events.find(e => e.kind === 3);
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
     * 1. Fetches follow lists for Degree 1.
     * 2. For each discovered user, fetches their follow list (Degree 2).
     * 3. Continues until maxDegree is reached.
     * 
     * @returns {Promise<void>}
     */
    async syncWoTRecursiveP2P() {
        if (!this.wotManager) throw new Error("WoTManager not initialized.");
        
        console.log(`TransportManager: Starting recursive WoT sync (Max Degree: ${this.wotManager.maxDegree})...`);

        for (let d = 1; d < this.wotManager.maxDegree; d++) {
            const currentNodes = this.wotManager.getPubkeysAtDegree(d);
            console.log(`TransportManager: Level ${d} has ${currentNodes.length} nodes. Fetching their follows (Level ${d+1})...`);

            const promises = currentNodes.map(async (pk) => {
                try {
                    const tpk = await this.resolveTransportKey(pk);
                    if (tpk) {
                        const events = await this.subscribeP2P(tpk);
                        const contactList = events.find(e => e.kind === 3);
                        if (contactList) {
                            const fullEventJson = await this.transport.bt.fetch(contactList.magnet);
                            const fullEvent = JSON.parse(fullEventJson.toString());
                            this.wotManager._parseContactList(fullEvent, d + 1);
                        }
                    }
                } catch {
                    // console.warn(`TransportManager: Failed to fetch follows for ${pk}`, e.message);
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
        if (!this.wotManager) throw new Error("WoTManager not initialized.");
        if (!this.feedManager) throw new Error("FeedManager not initialized.");

        const followPubkeys = Array.from(this.wotManager.follows.keys());
        if (followPubkeys.length === 0) return [];
        
        console.log(`TransportManager: Resolving P2P feeds for ${followPubkeys.length} follows (all degrees)...`);

        const allEvents = [];
        const resolvePromises = followPubkeys.map(async (npk) => {
            const tpk = await this.resolveTransportKey(npk);
            if (tpk) {
                const events = await this.subscribeP2P(tpk);
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
        if (!this.feedManager) throw new Error("FeedManager not initialized.");

        // 1. Seed the event content itself
        const eventBuffer = this.packager.package(event);
        const eventFilename = this.packager.getFilename(event);
        const eventMagnet = await this.transport.bt.publish({ buffer: eventBuffer, filename: eventFilename });

        // 2. Update the P2P Feed Index
        const indexMagnet = await this.feedManager.updateFeed(event, eventMagnet);
        
        return indexMagnet;
    }

    /**
     * Subscribes to a user's P2P feed (resolves DHT pointer).
     * @param {string} transportPubkey - The Transport Public Key (hex).
     * @returns {Promise<Array>} - List of recent events (metadata/pointers).
     */
    async subscribeP2P(transportPubkey) {
        if (!this.feedManager) throw new Error("FeedManager not initialized.");

        // 1. Resolve DHT Pointer
        let pointer;
        try {
            pointer = await this.feedManager.resolveFeedPointer(transportPubkey);
        } catch (e) {
            throw new Error(`DHT resolution failed: ${e.message}`);
        }

        if (!pointer) return [];

        // 2. Fetch Index Torrent
        const magnet = `magnet:?xt=urn:btih:${pointer.infoHash}`;
        try {
            const indexBuf = await this.transport.bt.fetch(magnet);
            const data = JSON.parse(indexBuf.toString());
            return data.items || [];
        } catch (e) {
            throw new Error(`Failed to fetch or parse P2P index: ${e.message}`);
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
            console.log(`TransportManager: Auto-seeding event ${event.id} from followed user ${event.pubkey}`);
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
            console.error("TransportManager: Relay publish failed. Aborting seed.", error);
            throw new Error("Relay publish failed. Seeding aborted.");
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
     * Optimization: Uses memory cache and background processing to prevent blocking.
     * 
     * @param {object} event - The Nostr event to seed.
     * @param {boolean} [background=true] - If true, resolves instantly while seeding in background.
     * @returns {Promise<string>} - The magnet URI (or cached URI).
     */
    async reseedEvent(event, background = true) {
        if (!event || !event.id) throw new Error("Invalid event for reseeding.");

        // 1. Instant Cache/Tag Check
        if (this.magnetCache.has(event.id)) return this.magnetCache.get(event.id);
        const existingBt = event.tags?.find(t => t[0] === 'bt');
        if (existingBt && existingBt[1]) {
            this.magnetCache.set(event.id, existingBt[1]);
            return existingBt[1];
        }

        // 2. Perform Hashing and DHT Announcement
        const performSeed = async () => {
            try {
                const buffer = this.packager.package(event);
                const filename = this.packager.getFilename(event);
                const magnetUri = await this.transport.bt.publish({ buffer, filename });
                this.magnetCache.set(event.id, magnetUri);
                
                // If we have a FeedManager (Relay mode), update the global index
                if (this.feedManager) {
                    await this.feedManager.updateFeed(event, magnetUri);
                }
                return magnetUri;
            } catch (err) {
                console.error(`TransportManager: Background seeding failed for ${event.id}:`, err.message);
                throw err;
            }
        };

        if (background) {
            // Kick off process but don't await result
            performSeed().catch(() => {}); 
            // Return a "likely" magnet if we can calculate it, or just resolve null for now
            // For now, we return a placeholder or the ID to signify "queued"
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
        const btTag = event.tags.find(t => t[0] === 'bt');
        const urlTag = event.tags.find(t => t[0] === 'url' || t[0] === 'image' || t[0] === 'video');

        const magnet = btTag ? btTag[1] : null;
        const url = urlTag ? urlTag[1] : null;

        if (magnet) {
            try {
                console.log(`TransportManager: Attempting to fetch media via BitTorrent: ${magnet}`);
                return await this.transport.bt.fetch(magnet);
            } catch (err) {
                console.warn("TransportManager: BT fetch failed, trying HTTP fallback...", err);
            }
        }

        if (url) {
            console.log(`TransportManager: Fetching media via HTTP: ${url}`);
            return "mock-http-data";
        }

        throw new Error("No media found (neither BT nor HTTP).");
    }
}
