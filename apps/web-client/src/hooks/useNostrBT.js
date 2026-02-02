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
    const btRef = useRef(null);
    const profileRef = useRef(null);
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
        setIdentity({ pubkey: nostrPk, p2p: id.getPublicKey() });

        const bt = new BitTorrentTransport({ 
            dht: false,
            announce: ['wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz'] 
        });
        btRef.current = bt;

        bt.client.on('peer', (addr) => logSwarmEvent(`New peer connected: ${addr}`, 'success'));
        bt.client.on('torrent', (t) => {
            const isJson = t.name.endsWith('.json');
            logSwarmEvent(`Seeding ${isJson ? 'Event Index' : 'Media'}: ${t.name}`, 'info');
        });

        const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
        const nostr = new NostrTransport(relays);
        profileRef.current = new ProfileManager(nostr);

        const wot = new WoTManager(nostr);
        const feed = new FeedManager(bt, id);

        const hybrid = new HybridTransport(nostr, bt);
        hybridRef.current = hybrid;
        
        // Correctly pass the managers in the options object
        managerRef.current = new TransportManager(hybrid, { 
            wotManager: wot, 
            feedManager: feed 
        });

        const onEvent = (event) => {
            if (!isMounted.current) return;
            const name = profileRef.current.getDisplayName(event.pubkey);
            managerRef.current.handleIncomingEvent(event);

            // Update oldest timestamp SEPARATELY from messages
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
            profileRef.current.fetchProfile(event.pubkey);
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
            const val = args.join(' ');
                        if (cmd === '/follow') {
                            logSwarmEvent(`Deep Follow: ${val.substring(0,8)}...`);
                            try {
                                const sk = Buffer.from(localStorage.getItem('nostr_nsec'), 'hex');
                                
                                // 1. Update local WoT
                                managerRef.current.wotManager.addFollow(val, 1);
            
                                // 2. Publish updated Kind 3 (Contact List) to Nostr & P2P
                                const contacts = Array.from(managerRef.current.wotManager.follows.keys());
                                const eventTemplate = {
                                    kind: 3,
                                    created_at: Math.floor(Date.now() / 1000),
                                    content: '',
                                    tags: contacts.map(pk => ['p', pk])
                                };
                                const signedEvent = finalizeEvent(eventTemplate, sk);
                                
                                // Use publishP2P to update our own feed pointer
                                await managerRef.current.publish(signedEvent);
                                await managerRef.current.publishP2P(signedEvent);
                                
                                logSwarmEvent(`Published updated follow list.`, 'success');
            
                                // 3. Bootstrap from the person we just followed
                                logSwarmEvent(`Bootstrapping from ${val.substring(0,8)}'s feed...`);
                                await managerRef.current.bootstrapWoTP2P(val);
                                logSwarmEvent(`P2P Graph Expanded.`, 'success');
            
                            } catch (err) {
                                logSwarmEvent(`Follow failed: ${err.message}`, 'error');
                            }
                        }
             else if (cmd === '/search') {
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
