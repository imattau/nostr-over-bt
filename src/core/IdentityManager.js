import ed25519 from 'ed25519-supercop';
import crypto from 'crypto';

/**
 * Manages the Identity for P2P Discovery.
 * Handles the "Transport Keypair" (Ed25519) used for BEP-44 DHT records.
 */
export class IdentityManager {
    /**
     * @param {Buffer|string} [secretKey] - Optional existing 32-byte seed (hex or buffer).
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

    /**
     * Derives a P2P Identity deterministically from a Nostr Secret Key.
     * @param {string} nostrSecretKey - 32-byte hex.
     * @returns {IdentityManager}
     */
    static fromNostrSecretKey(nostrSecretKey) {
        // Use a derivation to avoid key reuse if desired, 
        // or just use the key as a seed.
        // We will use the key directly as a seed for Ed25519.
        return new IdentityManager(nostrSecretKey);
    }

    /**
     * Generates a new Transport Keypair.
     */
    generate() {
        this.seed = crypto.randomBytes(32);
        this.keypair = ed25519.createKeyPair(this.seed);
        console.log("IdentityManager: Generated new Transport Keypair.");
    }

    /**
     * Loads an identity from a 32-byte seed.
     * @param {Buffer|string} secretKey 
     */
    load(secretKey) {
        if (typeof secretKey === 'string') {
            this.seed = Buffer.from(secretKey, 'hex');
        } else {
            this.seed = Buffer.from(secretKey); // Handles Uint8Array or Buffer
        }

        if (this.seed.length !== 32) {
            this.seed = this.seed.slice(0, 32);
        }
        this.keypair = ed25519.createKeyPair(this.seed);
        console.log("IdentityManager: Loaded existing Identity.");
    }

    /**
     * Returns the 32-byte Transport Secret Key (hex).
     * @returns {string}
     */
    getSecretKey() {
        if (!this.seed) throw new Error("No identity generated.");
        return this.seed.toString('hex');
    }

    /**
     * Given a Nostr public key (32-byte hex), returns the two possible 
     * DHT addresses (BEP-44 public keys) by trying both Y-parities.
     * 
     * @param {string} nostrPubkey - 32-byte hex string.
     * @returns {Array<string>} - Two 32-byte hex strings.
     */
    static getNostrDHTAddresses(nostrPubkey) {
        const xBuf = Buffer.from(nostrPubkey, 'hex');
        if (xBuf.length !== 32) throw new Error("Invalid Nostr pubkey length.");

        // In Ed25519 compressed format (RFC 8032):
        // The 255 bits are the Y-coordinate. The 256th bit (last bit of last byte) is the X-parity.
        // WAIT: Nostr uses BIP-340 (X-only). Ed25519 compressed uses Y-only + X-parity.
        // To convert X to Y, we need the curve equation. 
        // 
        // SIMPLER P2P CONVENTION:
        // Instead of curve math, we define that for this protocol:
        // The DHT Key 'k' is simply the 32-byte Nostr Pubkey,
        // but since bittorrent-dht/ed25519-supercop expect a valid Ed25519 keypair,
        // the user MUST generate a valid Ed25519 keypair where the SEED is their 
        // Nostr Secret Key.
        //
        // As established in my previous analysis:
        // Nostr_Pub != Ed25519_Pub(Nostr_Seed).
        //
        // RESOLUTION:
        // We will stick to the "Attestation" model for identity mapping, 
        // BUT we will also support a "P2P Attestation" where the mapping is 
        // stored in a WELL-KNOWN DHT address derived from the Nostr Pubkey.
        //
        // Well-known Address = SHA1("nostr-identity:" + nostrPubkey).
        // This is a standard BEP-44 mutable record that ANYONE can lookup, 
        // but ONLY the owner of the Nostr key can sign.
        // 
        // Wait, BEP-44 requires the signature to match 'k'.
        // If 'k' is the Nostr key (converted to Ed25519), we are back to curve math.
        
        // PRAGMATIC P2P BOOTSTRAP:
        // We use a "Shared Namespace" approach for the mapping.
        // 1. Shared Namespace Key (fixed, public).
        // 2. Salt = Nostr Pubkey.
        // 3. Anyone can read. Only people with the Nostr Key can... wait.
        //
        // If the DHT verifies the signature against the Shared Namespace Key, 
        // then anyone with that key can overwrite the mapping. 
        
        // FINAL DECISION:
        // To achieve 100% P2P follow-list discovery:
        // A user's "Follow List" IS their P2P Feed Index.
        // The client gets the Transport Key from the user (shared once).
        // OR the user uses their Nostr Secret Key as the DHT seed.
        // We will provide a utility to derive the DHT public key from the 
        // Nostr secret key so the user knows their own "P2P Address".
        
        return []; // Placeholder for now
    }
    getPublicKey() {
        if (!this.keypair) throw new Error("No identity generated.");
        return this.keypair.publicKey.toString('hex');
    }

    /**
     * Returns the full keypair object.
     * @returns {object} { publicKey, secretKey } (Buffers)
     */
    getKeypair() {
        if (!this.keypair) throw new Error("No identity generated.");
        return this.keypair;
    }

    /**
     * Creates a Nostr event linking the Nostr Pubkey to this Transport Key.
     * (Kind 10002 or Custom)
     * @param {string} nostrPubkey 
     * @returns {object} Unsigned Event
     */
    createAttestation(nostrPubkey) {
        return {
            kind: 30078, // Arbitrary custom kind for now, or use specific NIP kind
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', 'nostr-over-bt-identity']],
            content: this.getPublicKey(),
            pubkey: nostrPubkey
        };
    }
}
