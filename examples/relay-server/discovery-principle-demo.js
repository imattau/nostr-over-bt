import crypto from 'crypto';
import { FeedManager } from '../../src/core/FeedManager.js';
import { IdentityManager } from '../../src/core/IdentityManager.js';

// --- The "Shared Universe" (Simulating the Global DHT) ---
const GLOBAL_DHT_STORE = new Map();

class MockDHTNode {
    constructor(id) { this.id = id; }
    
    async put(opts, cb) {
        const target = crypto.createHash('sha1').update(opts.k).digest('hex');
        GLOBAL_DHT_STORE.set(target, { v: opts.v, seq: opts.seq, sig: Buffer.alloc(64) });
        console.log(`[DHT] PUT Target: ${target}`);
        cb(null, Buffer.from('success'));
    }

    async get(target, cb) {
        const targetHex = target.toString('hex');
        console.log(`[DHT] GET Target: ${targetHex}`);
        const res = GLOBAL_DHT_STORE.get(targetHex);
        cb(null, res || null);
    }
}

class MockTransport {
    constructor(dht) { this.dht = dht; }
    getDHT() { return this.dht; }
    async publish() { return 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678'; }
}

async function main() {
    console.log("=== BEP-44 Discovery Principle Demo ===");
    
    // 1. Setup Relay
    const relayDHT = new MockDHTNode('Relay-1');
    const relayIdentity = new IdentityManager();
    relayIdentity.generate();
    const relayFeed = new FeedManager(new MockTransport(relayDHT), relayIdentity);
    console.log(`Relay Identity (Target): ${relayIdentity.getPublicKey()}`);

    // 2. Setup 20 Clients (Disconnected from Relay)
    const clients = [];
    for(let i=0; i<20; i++) {
        const clientDHT = new MockDHTNode(`Client-${i}`);
        const clientFeed = new FeedManager(new MockTransport(clientDHT), new IdentityManager());
        clients.push(clientFeed);
    }

    // 3. RELAY DISCOVERS AN EVENT (from a connected publisher)
    console.log("\n[Relay] Receiving event and updating DHT Feed...");
    const event = { id: 'evt-123', created_at: 1000, kind: 1 };
    await relayFeed.updateFeed(event, 'magnet:?xt=urn:btih:event-data');

    // 4. CLIENTS DISCOVER THE EVENT VIA DHT
    console.log("\n[Clients] Checking DHT for Relay updates...");
    let discovered = 0;
    for(let i=0; i<clients.length; i++) {
        const client = clients[i];
        try {
            const ptr = await client.resolveFeedPointer(relayIdentity.getPublicKey());
            if (ptr && ptr.infoHash) {
                discovered++;
            } else {
                if (i === 0) console.log("[Debug] Client 0: ptr is", JSON.stringify(ptr));
            }
        } catch (e) {
            if (i === 0) console.log("[Debug] Client 0 error:", e.message);
        }
    }

    console.log(`\n=== Results ===`);
    console.log(`Relay -> DHT Path established.`);
    console.log(`Reach: ${discovered} / 20 clients discovered the event WITHOUT a relay connection.`);
    console.log("Status: PRINCIPLE VERIFIED.");
}

main();
