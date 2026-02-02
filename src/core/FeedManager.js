import ed25519 from 'ed25519-supercop';
import crypto from 'crypto';
import { FeedIndex } from './FeedIndex.js';

/**
 * FeedManager handles the P2P Discovery "Feed".
 * It interacts with the DHT to publish/resolve mutable records (BEP-44).
 */
export class FeedManager {
    /**
     * @param {BitTorrentTransport} btTransport 
     * @param {IdentityManager} identityManager 
     * @param {object} [options={}]
     * @param {number} [options.initialSeq=1] - Initial sequence number if known.
     * @param {number} [options.indexLimit=100] - Max items in the feed index.
     */
    constructor(btTransport, identityManager, options = {}) {
        this.bt = btTransport;
        this.identity = identityManager;
        this.seq = options.initialSeq || 1; 
        this.index = new FeedIndex(options.indexLimit || 100);
    }

    /**
     * Syncs the sequence number with the latest record on the DHT.
     * Essential for maintaining persistence after a restart.
     * @returns {Promise<number>} - The new current sequence number.
     */
    async syncSequence() {
        try {
            const pubkey = this.identity.getPublicKey();
            const record = await this.resolveFeedPointer(pubkey);
            if (record && record.seq !== undefined) {
                this.seq = record.seq + 1;
                console.log(`FeedManager: Synced sequence number from DHT: ${this.seq}`);
            }
        } catch (error) {
            console.warn("FeedManager: Failed to sync sequence number, defaulting to current.", error.message);
        }
        return this.seq;
    }

    /**
     * Updates the P2P feed with a new event.
     * 1. Adds event to local FeedIndex.
     * 2. Seeds the new index.json.
     * 3. Updates the DHT pointer to the new index.
     * 
     * @param {object} event - The Nostr event.
     * @param {string} magnetUri - The magnet for the event content.
     * @returns {Promise<string>} - The magnet URI of the updated Index.
     */
    async updateFeed(event, magnetUri) {
        // 1. Update Index
        this.index.add(event, magnetUri);
        const buffer = this.index.toBuffer();
        
        // 2. Seed Index
        const indexMagnet = await this.bt.publish({ buffer, filename: 'index.json' });
        
        // Extract InfoHash from magnet
        const match = indexMagnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
        if (!match) throw new Error(`Invalid magnet URI from transport: ${indexMagnet}`);
        const infoHash = match[1];

        // 3. Validate InfoHash (should be 40 char hex for v1)
        if (!/^[a-fA-F0-9]{40}$/.test(infoHash)) {
            throw new Error(`Invalid InfoHash extracted: ${infoHash}. Expected 40-character hex.`);
        }

        // 4. Update DHT Pointer
        await this.publishFeedPointer(infoHash);

        return indexMagnet;
    }

    /**
     * Publishes a pointer to the given InfoHash (the "Feed Torrent").
     * @param {string} infoHash - The InfoHash of the feed index torrent (hex string).
     * @returns {Promise<string>} - The public key (address) of the record.
     */
    async publishFeedPointer(infoHash, retries = 3) {
        if (!/^[a-fA-F0-9]{40}$/.test(infoHash)) {
            throw new Error(`Invalid InfoHash: ${infoHash}. Expected 40-character hex.`);
        }

        const dht = this.bt.getDHT();
        if (!dht) throw new Error("DHT not available. Ensure WebTorrent client is ready.");

        const keypair = this.identity.getKeypair();

        const attempt = (remaining) => {
            return new Promise((resolve, reject) => {
                const opts = {
                    k: keypair.publicKey,
                    seq: this.seq++,
                    v: {
                        ih: Buffer.from(infoHash, 'hex'),
                        ts: Math.floor(Date.now() / 1000),
                        npk: this.identity.nostrPubkey ? Buffer.from(this.identity.nostrPubkey, 'hex') : undefined
                    },
                    sign: (buf) => {
                        if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
                        return ed25519.sign(buf, keypair.publicKey, keypair.secretKey);
                    }
                };

                dht.put(opts, (err, hash) => {
                    if (err) {
                        if (remaining > 0) {
                            console.warn(`FeedManager: DHT PUT failed, retrying... (${remaining} left)`);
                            setTimeout(() => resolve(attempt(remaining - 1)), 2000);
                        } else {
                            reject(err);
                        }
                    } else {
                        console.log(`FeedManager: Updated DHT Pointer. Hash: ${hash.toString('hex')}`);
                        resolve(keypair.publicKey.toString('hex'));
                    }
                });
            });
        };

        return await attempt(retries);
    }

    /**
     * Resolves a feed pointer from the DHT.
     * @param {string} transportPubkey - The Transport Public Key (hex).
     * @returns {Promise<object>} - { infoHash, timestamp }
     */
    async resolveFeedPointer(transportPubkey) {
        const dht = this.bt.getDHT();
        if (!dht) throw new Error("DHT not available.");

        return new Promise((resolve, reject) => {
            const publicKeyBuffer = Buffer.from(transportPubkey, 'hex');
            
            // Calculate BEP-44 Target: SHA1(k)
            const target = crypto.createHash('sha1').update(publicKeyBuffer).digest();
            
            dht.get(target, (err, res) => {
                if (err) return reject(err);
                if (!res || !res.v) return resolve(null); // Not found

                try {
                    const infoHash = res.v.ih.toString('hex');
                    const ts = res.v.ts;
                    const seq = res.seq;
                    const nostrPubkey = res.v.npk ? res.v.npk.toString('hex') : null;
                    resolve({ infoHash, ts, seq, nostrPubkey });
                } catch {
                    reject(new Error("Invalid record format"));
                }
            });
        });
    }
}
