import { ITransport } from '../interfaces/ITransport.js';
// Intent: Use 'nostr-tools' for actual relay communication.
// import { SimplePool } from 'nostr-tools'; 

export class NostrTransport extends ITransport {
    constructor(relays = []) {
        super();
        this.relays = relays;
        // this.pool = new SimplePool();
    }

    async connect() {
        console.log(`NostrTransport: Connecting to [${this.relays.join(', ')}]...`);
    }

    async disconnect() {
        console.log("NostrTransport: Disconnecting...");
        // this.pool.close(this.relays);
    }

    async publish(event) {
        console.log("NostrTransport: Publishing event", event);
        return "mock-relay-id";
    }

    async subscribe(filter, _onEvent) {
        console.log("NostrTransport: Subscribing with filter", filter);
    }
}
