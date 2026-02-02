# Task: Deferred Seeding & Media Handling

**Objective:** Modify `TransportManager` to ensure seeding only occurs after successful relay publication, and support optional media seeding.

## Status
*   **Status:** In Progress
*   **Owner:** Gemini Agent
*   **Start Date:** 2026-02-02

## Sub-Tasks

### 1. Refactor TransportManager
- [x] Modify `publish` method to:
    1.  Accept `event` and optional `mediaFiles`.
    2.  Publish to Relay first.
    3.  Check for success.
    4.  IF success: Seed `event` and `mediaFiles` via BitTorrent.
    5.  IF fail: Throw error or return failure status (do not seed).

### 2. Update Tests
- [x] Update `TransportManager.test.js` to verify:
    -   Seeding is called *after* relay success.
    -   Seeding is *skipped* if relay fails.
    -   Media files are seeded if provided.

## Notes
- "Media files" input format should be compatible with `WebTorrent` (Buffer, File, or path).
- **Completion Date:** 2026-02-02
