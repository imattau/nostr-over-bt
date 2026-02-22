import { LRUCache } from 'lru-cache';
import * as magnet from 'magnet-uri';
import { awaitEventWithTimeout } from '../utils/AsyncUtils.js';
import { logger } from '../utils/Logger.js';
import { Kinds, Identifiers } from '../Constants.js';

/**
 * FeedTracker handles the discovery of P2P feed magnets.
 * It provides a bridge for browsers by using Nostr relays to discover 
 * the magnets that would normally be found via DHT.
 */
export class FeedTracker {
    /**
     * @param {TransportManager} transportManager 
     */
    constructor(transportManager) {
        this.manager = transportManager;
        this.cache = new LRUCache({ max: 1000 }); // transportPubkey -> latestMagnet
    }

    /**
     * Discovers the latest magnet for a user's feed.
     * Strategy:
     * 1. Try DHT (if available/Node.js).
     * 2. Try Nostr Relay (Kind 30078) as fallback/Browser bridge.
     * 
     * @param {string} transportPubkey - The P2P address.
     * @param {string} [nostrPubkey] - Optional Nostr identity to help relay lookup.
     * @returns {Promise<string|null>}
     */
    async discover(transportPubkey, nostrPubkey = null) {
        if (this.cache.has(transportPubkey)) return this.cache.get(transportPubkey);

        logger.log(`Discovering magnet for ${transportPubkey.substring(0,8)}...`);

        let magnetUri = null;

        // 1. Try DHT (Safely)
        try {
            const dht = this.manager.transport.bt.getDHT();
            if (dht && this.manager.feedManager) {
                const ptr = await this.manager.feedManager.resolveFeedPointer(transportPubkey);
                if (ptr && ptr.infoHash) {
                    magnetUri = magnet.encode({
                        infoHash: ptr.infoHash
                    });
                }
            }
        } catch (e) {
            logger.log("DHT path not available, using Relay Bridge.");
        }

        // 2. Try Nostr Relay Bridge
        if (!magnetUri && this.manager.transport.nostr && nostrPubkey) {
            const filter = {
                authors: [nostrPubkey],
                kinds: [Kinds.Application],
                '#d': [Identifiers.FEED_BRIDGE],
                limit: 1
            };
            const event = await awaitEventWithTimeout(this.manager.transport.nostr, filter, 5000, (e) => e.content && e.content.startsWith('magnet:'));
            if (event) {
                magnetUri = event.content;
            }
        }

        if (magnetUri) {
            // OPTIMIZATION: Append trackers from the current transport to the magnet
            // This ensures we can find peers via our local/preferred trackers
            const announceList = this.manager.transport.bt.announce || [];
            if (announceList.length > 0) {
                const parsed = magnet.decode(magnetUri);
                const trackers = Array.isArray(parsed.tr) ? parsed.tr : (parsed.tr ? [parsed.tr] : []);
                
                for (const tracker of announceList) {
                    if (!trackers.includes(tracker)) {
                        trackers.push(tracker);
                    }
                }
                
                parsed.tr = trackers;
                magnetUri = magnet.encode(parsed);
            }
            
            this.cache.set(transportPubkey, magnetUri);
            return magnetUri;
        }

        return null;
    }
}
