# Terminal Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/terminal-client` — a browser-based IRC-style Nostr client with a modern hacker dark aesthetic that makes the BitTorrent P2P swarm a first-class visible component.

**Architecture:** React 18 + Vite, plain CSS (no component library), CSS Grid for 3-column layout. Hook adapted from `apps/web-client/src/hooks/useNostrBT.js`, extended with structured `swarmEvents`, `peers`, and `stats` state. Five focused components: StatusBar, ChannelList, MessageFeed, CommandInput, SwarmPanel.

**Tech Stack:** React 18, Vite 5, nostr-over-bt (local), nostr-tools, webtorrent, buffer polyfill.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/terminal-client/package.json` | Create | Dependencies, scripts |
| `apps/terminal-client/vite.config.js` | Create | Vite + polyfills (copy from web-client) |
| `apps/terminal-client/index.html` | Create | HTML entry, dark background |
| `apps/terminal-client/src/main.jsx` | Create | React mount + Buffer polyfill |
| `apps/terminal-client/src/App.jsx` | Create | 3-column CSS Grid shell + global styles |
| `apps/terminal-client/src/hooks/useNostrBT.js` | Create | All transport state: messages, swarmEvents, peers, stats, identity, publish, activeChannel |
| `apps/terminal-client/src/components/StatusBar.jsx` | Create | Top bar: connection dot, pubkey, peer count, channel |
| `apps/terminal-client/src/components/ChannelList.jsx` | Create | Left: channel switcher + peer list |
| `apps/terminal-client/src/components/MessageFeed.jsx` | Create | Center: scrolling IRC message stream |
| `apps/terminal-client/src/components/CommandInput.jsx` | Create | Bottom: prompt bar with command history |
| `apps/terminal-client/src/components/SwarmPanel.jsx` | Create | Right: live DHT/BT telemetry log |

---

## Task 1: Scaffold — package.json, vite.config.js, index.html, main.jsx

**Files:**
- Create: `apps/terminal-client/package.json`
- Create: `apps/terminal-client/vite.config.js`
- Create: `apps/terminal-client/index.html`
- Create: `apps/terminal-client/src/main.jsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "nostr-bt-terminal",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "buffer": "^6.0.3",
    "nostr-over-bt": "file:../..",
    "nostr-tools": "^2.22.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "webtorrent": "^2.8.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.1"
  }
}
```

- [ ] **Step 2: Create vite.config.js** (identical to web-client)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
    process: { env: {} }
  },
  resolve: {
    alias: {
      webtorrent: 'webtorrent/dist/webtorrent.min.js'
    }
  }
})
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NOSTR-OVER-BT</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root { height: 100%; background: #0d1117; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create src/main.jsx**

```jsx
import { Buffer } from 'buffer'
window.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Install dependencies**

```bash
cd apps/terminal-client && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Verify dev server starts**

```bash
cd apps/terminal-client && npm run dev
```

Expected: Vite outputs `Local: http://localhost:5173/` (or similar). A blank dark page loads in the browser. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add apps/terminal-client/package.json apps/terminal-client/vite.config.js apps/terminal-client/index.html apps/terminal-client/src/main.jsx apps/terminal-client/package-lock.json
git commit -m "feat(terminal-client): scaffold vite+react app"
```

---

## Task 2: useNostrBT hook

**Files:**
- Create: `apps/terminal-client/src/hooks/useNostrBT.js`

This is adapted from `apps/web-client/src/hooks/useNostrBT.js` with three changes:
1. `peers` becomes a `string[]` of transport pubkeys (not a count)
2. `swarmEvents` appends newest at the end (not prepend), capped at 100
3. `stats` object added: `{ dhtNodes, uploadSpeed, downloadSpeed, peerCount }`
4. `activeChannel` state + `setActiveChannel` returned
5. `follows` set tracked for the `#follows` filter

- [ ] **Step 1: Create the hook**

