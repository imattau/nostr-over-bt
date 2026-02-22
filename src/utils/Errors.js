/**
 * Base error class for nostr-over-bt.
 */
export class NostrBTError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * Thrown when transport-level operations fail (relays, swarm, DHT).
 */
export class TransportError extends NostrBTError {
    constructor(message, transportType) {
        super(message);
        this.transportType = transportType;
    }
}

/**
 * Thrown when data validation fails (zod, signatures, hashes).
 */
export class ValidationError extends NostrBTError {
    constructor(message) {
        super(message);
    }
}

/**
 * Thrown when operations exceed their allocated time.
 */
export class TimeoutError extends NostrBTError {
    constructor(message, timeout) {
        super(message);
        this.timeout = timeout;
    }
}
