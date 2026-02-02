# Task: Phase 2 - Core Transport Logic

**Objective:** Implement the core logic for packaging Nostr events into BitTorrent-ready formats and managing hybrid transport.

## Status
*   **Status:** In Progress
*   **Owner:** Gemini Agent
*   **Start Date:** 2026-02-02

## Sub-Tasks

### 1. Event Packaging
- [x] Implement `EventPackager` class in `src/core/EventPackager.js`.
    - [x] `package(event)`: Converts Nostr event to a File/Buffer for seeding.
    - [x] `unpack(data)`: Restores Nostr event from BitTorrent data.
- [x] Add unit tests for `EventPackager`.

### 2. Transport Management
- [x] Implement `TransportManager` in `src/core/TransportManager.js`.
    - [x] Orchestrates `HybridTransport` workflow.
    - [x] Handles "Injected Logic": automatically adding magnet tags to events.
- [x] Add unit tests for `TransportManager`.

### 3. Injected Logic Strategy
- [x] Define the tag format for BitTorrent links (e.g., `["bt", <magnet_uri>]`).
- [x] Ensure standard clients ignore/render these tags gracefully.

### 4. Milestone 2 Verification
- [x] Create an integration test showing an event being packaged, seeded via BT, and published to a mock relay with the BT tag.

## Notes
- `EventPackager` should ensure that the packaged data includes the full Nostr event to maintain integrity.
- Injected tags should follow NIP conventions if possible (e.g., using a specific tag name that doesn't conflict).
- **Completion Date:** 2026-02-02
