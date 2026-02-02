# P2P Discovery Protocol: Nostr over BEP-44

This document outlines the architecture for fully decentralized event discovery using the BitTorrent DHT, removing the hard dependency on Relays for metadata retrieval.

## Core Concept
Use **BEP-44 (Mutable Torrents)** to store a "Feed Pointer" in the DHT. This pointer acts as a mutable reference to the user's latest content tree (e.g., a Magnet URI for a "Feed" torrent).

## Architecture

### 1. Identity Mapping
To enable deterministic lookups (`Nostr Pubkey` -> `DHT Entry`), we need a strategy to map identities.

**Challenge:** Nostr uses Ed25519 keys with Schnorr signatures. BEP-44 uses Ed25519 keys with standard signatures (or specific DHT node logic). Reusing the exact same keypair across protocols is discouraged for security and compatibility reasons.

**Strategy: Associated Transport Key**
1.  **Generation:** The client generates a dedicated `Transport Keypair` (Ed25519) for DHT operations.
2.  **Attestation:** The user publishes a Nostr Event (e.g., Kind 10002 or Custom Kind) signed by their `Nostr Key`, containing the `Transport Public Key`.
    *   *Note:* This requires one initial Relay lookup to "bootstrap" the identity, OR the user can just use the Transport Key as a "known" alias shared out-of-band.
3.  **Deterministic Fallback (Optional):** If the client possesses the root seed, they can deterministically derive the `Transport Key` from the same seed using a different derivation path (e.g., `m/44'/.../1'`).

### 2. The Mutable Record (BEP-44)
The DHT record stored at the `Transport Public Key` address contains:

*   **`k` (key):** Transport Public Key (32 bytes).
*   **`seq` (sequence):** Monotonically increasing integer (incremented on update).
*   **`v` (value):** Bencoded dictionary containing:
    *   `ih` (infohash): SHA1 hash of the latest "Feed Torrent" (20 bytes).
    *   `ts` (timestamp): Unix timestamp of update.
    *   `ws` (webseeds): Optional list of HTTP fallbacks.
*   **`sig` (signature):** Ed25519 signature of the payload using the Transport Private Key.

### 3. The Feed Torrent
The `infohash` in the mutable record points to a **Feed Torrent**. This torrent is a lightweight "Index" file containing:
*   A list of recent Event IDs.
*   A list of Magnet URIs for those events (or they are included in this torrent if small).
*   Merkle root of the user's history?

### 4. Client Workflow
1.  **Resolve Identity:** User inputs `npub1...`. Client checks local DB or Relay for associated `Transport Key`.
2.  **DHT Lookup:** Client performs a `dht.get(transport_pubkey)`.
3.  **Resolve Feed:** DHT returns the mutable record with `latest_infohash`.
4.  **Join Swarm:** Client joins the swarm for `latest_infohash`.
5.  **Download Index:** Client downloads the small Index file.
6.  **Retrieve Events:** Client parses Index, identifies new events, and fetches them (via Swarm or Relay).

## Advantages
*   **Relay Resilience:** If relays go down, the "Head" of the user's stream is still resolvable via the DHT.
*   **Censorship Resistance:** Updates propagate via the P2P layer; no single server can block the "update" of the feed pointer.
*   **Bandwidth Efficiency:** Relays don't need to push every event; they just need to serve the Identity Bootstrap (which changes rarely).

## Implementation Roadmap
1.  Add `bittorrent-dht` direct dependency (accessing `put/get` for mutable items).
2.  Implement `IdentityManager` to handle Transport Key generation/derivation.
3.  Implement `FeedManager` to manage the "Index Torrent" and update the DHT pointer.
