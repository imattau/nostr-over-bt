import { NostrBTError } from '../utils/Errors.js';

/**
 * Abstract Base Class for Transport Layers.
 * Enforces implementation of core transport methods.
 */
export class ITransport {
    constructor() {
        if (this.constructor === ITransport) {
            throw new NostrBTError("Abstract classes can't be instantiated.");
        }
    }

    /**
     * Connect to the transport network.
     * @returns {Promise<void>}
     */
    async connect() {
        throw new NostrBTError("Method 'connect()' must be implemented.");
    }

    /**
     * Disconnect from the transport network.
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new NostrBTError("Method 'disconnect()' must be implemented.");
    }

    /**
     * Publish an event.
     * @param {object} _event - The Nostr event object.
     * @returns {Promise<string>} - Returns the ID or status of the published event.
     */
    async publish(_event) {
        throw new NostrBTError("Method 'publish()' must be implemented.");
    }

    /**
     * Subscribe to events.
     * @param {object} _filter - The subscription filter.
     * @param {function} _onEvent - Callback when an event is received.
     * @returns {{ close: function }} - A subscription object with a close method.
     */
    subscribe(_filter, _onEvent) {
        throw new NostrBTError("Method 'subscribe()' must be implemented.");
    }
}
