import 'dotenv/config';
import WebSocket from 'ws';
import * as nip19 from 'nostr-tools/nip19';
import { getPublicKey, finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { 
    TransportManager, 
    IdentityManager, 
    HybridTransport, 
    NostrTransport, 
    BitTorrentTransport,
    WoTManager,
    FeedManager,
    ProfileManager
} from 'nostr-over-bt';
import { TerminalUi } from './Ui.js';

// --- Fix for Node.js WebSocket support ---
global.WebSocket = class extends WebSocket {
    constructor(address, protocols, options) {
        super(address, protocols, {
            ...options,
            headers: {
                'User-Agent': 'nostr-over-bt-cli/1.0.0'
            }
        });
    }
};

const ui = new TerminalUi();

// --- Redirect Console to TUI ---
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const tuiLog = (...args) => ui.logDiscovery(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
const tuiError = (...args) => ui.logDiscovery(`{red-fg}ERROR: ${args.join(' ')}{/}`);
console.warn = (...args) => ui.logDiscovery(`{yellow-fg}WARN: ${args.join(' ')}{/}`); // Keep original warn
console.log = tuiLog;
console.error = tuiError;
console.info = tuiLog;
console.debug = tuiLog;


// --- Global Error Catching (Prevents stdout leaks) ---
process.on('uncaughtException', (err) => {
    tuiError('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    tuiError('Unhandled Rejection:', reason);
});


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
            originalError("CRITICAL: Invalid nsec provided in .env:", e.message);
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
const DEFAULT_RELAYS = [
    'ws://localhost:8080',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social'
];

const identity = IdentityManager.fromNostrSecretKey(privateKeyHex);

const bt = new BitTorrentTransport({ dht: true, announce: ['ws://localhost:8081'] });
const relays = process.env.RELAY_URL ? [process.env.RELAY_URL] : DEFAULT_RELAYS;
const nostr = new NostrTransport(relays);
const hybrid = new HybridTransport(nostr, bt);
const wot = new WoTManager(nostr);
const feed = new FeedManager(bt, identity);
const profiles = new ProfileManager(nostr);

const manager = new TransportManager(hybrid, { wotManager: wot, feedManager: feed });

let currentView = 'global'; // 'global' or 'bt-only'
const allMessages = []; // Store all incoming messages for filtering

// Helper to display messages based on current view
const displayMessages = () => {
    ui.timeline.setContent(''); // Clear current view
    const messagesToDisplay = allMessages.filter(m => currentView === 'global' || m.isHybrid);
    messagesToDisplay.forEach(m => ui.logMessage(m.author, m.content, m.source));
};

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
            await manager.bootstrapWoTP2P(val).catch(e => ui.logDiscovery(`{red-fg}Follow error: ${e.message}{/}`));
            break;

        case '/search':
            ui.logDiscovery(`FTS Search: "${val}"`);
            nostr.subscribe({ search: val, limit: 10 }, (event) => {
                const name = profiles.getDisplayName(event.pubkey);
                ui.logMessage(name, `[SEARCH] ${event.content}`, 'Relay');
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
            ui.logDiscovery(" /view             - Toggle between Global and Nostr-BT only feeds");
            ui.logDiscovery(" /quit             - Exit application");
            ui.logDiscovery(" /help             - Show this list");
            break;

        case '/view':
            currentView = currentView === 'global' ? 'bt-only' : 'global';
            ui.logDiscovery(`Switched to ${currentView === 'global' ? 'Global' : 'Nostr-BT Only'} feed.`);
            displayMessages(); // Re-render the timeline with the current messages based on the new view
            break;

        case '/quit':
            await hybrid.disconnect().catch(() => {});
            process.exit(0);
            break;

        default:
            ui.logDiscovery(`{red-fg}Unknown command: ${cmd}{/}`);
    }
};

// --- 3. Telemetry Loop ---

async function start() {
    try {
        originalLog("[Diag] Entering start()...");
        
        // NOW enable redirection (after initial Diag logs)
        // console.log, console.error, console.warn already redirected above.

        ui.render(); 
        
        console.log(`Nostr Identity: ${myNostrPk.substring(0,8)}...`);
        console.log(`P2P Address: ${identity.getPublicKey().substring(0,16)}...`);
        
        console.log(`DHT Status: Connecting...`);
        
        await hybrid.connect();
        console.log(`Network: Online.`);

        // Subscribe to global notes (Kind 1)
        nostr.subscribe({ kinds: [1], limit: 50 }, (event) => {
            if (event.pubkey === myNostrPk) return;
            
            profiles.fetchProfile(event.pubkey);
            manager.handleIncomingEvent(event);

            const name = profiles.getDisplayName(event.pubkey);
            const isHybrid = event.tags?.some(t => t[0] === 'bt') || event.content?.startsWith('magnet:');
            
            const messageObj = {
                author: name,
                content: event.content,
                source: isHybrid ? 'Hybrid' : 'Relay',
                isHybrid: isHybrid
            };
            allMessages.push(messageObj);

            if (currentView === 'global' || (currentView === 'bt-only' && isHybrid)) {
                ui.logMessage(messageObj.author, messageObj.content, messageObj.source);
            }
        });

        // Initial P2P sync
        manager.subscribeFollowsP2P().then(events => {
            if (events && events.length > 0) {
                console.log(`Found ${events.length} P2P events.`);
                events.forEach(e => {
                    profiles.fetchProfile(e.pubkey);
                    const name = profiles.getDisplayName(e.pubkey);
                    const messageObj = {
                        author: name,
                        content: e.content,
                        source: 'P2P',
                        isHybrid: true // P2P events are inherently hybrid
                    };
                    allMessages.push(messageObj);

                    if (currentView === 'global' || (currentView === 'bt-only' && messageObj.isHybrid)) {
                        ui.logMessage(name, e.content, 'P2P');
                    }
                });
            }
        }).catch(err => console.warn(`P2P Sync: ${err.message}`));

        setInterval(() => {
            const dht = bt.getDHT();
            const peers = bt.client.torrents.reduce((acc, t) => acc + (t.numPeers || 0), 0);
            const nodes = dht ? (dht.nodes ? dht.nodes.length : 0) : 0;
            const speed = Math.round((bt.client.downloadSpeed || 0) / 1024);
            ui.updateNetwork(speed, peers, nodes);
        }, 1000);

    } catch (err) {
        originalError("Startup Critical Error:", err);
        process.exit(1);
    }
}

start();
const stayAlive = setInterval(() => {}, 10000);