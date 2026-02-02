import crypto from 'crypto';
import { TransportManager } from '../src/core/TransportManager.js';
import { FeedManager } from '../src/core/FeedManager.js';
import { IdentityManager } from '../src/core/IdentityManager.js';
import { WoTManager } from '../src/core/WoTManager.js';
// ...
class MockDHT {
    constructor() { this.store = new Map(); }
    put(opts, cb) { 
        // Match FeedManager logic: target = SHA1(k)
        const target = crypto.createHash('sha1').update(opts.k).digest('hex');
        this.store.set(target, { v: opts.v, seq: opts.seq });
        cb(null, Buffer.from('success')); 
    }
    get(target, cb) {
        cb(null, this.store.get(target.toString('hex')) || null);
    }
}

class MockBT {
    constructor() { this.dht = new MockDHT(); this.torrents = new Map(); }
    getDHT() { return this.dht; }
    async publish(data) {
        const hash = Buffer.from(Math.random().toString()).toString('hex').padEnd(40, '0');
        const magnet = `magnet:?xt=urn:btih:${hash}`;
        this.torrents.set(hash, data.buffer);
        return magnet;
    }
    async fetch(magnet) {
        const hash = magnet.match(/xt=urn:btih:([a-fA-F0-9]+)/)[1];
        return this.torrents.get(hash);
    }
}

async function main() {
    console.log("=== WoT Discovery Stress Test ===");
    
    const sharedBT = new MockBT();
    const mockNostr = { subscribe: () => {} };

    // 1. Setup Graph: Alice -> Bob -> Charlie
    // Alice follows Bob (Degree 1)
    // Bob follows Charlie (Degree 2)
    // Alice wants to discover Charlie's event via Bob's feed.

    console.log("[Test] Creating Identities...");
    const aliceId = new IdentityManager(); aliceId.generate();
    const bobId = new IdentityManager(); bobId.generate();
    const charlieId = new IdentityManager(); charlieId.generate();

    const aliceMgr = new TransportManager({ bt: sharedBT, nostr: mockNostr }, {
        feedManager: new FeedManager(sharedBT, aliceId),
        wotManager: new WoTManager(mockNostr)
    });

    const bobMgr = new TransportManager({ bt: sharedBT, nostr: mockNostr }, {
        feedManager: new FeedManager(sharedBT, bobId)
    });

    const charlieMgr = new TransportManager({ bt: sharedBT, nostr: mockNostr }, {
        feedManager: new FeedManager(sharedBT, charlieId)
    });

    // 2. Publish Charlie's Event
    console.log("[Charlie] Publishing private event...");
    const charlieEvent = { id: 'charlie-post', kind: 1, created_at: 3000, content: 'Secret!' };
    await charlieMgr.publishP2P(charlieEvent);

    // 3. Publish Bob's Contact List (Following Charlie)
    console.log("[Bob] Publishing contact list (following Charlie)...");
    const bobContactList = {
        id: 'bob-contacts', kind: 3, created_at: 2000,
        tags: [['p', 'charlie-nostr-pk']]
    };
    // Mock mapping for test: charlie-nostr-pk -> charlieId.publicKey
    aliceMgr.keyCache.set('charlie-nostr-pk', charlieId.getPublicKey());
    aliceMgr.keyCache.set('bob-nostr-pk', bobId.getPublicKey());

    await bobMgr.publishP2P(bobContactList);

    // 4. Alice starts with ONLY Bob in her WoT
    console.log("[Alice] Initializing WoT with Bob...");
    aliceMgr.wotManager.follows.set('bob-nostr-pk', { degree: 1 });

    // 5. Run Recursive Discovery
    console.log("[Alice] Starting Recursive P2P Discovery...");
    const start = performance.now();
    
    await aliceMgr.syncWoTRecursiveP2P();
    const events = await aliceMgr.subscribeFollowsP2P();

    const end = performance.now();

    // 6. Verification
    console.log(`
=== Results ===`);
    console.log(`Discovery Time: ${(end - start).toFixed(2)}ms`);
    console.log(`WoT Size: ${aliceMgr.wotManager.follows.size} nodes`);
    
    const foundCharlie = events.some(e => e.id === 'charlie-post');
    console.log(`Discovered Charlie's event via Bob: ${foundCharlie ? 'YES' : 'NO'}`);

    if (foundCharlie) {
        console.log("SUCCESS: Multi-degree discoverability verified!");
    } else {
        console.log("FAIL: Charlie was not discovered.");
        process.exit(1);
    }
}

main();
