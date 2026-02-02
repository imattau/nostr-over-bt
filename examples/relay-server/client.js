import WebSocket from 'ws';
import { TransportManager } from '../../src/core/TransportManager.js';
import { HybridTransport } from '../../src/transport/HybridTransport.js';
import { NostrTransport } from '../../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../../src/transport/BitTorrentTransport.js';
import { FeedManager } from '../../src/core/FeedManager.js';
import { IdentityManager } from '../../src/core/IdentityManager.js';
import { WoTManager } from '../../src/core/WoTManager.js';

/**
 * NOSTR-OVER-BT REFERENCE CLIENT
 * 
 * Demonstrates:
 * 1. Deterministic P2P Identity.
 * 2. Hybrid Publishing (Relay + P2P).
 * 3. Zero-Relay Discovery via DHT.
 */

const RELAY_URL = 'ws://localhost:8888';
const TRACKER_URL = 'ws://localhost:8889';

async function runDemo() {
    console.log("=== Nostr-over-BT Client Demo ===");

    // --- 1. Setup Alice (The Publisher) ---
    // Derived from a fake "Nostr Secret Key"
    const aliceNostrSK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const aliceId = IdentityManager.fromNostrSecretKey(aliceNostrSK);
    
    const aliceBT = new BitTorrentTransport({ announce: [TRACKER_URL] });
    const aliceFeed = new FeedManager(aliceBT, aliceId);
    const aliceNostr = new NostrTransport([RELAY_URL]);
    
    const aliceMgr = new TransportManager(new HybridTransport(aliceNostr, aliceBT), {
        feedManager: aliceFeed
    });

    console.log(`[Alice] P2P Address: ${aliceId.getPublicKey()}`);

    // --- 2. Alice Publishes ---
    const event = {
        id: 'alice-note-' + Date.now(),
        pubkey: 'alice-nostr-pk',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        content: 'I am publishing via both Relay and P2P!',
        sig: 'sig'
    };

    console.log("[Alice] Publishing hybrid event...");
    // This seeds to BT AND pushes to Relay
    const result = await aliceMgr.publish(event);
    console.log(`[Alice] Published! Content Magnet: ${result.magnetUri.substring(0, 40)}...`);

    // --- 3. Setup Bob (The Follower) ---
    // Bob has NO connection to the relay initially.
    console.log("\n[Bob] Bob is starting with only Alice's P2P address.");
    const bobBT = new BitTorrentTransport({ announce: [TRACKER_URL] });
    const bobWot = new WoTManager(new NostrTransport([]));
    const bobMgr = new TransportManager(new HybridTransport(new NostrTransport([]), bobBT), {
        feedManager: new FeedManager(bobBT, new IdentityManager()),
        wotManager: bobWot
    });

    // Bob bootstraps WoT from Alice's DHT entry
    // (In this demo, we simulate discovery by passing Alice's key)
    console.log("[Bob] Discovering Alice's feed via DHT...");
    try {
        const aliceEvents = await bobMgr.subscribeP2P(aliceId.getPublicKey());
        console.log(`[Bob] Success! Found ${aliceEvents.length} events in Alice's P2P feed.`);
        
        for (const e of aliceEvents) {
            console.log(` -> Event: [${e.id}] "${e.id.includes('note') ? 'Alice note' : 'other'}"`);
        }
    } catch (err) {
        console.error("[Bob] Discovery failed. (DHT usually requires a real network to work reliably in demo scripts)");
    }

    // --- Cleanup ---
    console.log("\nDemo complete. Cleaning up...");
    await aliceBT.disconnect();
    await bobBT.disconnect();
    process.exit(0);
}

runDemo().catch(console.error);