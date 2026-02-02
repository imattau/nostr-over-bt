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

    async disconnect() {
        this.pool.close(this.relays);
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
     */
    subscribe(filter, onEvent) {
        // In nostr-tools v2, subscribeMany takes an array of filters
        return this.pool.subscribeMany(this.relays, [filter], {
            onevent(event) {
                onEvent(event);
            }
        });
    }
}
