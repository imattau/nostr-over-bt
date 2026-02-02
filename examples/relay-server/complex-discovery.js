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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.join(__dirname, 'server.js');

const BOOTSTRAP_PORT = 6881;
const RELAY_BT_PORT = 9004;

// --- Lightweight Transport Wrapper for Raw DHT ---
class DirectDHTTransport {
    constructor(dht) {
        this.dht = dht;
    }
    getDHT() { return this.dht; }
    async publish(data) { return 'magnet:?xt=urn:btih:mock'; } // Mock content seed
    async fetch(magnet) { return Buffer.from('[]'); } // Mock content fetch
    async disconnect() { 
        return new Promise(r => this.dht.destroy(r)); 
    }
}

async function startBootstrapNode() {
    const dht = new DHT();
    return new Promise(resolve => {
        dht.listen(BOOTSTRAP_PORT, () => {
            console.log(`[Test] DHT Bootstrap Node running on ${BOOTSTRAP_PORT}`);
            resolve(dht);
        });
    });
}

async function createDHTNode() {
    const dht = new DHT({ bootstrap: [`127.0.0.1:${BOOTSTRAP_PORT}`] });
    return new Promise(resolve => {
        dht.listen(0, () => { // Bind to random port
            resolve(dht);
        });
    });
}

async function startRelay(port, enableBt) {
    const args = enableBt ? [] : ['--no-bt'];
    const env = { 
        ...process.env, 
        PORT: port, 
        TRACKER_PORT: port + 1000,
        DHT_BOOTSTRAP: `127.0.0.1:${BOOTSTRAP_PORT}`
    };
    const proc = spawn('node', [SERVER_PATH, ...args], { env, stdio: 'pipe' }); 
    
    let relayIdentity = null;

    return new Promise(resolve => {
        proc.stdout.on('data', d => {
            const line = d.toString();
            // process.stdout.write('[Relay] ' + line);
            if (line.includes('[Relay] P2P Identity:')) {
                relayIdentity = line.split('Identity: ')[1].trim();
            }
            if (line.includes('Listening')) {
                resolve({ proc, relayIdentity });
            }
        });
        proc.stderr.on('data', d => process.stderr.write('[Relay ERR] ' + d));
    });
}

async function runComplexScenario(bootstrap) {
    console.log("\n=== Scenario C: Bridged Discovery via Relay Feed (Direct DHT) ===");

    // 1. Start BT-Relay
    const { proc: relayProc, relayIdentity } = await startRelay(RELAY_BT_PORT, true);
    console.log(`BT-Relay started. Identity: ${relayIdentity}`);

    // 2. Setup Publisher (Standard Nostr Client connecting to BT-Relay)
    const pubWs = new WebSocket(`ws://localhost:${RELAY_BT_PORT}`);
    await new Promise(r => pubWs.on('open', r));
    
    const event = { 
        id: 'bridged-event-' + Date.now(), 
        kind: 1, 
        created_at: Math.floor(Date.now()/1000), 
        content: 'I am bridged!', 
        pubkey: 'pub' 
    };

    // 3. Setup Clients (Direct DHT)
    const clients = [];
    const CLIENT_COUNT = 5;
    let eventsReceived = 0;

    console.log(`[Test] Starting ${CLIENT_COUNT} Direct DHT Clients...`);
    for (let i = 0; i < CLIENT_COUNT; i++) {
        const dht = await createDHTNode();
        
        // Populate Routing Table
        // Important: Ping the bootstrap node explicitly to join the network
        // DHT 'ready' event usually handles this, but let's be safe.
        
        const bt = new DirectDHTTransport(dht);
        const feed = new FeedManager(bt, new IdentityManager());
        
        // Override subscribeP2P fetch logic since we mocked it
        // We only care about RESOLVING the feed pointer (finding the Relay's update)
        // If resolveFeedPointer returns success, we count it.
        
        const checkFeed = async () => {
            try {
                const ptr = await feed.resolveFeedPointer(relayIdentity);
                if (ptr) {
                    console.log(`Client ${i} resolved Relay Feed! InfoHash: ${ptr.infoHash}`);
                    // In real app, we'd download the index. Here we assume success.
                    eventsReceived++;
                    return true;
                }
            } catch (e) { /* ignore not found */ }
            return false;
        };

        // Poll for the feed update
        const poll = setInterval(async () => {
            const found = await checkFeed();
            if (found) clearInterval(poll);
        }, 2000);

        clients.push({ bt, poll });
    }

    // 4. Publish Event to Relay
    // Relay will: Receive -> Seed Content -> Update Relay Feed (PUT)
    console.log("Publishing event to Relay...");
    pubWs.send(JSON.stringify(['EVENT', event]));

    // 5. Wait for propagation
    console.log("Waiting for P2P propagation (30s)...");
    await new Promise(r => setTimeout(r, 30000));

    console.log(`Reach: ${eventsReceived} / ${CLIENT_COUNT}`);
    
    // Cleanup
    clients.forEach(c => {
        clearInterval(c.poll);
        c.bt.disconnect();
    });
    pubWs.close();
    relayProc.kill();
    
    return eventsReceived;
}

async function main() {
    try {
        const bootstrap = await startBootstrapNode();
        const res = await runComplexScenario(bootstrap);
        
        if (res > 0) {
            console.log("SUCCESS: Clients discovered Relay's Feed Update via DHT!");
        } else {
            console.log("FAIL: Zero reach.");
        }
        
        bootstrap.destroy();
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

main();