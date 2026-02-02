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

const BOOTSTRAP_IP = '127.0.0.1';
const BOOTSTRAP_PORT = 6881;
const CLIENT_COUNT = 20;
const FILLER_NODES = 30; 

let currentIPIndex = 2; // Start from 127.0.0.2
function nextIP() {
    return `127.0.0.${currentIPIndex++}`;
}

class DirectDHTTransport {

    constructor(dht) { this.dht = dht; }

    getDHT() { return this.dht; }

    async publish(data) { 

        // Must return 40-char hex to pass validation

        const hash = Buffer.from(data.filename + Math.random()).toString('hex').padEnd(40, '0').substring(0, 40);

        return `magnet:?xt=urn:btih:${hash}`; 

    } 

    async fetch(magnet) { return Buffer.from('{"items":[]}'); } 

    async disconnect() { return new Promise(r => this.dht.destroy(r)); }

}



async function startBootstrapNode() {
    const dht = new DHT();
    return new Promise(resolve => dht.listen(BOOTSTRAP_PORT, BOOTSTRAP_IP, () => resolve(dht)));
}

async function createDHTNode() {
    const ip = nextIP();
    const dht = new DHT({ bootstrap: [`${BOOTSTRAP_IP}:${BOOTSTRAP_PORT}`], host: ip });
    return new Promise(resolve => dht.listen(0, ip, () => resolve(dht)));
}

async function startRelay(port, enableBt) {
    const ip = nextIP();
    const args = enableBt ? [] : ['--no-bt'];
    const env = { 
        ...process.env, 
        PORT: port, 
        TRACKER_PORT: port + 1000, 
        DHT_BOOTSTRAP: `${BOOTSTRAP_IP}:${BOOTSTRAP_PORT}`,
        DHT_HOST: ip
    };
    const proc = spawn('node', [SERVER_PATH, ...args], { env, stdio: ['ignore', 'pipe', 'inherit'] }); 
    let relayIdentity = null;
    return new Promise(resolve => {
        proc.stdout.on('data', d => {
            const line = d.toString();
            if (line.includes('[Relay] P2P Identity:')) relayIdentity = line.split('Identity: ')[1].trim();
            if (line.includes('Listening')) resolve({ proc, relayIdentity });
        });
    });
}

async function main() {
    console.log("=== Final Discovery Test: Multi-IP Loopback Simulation ===");
    const bootstrap = await startBootstrapNode();
    console.log(`[Net] Bootstrap on ${BOOTSTRAP_IP}:${BOOTSTRAP_PORT}`);
    
    const fillers = [];
    console.log(`[Net] Starting ${FILLER_NODES} filler nodes on unique IPs...`);
    for(let i=0; i<FILLER_NODES; i++) {
        const dht = await createDHTNode();
        dht.put({ v: 'warmup' }, () => {}); // Force announcement
        fillers.push(dht);
    }

    console.log("[Net] Starting Relays on unique IPs...");
    const relays = []; 
    relays.push({ port: 9001, isBt: true, ...(await startRelay(9001, true)) });
    relays.push({ port: 9002, isBt: false, ...(await startRelay(9002, false)) });
    relays.push({ port: 9003, isBt: false, ...(await startRelay(9003, false)) });

    let discoveredCount = 0;
    const clients = [];
    console.log(`[Test] Configuring ${CLIENT_COUNT} Clients on unique IPs...`);
    for (let i = 0; i < CLIENT_COUNT; i++) {
        const dht = await createDHTNode();
        const bt = new DirectDHTTransport(dht);
        const id = new IdentityManager();
        id.generate();
        const feed = new FeedManager(bt, id);
        const myRelays = [];
        const possibleRelays = [9001, 9002, 9003];
        const count = Math.random() > 0.5 ? 2 : 1;
        while(myRelays.length < count) {
            const r = possibleRelays[Math.floor(Math.random() * possibleRelays.length)];
            if (!myRelays.includes(r)) myRelays.push(r);
        }
        const clientObj = { id: i, relays: myRelays, bt, feed, received: false };
        clientObj.sockets = myRelays.map(port => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            ws.on('open', () => ws.send(JSON.stringify(['REQ', `sub-${i}`, {}])))
            ws.on('message', d => {
                const msg = JSON.parse(d);
                if (msg[0] === 'EVENT' && !clientObj.received) {
                    clientObj.received = true;
                    discoveredCount++;
                }
            });
            return ws;
        });
        const checkDHT = async () => {
            if (clientObj.received) return;
            try {
                const ptr = await feed.resolveFeedPointer(relays[0].relayIdentity);
                if (ptr) {
                    clientObj.received = true;
                    discoveredCount++;
                    console.log(`Client ${i} DISCOVERED via DHT!`);
                }
            } catch(e) {}
        };
        clientObj.poller = setInterval(checkDHT, 3000);
        clients.push(clientObj);
    }

    console.log("[Net] Warming up DHT network (20s)...");
    await new Promise(r => setTimeout(r, 20000));

    console.log("[Test] Publishing Event to Relay 9001 (BT)...");
    const pubWs = new WebSocket(`ws://localhost:9001`);
    await new Promise(r => pubWs.on('open', r));
    pubWs.send(JSON.stringify(['EVENT', { id: 'final-test', kind: 1, created_at: Math.floor(Date.now()/1000), content: 'multi-ip' }]));

    console.log("[Test] Waiting for P2P propagation (20s)...");
    await new Promise(r => setTimeout(r, 20000));

    console.log(`\n=== Results ===`);
    console.log(`Total Reach: ${discoveredCount} / ${CLIENT_COUNT} (${(discoveredCount/CLIENT_COUNT*100).toFixed(0)}%)`);
    const onBtRelay = clients.filter(c => c.relays.includes(9001)).length;
    console.log(`Directly connected to BT-Relay: ${onBtRelay}`);
    console.log(`Discovery Boost (DHT): ${discoveredCount - onBtRelay} clients`);
    
    process.exit(0);
}
main();
