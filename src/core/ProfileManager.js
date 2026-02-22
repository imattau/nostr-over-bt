import { LRUCache } from 'lru-cache';
import { logger } from '../utils/Logger.js';
import { Kinds, Limits } from '../Constants.js';

/**
 * ProfileManager handles fetching and caching of Nostr metadata (Kind 0).
 * Implements aggressive batching to avoid "Too many concurrent REQs" errors.
 */
export class ProfileManager {
    /**
     * @param {NostrTransport} nostrTransport 
     */
    constructor(nostrTransport) {
        this.nostr = nostrTransport;
        this.cache = new LRUCache({
            max: Limits.PROFILE_CACHE_SIZE,
            ttl: 1000 * 60 * 60 * 24 // 24 hours
        }); 
        this.pending = new Set(); 
        this.queue = new Set();   
        this.batchTimeout = null;
        this.BATCH_INTERVAL = Limits.BATCH_INTERVAL_MS;
        this.MAX_BATCH_SIZE = Limits.MAX_BATCH_SIZE;
    }

    getDisplayName(pubkey) {
        if (this.cache.has(pubkey)) {
            const profile = this.cache.get(pubkey);
            return profile.display_name || profile.name || pubkey.substring(0, 8);
        }
        return pubkey.substring(0, 8);
    }

    fetchProfile(pubkey) {
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

        // Split into chunks if too large
        for (let i = 0; i < allQueued.length; i += this.MAX_BATCH_SIZE) {
            const chunk = allQueued.slice(i, i + this.MAX_BATCH_SIZE);
            this._fetchChunk(chunk);
        }
    }

    _fetchChunk(pubkeys) {
        pubkeys.forEach(pk => this.pending.add(pk));
        logger.log(`Fetching chunk of ${pubkeys.length} profiles...`);

        // Use a one-shot subscription that closes after EOSE or timeout
        const sub = this.nostr.subscribe({
            authors: pubkeys,
            kinds: [Kinds.Metadata]
        }, (event) => {
            try {
                const profile = JSON.parse(event.content);
                this.cache.set(event.pubkey, profile);
                this.pending.delete(event.pubkey);
            } catch { /* skip */ }
        });

        // Close profile sub after 10s to free relay resources
        setTimeout(() => {
            if (sub && sub.close) sub.close();
            pubkeys.forEach(pk => this.pending.delete(pk));
        }, 10000);
    }
}
