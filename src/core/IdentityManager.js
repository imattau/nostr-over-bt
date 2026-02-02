import nacl from 'tweetnacl';
import crypto from 'crypto';

/**
 * Manages the Identity for P2P Discovery.
 * Handles the "Transport Keypair" (Ed25519) used for BEP-44 DHT records.
 * Uses tweetnacl for cross-platform synchronous compatibility.
 */
export class IdentityManager {
    /**
     * @param {Buffer|Uint8Array|string} [secretKey] - Optional existing 32-byte seed.
     * @param {string} [nostrPubkey] - Optional associated Nostr public key.
     */
    constructor(secretKey = null, nostrPubkey = null) {
        this.keypair = null;
        this.seed = null;
        this.nostrPubkey = nostrPubkey;
        if (secretKey) {
            this.load(secretKey);
        }
    }

    setNostrPubkey(pk) {
        this.nostrPubkey = pk;
    }

    static fromNostrSecretKey(nostrSecretKey) {
        return new IdentityManager(nostrSecretKey);
    }

    generate() {
        // Use browser-safe getRandomValues if available, fallback to Node crypto
        this.seed = (typeof window !== 'undefined' && window.crypto) 
            ? window.crypto.getRandomValues(new Uint8Array(32)) 
            : crypto.randomBytes(32);
            
        this.keypair = nacl.sign.keyPair.fromSeed(this.seed);
        console.log("IdentityManager: Generated new Transport Keypair.");
    }

    load(secretKey) {
        if (typeof secretKey === 'string') {
            this.seed = Buffer.from(secretKey, 'hex');
        } else {
            this.seed = new Uint8Array(secretKey);
        }

        if (this.seed.length !== 32) {
            this.seed = this.seed.slice(0, 32);
        }
        
        this.keypair = nacl.sign.keyPair.fromSeed(this.seed);
        console.log("IdentityManager: Loaded existing Identity.");
    }

    getSecretKey() {
        if (!this.seed) throw new Error("No identity generated.");
        return Buffer.from(this.seed).toString('hex');
    }

    getPublicKey() {
        if (!this.keypair) throw new Error("No identity generated.");
        return Buffer.from(this.keypair.publicKey).toString('hex');
    }

    getKeypair() {
        if (!this.keypair) throw new Error("No identity generated.");
        return this.keypair;
    }

    createAttestation(nostrPubkey) {
        return {
            kind: 30078,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', 'nostr-over-bt-identity']],
            content: this.getPublicKey(),
            pubkey: nostrPubkey
        };
    }
}
