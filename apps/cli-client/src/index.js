import 'dotenv/config';
import * as nip19 from 'nostr-tools/nip19';
import { getPublicKey, finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { 
    TransportManager, 
    IdentityManager, 
    HybridTransport, 
    NostrTransport, 
    BitTorrentTransport,
    WoTManager,
    FeedManager
} from 'nostr-over-bt';
import { TerminalUi } from './Ui.js';

const ui = new TerminalUi();

// --- Redirect Console to TUI ---
console.log = (...args) => ui.logDiscovery(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
console.error = (...args) => ui.logDiscovery(`{red-fg}ERROR: ${args.join(' ')}{/}`);
console.warn = (...args) => ui.logDiscovery(`{yellow-fg}WARN: ${args.join(' ')}{/}`);

// --- 1. Initialize Identity ---
let privateKey;
let privateKeyHex;

if (process.env.PRIVATE_KEY) {
    let keyData = process.env.PRIVATE_KEY;
    if (keyData.startsWith('nsec1')) {
        try {
            const { data } = nip19.decode(keyData);
            privateKeyHex = data;
        } catch (e) {
            console.error("Invalid nsec provided in .env");
            process.exit(1);
        }
    } else {
        privateKeyHex = keyData;
    }
    privateKey = Buffer.from(privateKeyHex, 'hex');
} else {
    privateKey = generateSecretKey();
    privateKeyHex = Buffer.from(privateKey).toString('hex');
}

const myNostrPk = getPublicKey(privateKey);
const identity = IdentityManager.fromNostrSecretKey(privateKeyHex);

const bt = new BitTorrentTransport({ dht: true, announce: ['ws://localhost:8081'] });
const nostr = new NostrTransport([process.env.RELAY_URL || 'ws://localhost:8080']);
const hybrid = new HybridTransport(nostr, bt);
const wot = new WoTManager(nostr);
const feed = new FeedManager(bt, identity);

const manager = new TransportManager(hybrid, { wotManager: wot, feedManager: feed });

// --- 2. Input Handling ---

ui.onInput = async (msg) => {
    if (!msg.startsWith('/')) {
        ui.logDiscovery("{yellow-fg}Command required.{/} Type {bold}/new <message>{/} to post or {bold}/help{/} for list.");
        return;
    }

    const [cmd, ...args] = msg.split(' ');
    const val = args.join(' ');

    switch (cmd) {
        case '/new':
            if (!val) return;
            const hashtags = val.match(/#[a-zA-Z0-9]+/g) || [];
            const tags = hashtags.map(t => ['t', t.substring(1)]);
            const eventTemplate = {
                kind: 1,
                created_at: Math.floor(Date.now() / 1000),
                content: val,
                tags: tags
            };
            const signedEvent = finalizeEvent(eventTemplate, privateKey);
            ui.logMessage('Me', val, 'Hybrid');
            await manager.publish(signedEvent);
            break;

        case '/follow':
            ui.logDiscovery(`Mapping P2P path for: ${val.substring(0,8)}...`);
            await manager.bootstrapWoTP2P(val);
            ui.logDiscovery(`Graph Expanded via DHT.`);
            break;

        case '/search':
            ui.logDiscovery(`FTS Search: "${val}"`);
            nostr.subscribe({ search: val, limit: 10 }, (event) => {
                ui.logMessage(event.pubkey, `[SEARCH] ${event.content}`, 'Relay');
            });
            break;

        case '/relay': {
            const [sub, url] = args;
            if (sub === 'add') { nostr.addRelay(url); ui.logDiscovery(`Added relay: ${url}`); }
            else if (sub === 'remove') { nostr.removeRelay(url); ui.logDiscovery(`Removed relay: ${url}`); }
            else if (sub === 'list') { ui.logDiscovery(`Active Relays: ${nostr.relays.join(', ')}`); }
            break;
        }

        case '/tracker': {
            const [sub, url] = args;
            if (sub === 'add') { bt.addTracker(url); ui.logDiscovery(`Added tracker: ${url}`); }
            else if (sub === 'list') { ui.logDiscovery(`Active Trackers: ${bt.announce.join(', ')}`); }
            break;
        }

        case '/clear':
            ui.timeline.setContent('');
            ui.searchPanel.setContent('');
            break;

        case '/help':
            ui.logDiscovery("Available Commands:");
            ui.logDiscovery(" /new <msg>        - Post hybrid message");
            ui.logDiscovery(" /follow <pk>      - Start P2P discovery");
            ui.logDiscovery(" /search <q>       - Full-text search");
            ui.logDiscovery(" /relay add <url>  - Connect to relay");
            ui.logDiscovery(" /relay list       - List connections");
            ui.logDiscovery(" /tracker add <u>  - Add BT tracker");
            ui.logDiscovery(" /clear            - Reset panels");
            ui.logDiscovery(" /quit             - Exit application");
            ui.logDiscovery(" /help             - Show this list");
            break;

        case '/quit':
            await hybrid.disconnect();
            process.exit(0);
            break;

        default:
            ui.logDiscovery(`{red-fg}Unknown command: ${cmd}{/}`);
    }
};

// --- 3. Telemetry Loop ---

async function start() {
    ui.logDiscovery(`Nostr Identity: ${myNostrPk.substring(0,8)}...`);
    ui.logDiscovery(`P2P Address: ${identity.getPublicKey().substring(0,16)}...`);
    if (!process.env.PRIVATE_KEY) ui.logDiscovery("Notice: Using temporary random identity.");
    
    await hybrid.connect();

    setInterval(() => {
        const dht = bt.getDHT();
        const peers = bt.client.torrents.reduce((acc, t) => acc + (t.numPeers || 0), 0);
        const nodes = dht ? (dht.nodes ? dht.nodes.length : 0) : 0;
        const speed = Math.round((bt.client.downloadSpeed || 0) / 1024);
        ui.updateNetwork(speed, peers, nodes);
    }, 1000);

    ui.render();
}

start().catch(console.error);
