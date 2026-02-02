import { NostrTransport } from '../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../src/transport/BitTorrentTransport.js';
import { HybridTransport } from '../src/transport/HybridTransport.js';
import { TransportManager } from '../src/core/TransportManager.js';
import { WoTManager } from '../src/core/WoTManager.js';

// --- Configuration ---
const RELAYS = ['wss://relay.damus.io']; // Example relay
const MY_PUBKEY = '...hex-pubkey...';

// --- Setup ---
const nostr = new NostrTransport(RELAYS);
const bt = new BitTorrentTransport({ dht: true });
const hybrid = new HybridTransport(nostr, bt);

// Optional: Web of Trust
const wot = new WoTManager(nostr);
// await wot.refreshFollows(MY_PUBKEY); 

const manager = new TransportManager(hybrid, wot);

async function main() {
    try {
        console.log("Starting...");
        await hybrid.connect();

        // --- 1. Publishing an Event ---
        const event = {
            id: '...signed-event-id...',
            pubkey: MY_PUBKEY,
            created_at: Math.floor(Date.now() / 1000),
            kind: 1,
            tags: [],
            content: 'Hello Nostr over BitTorrent!',
            sig: '...signature...'
        };

        console.log("Publishing event...");
        // Publish will:
        // 1. Send to Relays
        // 2. If success, Seed via BitTorrent
        const result = await manager.publish(event);
        console.log("Published!", result);

        // --- 2. Fetching Media ---
        if (result.magnetUri) {
            console.log("Fetching content back via BT...");
            // Simulate fetching the content we just seeded (or from another peer)
            // const buffer = await manager.fetchMedia({ ...event, tags: [['bt', result.magnetUri]] });
            // console.log("Fetched content:", buffer.toString());
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        console.log("Cleaning up...");
        await hybrid.disconnect();
    }
}

// Check if run directly
if (process.argv[1].endsWith('usage-example.js')) {
    main();
}