```js
// apps/terminal-client/src/hooks/useNostrBT.js
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  TransportManager, IdentityManager, HybridTransport,
  NostrTransport, BitTorrentTransport, ProfileManager, WoTManager, FeedManager
} from 'nostr-over-bt'
import { finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'

export function useNostrBT() {
  const [status, setStatus] = useState('initializing')
  const [messages, setMessages] = useState([])
  const [peers, setPeers] = useState([])           // string[] of transport pubkeys
  const [stats, setStats] = useState({ dhtNodes: 0, uploadSpeed: 0, downloadSpeed: 0, peerCount: 0 })
  const [swarmEvents, setSwarmEvents] = useState([])
  const [identity, setIdentity] = useState(null)
  const [activeChannel, setActiveChannel] = useState('global')
  const [follows, setFollows] = useState(new Set())
  const [seeding, setSeeding] = useState([])       // string[] of active infoHashes

  const managerRef = useRef(null)
  const hybridRef = useRef(null)
  const initialized = useRef(false)
  const isMounted = useRef(true)

  const logSwarmEvent = useCallback((msg, type = 'info') => {
    if (!isMounted.current) return
    const time = new Date().toTimeString().slice(0, 8)
    setSwarmEvents(prev => [...prev, { time, msg, type }].slice(-100))
  }, [])

  useEffect(() => {
    isMounted.current = true
    if (initialized.current) return
    initialized.current = true

    let sk = localStorage.getItem('nostr_nsec')
    if (!sk) {
      sk = Buffer.from(generateSecretKey()).toString('hex')
      localStorage.setItem('nostr_nsec', sk)
    }
    const id = IdentityManager.fromNostrSecretKey(sk)
    const nostrPk = getPublicKey(Buffer.from(sk, 'hex'))
    id.setNostrPubkey(nostrPk)
    setIdentity({ pubkey: nostrPk, p2p: id.getPublicKey() })

    const bt = new BitTorrentTransport({
      dht: false,
      announce: ['wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz']
    })

    bt.client.on('peer', (addr) => logSwarmEvent(`peer connected: ${addr}`, 'success'))
    bt.client.on('torrent', (t) => {
      logSwarmEvent(`seeding: ${t.infoHash.slice(0, 12)}`, 'info')
      setSeeding(prev => [...new Set([...prev, t.infoHash])])
    })

    const nostr = new NostrTransport(['wss://relay.damus.io', 'wss://nos.lol'])
    const profileManager = new ProfileManager(nostr)
    const hybrid = new HybridTransport(nostr, bt)
    hybridRef.current = hybrid

    const wot = new WoTManager(nostr)
    const feed = new FeedManager(bt, id)
    managerRef.current = new TransportManager(hybrid, { wotManager: wot, feedManager: feed })

    const onEvent = (event) => {
      if (!isMounted.current) return
      const author = profileManager.getDisplayName(event.pubkey)
      managerRef.current.handleIncomingEvent(event)
      const hasBT = event.tags?.some(t => t[0] === 'bt') || event.content?.startsWith('magnet:')
      const magnetUri = event.tags?.find(t => t[0] === 'bt')?.[1] || null

      setMessages(prev => {
        if (prev.some(m => m.id === event.id)) return prev
        return [...prev, {
          id: event.id,
          author,
          pubkey: event.pubkey,
          content: event.content,
          source: hasBT ? 'bt' : 'relay',
          ts: event.created_at,
          hasBT,
          magnetUri
        }].sort((a, b) => a.ts - b.ts).slice(-500)
      })
      profileManager.fetchProfile(event.pubkey)
    }

    const start = async () => {
      await hybrid.connect()
      if (!isMounted.current) return
      setStatus('online')
      logSwarmEvent('hybrid transport online', 'success')
      nostr.subscribe({ kinds: [1], limit: 50 }, onEvent)
    }
    start()

    const interval = setInterval(() => {
      if (!isMounted.current) return
      const peerCount = bt.client.torrents.reduce((acc, t) => acc + (t.numPeers || 0), 0)
      const uploadSpeed = Math.round(bt.client.uploadSpeed / 1024)
      const downloadSpeed = Math.round(bt.client.downloadSpeed / 1024)
      setStats(prev => ({ ...prev, peerCount, uploadSpeed, downloadSpeed }))
    }, 2000)

    return () => {
      isMounted.current = false
      clearInterval(interval)
      if (hybridRef.current) hybridRef.current.disconnect()
      initialized.current = false
    }
  }, [logSwarmEvent])

  const addSystemMessage = useCallback((content) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      author: 'system',
      pubkey: null,
      content,
      source: 'system',
      ts: Math.floor(Date.now() / 1000),
      hasBT: false,
      magnetUri: null
    }])
  }, [])

  const publish = useCallback(async (input) => {
    if (!managerRef.current) return
    const trimmed = input.trim()
    if (!trimmed) return

    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.split(' ')
      const arg = args.join(' ')

      if (cmd === '/help') {
        addSystemMessage('/follow <npub>  — follow a user\n/relay list|add <url>  — manage relays\n/peers  — list connected peers\n/clear  — clear message feed\n/help  — show this message')
        return
      }

      if (cmd === '/clear') {
        setMessages([])
        return
      }

      if (cmd === '/peers') {
        addSystemMessage(`Connected peers: ${peers.length > 0 ? peers.join(', ') : 'none'}`)
        return
      }

      if (cmd === '/relay') {
        const [sub] = args
        if (sub === 'list') {
          addSystemMessage('Relays: wss://relay.damus.io, wss://nos.lol')
        } else {
          addSystemMessage('Usage: /relay list')
        }
        return
      }

      if (cmd === '/follow') {
        logSwarmEvent(`following: ${arg.slice(0, 12)}...`)
        try {
          const sk = Buffer.from(localStorage.getItem('nostr_nsec'), 'hex')
          let targetPk = arg
          if (arg.startsWith('npub1')) {
            const { data } = nip19.decode(arg)
            targetPk = data
          }
          managerRef.current.wotManager.addFollow(targetPk, 1)
          setFollows(prev => new Set([...prev, targetPk]))

          const contacts = Array.from(managerRef.current.wotManager.follows.keys())
          const contactEvent = finalizeEvent({
            kind: 3, created_at: Math.floor(Date.now() / 1000), content: '',
            tags: contacts.map(pk => ['p', pk])
          }, sk)
          await managerRef.current.publish(contactEvent)

          const tpk = await managerRef.current.resolveTransportKey(targetPk)
          if (tpk) {
            setPeers(prev => [...new Set([...prev, tpk])])
            logSwarmEvent(`resolved p2p: ${tpk.slice(0, 12)}...`, 'success')
            await managerRef.current.bootstrapWoTP2P(tpk, targetPk)
            logSwarmEvent('p2p graph expanded', 'success')
          } else {
            logSwarmEvent(`no p2p addr for ${targetPk.slice(0, 8)}`, 'error')
          }
        } catch (err) {
          logSwarmEvent(`follow failed: ${err.message}`, 'error')
        }
        return
      }

      addSystemMessage(`Unknown command: ${cmd}. Type /help for commands.`)
      return
    }

    // Plain text post
    const sk = Buffer.from(localStorage.getItem('nostr_nsec'), 'hex')
    const eventTemplate = { kind: 1, created_at: Math.floor(Date.now() / 1000), content: trimmed, tags: [] }
    const signedEvent = finalizeEvent(eventTemplate, sk)
    setMessages(prev => [...prev, {
      id: signedEvent.id, author: 'me', pubkey: null,
      content: trimmed, source: 'hybrid',
      ts: signedEvent.created_at, hasBT: true, magnetUri: null
    }])
    await managerRef.current.publish(signedEvent, [])
  }, [peers, addSystemMessage, logSwarmEvent])

  return {
    status, messages, peers, stats, swarmEvents, seeding,
    identity, activeChannel, setActiveChannel, follows, publish
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/terminal-client/src/hooks/useNostrBT.js
git commit -m "feat(terminal-client): add useNostrBT hook with swarm/peer/stats state"
```

