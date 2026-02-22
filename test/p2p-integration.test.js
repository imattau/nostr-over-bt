import { jest, describe, test, expect } from '@jest/globals';
import { TransportManager } from '../src/core/TransportManager.js';
import { FeedManager } from '../src/core/FeedManager.js';
import { IdentityManager } from '../src/core/IdentityManager.js';
import { HybridTransport } from '../src/transport/HybridTransport.js';
import { NostrTransport } from '../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../src/transport/BitTorrentTransport.js';

// Mock DHT that stores the actual infoHash put into it
class MockDHT {
    constructor() { this.store = new Map(); }
    put(opts, cb) { 
        this.store.set(opts.k.toString('hex'), { v: opts.v, seq: opts.seq }); 
        cb(null, Buffer.from('dht-hash')); 
    }
    get(target, cb) {
        const val = this.store.values().next().value;
        cb(null, val || null);
    }
}

class MockBT extends BitTorrentTransport {
    constructor() { 
        super({ dht: false }); 
        if (this.client) this.client.destroy();
        this.dht = new MockDHT(); 
        this.torrents = new Map(); 
    }
    getDHT() { return this.dht; }
    async disconnect() { return; }
    
    async publish(data) {
        const mockHash = Buffer.from(data.filename).toString('hex').padEnd(40, '0');
        const magnet = `magnet:?xt=urn:btih:${mockHash}&dn=${data.filename}`;
        this.torrents.set(mockHash, data.buffer);
        return magnet;
    }
    
    async fetch(magnet) {
        const hash = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/)[1];
        if (this.torrents.has(hash)) return this.torrents.get(hash);
        throw new Error(`Torrent not found: ${hash}`);
    }
}

describe('P2P End-to-End Integration', () => {
    test('Alice publishes P2P and Bob subscribes', async () => {
        const aliceIdentity = new IdentityManager();
        aliceIdentity.generate();
        const aliceBT = new MockBT();
        const aliceFeed = new FeedManager(aliceBT, aliceIdentity);
        const aliceTransport = new TransportManager(new HybridTransport(new NostrTransport(), aliceBT), { feedManager: aliceFeed });

        const bobTransport = new TransportManager(new HybridTransport(new NostrTransport(), aliceBT), { feedManager: new FeedManager(aliceBT, new IdentityManager()) });
        
        const event = { id: 'evt-p2p', kind: 1, created_at: 1000 };
        const indexMagnet = await aliceTransport.publishP2P(event);
        
        expect(indexMagnet).toBeDefined();

                const alicePubkey = aliceIdentity.getPublicKey();

                const events = await bobTransport.subscribeP2P(alicePubkey);

                

                expect(events).toHaveLength(1);

                expect(events[0].id).toBe('evt-p2p');

            });

        

            test('Bob discovers Alice events by following her Nostr pubkey', async () => {

                // Setup Alice
                const aliceNostrPk = '00'.repeat(32);
                const aliceIdentity = new IdentityManager(null, aliceNostrPk);

                aliceIdentity.generate();

                const aliceBT = new MockBT();

                const aliceFeed = new FeedManager(aliceBT, aliceIdentity);

                const aliceTransport = new TransportManager(new HybridTransport(new NostrTransport(), aliceBT), { feedManager: aliceFeed });

        

                // Setup Bob

                const bobNostr = new NostrTransport();

                const bobTransport = new TransportManager(new HybridTransport(bobNostr, aliceBT), { 

                    feedManager: new FeedManager(aliceBT, new IdentityManager()),

                    wotManager: { follows: new Set([aliceNostrPk]) }

                });

        

                // 1. Alice Publishes P2P

                await aliceTransport.publishP2P({ id: 'evt-1', created_at: 1000 });

        

                // 2. Mock Bob finding Alice's attestation on Nostr

                bobNostr.subscribe = jest.fn((filter, cb) => {

                    // Simulate finding the attestation event

                    cb({ content: aliceIdentity.getPublicKey() });

                });

        

                // 3. Bob syncs follows

                const events = await bobTransport.subscribeFollowsP2P();

        

                expect(events).toHaveLength(1);

                expect(events[0].id).toBe('evt-1');

                expect(bobNostr.subscribe).toHaveBeenCalled();

            });

        });

        