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
        this.cache = new Map(); // transportPubkey -> latestMagnet
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

        console.log(`FeedTracker: Discovering magnet for ${transportPubkey.substring(0,8)}...`);

        let magnet = null;

        // 1. Try DHT (Safely)
        try {
            const dht = this.manager.transport.bt.getDHT();
            if (dht && this.manager.feedManager) {
                const ptr = await this.manager.feedManager.resolveFeedPointer(transportPubkey);
                if (ptr && ptr.infoHash) {
                    magnet = `magnet:?xt=urn:btih:${ptr.infoHash}`;
                }
            }
        } catch (e) {
            console.log("FeedTracker: DHT path not available, using Relay Bridge.");
        }

        // 2. Try Nostr Relay Bridge
        if (!magnet && this.manager.transport.nostr && nostrPubkey) {
            magnet = await new Promise((resolve) => {
                const filter = {
                    authors: [nostrPubkey],
                    kinds: [30078],
                    '#d': ['nostr-over-bt-feed'],
                    limit: 1
                };
                const timeout = setTimeout(() => resolve(null), 5000);
                this.manager.transport.nostr.subscribe(filter, (event) => {
                    if (event.content && event.content.startsWith('magnet:')) {
                        clearTimeout(timeout);
                        resolve(event.content);
                    }
                });
            });
        }

        if (magnet) {
            // OPTIMIZATION: Append trackers from the current transport to the magnet
            // This ensures we can find peers via our local/preferred trackers
            const announceList = this.manager.transport.bt.announce || [];
            for (const tracker of announceList) {
                if (!magnet.includes(encodeURIComponent(tracker))) {
                    magnet += `&tr=${encodeURIComponent(tracker)}`;
                }
            }
            this.cache.set(transportPubkey, magnet);
            return magnet;
        }

        return null;
    }
}
