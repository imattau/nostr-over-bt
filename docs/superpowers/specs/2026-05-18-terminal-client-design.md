# Terminal Client Design

**Date:** 2026-05-18  
**Status:** Approved  

## Context

The existing `apps/web-client` is a functional but prototype-grade React+Bootstrap app. It exposes the nostr-over-bt hybrid transport but buries the BitTorrent/P2P layer as a secondary concern. The goal is a new `apps/terminal-client` — a browser-based IRC-style chat interface with a modern hacker dark aesthetic (Dracula/Tokyo Night palette) that makes the P2P swarm a first-class visible component at all times.

## Architecture

**Stack:** React 18 + Vite. Plain CSS (no component library) — monospace fonts, CSS custom properties for theming, CSS Grid for layout. Same Vite polyfills as `apps/web-client` (Buffer, process, WebTorrent alias).

**Location:** `apps/terminal-client/` — standalone app, does not modify web-client.

```
apps/terminal-client/
├── src/
│   ├── main.jsx
│   ├── App.jsx               # 3-column CSS Grid shell
│   ├── hooks/
│   │   └── useNostrBT.js     # Adapted from apps/web-client/src/hooks/useNostrBT.js
│   └── components/
│       ├── StatusBar.jsx     # Top: connection status + stats
│       ├── ChannelList.jsx   # Left: feed channels + peer list
│       ├── MessageFeed.jsx   # Center: scrolling IRC-style message stream
│       ├── CommandInput.jsx  # Center bottom: prompt bar
│       └── SwarmPanel.jsx    # Right: live DHT/BT telemetry
├── index.html
├── package.json
└── vite.config.js
```

## Layout

3-column fixed grid, full viewport height:

```
┌─ StatusBar (full width, 1 line) ────────────────────────────────────────┐
│ [●] ONLINE  npub1ab3x···  peers: 12  #global                            │
├─ channels ──┬─────────── #global ──────────────┬─── swarm ─────────────┤
│ #global     │ 14:23 npub1ab3x » hello world     │ ▶ DHT 847 nodes       │
│ #nostr-bt   │ 14:24 npub1ff2y » gm       [relay]│ ▶ peers 12 connected  │
│ #follows    │ 14:24 npub1ab3x » file     [bt]   │ ↑ 42KB/s  ↓ 18KB/s   │
│             │          └─ 📦 magnet:?xt=abc123  │ ───────────────────── │
│ PEERS       │ 14:25 npub1zz9q » building?[relay]│ 14:23 peer connected  │
│ · npub1xx   │                                   │ 14:24 DHT lookup ok   │
│ · npub1yy   │ > _                               │ 14:24 seeding abc123  │
└─────────────┴───────────────────────────────────┴───────────────────────┘
```

Column widths: Left 150px fixed, Right 280px fixed, Center fills remaining space.

## Components

### StatusBar
- Single line, full width
- Shows: connection dot (green/red), truncated nostr pubkey, peer count, active channel
- Connection dot pulses CSS animation on relay connect/disconnect

### ChannelList (Left)
- Feed channels: `#global`, `#nostr-bt`, `#follows` — click to switch active channel
- `PEERS` section: live connected transport pubkeys, truncated to 10 chars
- Active channel highlighted; peers dim if inactive

### MessageFeed (Center)
- Scrolling list, auto-scroll to bottom, pauses on manual scroll up
- Message format: `HH:MM  <npub1ab3x>  message content           [bt]`
- Transport badge right-aligned: `[bt]` (green), `[relay]` (blue), `[hybrid]` (yellow)
- File attachments as sub-line: `         └─ 📦 seeding: magnet:?xt=...` in dim text
- Filters by `activeChannel`: global = all, nostr-bt = BT-sourced only, follows = WoT only
- `/help` output renders inline as system messages in dim color

### CommandInput (Center bottom)
- `> _` prompt, single line input
- Plain text → `publish()` as kind 1 event
- Commands: `/follow <npub>`, `/relay <add|list>`, `/peers`, `/clear`, `/help`
- Enter to submit, up/down arrow for command history

### SwarmPanel (Right)
- Header: `DHT <n> nodes  ↑ <x>KB/s  ↓ <x>KB/s`
- Scrolling event log, capped at 100 entries, newest appended:
  - Green: peer connected, seed success
  - Yellow: DHT lookup, magnet resolve  
  - Red: connection error, fetch fail
- Footer section: `SEEDING (n)` — list of active infoHashes

## Data Flow

**State (all in `useNostrBT` hook):**
- `messages[]` — all received events; filtered in MessageFeed by `activeChannel`
- `swarmEvents[]` — capped at 100, SwarmPanel subscribes
- `peers[]` — connected transport pubkeys from DHT activity
- `stats` — `{ dhtNodes, uploadSpeed, downloadSpeed, peerCount }`
- `identity` — `{ nostrPubkey, transportPubkey }` derived once on mount
- `activeChannel` — `'global' | 'nostr-bt' | 'follows'`

**Incoming:** Nostr relays + BitTorrent DHT → `useNostrBT` → messages/swarmEvents/peers state  
**Outgoing:** CommandInput → `useNostrBT.publish()` → relay + BT seed + optimistic local append

## Reuse from web-client

- `apps/web-client/src/hooks/useNostrBT.js` — copy and extend with `swarmEvents`, `peers`, `stats` state slices
- `apps/web-client/vite.config.js` — copy verbatim (same polyfills)
- Identity generation pattern (localStorage secret key)

## Verification

1. `npm install && npm run dev` — 3-column layout renders in browser
2. StatusBar shows `[●] ONLINE` with truncated pubkey
3. Messages stream into `#global` with `[relay]` badges
4. Switch to `#nostr-bt` — only BT-sourced messages visible
5. Post a message — appears immediately, badge updates to `[hybrid]` once seeded
6. `/follow <npub>` — peer appears in ChannelList under `PEERS`
7. SwarmPanel shows DHT node count and live green/yellow/red event log
8. `/help` — prints command list inline in feed
