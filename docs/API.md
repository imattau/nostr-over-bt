# API Reference: nostr-over-bt

This document provides a detailed reference for all public classes and methods in the `nostr-over-bt` library.

## Core Components

### 1. TransportManager
The primary facade for interacting with the library. Coordinates hybrid and P2P operations.

#### `constructor(transport, options = {})`
*   `transport`: An instance of `HybridTransport`.
*   `options`:
    *   `wotManager`: (Optional) `WoTManager` instance.
    *   `feedManager`: (Optional) `FeedManager` instance.

#### `publish(signedEvent, mediaFiles = [])`
Publishes an event to Nostr relays and seeds it to BitTorrent.
*   **Enforces Deferred Seeding:** Only seeds if relay publish succeeds.
*   `signedEvent`: The signed Nostr event.
*   `mediaFiles`: Array of `{ buffer, filename }` to seed alongside the event.
*   Returns: `Promise<{ magnetUri, mediaMagnets, relayStatus }>`

#### `publishP2P(event)`
Publishes an event purely via P2P (DHT + Swarm), bypassing relays. Requires `FeedManager` to be initialized.
*   `event`: The signed Nostr event.
*   Returns: `Promise<string>` (Magnet URI of the updated Index).

#### `subscribeP2P(transportPubkey, nostrPubkey = null)`
Resolves a user's P2P feed from the DHT or Relay-bridge and returns recent event metadata.
*   `transportPubkey`: The user's P2P public key.
*   `nostrPubkey`: (Optional) The user's Nostr public key to assist in relay-based discovery.
*   Returns: `Promise<Array>` (List of event pointers).

#### `subscribeFollowsP2P()`
Crawls the entire Web of Trust graph and fetches latest events from all followed users via P2P.
*   Returns: `Promise<Array>` (Flattened list of events).

#### `reseedEvent(event, background = true)`
Adds an existing event to the local seeding queue.
*   `event`: The Nostr event object.
*   `background`: If true, returns immediately while seeding happens in the background.
*   Returns: `Promise<string>` (Magnet URI or queued ID).

#### `fetchMedia(event)`
Fetches media associated with an event using a BT-first, HTTP-fallback strategy.
*   `event`: The Nostr event containing media tags (`bt`, `url`, `image`, `video`).
*   Returns: `Promise<Buffer>` (The media content).

#### `resolveTransportKey(nostrPubkey)`
Resolves a Nostr public key to its associated P2P transport public key.
*   `nostrPubkey`: The user's hex pubkey.
*   Returns: `Promise<string|null>` (The P2P transport public key).

#### `bootstrapWoTP2P(transportPubkey, nostrPubkey = null)`
Bootstraps the Web of Trust list directly from a user's P2P Feed.
*   `transportPubkey`: The target user's P2P address.
*   `nostrPubkey`: (Optional) Nostr identity to help resolve magnet via Relay Bridge.

---

### 2. IdentityManager
Handles P2P identities and cryptographic keys (Ed25519).

#### `static fromNostrSecretKey(sk)`
Derives a stable P2P Identity from a Nostr secret key.

#### `generate()`
Generates a fresh random P2P Identity.

#### `getPublicKey()`
Returns the hex-encoded P2P transport public key.

#### `getSecretKey()`
Returns the hex-encoded P2P transport secret key.

#### `createAttestation(nostrPubkey)`
Creates a Kind 30078 event to link a Nostr identity to this P2P transport key.

---

### 3. WoTManager
Manages the social graph for selective seeding and discovery.

#### `refreshFollows(userPubkey)`
Fetches the primary follow list (Kind 3) from relays.

#### `syncWoTRecursiveP2P()`
Recursively expands the trust graph (follows of follows) using P2P discovery.

#### `addFollow(pubkey, degree = 1)`
Manually adds a follow to the local graph.

#### `isFollowing(pubkey)`
Checks if a pubkey is within the trusted graph.

---

### 4. FeedManager
Manages BEP-44 DHT mutable records for P2P event discovery.

#### `syncSequence()`
Synchronizes the local sequence number with the latest global DHT state to ensure updates are accepted.

#### `updateFeed(event, magnetUri, signNostr = null)`
Updates the P2P feed index and DHT pointer.
*   `event`: The latest event.
*   `magnetUri`: The magnet URI of the latest event.
*   `signNostr`: (Optional) Callback to sign a Nostr discovery bridge event.

---

### 5. ProfileManager
Handles fetching and caching of Nostr metadata (Kind 0) with aggressive batching.

#### `getDisplayName(pubkey)`
Returns a cached display name for the pubkey or a short hex string if not found.

#### `fetchProfile(pubkey)`
Queues a profile fetch from the Nostr network.

---

## Transport Layer

### BitTorrentTransport
Standard transport for BitTorrent DHT and Swarm operations.

#### `constructor(options = {})`
*   `options.announce`: List of tracker URLs.
*   `options.dht`: Boolean or DHT config object (default: true).

#### `waitForDHT(timeout = 10000)`
Waits for the DHT to bootstrap.

---

### NostrTransport
Transport for standard Nostr relay operations.

#### `constructor(relays = [])`
*   `relays`: Array of relay URLs.

#### `addRelay(url)` / `removeRelay(url)`
Dynamically manage the relay pool.

---

### HybridTransport
Coordinates both transports for unified operation.

#### `constructor(nostr, bt)`
*   `nostr`: An instance of `NostrTransport`.
*   `bt`: An instance of `BitTorrentTransport`.
