/**
 * Abstract Base Class for Transport Layers.
 * Enforces implementation of core transport methods.
 */
export class ITransport {
    constructor() {
        if (this.constructor === ITransport) {
            throw new Error("Abstract classes can't be instantiated.");
        }
    }

    /**
     * Connect to the transport network.
     * @returns {Promise<void>}
     */
    async connect() {
        throw new Error("Method 'connect()' must be implemented.");
    }

    /**
     * Disconnect from the transport network.
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.");
    }

    /**
     * Publish an event.
     * @param {object} _event - The Nostr event object.
     * @returns {Promise<string>} - Returns the ID or status of the published event.
     */
    async publish(_event) {
        throw new Error("Method 'publish()' must be implemented.");
    }

    /**
     * Subscribe to events.
     * @param {object} _filter - The subscription filter.
     * @param {function} _onEvent - Callback when an event is received.
     * @returns {Promise<void>}
     */
    async subscribe(_filter, _onEvent) {
        throw new Error("Method 'subscribe()' must be implemented.");
    }
}
