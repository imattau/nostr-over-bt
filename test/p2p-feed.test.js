import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { FeedManager } from '../src/core/FeedManager.js';
import { IdentityManager } from '../src/core/IdentityManager.js';
import { FeedIndex } from '../src/core/FeedIndex.js';

// Mock DHT and BT
class MockDHT {
    put(opts, cb) { cb(null, Buffer.from('mock-hash')); }
    get(target, cb) { cb(null, null); }
}

class MockBT {
    constructor() {
        this.dht = new MockDHT();
    }
    getDHT() { return this.dht; }
    
    async publish(data) {
        // Return a fake magnet with a fake hash derived from content length/name (exactly 40 chars)
        const fakeHash = ('1234567890abcdef1234567890abcdef' + data.buffer.length).padEnd(40, '0');
        return `magnet:?xt=urn:btih:${fakeHash}&dn=${data.filename}`;
    }
}

describe('P2P Feed Indexing', () => {
    let feedManager;
    let identityManager;
    let mockBT;

    beforeEach(() => {
        identityManager = new IdentityManager();
        identityManager.generate();
        mockBT = new MockBT();
        feedManager = new FeedManager(mockBT, identityManager);
    });

    test('FeedIndex should manage items correctly', () => {
        const index = new FeedIndex(2); // Limit 2
        index.add({ id: '1', created_at: 100 }, 'magnet:1');
        index.add({ id: '2', created_at: 200 }, 'magnet:2');
        index.add({ id: '3', created_at: 300 }, 'magnet:3');

        const buffer = index.toBuffer();
        const loaded = new FeedIndex();
        loaded.loadFromBuffer(buffer);

        expect(loaded.items.length).toBe(2);
        expect(loaded.items[0].id).toBe('3'); // Newest first
        expect(loaded.items[1].id).toBe('2');
    });

    test('updateFeed should publish index and update DHT', async () => {
        const event = { id: 'evt1', created_at: 1000, kind: 1 };
        const contentMagnet = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';

        // Wait for the feed update (which is now properly awaited in FeedManager but backgrounded in TransportManager)
        const indexMagnet = await feedManager.updateFeed(event, contentMagnet);

        expect(indexMagnet).toContain('magnet:?xt=urn:btih:');
        expect(feedManager.index.items.length).toBe(1);
        expect(feedManager.index.items[0].id).toBe('evt1');
    });
});
