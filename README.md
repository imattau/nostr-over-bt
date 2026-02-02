# ⚡️ Nostr-over-BT

**nostr-over-bt** is a high-performance Node.js library that bridges the [Nostr](https://github.com/nostr-protocol/nostr) protocol with the [BitTorrent](https://en.wikipedia.org/wiki/BitTorrent) network. It enables a hybrid transport layer where standard Nostr metadata lives on relays, while heavy content and long-term event storage are offloaded to a decentralized P2P swarm.

## 🚀 Key Features

*   **Hybrid Delivery:** Seamlessly fallback between Nostr Relays and BitTorrent Swarms.
*   **Infinite Scalability:** Offload 99%+ of relay bandwidth to the swarm. Perfect for large media, long-form content, and viral posts.
*   **Zero-Relay Discovery:** Uses BitTorrent DHT (BEP-44) to find user feeds purely via their public key—no relay connection required for bootstrapping.
*   **P2P Web of Trust (WoT):** Automatically crawls and discovers events from "friends-of-friends" by traversing the social graph through the DHT.
*   **Deterministic Identity:** Derive your P2P seeding address directly from your Nostr secret key.
*   **Relay Optimized:** Includes a reference relay that acts as a "Seeding Bridge," automatically backing up every incoming event to the global BitTorrent DHT.

## 🎯 What it Achieves

The goal of this library is to solve the two biggest scaling challenges in the Nostr ecosystem:

1.  **The Bandwidth Bottleneck:** Standard relays are expensive to run because they bear the full cost of data delivery. `nostr-over-bt` transforms the relay into a *notifier*, leaving the heavy lifting to the peers who are actually consuming the content.
2.  **Relay Silos:** In standard Nostr, if a publisher and a follower are on different relays, they cannot see each other. `nostr-over-bt` creates a **Global P2P Index** via the DHT, ensuring that as long as you have a user's pubkey, you can find their content anywhere in the world.

## 📦 Installation

```bash
npm install nostr-over-bt
```

## 📖 Documentation

*   [API Reference](docs/API.md): Detailed documentation of all classes and methods.
*   [P2P Discovery](docs/P2P_DISCOVERY.md): Deep dive into the DHT-based discovery protocol.

## 🛠 Quick Start (Client)

```javascript
import { TransportManager, IdentityManager, HybridTransport, NostrTransport, BitTorrentTransport } from 'nostr-over-bt';

// 1. Setup Identity
const id = IdentityManager.fromNostrSecretKey(MY_SECRET_KEY);

// 2. Initialize Transports
const bt = new BitTorrentTransport({ dht: true });
const nostr = new NostrTransport(['wss://relay.damus.io']);
const manager = new TransportManager(new HybridTransport(nostr, bt));

// 3. Publish Hybrid Event
const event = { kind: 1, content: "Hello decentralized world!", ... };
const result = await manager.publish(event); 
// Result contains { magnetUri, relayStatus }
```

## 🖥 Relay Integration

Relay operators can use the library to become "Seeding Nodes," ensuring that all events passing through their relay are permanently archived in the BitTorrent network. See `examples/relay-server/server.js` for a full implementation.

## 📊 Performance

| Mode | Relay Bandwidth | Reach | Scalability |
| :--- | :--- | :--- | :--- |
| **Standard Nostr** | Linear $O(N)$ | Relay-dependent | Medium |
| **BT-Nostr** | **Constant $O(1)$** | **Universal (DHT)** | **Infinite** |

## 📜 License

LGPL-2.1