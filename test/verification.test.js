import { NostrTransport } from '../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../src/transport/BitTorrentTransport.js';
import { HybridTransport } from '../src/transport/HybridTransport.js';

describe('Architecture Verification', () => {
    test('NostrTransport should be instantiable', () => {
        const nostr = new NostrTransport();
        expect(nostr).toBeDefined();
    });

    test('BitTorrentTransport should be instantiable', () => {
        const bt = new BitTorrentTransport();
        expect(bt).toBeDefined();
        // Clean up client to prevent hanging
        bt.disconnect();
    });

    test('BitTorrentTransport should accept DHT options', () => {
        const btDisabled = new BitTorrentTransport({ dht: false });
        expect(btDisabled).toBeDefined();
        // In a real mock, we would check btDisabled.client.dht
        btDisabled.disconnect();
    });

    test('HybridTransport should be instantiable', () => {
        const nostr = new NostrTransport();
        const bt = new BitTorrentTransport();
        const hybrid = new HybridTransport(nostr, bt);
        expect(hybrid).toBeDefined();
        bt.disconnect();
    });
});
