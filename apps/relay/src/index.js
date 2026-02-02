import 'dotenv/config';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Server as TrackerServer } from 'bittorrent-tracker';
import { nip19 } from 'nostr-tools';
import { 
    TransportManager, 
    HybridTransport, 
    NostrTransport, 
    BitTorrentTransport, 
    FeedManager, 
    IdentityManager 
} from 'nostr-over-bt';

import { RelayDatabase } from './Database.js';
import { SeedingQueue } from './Queue.js';

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || './relay.db';
const ENABLE_BT = process.env.ENABLE_BT !== 'false';
const TRACKER_PORT = process.env.TRACKER_PORT || 8081;

const db = new RelayDatabase(DB_PATH);

// --- Whitelist Setup ---
const ALLOWED_PUBKEYS = new Set();
if (process.env.ALLOWED_PUBKEYS) {
    process.env.ALLOWED_PUBKEYS.split(',').forEach(key => {
        const trimmed = key.trim();
        if (trimmed.startsWith('npub1')) {
            try {
                const { data } = nip19.decode(trimmed);
                ALLOWED_PUBKEYS.add(data);
            } catch (e) {
                console.error(`[Relay] Invalid npub in whitelist: ${trimmed}`);
            }
        } else {
            ALLOWED_PUBKEYS.add(trimmed); // Assume hex
        }
    });
    console.log(`[Relay] Private Mode: Active (${ALLOWED_PUBKEYS.size} pubkeys allowed)`);
}

// --- NIP-11 Information Document ---
const relayInfo = {
    name: process.env.RELAY_NAME || "Nostr-BT Relay",
    description: process.env.RELAY_DESCRIPTION || "A decentralized relay backed by BitTorrent",
    pubkey: process.env.RELAY_PUBKEY || "",
    contact: process.env.RELAY_CONTACT || "",
    supported_nips: [1, 2, 4, 9, 11, 12, 15, 16, 20, 33, 50, 65],
    software: "https://github.com/imattau/nostr-over-bt",
    version: "1.0.0",
    limitation: {
        search_config: { is_enabled: true, min_prefix: 3 },
        payment_required: ALLOWED_PUBKEYS.size > 0 // Signal restriction
    }
};

// --- HTTP Server (for NIP-11 and Tracker) ---
const server = http.createServer((req, res) => {
    if (req.headers.accept === 'application/nostr+json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(relayInfo));
        return;
    }
    res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });

// --- BT Setup ---
let transportManager, hybrid, tracker;
if (ENABLE_BT) {
    tracker = new TrackerServer({ udp: true, http: true, ws: true });
    tracker.listen(TRACKER_PORT);
    const bt = new BitTorrentTransport({ announce: [`ws://localhost:${TRACKER_PORT}`] });
    const id = new IdentityManager(); id.generate();
    hybrid = new HybridTransport(new NostrTransport([]), bt);
    transportManager = new TransportManager(hybrid, { feedManager: new FeedManager(bt, id) });
}
const queue = ENABLE_BT ? new SeedingQueue(transportManager) : null;

// --- Connection Handling ---
wss.on('connection', (ws) => {
    const subscriptions = new Map();

    ws.on('message', async (data) => {
        try {
            const [type, ...payload] = JSON.parse(data);

            switch (type) {
                case 'EVENT': {
                    const event = payload[0];

                    // Private Mode Restriction
                    if (ALLOWED_PUBKEYS.size > 0 && !ALLOWED_PUBKEYS.has(event.pubkey)) {
                        ws.send(JSON.stringify(['OK', event.id, false, 'restricted: pubkey not in whitelist']));
                        return;
                    }

                    const result = db.saveEvent(event);
                    ws.send(JSON.stringify(['OK', event.id, true, '']));
                    if (result.changes > 0) {
                        if (queue) queue.enqueue(event);
                        broadcast(event);
                    }
                    break;
                }
                case 'REQ': {
                    const subId = payload[0];
                    const filters = payload.slice(1);
                    subscriptions.set(subId, filters);
                    filters.forEach(f => {
                        const results = db.queryEvents(f);
                        results.forEach(e => ws.send(JSON.stringify(['EVENT', subId, e])));
                    });
                    ws.send(JSON.stringify(['EOSE', subId]));
                    break;
                }
                case 'CLOSE':
                    subscriptions.delete(payload[0]);
                    break;
            }
        } catch (e) {
            console.error('[Relay] Error:', e.message);
        }
    });

    ws.on('close', () => subscriptions.clear());
});

function broadcast(event) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify(['EVENT', 'subscription', event]));
        }
    });
}

server.listen(PORT, () => {
    console.log(`[Relay] Production Relay listening on http/ws localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    if (hybrid) await hybrid.disconnect();
    if (tracker) tracker.close();
    server.close();
    process.exit(0);
});
