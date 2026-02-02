import WebSocket from 'ws';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import WebTorrent from 'webtorrent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.join(__dirname, 'server.js');
const RELAY_URL = 'ws://localhost:8888';

const PAYLOAD_SIZE = 1024 * 1024 * 5; // 5MB Payload to keep leechers busy
const LEECHER_COUNT = 10;
const TEST_EVENT_COUNT = 20;

// Helper to start the relay
function startRelay() {
    const serverProcess = spawn('node', [SERVER_PATH], { stdio: 'pipe' });
    return new Promise((resolve) => {
        // Wait for output indicating start
        serverProcess.stdout.on('data', (data) => {
            if (data.toString().includes('Listening')) resolve(serverProcess);
        });
    });
}

// Helper to publish a large file event to get a magnet
async function publishLargeEvent(ws) {
    const largeBuffer = Buffer.alloc(PAYLOAD_SIZE, 'a');
    // We can't easily push 5MB via the WS mock relay as designed without crashing/timeout 
    // or the relay's internal logic.
    // Instead, we will use a dedicated WebTorrent client to create a magnet, 
    // and just tell the relay "Here is an event" - wait, the relay needs to SEED it.
    // 
    // To make the relay seed it, we must send it via WS. 5MB might be too big for WS frame default?
    // Let's try 500KB.
    const size = 1024 * 500; // 500KB
    const content = 'x'.repeat(size);
    
    const event = {
        id: `load-event-${Date.now()}`,
        pubkey: 'load-maker',
        created_at: Math.floor(Date.now()/1000),
        kind: 1,
        content: content,
        sig: 'sig'
    };

    return new Promise((resolve) => {
        ws.send(JSON.stringify(['EVENT', event]));
        ws.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg[0] === 'OK' && msg[1] === event.id) {
                // Parse the logs or assume the relay logic:
                // The relay logs "Seeded! Magnet: ..."
                // But the client doesn't get the magnet in the OK message in standard NIP-20
                // Our modified server sends: ['OK', id, true, 'stored & seeded via BT']
                // But it doesn't send the magnet back in the OK message payload usually.
                // WE NEED THE MAGNET.
                // I'll cheat: calculate the magnet client-side using WebTorrent 
                // on the exact same data to ensure we match.
                resolve(event);
            }
        });
    });
}

// Helper: Measure time to publish N small events
async function measureIngestion(label) {
    const ws = new WebSocket(RELAY_URL);
    await new Promise(r => ws.on('open', r));

    const start = performance.now();
    let acks = 0;

    for (let i = 0; i < TEST_EVENT_COUNT; i++) {
        ws.send(JSON.stringify(['EVENT', {
            id: `test-${label}-${i}-${Date.now()}`,
            kind: 1,
            content: 'small',
            pubkey: 'tester',
            created_at: Math.floor(Date.now()/1000),
            sig: 'sig'
        }]));
    }

    await new Promise(resolve => {
        ws.on('message', d => {
            if (JSON.parse(d)[0] === 'OK') {
                acks++;
                if (acks === TEST_EVENT_COUNT) resolve();
            }
        });
    });

    ws.close();
    return performance.now() - start;
}

// Helper: Get magnet for event (locally)
function getMagnet(event) {
    return new Promise(resolve => {
        const client = new WebTorrent({ dht: false, tracker: false });
        const buffer = Buffer.from(JSON.stringify(event));
        client.seed(buffer, { name: `${event.id}.json` }, torrent => {
            const magnet = torrent.magnetURI;
            client.destroy();
            resolve(magnet);
        });
    });
}

async function runSwarmBenchmark() {
    console.log("=== Swarm Impact Benchmark ===");
    
    // 1. Start Relay
    const serverProc = await startRelay();
    console.log("Relay started.");

    // 2. Publish Payload Event
    const ws = new WebSocket(RELAY_URL);
    await new Promise(r => ws.on('open', r));
    const loadEvent = await publishLargeEvent(ws);
    const magnet = await getMagnet(loadEvent);
    console.log(`Load Event Published. Magnet: ${magnet.substring(0, 40)}...`);
    ws.close();

    // 3. Baseline Ingestion (No Load)
    const tBase = await measureIngestion('base');
    console.log(`Baseline Ingestion: ${tBase.toFixed(2)}ms`);

    // 4. Load: Solo Relay (Leechers vs Relay)
    console.log(`
--- Starting ${LEECHER_COUNT} Leechers (Solo Relay) ---
`);
    const leechers1 = [];
    // Start leechers
    for(let i=0; i<LEECHER_COUNT; i++) {
        const client = new WebTorrent({ dht: true }); // Must enable DHT to find relay
        client.add(magnet, { path: `/tmp/nostr-bench/leech-${i}` }); // Download
        leechers1.push(client);
    }
    
    // Give them a moment to start swarming
    await new Promise(r => setTimeout(r, 2000));

    // Measure Ingestion while Leeching
    const tSolo = await measureIngestion('solo');
    console.log(`Solo Relay Ingestion: ${tSolo.toFixed(2)}ms`);

    // Cleanup Leechers
    leechers1.forEach(c => c.destroy());
    
    // 5. Load: Relay + Helpers (Swarm Help)
    console.log(`
--- Starting Helpers + Leechers (Swarm) ---
`);
    
    // Start Helpers (Seeds)
    const helpers = [];
    for(let i=0; i<5; i++) {
        const client = new WebTorrent({ dht: true });
        // Seed the SAME buffer
        const buffer = Buffer.from(JSON.stringify(loadEvent));
        client.seed(buffer, { name: `${loadEvent.id}.json` });
        helpers.push(client);
    }
    
    // Wait for helpers to announce
    await new Promise(r => setTimeout(r, 3000));

    // Start Leechers again
    const leechers2 = [];
    for(let i=0; i<LEECHER_COUNT; i++) {
        const client = new WebTorrent({ dht: true });
        client.add(magnet, { path: `/tmp/nostr-bench/leech-2-${i}` });
        leechers2.push(client);
    }

    await new Promise(r => setTimeout(r, 2000));

    // Measure Ingestion
    const tSwarm = await measureIngestion('swarm');
    console.log(`Swarm Helped Ingestion: ${tSwarm.toFixed(2)}ms`);

    // Cleanup
    helpers.forEach(c => c.destroy());
    leechers2.forEach(c => c.destroy());
    serverProc.kill();
    
    // Report
    console.log("\n=== Results ===");
    console.log(`Baseline: ${tBase.toFixed(2)}ms`);
    console.log(`Under Load (Solo): ${tSolo.toFixed(2)}ms`);
    console.log(`Under Load (Swarm): ${tSwarm.toFixed(2)}ms`);
    
    if (tSwarm < tSolo) {
        console.log("SUCCESS: Swarm peers improved relay responsiveness!");
    } else {
        console.log("NOTE: Swarm overhead (DHT traffic) might be outweighing bandwidth savings in this local simulation.");
    }
    
    process.exit(0);
}

runSwarmBenchmark();
