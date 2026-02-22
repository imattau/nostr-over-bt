# P2P Discovery Protocol: Nostr over BEP-44

This document outlines the architecture for fully decentralized event discovery using the BitTorrent DHT, removing the hard dependency on Relays for metadata retrieval.

## Core Concept
Use **BEP-44 (Mutable Torrents)** to store a "Feed Pointer" in the DHT. This pointer acts as a mutable reference to the user's latest content tree (an Index file hosted in the BitTorrent Swarm).

## Architecture

### 1. Identity Mapping
To enable deterministic lookups (`Nostr Pubkey` -> `DHT Entry`), we map identities through a "Transport Key".

**Strategy: Associated Transport Key**
1.  **Generation:** The `IdentityManager` derives a dedicated `Transport Keypair` (Ed25519) from the user's Nostr secret key.
2.  **Attestation (Relay Bridge):** The user publishes a Nostr Event (Kind 30078) signed by their `Nostr Key`, containing the `Transport Public Key` in the content field and using the `d` tag `nostr-over-bt-identity`.
3.  **DHT Record (Native P2P):** The DHT mutable record itself optionally includes the user's `Nostr Pubkey` (`npk`) in its value dictionary.

### 2. The Mutable Record (BEP-44)
The DHT record is stored at the `Transport Public Key` address.

*   **`k` (key):** Transport Public Key (32 bytes).
*   **`seq` (sequence):** Monotonically increasing integer.
*   **`v` (value):** Bencoded dictionary containing:
    *   `ih` (infohash): SHA1 hash of the latest "Feed Index" torrent (20 bytes).
    *   `ts` (timestamp): Unix timestamp of update.
    *   `npk` (nostr pubkey): Optional associated Nostr public key.
*   **`sig` (signature):** Ed25519 signature of the payload.

### 3. The Feed Index
The `infohash` points to a **Feed Index** torrent. This torrent contains a lightweight `index.json` file:
*   `items`: Array of recent events. Each item contains:
    *   `id`: Nostr event ID.
    *   `magnet`: Magnet URI for the full event content.
    *   `ts`: Timestamp of the event.
    *   `kind`: Nostr event kind.

### 4. Client Discovery Workflow
The `FeedTracker` handles multi-modal discovery:

1.  **DHT Mode (Primary):** Performs `dht.get(transport_pubkey)` to find the latest infohash.
2.  **Relay Bridge Mode (Fallback/Bootstrap):** Checks for Kind 30078 events with `d` tag `nostr-over-bt-feed` on configured relays. This is essential for web browsers where DHT access might be limited.

## Implementation Details

### `IdentityManager`
Handles the Ed25519 transport keypair. Uses `tweetnacl` for cross-platform compatibility.

### `FeedManager`
Manages the sequence numbers and performs the `dht.put` operations. It also constructs the `index.json` payload.

### `FeedTracker`
Orchestrates the discovery process, trying DHT and Relays in parallel or sequence to resolve a user's current P2P Feed magnet.

## Advantages
*   **Relay Resilience:** If relays go down, the "Head" of the user's stream is still resolvable via the DHT.
*   **Censorship Resistance:** Updates propagate via the P2P layer.
*   **Global WoT Sync:** Enables crawling the social graph without relay rate limits by following the DHT pointers of followed users.
