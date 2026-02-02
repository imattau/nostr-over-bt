import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { TransportManager } from '../src/core/TransportManager.js';

// Manual Mocks for transports
class MockNostrTransport {
    publish = jest.fn();
}
class MockBitTorrentTransport {
    publish = jest.fn();
}

describe('TransportManager', () => {
    let transportManager;
    let mockNostr;
    let mockBt;

    const mockEvent = {
        id: '123',
        pubkey: 'abc',
        created_at: 123456789,
        kind: 1,
        tags: [],
        content: 'Hello BT!',
        sig: 'sig123'
    };

    beforeEach(() => {
        mockNostr = new MockNostrTransport();
        mockBt = new MockBitTorrentTransport();
        const hybrid = { nostr: mockNostr, bt: mockBt };
        transportManager = new TransportManager(hybrid);
    });

    test('should seed AFTER relay success', async () => {
        mockNostr.publish.mockResolvedValue('ok');
        mockBt.publish.mockResolvedValue('magnet:?xt=urn:btih:event');

        const result = await transportManager.publish(mockEvent);

        expect(mockNostr.publish).toHaveBeenCalledWith(mockEvent);
        expect(mockBt.publish).toHaveBeenCalled();
        expect(result.magnetUri).toBe('magnet:?xt=urn:btih:event');
    });

    test('should NOT seed if relay fails', async () => {
        mockNostr.publish.mockRejectedValue(new Error('Relay rejected'));

        await expect(transportManager.publish(mockEvent)).rejects.toThrow("Relay publish failed");
        
        expect(mockNostr.publish).toHaveBeenCalled();
        expect(mockBt.publish).not.toHaveBeenCalled();
    });

    test('should seed media files if provided', async () => {
        mockNostr.publish.mockResolvedValue('ok');
        mockBt.publish
            .mockResolvedValueOnce('magnet:?xt=urn:btih:event')
            .mockResolvedValueOnce('magnet:?xt=urn:btih:media');

        const media = [{ buffer: Buffer.from('media'), filename: 'video.mp4' }];
        const result = await transportManager.publish(mockEvent, media);

        expect(mockBt.publish).toHaveBeenCalledTimes(2); // Event + Media
        expect(result.mediaMagnets[0]).toBe('magnet:?xt=urn:btih:media');
    });

    test('should reseed an existing event', async () => {
        mockBt.publish.mockResolvedValue('magnet:?xt=urn:btih:reseed');
        
        // Disable backgrounding for test verification
        const magnet = await transportManager.reseedEvent(mockEvent, false);

        expect(mockBt.publish).toHaveBeenCalled();
        expect(magnet).toBe('magnet:?xt=urn:btih:reseed');
    });

    test('should fetch media via BT first', async () => {
        mockBt.fetch = jest.fn().mockResolvedValue(Buffer.from('bt-content'));
        const eventWithMagnet = { ...mockEvent, tags: [['bt', 'magnet:abc']] };

        const content = await transportManager.fetchMedia(eventWithMagnet);
        
        expect(mockBt.fetch).toHaveBeenCalledWith('magnet:abc');
        expect(content.toString()).toBe('bt-content');
    });

    test('should fallback to HTTP if BT fails', async () => {
        mockBt.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
        const eventWithBoth = { 
            ...mockEvent, 
            tags: [['bt', 'magnet:abc'], ['url', 'http://example.com/video']] 
        };

        const content = await transportManager.fetchMedia(eventWithBoth);

        expect(mockBt.fetch).toHaveBeenCalled();
        // Since we mock the return string "mock-http-data" in TransportManager
        expect(content).toBe('mock-http-data');
    });
});
