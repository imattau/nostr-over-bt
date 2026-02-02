import { WebSocketServer } from 'ws';
import { Server as TrackerServer } from 'bittorrent-tracker';
import { TransportManager } from '../../src/core/TransportManager.js';
import { HybridTransport } from '../../src/transport/HybridTransport.js';
import { NostrTransport } from '../../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../../src/transport/BitTorrentTransport.js';
import { FeedManager } from '../../src/core/FeedManager.js';
import { IdentityManager } from '../../src/core/IdentityManager.js';

/**
 * NOSTR-OVER-BT REFERENCE RELAY
 * 
 * Features:
 * 1. Standard Nostr Relay (WS)
 * 2. Automatic BitTorrent Seeding of all incoming events.
 * 3. Built-in BT Tracker for swarm coordination.
 * 4. P2P Feed Index (BEP-44) for relay-wide discovery.
 */

// --- Configuration ---
const PORT = process.env.PORT || 8888;
const TRACKER_PORT = process.env.TRACKER_PORT || 8889;
const ENABLE_BT = !process.argv.includes('--no-bt');
const DHT_BOOTSTRAP = process.env.DHT_BOOTSTRAP ? process.env.DHT_BOOTSTRAP.split(',') : undefined;
const DHT_HOST = process.env.DHT_HOST || '0.0.0.0';

// --- Global State ---
const eventsMap = new Map();
const subscribers = new Map(); // ws -> Set(subId)

// --- 1. Start BitTorrent Tracker ---
let trackerServer;
if (ENABLE_BT) {
    trackerServer = new TrackerServer({ udp: true, http: true, ws: true });
    trackerServer.listen(TRACKER_PORT, () => {
        console.log(`[Tracker] Running on port ${TRACKER_PORT}`);
    });
}

// --- Setup nostr-over-bt ---
const nostrTransport = new NostrTransport([]); 
let btTransport = null;
let hybrid = null;
let transportManager = null;
let relayFeed = null;
let relayIdentity = null;

if (ENABLE_BT) {
    btTransport = new BitTorrentTransport({ 
        dht: { bootstrap: DHT_BOOTSTRAP, host: DHT_HOST }, 
        tracker: true,
        announce: [`ws://localhost:${TRACKER_PORT}`]
    });

    relayIdentity = new IdentityManager();
    relayIdentity.generate();
    console.log(`[Relay] P2P Discovery Address: ${relayIdentity.getPublicKey()}`);
    relayFeed = new FeedManager(btTransport, relayIdentity);

    hybrid = new HybridTransport(nostrTransport, btTransport);
    transportManager = new TransportManager(hybrid, { feedManager: relayFeed });
} else {
    // Standard Mode
    hybrid = { 
        connect: async () => {}, 
        disconnect: async () => {},
        nostr: nostrTransport
    };
    transportManager = {
        reseedEvent: async () => { throw new Error("BT Disabled"); }
    };
    relayFeed = null; // Ensure null
    relayIdentity = null;
}



// --- 3. WebSocket Relay Server ---
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
    console.log('[Relay] New client connected');
    subscribers.set(ws, new Set());

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            if (!Array.isArray(message)) return;

            const [type, ...payload] = message;

            switch (type) {
                case 'EVENT':
                    await handleEvent(ws, payload[0]);
                    break;
                case 'REQ':
                    handleReq(ws, payload[0], payload[1]);
                    break;
                case 'CLOSE':
                    subscribers.get(ws)?.delete(payload[0]);
                    break;
            }
        } catch (e) {
            console.error('[Relay] Error:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('[Relay] Client disconnected');
        subscribers.delete(ws);
    });
});

async function handleEvent(ws, event) {
    if (!event.id) return;

    // 1. Store locally
    eventsMap.set(event.id, event);
    console.log(`[Relay] Stored event ${event.id.substring(0, 8)}`);

    // 2. Broadcast to subscribers
    broadcast(event);

    // 3. P2P Bridge
    if (ENABLE_BT) {
        try {
            const magnet = await transportManager.reseedEvent(event);
            if (relayFeed) {
                await relayFeed.updateFeed(event, magnet);
                console.log(`[Relay] Event bridged to P2P Swarm & DHT Feed.`);
            }
            ws.send(JSON.stringify(['OK', event.id, true, `stored & seeded`]));
        } catch (err) {
            console.error('[Relay] Seeding failed:', err.message);
            ws.send(JSON.stringify(['OK', event.id, false, `error: ${err.message}`]));
        }
    } else {
        ws.send(JSON.stringify(['OK', event.id, true, 'stored']));
    }
}

function handleReq(ws, subId, filter) {
    subscribers.get(ws)?.add(subId);
    console.log(`[Relay] New subscription: ${subId}`);

    // Simple filter matching (return all for demo)
    for (const event of eventsMap.values()) {
        ws.send(JSON.stringify(['EVENT', subId, event]));
    }
    ws.send(JSON.stringify(['EOSE', subId]));
}

function broadcast(event) {
    for (const [ws, subs] of subscribers.entries()) {
        for (const subId of subs) {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify(['EVENT', subId, event]));
            }
        }
    }
}

console.log(`[Relay] Listening on ws://localhost:${PORT}`);
console.log(`
╔════════════════════════════════════════════════════════════╗
║   NOSTR-OVER-BT SEEDING RELAY                              ║
║   WebSocket: ws://localhost:${PORT}                         ║
║   BT Tracker: ws://localhost:${TRACKER_PORT}                ║
╚════════════════════════════════════════════════════════════╝
`);

process.on('SIGINT', async () => {
    console.log('\n[Relay] Shutting down...');
    
    // Force exit if graceful cleanup takes too long
    setTimeout(() => {
        console.error("[Relay] Force exiting due to timeout.");
        process.exit(1);
    }, 5000);

    try {
        if (hybrid && hybrid.disconnect) await hybrid.disconnect();
        wss.close();
        if (trackerServer) trackerServer.close();
    } catch (e) {
        console.error("[Relay] Cleanup error:", e.message);
    }
    process.exit(0);
});
