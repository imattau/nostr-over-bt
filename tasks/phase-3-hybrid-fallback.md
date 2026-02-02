# Task: Phase 3 - Hybrid Delivery & Fallback

**Objective:** Implement mechanisms to ensure data availability when peers are missing (Relay Fallback) and to re-seed content fetched from relays (Restart Seeding).

## Status
*   **Status:** In Progress
*   **Owner:** Gemini Agent
*   **Start Date:** 2026-02-02

## Sub-Tasks

### 1. Relay Fallback (Reading)
- [x] Implement `HybridTransport.subscribe`:
    -   (Decision: `subscribe` relies on Relays for events).
    -   Implemented `fetchMedia` in `TransportManager` which handles the fallback logic: Magnet -> HTTP URL.

### 2. Restart Seeding (Re-seeding)
- [x] Implement `TransportManager.reseedEvent(event)`:
    -   Implemented `reseedEvent` to allow any client to re-package and seed a Relay event.

### 3. Implementation Steps
- [x] Update `TransportManager` with `reseedEvent(event)`.
- [x] Update `TransportManager` to handle `fetchMedia(event)` which tries BT then HTTP.
- [x] Update `BitTorrentTransport` with `fetch(magnet)`.

### 4. Verification
- [x] Test `reseedEvent` and `fetchMedia` in `TransportManager.test.js`.

## Notes
- "Restart Seeding" is crucial for keeping the swarm alive. Any client that fetches the event from a relay can become a seed for that event.
