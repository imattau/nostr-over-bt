import { EventPackager } from '../src/core/EventPackager.js';

describe('EventPackager', () => {
    const packager = new EventPackager();
    const mockEvent = {
        id: '123',
        pubkey: 'abc',
        created_at: 123456789,
        kind: 1,
        tags: [],
        content: 'Hello BT!',
        sig: 'sig123'
    };

    test('should package an event into a buffer', () => {
        const buffer = packager.package(mockEvent);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.toString()).toContain('Hello BT!');
    });

    test('should unpack a buffer back into an event', () => {
        const buffer = packager.package(mockEvent);
        const unpacked = packager.unpack(buffer);
        expect(unpacked).toEqual(mockEvent);
    });

    test('should generate a correct filename', () => {
        const filename = packager.getFilename(mockEvent);
        expect(filename).toBe('123.json');
    });

    test('should throw error on invalid event', () => {
        expect(() => packager.package({})).toThrow("Invalid Nostr event");
    });

    test('should throw error on invalid unpacking data', () => {
        expect(() => packager.unpack("not json")).toThrow("Failed to unpack event");
    });
});
