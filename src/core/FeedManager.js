import nacl from 'tweetnacl';
import crypto from 'crypto';
import { FeedIndex } from './FeedIndex.js';

/**
 * FeedManager handles the P2P Discovery "Feed".
 * It interacts with the DHT to publish/resolve mutable records (BEP-44).
 */
export class FeedManager {
    constructor(btTransport, identityManager, options = {}) {
        this.bt = btTransport;
        this.identity = identityManager;
        this.seq = options.initialSeq || 1; 
        this.index = new FeedIndex(options.indexLimit || 100);
    }

    async syncSequence() {
        try {
            const pubkey = this.identity.getPublicKey();
            const record = await this.resolveFeedPointer(pubkey);
            if (record && record.seq !== undefined) {
                this.seq = record.seq + 1;
                console.log(`FeedManager: Synced sequence number from DHT: ${this.seq}`);
            }
        } catch (error) {
            console.warn("FeedManager: Failed to sync sequence number.", error.message);
        }
        return this.seq;
    }

    /**
     * Updates the P2P feed with a new event.
     * @param {object} event - The Nostr event.
     * @param {string} magnetUri - The magnet for the event content.
     * @param {function} [signNostr] - Optional callback to sign a Nostr discovery event.
     */
    async updateFeed(event, magnetUri, signNostr = null) {
        this.index.add(event, magnetUri);
        const buffer = this.index.toBuffer();
        const indexMagnet = await this.bt.publish({ buffer, filename: 'index.json' });
        
        const match = indexMagnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
        if (!match) throw new Error(`Invalid magnet URI from transport: ${indexMagnet}`);
        const infoHash = match[1];

        if (!/^[a-fA-F0-9]{40}$/.test(infoHash)) {
            throw new Error(`Invalid InfoHash extracted: ${infoHash}.`);
        }

        // 1. Update DHT (P2P Discovery)
        await this.publishFeedPointer(infoHash);

        // 2. Update Nostr Relay (Bridge Discovery for Browsers)
        if (signNostr && this.bt.announce.length > 0) {
            const discoveryEvent = {
                kind: 30078,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', 'nostr-over-bt-feed']],
                content: indexMagnet
            };
            const signed = await signNostr(discoveryEvent);
            // The TransportManager will broadcast this to relays
            return { indexMagnet, discoveryEvent: signed };
        }

        return indexMagnet;
    }

    async publishFeedPointer(infoHash, retries = 3) {
        const dht = this.bt.getDHT();
        if (!dht) throw new Error("DHT not available.");

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
                        // Use tweetnacl for synchronous Ed25519 signing (BEP-44 requirement)
                        return nacl.sign.detached(buf, keypair.secretKey);
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

    async resolveFeedPointer(transportPubkey) {
        const dht = this.bt.getDHT();
        if (!dht) {
            // Silence warning if DHT is intentionally disabled (browsers)
            return null;
        }

        return new Promise((resolve, reject) => {
            const publicKeyBuffer = Buffer.from(transportPubkey, 'hex');
            // Browser-safe SHA1 if needed, but bittorrent-dht handles it usually.
            // For mock/local consistency we use Node's crypto or a shim.
            const target = crypto.createHash('sha1').update(publicKeyBuffer).digest();
            
            dht.get(target, (err, res) => {
                if (err) return reject(err);
                if (!res || !res.v) return resolve(null);

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
