import WebSocket from 'ws';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import DHT from 'bittorrent-dht';
import { TransportManager } from '../../src/core/TransportManager.js';
import { FeedManager } from '../../src/core/FeedManager.js';
import { IdentityManager } from '../../src/core/IdentityManager.js';
import { HybridTransport } from '../../src/transport/HybridTransport.js';
import { NostrTransport } from '../../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../../src/transport/BitTorrentTransport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.join(__dirname, 'server.js');

const CLIENT_COUNT = 20;
const BOOTSTRAP_PORT = 6881;

async function startBootstrapNode() {
    const dht = new DHT();
    return new Promise(resolve => {
        dht.listen(BOOTSTRAP_PORT, () => {
            console.log(`[Test] DHT Bootstrap Node running on ${BOOTSTRAP_PORT}`);
            resolve(dht);
        });
    });
}

async function startRelay(port, enableBt) {
    const args = enableBt ? [] : ['--no-bt'];
    const env = { ...process.env, PORT: port, TRACKER_PORT: port + 1000, DHT_BOOTSTRAP: `127.0.0.1:${BOOTSTRAP_PORT}` };
    const proc = spawn('node', [SERVER_PATH, ...args], { env, stdio: 'pipe' }); 
    return new Promise(resolve => {
        proc.stdout.on('data', d => {
            if (d.toString().includes('Listening')) resolve(proc);
        });
    });
}

async function runStandardScenario() {
    console.log("\n=== Scenario A: Standard Nostr (Fragmented) ===");
    const relays = [9001, 9002, 9003];
    const serverProcs = [];
    for (const port of relays) serverProcs.push(await startRelay(port, false));

    let eventsReceived = 0;
    const clients = [];
    for (let i = 0; i < CLIENT_COUNT; i++) {
        const port = relays[Math.floor(Math.random() * relays.length)];
        const ws = new WebSocket(`ws://localhost:${port}`);
        await new Promise(r => ws.on('open', r));
        ws.send(JSON.stringify(['REQ', 'sub', {}]));
        ws.on('message', d => { if (JSON.parse(d)[0] === 'EVENT') eventsReceived++; });
        clients.push(ws);
    }

    const pubWs = new WebSocket(`ws://localhost:${relays[0]}`);
    await new Promise(r => pubWs.on('open', r));
    const event = { id: 'std-event', kind: 1, created_at: Math.floor(Date.now()/1000), content: 'hello' };
    pubWs.send(JSON.stringify(['EVENT', event]));
    
    await new Promise(r => setTimeout(r, 2000));
    console.log(`Reach: ${eventsReceived} / ${CLIENT_COUNT} clients received the event.`);

    clients.forEach(c => c.close());
    pubWs.close();
    serverProcs.forEach(p => p.kill());
    return eventsReceived;
}

async function runBTScenario(bootstrapDht) {
    console.log("\n=== Scenario B: BT-Nostr (P2P Discovery) ===");
    const serverProcs = [];
    serverProcs.push(await startRelay(9001, true)); 
    serverProcs.push(await startRelay(9002, false));
    serverProcs.push(await startRelay(9003, false));
    
    const dhtOpts = { bootstrap: [`127.0.0.1:${BOOTSTRAP_PORT}`] };

    const identity = new IdentityManager();
    identity.generate();
    
    const pubBT = new BitTorrentTransport({ dht: dhtOpts }); 
    const pubFeed = new FeedManager(pubBT, identity);
    const pubManager = new TransportManager(new HybridTransport(new NostrTransport(), pubBT), { feedManager: pubFeed });
    
    const event = { id: 'bt-event-' + Date.now(), kind: 1, created_at: Math.floor(Date.now()/1000), content: 'p2p hello', pubkey: 'pub' };
    
    console.log("[Test] Starting clients to populate DHT network...");
    let eventsReceived = 0;
    const clients = [];

    for (let i = 0; i < CLIENT_COUNT; i++) {
        await new Promise(r => setTimeout(r, 50)); 
        const bt = new BitTorrentTransport({ dht: dhtOpts });
        const id = new IdentityManager(); id.generate();
        const feed = new FeedManager(bt, id);
        const mgr = new TransportManager(new HybridTransport(new NostrTransport(), bt), { feedManager: feed });
        
        mgr.subscribeP2P(identity.getPublicKey()).then(items => {
            if (items && items.length > 0) eventsReceived++;
        });
        clients.push(bt);
    }

    await new Promise(r => setTimeout(r, 5000));

    try {
        console.log("[Test] Publisher putting to DHT...");
        await pubManager.publishP2P(event);
        console.log("[Test] Publisher posted to DHT.");
    } catch (e) {
        console.warn("[Test] WARN: Local DHT simulation often fails in single-process tests. Error:", e.message);
    }

    console.log("[Test] Waiting for propagation...");
    await new Promise(r => setTimeout(r, 10000)); 

    console.log(`Reach: ${eventsReceived} / ${CLIENT_COUNT} clients received the event.`);

    clients.forEach(c => c.disconnect());
    pubBT.disconnect();
    serverProcs.forEach(p => p.kill());
    return eventsReceived;
}

async function main() {
    try {
        const bootstrap = await startBootstrapNode();
        const resA = await runStandardScenario();
        await new Promise(r => setTimeout(r, 2000));
        const resB = await runBTScenario(bootstrap);
        
        console.log("\n=== Comparison ===");
        console.log(`Standard Reach: ${((resA/CLIENT_COUNT)*100).toFixed(0)}%`);
        console.log(`BT/P2P Reach:   ${((resB/CLIENT_COUNT)*100).toFixed(0)}%`);
        
        bootstrap.destroy();
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

main();