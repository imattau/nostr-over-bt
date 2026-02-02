import WebSocket from 'ws';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.join(__dirname, 'server.js');
const RELAY_URL = 'ws://localhost:8888';

const EVENT_COUNT = 50; 
const TIMEOUT_MS = 15000;

let currentPort = 8888;

async function runBenchmark(label, options = {}) {
    const port = currentPort++;
    const trackerPort = port + 1000;
    const relayUrl = `ws://localhost:${port}`;
    console.log(`
--- Starting Benchmark: ${label} (Port: ${port}) ---`);
    
    // Start Server
    const args = options.enableBt ? [] : ['--no-bt'];
    const env = { ...process.env, PORT: port, TRACKER_PORT: trackerPort };
    const serverProcess = spawn('node', [SERVER_PATH, ...args], { env, stdio: 'pipe' });

    // Wait for server and drain pipes
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);
        serverProcess.stdout.on('data', d => {
            const msg = d.toString();
            if (msg.includes('Listening')) {
                clearTimeout(timeout);
                console.log(`[Bench] Server is listening.`);
                resolve();
            }
        });
        serverProcess.stderr.on('data', d => {
            console.log(`[Server Error] ${d.toString()}`);
        });
    });

    try {
        console.log(`[Bench] Connecting to ${relayUrl}...`);
        const ws = new WebSocket(relayUrl);
        await new Promise((r, j) => { 
            ws.on('open', () => { console.log("[Bench] Connected."); r(); }); 
            ws.on('error', j); 
        });

        let acks = 0;
        const start = performance.now();

        const count = options.repeat ? EVENT_COUNT * 2 : EVENT_COUNT;
        console.log(`[Bench] Blasting ${count} events...`);
        for (let i = 0; i < count; i++) {
            // In repeat mode, IDs cycle 0..49, 0..49
            const idIndex = options.repeat ? (i % EVENT_COUNT) : i;
            const event = {
                id: `bench-${label}-${idIndex}-${Date.now()}`,
                pubkey: 'bench-pub',
                created_at: Math.floor(Date.now() / 1000),
                kind: 1,
                tags: options.native ? [['bt', 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678']] : [],
                content: `Benchmark payload ${i}`,
                sig: 'sig'
            };
            ws.send(JSON.stringify(['EVENT', event]));
        }

        console.log(`[Bench] Waiting for ${count} ACKs...`);
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Timeout after ${acks}/${count} ACKs`)), TIMEOUT_MS);
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    if (msg[0] === 'OK') {
                        acks++;
                        if (acks % 10 === 0) console.log(`[Bench] Received ${acks} ACKs...`);
                        if (acks === count) { clearTimeout(timeout); resolve(); }
                    }
                } catch(e) {}
            });
        });

        const end = performance.now();
        const tps = count / ((end - start) / 1000);
        console.log(`Throughput: ${tps.toFixed(2)} events/sec`);
        ws.close();
        return tps;

    } finally {
        serverProcess.kill('SIGINT');
        await new Promise(resolve => {
            serverProcess.on('exit', resolve);
            // Fallback timeout
            setTimeout(resolve, 3000);
        });
    }
}

async function main() {
    console.log("=== Comprehensive Ingestion Benchmark ===");
    
    const tpsStandard = await runBenchmark('Standard Nostr (No BT)', { enableBt: false });
    const tpsBridge = await runBenchmark('BT-Nostr (Bridge Mode/Hashing)', { enableBt: true, native: false });
    const tpsNative = await runBenchmark('BT-Nostr (Native Mode/Pre-tagged)', { enableBt: true, native: true });
    
    // For Cached, we run the SAME events twice or just many events to see the effect of hits
    // Since our benchmark creates unique IDs per loop, we need a special 'cached' mode 
    // where it repeats the same 50 events. 
    // For simplicity, let's just run Native again and see if it's faster? 
    // No, I'll add a 'repeat' option.
    const tpsCached = await runBenchmark('BT-Nostr (Cached Mode/Repeat IDs)', { enableBt: true, native: true, repeat: true });

    console.log("\n=== Final Comparison ===");
    console.log(`1. Standard:  ${tpsStandard.toFixed(2)} TPS`);
    console.log(`2. BT-Bridge:  ${tpsBridge.toFixed(2)} TPS`);
    console.log(`3. BT-Native:  ${tpsNative.toFixed(2)} TPS`);
    console.log(`4. BT-Cached:  ${tpsCached.toFixed(2)} TPS`);
    
    console.log("\nSummary:");
    console.log(`Native mode is ${(tpsNative / tpsBridge).toFixed(1)}x faster than Bridge mode.`);
    console.log(`Cached mode is ${(tpsCached / tpsNative).toFixed(1)}x faster than Native mode.`);
    console.log(`Cached mode achieves ${((tpsCached / tpsStandard) * 100).toFixed(1)}% of Standard performance.`);
}

main().catch(console.error);