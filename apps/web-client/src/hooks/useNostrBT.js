import { useState, useEffect, useCallback, useRef } from 'react';
import { 
    TransportManager, 
    IdentityManager, 
    HybridTransport, 
    NostrTransport, 
    BitTorrentTransport,
    ProfileManager,
    WoTManager,
    FeedManager
} from 'nostr-over-bt';
import { finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

export function useNostrBT() {
    const [status, setStatus] = useState('initializing');
    const [messages, setMessages] = useState([]);
    const [peers, setPeers] = useState(0);
    const [speed, setSpeed] = useState('0 KB/s');
    const [identity, setIdentity] = useState(null);
    const [swarmEvents, setSwarmEvents] = useState([]);
    const [oldestTs, setOldestTs] = useState(Math.floor(Date.now() / 1000));
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const managerRef = useRef(null);
    const hybridRef = useRef(null);
    const initialized = useRef(false);
    const isMounted = useRef(true);

    const logSwarmEvent = useCallback((msg, type = 'info') => {
        if (!isMounted.current) return;
        const time = new Date().toTimeString().split(' ')[0];
        setSwarmEvents(prev => [{ time, msg, type }, ...prev].slice(0, 20));
    }, []);

    useEffect(() => {
        isMounted.current = true;
        if (initialized.current) return;
        initialized.current = true;

        let sk = localStorage.getItem('nostr_nsec');
        if (!sk) {
            sk = Buffer.from(generateSecretKey()).toString('hex');
            localStorage.setItem('nostr_nsec', sk);
        }
        const id = IdentityManager.fromNostrSecretKey(sk);
        const nostrPk = getPublicKey(Buffer.from(sk, 'hex'));
        id.setNostrPubkey(nostrPk); // Link for attestation
        setIdentity({ pubkey: nostrPk, p2p: id.getPublicKey() });

        const bt = new BitTorrentTransport({ 
            dht: false,
            announce: ['wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz'] 
        });

        bt.client.on('peer', (addr) => logSwarmEvent(`New peer connected: ${addr}`, 'success'));
        bt.client.on('torrent', (t) => {
            const isJson = t.name.endsWith('.json');
            logSwarmEvent(`Seeding ${isJson ? 'Event Index' : 'Media'}: ${t.name}`, 'info');
        });

        const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
        const nostr = new NostrTransport(relays);
        const profileManager = new ProfileManager(nostr);

        const hybrid = new HybridTransport(nostr, bt);
        hybridRef.current = hybrid;
        
        const wot = new WoTManager(nostr);
        const feed = new FeedManager(bt, id);
        managerRef.current = new TransportManager(hybrid, { wotManager: wot, feedManager: feed });

        const onEvent = (event) => {
            if (!isMounted.current) return;
            const name = profileManager.getDisplayName(event.pubkey);
            managerRef.current.handleIncomingEvent(event);

            setOldestTs(curr => Math.min(curr, event.created_at));

            setMessages(prev => {
                if (prev.some(m => m.id === event.id)) return prev;
                const newMsg = {
                    id: event.id, author: name, content: event.content,
                    source: 'Relay', ts: event.created_at,
                    hasBT: event.tags?.some(t => t[0] === 'bt') || event.content?.startsWith('magnet:')
                };
                return [newMsg, ...prev].sort((a, b) => b.ts - a.ts).slice(0, 500);
            });
            profileManager.fetchProfile(event.pubkey);
        };

        const start = async () => {
            await hybrid.connect();
            if (!isMounted.current) return;
            setStatus('online');
            logSwarmEvent("Hybrid Transport Online", 'success');
            nostr.subscribe({ kinds: [1], limit: 50 }, onEvent);
        };

        start();

        const interval = setInterval(() => {
            if (bt.client && isMounted.current) {
                const numPeers = bt.client.torrents.reduce((acc, t) => acc + (t.numPeers || 0), 0);
                setPeers(numPeers);
                setSpeed(`${Math.round(bt.client.downloadSpeed / 1024)} KB/s`);
            }
        }, 2000);

        return () => {
            isMounted.current = false;
            clearInterval(interval);
            if (hybridRef.current) hybridRef.current.disconnect();
            initialized.current = false;
        };
    }, [logSwarmEvent]);

    const publish = useCallback(async (content, files = [], type = 'post') => {
        if (!managerRef.current) return;

        if (type === 'command') {
            const [cmd, ...args] = content.split(' ');
            let val = args.join(' ');

            if (cmd === '/follow') {
                logSwarmEvent(`Deep Follow: ${val.substring(0,8)}...`);
                try {
                    const sk = Buffer.from(localStorage.getItem('nostr_nsec'), 'hex');
                    let targetNostrPk = val;
                    if (val.startsWith('npub1')) {
                        const { data } = nip19.decode(val);
                        targetNostrPk = data;
                    }

                    // 1. Update local WoT
                    managerRef.current.wotManager.addFollow(targetNostrPk, 1);

                    // 2. Publish updated Kind 3
                    const contacts = Array.from(managerRef.current.wotManager.follows.keys());
                    const eventTemplate = {
                        kind: 3, created_at: Math.floor(Date.now() / 1000), content: '',
                        tags: contacts.map(pk => ['p', pk])
                    };
                    const signedEvent = finalizeEvent(eventTemplate, sk);
                    await managerRef.current.publish(signedEvent);
                    
                    // 3. Publish Feed Update (Nostr Bridge)
                    // The updateFeed method now supports Nostr discovery
                    const signNostr = (ev) => finalizeEvent(ev, sk);
                    const indexResult = await managerRef.current.feedManager.updateFeed(signedEvent, 'mock-already-seeded', signNostr);
                    if (indexResult.discoveryEvent) {
                        await managerRef.current.transport.nostr.publish(indexResult.discoveryEvent);
                    }

                    // 4. Resolve transport key and bootstrap
                    const tpk = await managerRef.current.resolveTransportKey(targetNostrPk);
                    if (tpk) {
                        logSwarmEvent(`Resolved P2P address: ${tpk.substring(0,8)}...`);
                        await managerRef.current.bootstrapWoTP2P(tpk, targetNostrPk);
                        logSwarmEvent(`P2P Graph Expanded.`, 'success');
                    } else {
                        logSwarmEvent(`Could not resolve P2P address for ${targetNostrPk.substring(0,8)}`, 'error');
                    }

                } catch (err) {
                    logSwarmEvent(`Follow failed: ${err.message}`, 'error');
                }
            } else if (cmd === '/search') {
                logSwarmEvent(`Searching for "${val}"...`);
                managerRef.current.transport.nostr.subscribe({ search: val, limit: 10 }, (e) => {
                    setMessages(prev => [{
                        id: e.id, author: 'Search', content: e.content, source: 'Search', ts: e.created_at
                    }, ...prev]);
                });
            }
            return;
        }

        const sk = Buffer.from(localStorage.getItem('nostr_nsec'), 'hex');
        const mediaFiles = [];
        for (const file of files) {
            const buffer = await file.arrayBuffer();
            mediaFiles.push({ buffer: Buffer.from(buffer), filename: file.name });
        }
        const eventTemplate = { kind: 1, created_at: Math.floor(Date.now() / 1000), content, tags: [] };
        const signedEvent = finalizeEvent(eventTemplate, sk);
        setMessages(prev => [{
            id: signedEvent.id, author: 'Me', content: signedEvent.content,
            source: 'Hybrid', ts: signedEvent.created_at, files: files.map(f => f.name), hasBT: true
        }, ...prev]);
        await managerRef.current.publish(signedEvent, mediaFiles);
    }, [logSwarmEvent]);

    const loadMore = useCallback(async () => {
        if (!managerRef.current || isLoadingMore) return;
        setIsLoadingMore(true);
        logSwarmEvent(`Loading history...`);
        const nostr = managerRef.current.transport.nostr;
        nostr.subscribe({ kinds: [1], limit: 50, until: oldestTs - 1 }, (event) => {
            if (!isMounted.current) return;
            setOldestTs(curr => Math.min(curr, event.created_at));
            setMessages(prev => {
                if (prev.some(m => m.id === event.id)) return prev;
                return [...prev, {
                    id: event.id, author: event.pubkey.substring(0,8), content: event.content,
                    source: 'Relay', ts: event.created_at,
                    hasBT: event.tags?.some(t => t[0] === 'bt') || event.content?.startsWith('magnet:')
                }].sort((a, b) => b.ts - a.ts);
            });
        });
        setTimeout(() => { if (isMounted.current) setIsLoadingMore(false); }, 3000);
    }, [oldestTs, isLoadingMore, logSwarmEvent]);

    return { status, messages, peers, speed, identity, publish, swarmEvents, loadMore, isLoadingMore };
}