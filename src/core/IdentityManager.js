import nacl from 'tweetnacl';
import { generateSecretKey } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { logger } from '../utils/Logger.js';
import { Kinds, Identifiers } from '../Constants.js';

/**
 * Manages the Identity for P2P Discovery.
 * Handles the "Transport Keypair" (Ed25519) used for BEP-44 DHT records.
 * Uses tweetnacl for cross-platform synchronous compatibility.
 */
export class IdentityManager {
    /**
     * @param {Uint8Array|string} [secretKey] - Optional existing 32-byte seed.
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
        this.seed = generateSecretKey();
        this.keypair = nacl.sign.keyPair.fromSeed(this.seed);
        logger.log("Generated new Transport Keypair.");
    }

    load(secretKey) {
        if (typeof secretKey === 'string') {
            this.seed = hexToBytes(secretKey);
        } else {
            this.seed = secretKey;
        }

        if (this.seed.length !== 32) {
            this.seed = this.seed.slice(0, 32);
        }
        
        this.keypair = nacl.sign.keyPair.fromSeed(this.seed);
        logger.log("Loaded existing Identity.");
    }

    getSecretKey() {
        if (!this.seed) throw new Error("No identity generated.");
        return bytesToHex(this.seed);
    }

    getPublicKey() {
        if (!this.keypair) throw new Error("No identity generated.");
        return bytesToHex(this.keypair.publicKey);
    }

    getKeypair() {
        if (!this.keypair) throw new Error("No identity generated.");
        return this.keypair;
    }

    createAttestation(nostrPubkey) {
        return {
            kind: Kinds.Application,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', Identifiers.IDENTITY_BRIDGE]],
            content: this.getPublicKey(),
            pubkey: nostrPubkey
        };
    }
}