---

## Task 3: App.jsx — 3-column grid shell + CSS theme

**Files:**
- Create: `apps/terminal-client/src/App.jsx`

- [ ] **Step 1: Create App.jsx**

```jsx
// apps/terminal-client/src/App.jsx
import { useState } from 'react'
import { useNostrBT } from './hooks/useNostrBT.js'
import StatusBar from './components/StatusBar.jsx'
import ChannelList from './components/ChannelList.jsx'
import MessageFeed from './components/MessageFeed.jsx'
import CommandInput from './components/CommandInput.jsx'
import SwarmPanel from './components/SwarmPanel.jsx'

const CSS = `
  :root {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #21262d;
    --border: #30363d;
    --text: #c9d1d9;
    --text-dim: #484f58;
    --green: #3fb950;
    --blue: #58a6ff;
    --yellow: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
    --font: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 13px; }
  .app {
    display: grid;
    grid-template-rows: 28px 1fr;
    grid-template-columns: 150px 1fr 280px;
    grid-template-areas:
      "status status status"
      "channels feed swarm";
    height: 100vh;
    overflow: hidden;
  }
  .status-bar { grid-area: status; }
  .channel-list { grid-area: channels; border-right: 1px solid var(--border); overflow-y: auto; }
  .feed-area {
    grid-area: feed;
    display: grid;
    grid-template-rows: 1fr 36px;
    overflow: hidden;
  }
  .swarm-panel { grid-area: swarm; border-left: 1px solid var(--border); overflow: hidden; display: flex; flex-direction: column; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
`

export default function App() {
  const hook = useNostrBT()

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="status-bar">
          <StatusBar status={hook.status} identity={hook.identity} stats={hook.stats} activeChannel={hook.activeChannel} />
        </div>
        <div className="channel-list">
          <ChannelList activeChannel={hook.activeChannel} setActiveChannel={hook.setActiveChannel} peers={hook.peers} />
        </div>
        <div className="feed-area">
          <MessageFeed messages={hook.messages} activeChannel={hook.activeChannel} follows={hook.follows} />
          <CommandInput onSubmit={hook.publish} />
        </div>
        <div className="swarm-panel">
          <SwarmPanel swarmEvents={hook.swarmEvents} stats={hook.stats} seeding={hook.seeding} />
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify app loads (placeholder components needed first — create empty stubs)**

Create `apps/terminal-client/src/components/StatusBar.jsx`:
```jsx
export default function StatusBar() { return <div style={{background:'#161b22',padding:'4px 8px',fontSize:13,fontFamily:'monospace'}}>loading...</div> }
```

Create `apps/terminal-client/src/components/ChannelList.jsx`:
```jsx
export default function ChannelList() { return <div /> }
```

Create `apps/terminal-client/src/components/MessageFeed.jsx`:
```jsx
export default function MessageFeed() { return <div /> }
```

Create `apps/terminal-client/src/components/CommandInput.jsx`:
```jsx
export default function CommandInput() { return <div /> }
```

Create `apps/terminal-client/src/components/SwarmPanel.jsx`:
```jsx
export default function SwarmPanel() { return <div /> }
```

Run `npm run dev` in `apps/terminal-client`. Expected: dark page with 3-column grid visible, no console errors about missing modules.

- [ ] **Step 3: Commit**

```bash
git add apps/terminal-client/src/App.jsx apps/terminal-client/src/components/
git commit -m "feat(terminal-client): 3-column grid shell + CSS theme + stub components"
```

---

## Task 4: StatusBar component

**Files:**
- Modify: `apps/terminal-client/src/components/StatusBar.jsx`

- [ ] **Step 1: Implement StatusBar**

```jsx
// apps/terminal-client/src/components/StatusBar.jsx
const CSS = `
  .statusbar {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 12px;
    height: 28px;
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--red); display: inline-block;
    transition: background 0.3s;
  }
  .dot.online { background: var(--green); animation: pulse 2s infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; } 50% { opacity: 0.5; }
  }
  .statusbar .label { color: var(--text); }
  .statusbar .channel { color: var(--blue); margin-left: auto; }
`

export default function StatusBar({ status, identity, stats, activeChannel }) {
  const isOnline = status === 'online'
  const pubkey = identity?.pubkey ? identity.pubkey.slice(0, 16) + '···' : '···'

  return (
    <>
      <style>{CSS}</style>
      <div className="statusbar">
        <span className={`dot ${isOnline ? 'online' : ''}`} />
        <span className="label">{isOnline ? 'ONLINE' : 'CONNECTING'}</span>
        <span>{pubkey}</span>
        <span>peers: {stats.peerCount}</span>
        <span>↑{stats.uploadSpeed}KB/s</span>
        <span>↓{stats.downloadSpeed}KB/s</span>
        <span className="channel">#{activeChannel}</span>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify in browser** — StatusBar shows connection dot, truncated pubkey, peer stats, channel name. Dot should pulse green once connection establishes.

- [ ] **Step 3: Commit**

```bash
git add apps/terminal-client/src/components/StatusBar.jsx
git commit -m "feat(terminal-client): StatusBar with connection pulse animation"
```

---

## Task 5: ChannelList component

**Files:**
- Modify: `apps/terminal-client/src/components/ChannelList.jsx`

- [ ] **Step 1: Implement ChannelList**

```jsx
// apps/terminal-client/src/components/ChannelList.jsx
const CHANNELS = ['global', 'nostr-bt', 'follows']

const CSS = `
  .chanlist {
    padding: 8px 0;
    background: var(--bg);
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .chanlist-section {
    padding: 4px 8px;
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 8px;
  }
  .channel-item {
    padding: 3px 12px;
    cursor: pointer;
    color: var(--text-dim);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .channel-item:hover { background: var(--bg3); color: var(--text); }
  .channel-item.active { color: var(--blue); background: var(--bg2); }
  .peer-item {
    padding: 2px 12px;
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .peer-item::before { content: '· '; }
`

export default function ChannelList({ activeChannel, setActiveChannel, peers }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="chanlist">
        <div className="chanlist-section">channels</div>
        {CHANNELS.map(ch => (
          <div
            key={ch}
            className={`channel-item ${activeChannel === ch ? 'active' : ''}`}
            onClick={() => setActiveChannel(ch)}
          >
            #{ch}
          </div>
        ))}
        <div className="chanlist-section">peers</div>
        {peers.length === 0
          ? <div className="peer-item" style={{fontStyle:'italic'}}>none</div>
          : peers.map(p => (
            <div key={p} className="peer-item" title={p}>{p.slice(0, 10)}</div>
          ))
        }
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify in browser** — Three channels listed, clicking switches active channel (highlighted blue). PEERS section shows "none" until follows added.

- [ ] **Step 3: Commit**

```bash
git add apps/terminal-client/src/components/ChannelList.jsx
git commit -m "feat(terminal-client): ChannelList with channel switching and peer list"
```

---

## Task 6: MessageFeed component

**Files:**
- Modify: `apps/terminal-client/src/components/MessageFeed.jsx`

- [ ] **Step 1: Implement MessageFeed**

```jsx
// apps/terminal-client/src/components/MessageFeed.jsx
import { useEffect, useRef, useState } from 'react'

const CSS = `
  .feed {
    overflow-y: auto;
    padding: 8px 0;
    background: var(--bg);
    font-size: 12px;
    line-height: 1.6;
  }
  .msg-row {
    display: flex;
    padding: 1px 12px;
    gap: 0;
    align-items: baseline;
  }
  .msg-row:hover { background: var(--bg2); }
  .msg-time { color: var(--text-dim); min-width: 48px; flex-shrink: 0; }
  .msg-author { min-width: 110px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .msg-author.relay { color: var(--blue); }
  .msg-author.bt { color: var(--green); }
  .msg-author.hybrid { color: var(--yellow); }
  .msg-author.system { color: var(--text-dim); font-style: italic; }
  .msg-author.me { color: var(--purple); }
  .msg-content { flex: 1; color: var(--text); white-space: pre-wrap; word-break: break-word; }
  .msg-content.system { color: var(--text-dim); font-style: italic; }
  .msg-badge {
    flex-shrink: 0;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 8px;
    align-self: center;
  }
  .badge-relay { color: var(--blue); border: 1px solid var(--blue); }
  .badge-bt { color: var(--green); border: 1px solid var(--green); }
  .badge-hybrid { color: var(--yellow); border: 1px solid var(--yellow); }
  .msg-magnet {
    padding: 0 12px 2px 170px;
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

function formatTime(ts) {
  const d = new Date(ts * 1000)
  return d.toTimeString().slice(0, 5)
}

function filterMessages(messages, activeChannel, follows) {
  if (activeChannel === 'nostr-bt') return messages.filter(m => m.hasBT)
  if (activeChannel === 'follows') return messages.filter(m => m.pubkey && follows.has(m.pubkey))
  return messages
}

export default function MessageFeed({ messages, activeChannel, follows }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const filtered = filterMessages(messages, activeChannel, follows)

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filtered.length, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="feed" ref={containerRef} onScroll={handleScroll}>
        {filtered.map(msg => (
          <div key={msg.id}>
            <div className="msg-row">
              <span className="msg-time">{formatTime(msg.ts)}</span>
              <span className={`msg-author ${msg.source}`}>
                {msg.author.slice(0, 12)}
              </span>
              <span className={`msg-content ${msg.source === 'system' ? 'system' : ''}`}>
                {msg.content}
              </span>
              {msg.source !== 'system' && (
                <span className={`msg-badge badge-${msg.source}`}>{msg.source}</span>
              )}
            </div>
            {msg.magnetUri && (
              <div className="msg-magnet">└─ 📦 {msg.magnetUri}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify in browser** — Messages appear in time order, `[relay]` / `[bt]` / `[hybrid]` badges right-aligned. Switching to `#nostr-bt` shows only BT-sourced messages. Feed auto-scrolls. Scroll up pauses auto-scroll.

- [ ] **Step 3: Commit**

```bash
git add apps/terminal-client/src/components/MessageFeed.jsx
git commit -m "feat(terminal-client): MessageFeed with IRC layout, badges, auto-scroll"
```

---

## Task 7: CommandInput component

**Files:**
- Modify: `apps/terminal-client/src/components/CommandInput.jsx`

- [ ] **Step 1: Implement CommandInput**

```jsx
// apps/terminal-client/src/components/CommandInput.jsx
import { useState, useRef } from 'react'

const CSS = `
  .cmd-input-wrap {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--border);
    background: var(--bg2);
    padding: 0 12px;
    height: 36px;
    gap: 8px;
    flex-shrink: 0;
  }
  .cmd-prompt { color: var(--green); flex-shrink: 0; }
  .cmd-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    caret-color: var(--green);
  }
  .cmd-input::placeholder { color: var(--text-dim); }
`

export default function CommandInput({ onSubmit }) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const inputRef = useRef(null)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!value.trim()) return
      onSubmit(value)
      setHistory(prev => [value, ...prev].slice(0, 50))
      setHistoryIdx(-1)
      setValue('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(next)
      setValue(history[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(historyIdx - 1, -1)
      setHistoryIdx(next)
      setValue(next === -1 ? '' : history[next])
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="cmd-input-wrap" onClick={() => inputRef.current?.focus()}>
        <span className="cmd-prompt">{'>'}</span>
        <input
          ref={inputRef}
          className="cmd-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="type a message or /help"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify in browser** — Input accepts text, Enter posts (check for message appearing in feed), arrow keys cycle history, `/help` shows system message inline.

- [ ] **Step 3: Commit**

```bash
git add apps/terminal-client/src/components/CommandInput.jsx
git commit -m "feat(terminal-client): CommandInput with command history"
```

---

## Task 8: SwarmPanel component

**Files:**
- Modify: `apps/terminal-client/src/components/SwarmPanel.jsx`

- [ ] **Step 1: Implement SwarmPanel**

```jsx
// apps/terminal-client/src/components/SwarmPanel.jsx
import { useEffect, useRef } from 'react'

const CSS = `
  .swarm {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
    font-size: 11px;
  }
  .swarm-header {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text-dim);
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.8;
  }
  .swarm-header span { color: var(--text); }
  .swarm-log {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .swarm-entry {
    padding: 1px 10px;
    display: flex;
    gap: 8px;
    line-height: 1.6;
  }
  .swarm-entry .t { color: var(--text-dim); flex-shrink: 0; }
  .swarm-entry .m { word-break: break-all; }
  .swarm-entry.success .m { color: var(--green); }
  .swarm-entry.info .m { color: var(--text-dim); }
  .swarm-entry.error .m { color: var(--red); }
  .swarm-entry.warning .m { color: var(--yellow); }
  .swarm-footer {
    border-top: 1px solid var(--border);
    padding: 6px 10px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .swarm-footer .title { color: var(--text); margin-bottom: 4px; }
  .seed-item {
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-dim);
  }
  .seed-item::before { content: '· '; }
`

export default function SwarmPanel({ swarmEvents, stats, seeding }) {
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [swarmEvents.length])

  return (
    <>
      <style>{CSS}</style>
      <div className="swarm">
        <div className="swarm-header">
          DHT <span>{stats.dhtNodes}</span> nodes<br />
          ↑<span>{stats.uploadSpeed}</span>KB/s&nbsp;
          ↓<span>{stats.downloadSpeed}</span>KB/s
        </div>
        <div className="swarm-log" ref={logRef}>
          {swarmEvents.map((ev, i) => (
            <div key={i} className={`swarm-entry ${ev.type}`}>
              <span className="t">{ev.time}</span>
              <span className="m">{ev.msg}</span>
            </div>
          ))}
        </div>
        <div className="swarm-footer">
          <div className="title">SEEDING ({seeding.length})</div>
          {seeding.slice(0, 5).map(h => (
            <div key={h} className="seed-item" title={h}>{h}</div>
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify in browser** — SwarmPanel shows DHT/speed header, live event log (green/yellow/red), SEEDING footer. Log auto-scrolls as events arrive.

- [ ] **Step 3: Commit**

```bash
git add apps/terminal-client/src/components/SwarmPanel.jsx
git commit -m "feat(terminal-client): SwarmPanel with live telemetry log"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
cd apps/terminal-client && npm run dev
```

Open `http://localhost:5173` in browser.

- [ ] **Step 2: Check layout** — 3-column grid renders. StatusBar at top with connection dot. ChannelList on left with `#global`, `#nostr-bt`, `#follows`. SwarmPanel on right. Prompt at bottom.

- [ ] **Step 3: Check connection** — After a few seconds, StatusBar dot turns green and pulses. SwarmPanel shows "hybrid transport online" in green. Messages begin streaming into `#global`.

- [ ] **Step 4: Check channel filter** — Click `#nostr-bt`. Only messages with `[bt]` badge visible (may be empty initially). Click `#global` to return.

- [ ] **Step 5: Post a message** — Type `hello world` and press Enter. Message appears immediately with `[hybrid]` badge in purple (author "me").

- [ ] **Step 6: Test /help** — Type `/help`, press Enter. System message lists all commands in dim italic text.

- [ ] **Step 7: Test /peers** — Type `/peers`, press Enter. System message lists peers (likely "none" at this point).

- [ ] **Step 8: Test command history** — Press arrow up. Previous command appears in input. Press arrow down to clear.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat(terminal-client): complete IRC-style terminal client"
```
