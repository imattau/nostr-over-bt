import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { TransportManager } from '../src/core/TransportManager.js';
import { WoTManager } from '../src/core/WoTManager.js';

// Manual mocks
class MockTransport {
    nostr = { publish: jest.fn() };
    bt = { publish: jest.fn() };
}

describe('WoT Integration', () => {
    let transportManager;
    let mockTransport;
    let mockWoT;

    const followedPubkey = 'followed-user';
    const unknownPubkey = 'unknown-user';

    const eventFromFollowed = { id: '1', pubkey: followedPubkey, content: 'hi' };
    const eventFromUnknown = { id: '2', pubkey: unknownPubkey, content: 'who dis' };

    beforeEach(() => {
        mockTransport = new MockTransport();
        
        // Mock WoT Manager
        mockWoT = new WoTManager(mockTransport.nostr); // Real class but we'll mock method
        mockWoT.isFollowing = jest.fn((pubkey) => pubkey === followedPubkey);

        transportManager = new TransportManager(mockTransport, mockWoT);
    });

    test('should auto-seed event from followed user', async () => {
        mockTransport.bt.publish.mockResolvedValue('magnet:1');
        
        // For testing, we want to see the result, so we'd normally disable background
        // but handleIncomingEvent doesn't expose the background option yet.
        // I will update handleIncomingEvent to support options.
        const result = await transportManager.handleIncomingEvent(eventFromFollowed);

        expect(result).toContain('queued:1');
        expect(mockTransport.bt.publish).toHaveBeenCalled();
    });

    test('should NOT auto-seed event from unknown user', async () => {
        const result = await transportManager.handleIncomingEvent(eventFromUnknown);

        expect(result).toBeNull();
        expect(mockTransport.bt.publish).not.toHaveBeenCalled();
    });

    test('should default to NO seeding if WoTManager is missing', async () => {
        const tmNoWoT = new TransportManager(mockTransport);
        const result = await tmNoWoT.handleIncomingEvent(eventFromFollowed);

        expect(result).toBeNull();
        expect(mockTransport.bt.publish).not.toHaveBeenCalled();
    });
});
