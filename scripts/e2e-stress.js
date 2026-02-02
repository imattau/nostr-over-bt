import { TransportManager } from '../src/core/TransportManager.js';
import { HybridTransport } from '../src/transport/HybridTransport.js';
import { NostrTransport } from '../src/transport/NostrTransport.js';
import { BitTorrentTransport } from '../src/transport/BitTorrentTransport.js';
import { WoTManager } from '../src/core/WoTManager.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools'; // Assuming nostr-tools is available
import os from 'os';

// --- Configuration ---
const CONFIG = {
    CONCURRENT_USERS: 100,      // Number of virtual users
    TEST_DURATION_SEC: 600,     // 10 Minutes
    TARGET_REQ_PER_SEC: 500,    // Higher throughput target
    FAILURE_THRESHOLDS: {
        ERROR_RATE_PERCENT: 5,
        MAX_LATENCY_MS: 500,
        MAX_MEMORY_MB: 1024,
        MAX_CPU_PERCENT: 80
    }
};

// --- Mocks for Stability ---
// We mock the network layer to test the LIBRARY'S architecture/overhead,
// not the internet connection or external relays.
class MockNostrTransport extends NostrTransport {
    async publish(event) { 
        await new Promise(r => setTimeout(r, 10 + Math.random() * 20)); // 10-30ms latency
        return 'ok'; 
    }
    async subscribe(filter, onEvent) { return; }
}

class MockBitTorrentTransport extends BitTorrentTransport {
    constructor() { super({ dht: false }); }
    async publish(data) { 
        await new Promise(r => setTimeout(r, 50 + Math.random() * 50)); // 50-100ms latency
        return 'magnet:?xt=urn:btih:' + Math.random().toString(36).substring(7); 
    }
    async fetch(magnet) {
        return Buffer.from("mock-data");
    }
}

// --- Virtual User ---
class VirtualUser {
    constructor(id) {
        this.id = id;
        // Generate random keys (simulated)
        this.pubkey = `pubkey-${id}`;
        
        const nostr = new MockNostrTransport();
        const bt = new MockBitTorrentTransport();
        const hybrid = new HybridTransport(nostr, bt);
        const wot = new WoTManager(nostr);
        this.manager = new TransportManager(hybrid, wot);
    }

    async actionPublish() {
        const start = performance.now();
        const event = {
            id: `evt-${this.id}-${Date.now()}`,
            pubkey: this.pubkey,
            created_at: Math.floor(Date.now() / 1000),
            kind: 1,
            tags: [],
            content: `Stress test content from user ${this.id}`,
            sig: 'sig'
        };
        await this.manager.publish(event);
        return performance.now() - start;
    }

    async actionFetch() {
        const start = performance.now();
        // Simulate fetching media
        const eventWithMedia = { tags: [['bt', 'magnet:test']] };
        await this.manager.fetchMedia(eventWithMedia);
        return performance.now() - start;
    }
}

// --- Main Test Loop ---
async function runStressTest() {
    console.log(`Starting E2E Stress Test...`);
    console.log(`Config: ${JSON.stringify(CONFIG, null, 2)}`);

    const users = Array.from({ length: CONFIG.CONCURRENT_USERS }, (_, i) => new VirtualUser(i));
    console.log(`Created ${users.length} virtual users.`);

    let totalRequests = 0;
    let failedRequests = 0;
    let totalLatency = 0;
    let startTime = Date.now();
    let isRunning = true;

    // Resource Monitoring
    const initialMemory = process.memoryUsage().heapUsed;
    const monitorInterval = setInterval(() => {
        const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const cpuLoad = os.loadavg()[0]; // 1-minute load average
        console.log(`[Monitor] RAM: ${memMB}MB | CPU Load: ${cpuLoad.toFixed(2)} | Reqs: ${totalRequests}`);

        if (memMB > CONFIG.FAILURE_THRESHOLDS.MAX_MEMORY_MB) {
            console.error("FAILURE: Memory threshold exceeded!");
            isRunning = false;
        }
    }, 1000);

    // Load Generator
    const endTime = startTime + (CONFIG.TEST_DURATION_SEC * 1000);
    
    // We'll use a loop that tries to maintain the target request rate
    // But for simplicity in Node, we'll just fire promises in a tight loop with concurrency limit
    // governed by the number of users (each user acts sequentially, but all run in parallel)
    
    const userLoops = users.map(async (user) => {
        while (isRunning && Date.now() < endTime) {
            try {
                // Randomly choose action: 70% Publish, 30% Fetch
                const isPublish = Math.random() > 0.3;
                let latency = 0;

                if (isPublish) {
                    latency = await user.actionPublish();
                } else {
                    latency = await user.actionFetch();
                }

                totalRequests++;
                totalLatency += latency;

                // Throttle to meet target req/sec roughly
                // (Very basic throttling)
                await new Promise(r => setTimeout(r, 1000 / (CONFIG.TARGET_REQ_PER_SEC / CONFIG.CONCURRENT_USERS)));

            } catch (err) {
                failedRequests++;
                // console.error(err);
            }
        }
    });

    await Promise.all(userLoops);
    clearInterval(monitorInterval);

    // --- Reporting ---
    const totalTimeSec = (Date.now() - startTime) / 1000;
    const avgLatency = totalLatency / totalRequests;
    const reqPerSec = totalRequests / totalTimeSec;
    const errorRate = (failedRequests / totalRequests) * 100;
    const finalMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    console.log("\n=== Stress Test Report ===");
    console.log(`Duration: ${totalTimeSec.toFixed(2)}s`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Throughput: ${reqPerSec.toFixed(2)} req/sec`);
    console.log(`Avg Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Error Rate: ${errorRate.toFixed(2)}%`);
    console.log(`Memory Usage: ${finalMemory}MB (Delta: ${Math.round((finalMemory - (initialMemory/1024/1024)))}MB)`);

    // --- Failure Check ---
    let passed = true;
    if (errorRate > CONFIG.FAILURE_THRESHOLDS.ERROR_RATE_PERCENT) {
        console.error(`FAIL: Error rate > ${CONFIG.FAILURE_THRESHOLDS.ERROR_RATE_PERCENT}%`);
        passed = false;
    }
    if (avgLatency > CONFIG.FAILURE_THRESHOLDS.MAX_LATENCY_MS) {
        console.error(`FAIL: Latency > ${CONFIG.FAILURE_THRESHOLDS.MAX_LATENCY_MS}ms`);
        passed = false;
    }

    if (passed) {
        console.log("RESULT: PASS");
        process.exit(0);
    } else {
        console.log("RESULT: FAIL");
        process.exit(1);
    }
}

runStressTest();
