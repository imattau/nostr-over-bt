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

        // 1. Try DHT (Fastest if in Node)
        if (this.manager.feedManager) {
            try {
                const ptr = await this.manager.feedManager.resolveFeedPointer(transportPubkey);
                if (ptr && ptr.infoHash) {
                    const magnet = `magnet:?xt=urn:btih:${ptr.infoHash}`;
                    this.cache.set(transportPubkey, magnet);
                    return magnet;
                }
            } catch (e) {
                // DHT failed or not available (e.g. Browser)
            }
        }

        // 2. Try Nostr Relay Bridge (NIP-based discovery)
        // We look for a Kind 30078 event where the content or d-tag links to the magnet
        if (this.manager.transport.nostr && nostrPubkey) {
            return new Promise((resolve) => {
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
                        this.cache.set(transportPubkey, event.content);
                        resolve(event.content);
                    }
                });
            });
        }

        return null;
    }
}
