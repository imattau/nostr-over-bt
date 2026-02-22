import nacl from 'tweetnacl';
import * as magnet from 'magnet-uri';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { FeedIndex } from './FeedIndex.js';
import { logger } from '../utils/Logger.js';
import { TransportError } from '../utils/Errors.js';
import { Kinds, Identifiers, Limits } from '../Constants.js';

/**
 * FeedManager handles the P2P Discovery "Feed".
 * It interacts with the DHT to publish/resolve mutable records (BEP-44).
 */
export class FeedManager {
    constructor(btTransport, identityManager, options = {}) {
        this.bt = btTransport;
        this.identity = identityManager;
        this.seq = options.initialSeq || 1; 
        this.index = new FeedIndex(options.indexLimit || Limits.FEED_INDEX_LIMIT);
    }

    async syncSequence() {
        try {
            const pubkey = this.identity.getPublicKey();
            const record = await this.resolveFeedPointer(pubkey);
            if (record && record.seq !== undefined) {
                this.seq = record.seq + 1;
                logger.log(`Synced sequence number from DHT: ${this.seq}`);
            }
        } catch (error) {
            logger.warn("Failed to sync sequence number.", error.message);
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
        
        const parsed = magnet.decode(indexMagnet);
        if (!parsed || !parsed.infoHash) {
            throw new TransportError(`Invalid magnet URI from transport: ${indexMagnet}`, "bittorrent");
        }
        const infoHash = parsed.infoHash;

        // 1. Update DHT (P2P Discovery)
        await this.publishFeedPointer(infoHash);

        // 2. Update Nostr Relay (Bridge Discovery for Browsers)
        if (signNostr && this.bt.announce.length > 0) {
            const discoveryEvent = {
                kind: Kinds.Application,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', Identifiers.FEED_BRIDGE]],
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
        if (!dht) throw new TransportError("DHT not available.", "bittorrent");

        const keypair = this.identity.getKeypair();

        const attempt = (remaining) => {
            return new Promise((resolve, reject) => {
                const opts = {
                    k: keypair.publicKey,
                    seq: this.seq++,
                    v: {
                        ih: hexToBytes(infoHash),
                        ts: Math.floor(Date.now() / 1000),
                        npk: this.identity.nostrPubkey ? hexToBytes(this.identity.nostrPubkey) : undefined
                    },
                    sign: (buf) => {
                        // Use tweetnacl for synchronous Ed25519 signing (BEP-44 requirement)
                        return nacl.sign.detached(buf, keypair.secretKey);
                    }
                };

                dht.put(opts, (err, hash) => {
                    if (err) {
                        if (remaining > 0) {
                            logger.warn(`DHT PUT failed, retrying... (${remaining} left)`);
                            setTimeout(() => resolve(attempt(remaining - 1)), 2000);
                        } else {
                            reject(new TransportError(err.message, "bittorrent"));
                        }
                    } else {
                        logger.log(`Updated DHT Pointer. Hash: ${bytesToHex(hash)}`);
                        resolve(bytesToHex(keypair.publicKey));
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
            const publicKeyBytes = hexToBytes(transportPubkey);
            // bittorrent-dht handles it internally usually, but we need the target hash (SHA1 of the key)
            // Note: Since we are in the DHT world, we'll keep the Buffer dependency for bittorrent-dht's target.
            const target = Buffer.from(publicKeyBytes);
            
            dht.get(target, (err, res) => {
                if (err) return reject(new TransportError(err.message, "bittorrent"));
                if (!res || !res.v) return resolve(null);

                try {
                    const infoHash = bytesToHex(res.v.ih);
                    const ts = res.v.ts;
                    const seq = res.seq;
                    const nostrPubkey = res.v.npk ? bytesToHex(res.v.npk) : null;
                    resolve({ infoHash, ts, seq, nostrPubkey });
                } catch {
                    reject(new TransportError("Invalid record format from DHT", "bittorrent"));
                }
            });
        });
    }
}
