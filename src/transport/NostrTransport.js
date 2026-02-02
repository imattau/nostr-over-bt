import { ITransport } from '../interfaces/ITransport.js';
import { SimplePool } from 'nostr-tools/pool';

/**
 * NostrTransport implements relay-based communication using nostr-tools.
 */
export class NostrTransport extends ITransport {
    constructor(relays = []) {
        super();
        this.relays = relays;
        this.pool = new SimplePool();
    }

    async connect() {}

    /**
     * Closes connections to all relays in the pool.
     */
    async disconnect() {
        try {
            // In nostr-tools v2, we should remove individual relays to close their connections properly
            for (const url of this.relays) {
                this.pool.close([url]);
            }
        } catch (e) {
            console.warn("NostrTransport: Error during disconnect", e.message);
        }
    }

    addRelay(url) {
        if (!this.relays.includes(url)) {
            this.relays.push(url);
        }
    }

    removeRelay(url) {
        this.relays = this.relays.filter(r => r !== url);
    }

    async publish(event) {
        try {
            await Promise.any(this.pool.publish(this.relays, event));
            return event.id;
        } catch (err) {
            throw new Error(`NostrTransport: Publish failed: ${err.message}`);
        }
    }

    /**
     * Subscribes to events from relays.
     * Note: nostr-tools v2 subscribeMany takes a single Filter object, not an array.
     */
    subscribe(filter, onEvent) {
        // Ensure we pass a single clean object
        const cleanFilter = Array.isArray(filter) ? filter[0] : filter;
        
        return this.pool.subscribeMany(this.relays, cleanFilter, {
            onevent(event) {
                onEvent(event);
            }
        });
    }
}
