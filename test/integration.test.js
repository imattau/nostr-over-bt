import { jest, describe, test, expect } from '@jest/globals';
import { TransportManager } from '../src/core/TransportManager.js';
import { HybridTransport } from '../src/transport/HybridTransport.js';
import { NostrTransport } from '../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../src/transport/BitTorrentTransport.js';

describe('End-to-End Integration', () => {
    test('should seed an event and return a valid magnet URI', async () => {
        // Use real BitTorrentTransport but mock Nostr to avoid real network
        const nostr = new NostrTransport();
        const bt = new BitTorrentTransport({ dht: false, tracker: false });
        const hybrid = new HybridTransport(nostr, bt);
        const manager = new TransportManager(hybrid);

        const mockEvent = {
            id: 'test-id-' + Date.now(),
            pubkey: 'test-pubkey',
            created_at: Math.floor(Date.now() / 1000),
            kind: 1,
            tags: [],
            content: 'Integration Test Content',
            sig: 'test-sig'
        };

        // Mock Nostr publish to succeed
        jest.spyOn(nostr, 'publish').mockResolvedValue(mockEvent.id);

        try {
            const result = await manager.publish(mockEvent);

            expect(result.magnetUri).toContain('magnet:?xt=urn:btih:');
            expect(result.magnetUri).toContain('dn=' + mockEvent.id + '.json');
            
            // Clean up
            await bt.disconnect();
        } catch (error) {
            await bt.disconnect();
            throw error;
        }
    }, 10000); // 10s timeout
});
