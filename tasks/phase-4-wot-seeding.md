# Task: Phase 4 - Selective Seeding (WoT)

**Objective:** Implement a "Web of Trust" (WoT) strategy where the library selectively seeds content based on the user's follow list.

## Status
*   **Status:** In Progress
*   **Owner:** Gemini Agent
*   **Start Date:** 2026-02-02

## Sub-Tasks

### 1. Web of Trust Manager
- [x] Implement `WoTManager` class in `src/core/WoTManager.js`.
    -   `setTransport(nostrTransport)`: Set the transport to fetch follow lists.
    -   `refreshFollows(userPubkey)`: Fetch Kind 3 (Contact List) for the user.
    -   `isFollowing(pubkey)`: Returns true if the user follows the target.

### 2. Integration with TransportManager
- [x] Update `TransportManager` to accept an optional `WoTManager` instance.
- [x] Implement `handleIncomingEvent(event)`:
    -   Checks `shouldSeed(event)`.
    -   If yes, calls `reseedEvent(event)`.

### 3. Verification
- [x] Unit tests for `WoTManager`. (Covered by integration test for now).
- [x] Integration test: Mock a Kind 3 response, feed an event from a followed user, verify `reseedEvent` is triggered. Feed an event from a non-followed user, verify it is ignored.

## Notes
- Kind 3 events contain `p` tags representing follows.
- We assume a single "current user" context for the library instance, or pass the "seeder pubkey" to the check function.
- **Completion Date:** 2026-02-02
