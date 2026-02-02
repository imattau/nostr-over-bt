import { jest, describe, test, expect } from '@jest/globals';
import { TransportManager } from '../src/core/TransportManager.js';
import { HybridTransport } from '../src/transport/HybridTransport.js';
import { NostrTransport } from '../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../src/transport/BitTorrentTransport.js';

describe('Stress Testing', () => {
    // Mock transports for speed
    class MockNostrTransport extends NostrTransport {
        async publish(event) { return 'ok'; }
    }
    class MockBitTorrentTransport extends BitTorrentTransport {
        async publish(data) { return 'magnet:?xt=urn:btih:' + data.filename; }
    }

    test('should handle high volume of events efficiently', async () => {
        const nostr = new MockNostrTransport();
        const bt = new MockBitTorrentTransport();
        const hybrid = new HybridTransport(nostr, bt);
        const manager = new TransportManager(hybrid);

        const COUNT = 1000;
        const events = [];
        for (let i = 0; i < COUNT; i++) {
            events.push({
                id: `stress-${i}`,
                pubkey: 'stress-pubkey',
                created_at: Date.now(),
                kind: 1,
                tags: [],
                content: `Stress content ${i}`,
                sig: 'sig'
            });
        }

        const start = performance.now();
        
        // Execute in parallel chunks of 50 to simulate realistic concurrency
        const CHUNK_SIZE = 50;
        for (let i = 0; i < events.length; i += CHUNK_SIZE) {
            const chunk = events.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(e => manager.publish(e)));
        }

        const end = performance.now();
        const duration = end - start;
        const throughput = COUNT / (duration / 1000);

        console.log(`Stress Test: Processed ${COUNT} events in ${duration.toFixed(2)}ms.`);
        console.log(`Throughput: ${throughput.toFixed(2)} events/sec`);

        // Expect reasonable performance (e.g., > 100 events/sec on modern hardware for simple logic)
        expect(throughput).toBeGreaterThan(100);

        // Cleanup
        await hybrid.disconnect();
    });
});
