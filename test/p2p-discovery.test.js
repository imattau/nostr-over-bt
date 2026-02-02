import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { FeedManager } from '../src/core/FeedManager.js';
import { IdentityManager } from '../src/core/IdentityManager.js';

// Mock DHT
class MockDHT {
    constructor() {
        this.store = new Map(); // target(hex) -> { v, seq, k, sig }
    }

    put(opts, cb) {
        // opts has k, seq, v, sign
        // Calculate target = sha1(k)
        // Verify signature (skip for mock)
        // Store
        // For mock, we just use a simple key based on 'k'
        const kHex = opts.k.toString('hex');
        this.store.set(kHex, opts);
        cb(null, Buffer.from('mock-hash'));
    }

    get(target, cb) {
        // In real DHT, target is sha1(k). 
        // In our FeedManager, we pass target=sha1(k).
        // Since we can't easily reverse sha1(k) to find k in our map without iterating,
        // we'll mock the 'get' to cheat and look up by iterating or assume target matches.
        
        // Mock cheat: We assume the test passes the RIGHT target.
        // We iterate our store to find which 'k' hashes to this target?
        // Too complex for simple mock.
        
        // BETTER MOCK: FeedManager uses crypto.
        // Let's spy on crypto? No.
        
        // Let's just store by TARGET in the mock.
        // But `put` receives `k`, not `target`. 
        // `put` implementation calculates target internally.
        
        // We'll import crypto here to match logic.
        // But we are in ESM test.
        // We'll just always return the *last put value* for simplicity 
        // if the test is single-threaded/sequential.
        
        const values = Array.from(this.store.values());
        if (values.length > 0) {
            const val = values[values.length - 1];
            cb(null, { v: val.v, k: val.k, seq: val.seq, sig: Buffer.alloc(64) });
        } else {
            cb(null, null);
        }
    }
}

// Mock BitTorrentTransport
class MockBT {
    constructor() {
        this.dht = new MockDHT();
    }
    getDHT() { return this.dht; }
}

describe('P2P Discovery (BEP-44)', () => {
    let feedManager;
    let identityManager;
    let mockBT;

    beforeEach(() => {
        identityManager = new IdentityManager();
        identityManager.generate();
        mockBT = new MockBT();
        feedManager = new FeedManager(mockBT, identityManager);
    });

    test('should generate a valid Transport Keypair', () => {
        const pk = identityManager.getPublicKey();
        expect(pk).toHaveLength(64); // 32 bytes hex
    });

    test('should publish a feed pointer to DHT', async () => {
        const infoHash = '1234567890abcdef1234567890abcdef12345678';
        const address = await feedManager.publishFeedPointer(infoHash);
        
        expect(address).toBe(identityManager.getPublicKey());
        expect(mockBT.dht.store.size).toBe(1);
    });

    test('should resolve a feed pointer from DHT', async () => {
        const infoHash = '1234567890abcdef1234567890abcdef12345678';
        
        // 1. Publish
        await feedManager.publishFeedPointer(infoHash);

        // 2. Resolve
        const pk = identityManager.getPublicKey();
        const result = await feedManager.resolveFeedPointer(pk);

        expect(result).not.toBeNull();
        expect(result.infoHash).toBe(infoHash);
        expect(result.ts).toBeDefined();
        expect(result.seq).toBe(1);
    });

    test('IdentityManager should support loading keys', () => {
        const sk = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const id2 = new IdentityManager(sk);
        expect(id2.getSecretKey()).toBe(sk);
        expect(id2.getPublicKey()).toBeDefined();
    });

    test('FeedManager should sync sequence number', async () => {
        const infoHash = '1234567890abcdef1234567890abcdef12345678';
        
        // Mock a state where DHT already has seq 5
        mockBT.dht.store.set(identityManager.getPublicKey(), {
            v: { ih: Buffer.from(infoHash, 'hex'), ts: 123 },
            seq: 5,
            k: Buffer.from(identityManager.getPublicKey(), 'hex')
        });

        const newSeq = await feedManager.syncSequence();
        expect(newSeq).toBe(6);
        expect(feedManager.seq).toBe(6);
    });
});
