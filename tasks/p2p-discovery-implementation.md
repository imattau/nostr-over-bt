# Task: P2P Discovery (BEP-44)

**Objective:** Implement fully decentralized event discovery using BitTorrent DHT mutable items (BEP-44), allowing clients to follow users and receive updates without relying on Relays.

## Status
*   **Status:** In Progress
*   **Owner:** Gemini Agent
*   **Start Date:** 2026-02-02

## Sub-Tasks

### 1. Dependencies & Setup
- [x] Install `bittorrent-dht` (if not exposed via webtorrent) or ensure access to `dht.put/get`.
- [x] Create `src/core/IdentityManager.js`:
    -   [x] Generate/Load "Transport Keypair" (Ed25519).
    -   [x] Create Nostr "Attestation Event" (linking Nostr Pubkey -> Transport Pubkey).

### 2. Mutable Record Management
- [x] Create `src/core/FeedManager.js`:
    -   [x] `publishFeedPointer(infoHash)`: Sign and PUT the mutable record to DHT.
    -   [x] `resolveFeedPointer(transportPubkey)`: GET the mutable record from DHT.

### 3. Feed Indexing
- [x] Implement "Index Torrent" logic:
    -   [x] Create a dynamic torrent containing a list of recent event Magnets/IDs.
    -   [x] Update this torrent when new events are published. (Implemented in `FeedIndex.js` and `FeedManager.updateFeed`).

### 4. Integration
- [x] Update `TransportManager`:
    -   [x] Add `publishP2P(event)` flow:
        1. Package Event.
        2. Update Index Torrent.
        3. Update DHT Pointer.
    -   [x] Add `subscribeP2P(transportPubkey)` flow:
        1. Resolve Pointer.
        2. Download Index.
        3. Fetch new events.

### 5. Verification
- [x] Integration Test:
    -   [x] Alice publishes to DHT.
    -   [x] Bob resolves Alice's key from DHT.
    -   [x] Bob downloads Alice's latest event via Index.

## Notes
- BEP-44 requires careful handling of sequence numbers (`seq`) to ensure updates are accepted by the network.
- `webtorrent` uses `bittorrent-dht` internally. We accessed the underlying DHT instance via `getDHT()`.
- **Completion Date:** 2026-02-02
