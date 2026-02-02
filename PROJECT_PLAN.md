# Project Plan: nostr-over-bt

## Executive Summary
**nostr-over-bt** is a Node.js library designed to enable Nostr event and media transport over BitTorrent, with seamless fallback to standard Nostr relays. This hybrid approach aims to reduce relay load and enhance data availability through peer-to-peer seeding, specifically utilizing a "Web of Trust" (WoT) prioritization strategy.

## 1. Scope and Objectives

### 1.1 Objectives
*   **Decentralized Transport:** Enable robust storage and retrieval of Nostr events via BitTorrent.
*   **Seamless Interoperability:** Ensure standard Nostr clients can consume events via "injected logic" (tags) without breaking changes.
*   **Reliability:** Implement a hybrid delivery system that falls back to relays when peers are unavailable and allows relays to "restart" seeding.
*   **Efficiency:** Prioritize bandwidth and storage based on user relationships (WoT).

### 1.2 Scope
*   **In-Scope:**
    *   Core Node.js library architecture (Modular/OOP).
    *   BitTorrent client integration (e.g., WebTorrent or similar).
    *   Nostr protocol integration (event signing/verification, tagging).
    *   Hybrid transport logic (Relay + BT).
    *   Selective seeding logic based on Follow lists.
    *   Comprehensive Unit, Stress, and Performance tests.
*   **Out-of-Scope:**
    *   Full-featured frontend client application (this is a backend/logic library).
    *   Implementations in languages other than JavaScript/TypeScript (Node.js) for this phase.

## 2. Deliverables
1.  **NPM Package:** `nostr-over-bt` library ready for import.
2.  **Documentation:** API Reference, Integration Guide, and Architecture diagrams.
3.  **Test Suite:**
    *   Unit Tests (Coverage > 80%).
    *   Performance Benchmarks (Latency, Throughput).
    *   Stress Tests (High volume event simulation).
4.  **Example Implementation:** A minimal CLI or script demonstrating usage.

## 3. Timeline & Phasing

### Phase 1: Foundation & Infrastructure (Weeks 1-2)
*   [x] Project Scaffolding & Configuration.
*   [x] Define core interfaces and abstract classes (OOP setup).
*   [x] Select and integrate base libraries (Nostr-tools, WebTorrent/Bittorrent-dht).
*   [x] **Milestone 1:** Basic environment operational with base dependencies.

### Phase 2: Core Transport Logic (Weeks 3-4)
*   [x] Implement `EventPackager`: Wraps Nostr events into torrent files/magnets.
*   [x] Implement `TransportManager`: Handles sending via BT and/or Relay.
*   [x] Develop "Injected Logic" strategy for standard Nostr tags.
*   [x] **Milestone 2:** Successful end-to-end transfer of a dummy event via BitTorrent.

### Phase 3: Hybrid Delivery & Fallback (Weeks 5-6)
*   [x] Implement Relay Fallback mechanism.
*   [x] Implement "Restart Seeding" from Relay data.
*   [x] **Milestone 3:** Hybrid transport working; system recovers when peers are down.

### Phase 4: Selective Seeding (WoT) (Weeks 7-8)
*   [x] Implement `WoTManager`: Fetches and parses follow lists.
*   [x] Integrate WoT logic into the Seeding service.
*   [x] **Milestone 4:** Smart seeding active; only "followed" content is prioritized.

### Phase 5: Optimization & Hardening (Weeks 9-10)
*   [x] Develop Stress and Performance test suites.
*   [x] Refactor based on profiling results.
*   [x] Final Code Review & Documentation polish.
*   [x] **Milestone 5:** Release Candidate 1.0.

## 4. Resources
*   **Development:** Core maintainer + AI Assistants.
*   **Infrastructure:** Local dev environment, Test Relays, Public DHT bootstrap nodes.
*   **Tools:** Node.js, Jest (Testing), Eslint (Linting).

## 5. Risks & Mitigation
*   **Risk:** P2P Latency too high for real-time chat.
    *   *Mitigation:* Use relays for "hot" data, BT for "cold" storage/media.
*   **Risk:** Browser compatibility issues (if web usage is intended later).
    *   *Mitigation:* Use Universal/Isomorphic libraries where possible (e.g., `webtorrent`).
*   **Risk:** Complexity of DHT/Magnet lookups.
    *   *Mitigation:* Modularize the lookup service; allow caching.

## 6. Communication & Reporting
*   **Strategy:** Maintain `GEMINI.md` as the source of truth for context.
*   **Task Management:** Use individual Task Files (e.g., `tasks/task-001-setup.md`) for complex coding sessions.
*   **Cadence:**
    *   **Daily:** Commit progress and update Task Files.
    *   **Weekly:** Review `PROJECT_PLAN.md` against progress; adjust timelines.
*   **KPIs:**
    *   Code Coverage %.
    *   Time-to-Retrieve (Relay vs. BT).
    *   Seeding Reliability %.
