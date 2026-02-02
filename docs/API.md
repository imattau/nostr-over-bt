# API Reference: nostr-over-bt

This document provides a detailed reference for all public classes and methods in the `nostr-over-bt` library.

## 1. TransportManager
The primary facade for interacting with the library. Coordinates hybrid and P2P operations.

### `constructor(transport, options = {})`
*   `transport`: An instance of `HybridTransport`.
*   `options`:
    *   `wotManager`: (Optional) `WoTManager` instance.
    *   `feedManager`: (Optional) `FeedManager` instance.

### `publish(signedEvent, mediaFiles = [])`
Publishes an event to Nostr relays and seeds it to BitTorrent.
*   **Enforces Deferred Seeding:** Only seeds if relay publish succeeds.
*   `mediaFiles`: Array of `{ buffer, filename }` to seed alongside the event.
*   Returns: `Promise<{ magnetUri, mediaMagnets, relayStatus }>`

### `publishP2P(event)`
Publishes an event purely via P2P (DHT + Swarm), bypassing relays.
*   Returns: `Promise<string>` (Magnet URI of the updated Index).

### `subscribeP2P(transportPubkey)`
Resolves a user's P2P feed from the DHT and returns recent event metadata.
*   Returns: `Promise<Array>` (List of event pointers).

### `subscribeFollowsP2P()`
Crawls the entire Web of Trust graph and fetches latest events from all followed users via P2P.
*   Returns: `Promise<Array>` (Flattened list of events).

### `reseedEvent(event, background = true)`
Adds an existing event to the local seeding queue.
*   `background`: If true, returns immediately while seeding happens in the background.

### `fetchMedia(event)`
Fetches media associated with an event using a BT-first, HTTP-fallback strategy.

---

## 2. IdentityManager
Handles P2P identities and cryptographic keys.

### `static fromNostrSecretKey(sk)`
Derives a stable P2P Identity from a Nostr secret key.

### `generate()`
Generates a fresh random P2P Identity.

### `getPublicKey()` / `getSecretKey()`
Returns the hex-encoded strings of the P2P identity.

---

## 3. WoTManager
Manages the social graph for selective seeding and discovery.

### `refreshFollows(userPubkey)`
Fetches the primary follow list (Kind 3) from relays.

### `syncWoTRecursiveP2P()`
Recursively expands the trust graph (follows of follows) using P2P discovery.

---

## 4. FeedManager
Manages BEP-44 DHT mutable records.

### `syncSequence()`
Synchronizes the local sequence number with the latest global DHT state to ensure updates are accepted.

---

## 5. Transports

### `BitTorrentTransport(options)`
*   `options.announce`: List of tracker URLs (e.g. `['ws://localhost:8889']`).
*   `options.dht`: Boolean or DHT config object.

### `NostrTransport(relays)`
*   `relays`: Array of relay URLs.

### `HybridTransport(nostr, bt)`
Combines both transports for unified operation.
