import { LRUCache } from 'lru-cache';
import { logger } from '../utils/Logger.js';
import { Kinds, Limits } from '../Constants.js';

/**
 * RelayListManager fetches and caches Nostr relay list metadata (Kind 10002).
 */
export class RelayListManager {
    /**
     * @param {NostrTransport} nostrTransport
     * @param {object} [options={}]
     * @param {function} [options.onRelayList] - Called when relay list metadata is fetched and cached.
     */
    constructor(nostrTransport, options = {}) {
        this.nostr = nostrTransport;
        this.onRelayList = options.onRelayList || null;
        this.cache = new LRUCache({
            max: Limits.PROFILE_CACHE_SIZE,
            ttl: 1000 * 60 * 60 * 24
        });
        this.pending = new Set();
        this.queue = new Set();
        this.batchTimeout = null;
        this.BATCH_INTERVAL = Limits.BATCH_INTERVAL_MS;
        this.MAX_BATCH_SIZE = Limits.MAX_BATCH_SIZE;
    }

    getRelayList(pubkey) {
        if (this.cache.has(pubkey)) {
            return this.cache.get(pubkey);
        }
        return [];
    }

    fetchRelayList(pubkey) {
        if (this.cache.has(pubkey) || this.pending.has(pubkey) || this.queue.has(pubkey)) return;

        this.queue.add(pubkey);

        if (!this.batchTimeout) {
            this.batchTimeout = setTimeout(() => this._flushBatch(), this.BATCH_INTERVAL);
        }
    }

    _flushBatch() {
        if (this.queue.size === 0) return;

        const allQueued = Array.from(this.queue);
        this.queue.clear();
        this.batchTimeout = null;

        for (let i = 0; i < allQueued.length; i += this.MAX_BATCH_SIZE) {
            const chunk = allQueued.slice(i, i + this.MAX_BATCH_SIZE);
            this._fetchChunk(chunk);
        }
    }

    _fetchChunk(pubkeys) {
        pubkeys.forEach(pk => this.pending.add(pk));
        logger.log(`Fetching chunk of ${pubkeys.length} relay lists...`);

        const sub = this.nostr.subscribe({
            authors: pubkeys,
            kinds: [Kinds.RelayList || 10002],
            limit: 1
        }, (event) => {
            try {
                const relays = Array.isArray(event.tags)
                    ? event.tags
                        .filter(tag => tag[0] === 'r' && typeof tag[1] === 'string')
                        .map(tag => tag[1])
                    : [];
                this.cache.set(event.pubkey, relays);
                this.pending.delete(event.pubkey);
                if (this.onRelayList) {
                    this.onRelayList(event.pubkey, relays);
                }
            } catch (err) {
                logger.warn('Failed to parse relay list metadata.', err.message);
            }
        });

        setTimeout(() => {
            if (sub && sub.close) sub.close();
            pubkeys.forEach(pk => this.pending.delete(pk));
        }, 10000);
    }
}
