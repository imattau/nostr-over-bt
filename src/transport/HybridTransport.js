import { ITransport } from '../interfaces/ITransport.js';

/**
 * HybridTransport coordinates communication between the Nostr network (Relays)
 * and the BitTorrent network (DHT/Swarm).
 * It implements the ITransport interface by delegating to specific transport instances.
 */
export class HybridTransport extends ITransport {
    /**
     * @param {ITransport} nostrTransport - Transport for Nostr Relays.
     * @param {ITransport} btTransport - Transport for BitTorrent.
     */
    constructor(nostrTransport, btTransport) {
        super();
        this.nostr = nostrTransport;
        this.bt = btTransport;
    }

    /**
     * Connects both transports.
     * @returns {Promise<void>}
     */
    async connect() {
        await Promise.all([this.nostr.connect(), this.bt.connect()]);
    }

    /**
     * Disconnects both transports.
     * @returns {Promise<void>}
     */
    async disconnect() {
        await Promise.all([this.nostr.disconnect(), this.bt.disconnect()]);
    }

    /**
     * Publishes to both networks.
     * @param {object} event 
     * @returns {Promise<object>} - { relayId, magnet }
     */
    async publish(event) {
        // Hybrid logic placeholder
        const relayId = await this.nostr.publish(event);
        const magnet = await this.bt.publish(event);
        return { relayId, magnet };
    }

    /**
     * Subscribes to both networks (delegated).
     * @param {object} filter 
     * @param {function} onEvent 
     * @returns {Promise<void>}
     */
    async subscribe(filter, onEvent) {
        await this.nostr.subscribe(filter, onEvent);
        await this.bt.subscribe(filter, onEvent);
    }
}
