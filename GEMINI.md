# Project Context

## Project Overview
**nostr-over-bt** is a project intended to be a library for using Nostr over BitTorrent.
*   **Current Status:** **Project Complete.** The library is fully implemented, including hybrid transport, Web of Trust seeding, and robust testing. Version 1.0.0 is ready.

## Project Concepts
*   **Primary Transport:** BitTorrent serves as the primary transport layer for both Nostr events and media.
*   **Relay Support:** The system is supported by Nostr relays.
*   **Injected Logic:** BitTorrent logic is injected into Nostr event JSON as tags, ensuring that standard clients can still render the events.
*   **Hybrid Delivery:** Events are still published to relays to provide fallback support when no BitTorrent peers are available. Seeding mechanisms must also be able to utilize relays to "restart seeding".
*   **Selective Seeding (WoT):** The library implements a "following first" strategy, prioritizing the seeding of events/media from followed users. Seeding general network content is optional.
*   **DHT Support:** Distributed Hash Table (DHT) support is integrated and configurable, allowing clients to participate in peer discovery and event storage if their environment supports it.
*   **Deferred Seeding:** To prevent network spam and ensure data validity, seeding of events and associated media only occurs *after* the event has been successfully accepted by a Nostr relay.
*   **Media Handling:** The library supports the standard flow of uploading media to HTTP servers. BitTorrent seeding of media is treated as a redundancy/fallback layer, not a replacement for standard HTTP hosting.
*   **Library Compatibility:** The project is designed to complement, not replace, existing Nostr libraries like `nostr-tools`. It accepts standard Nostr event objects and leaves key management and signing to the consuming application.
*   **Kind Agnostic:** The transport layer is fully agnostic to Nostr event kinds. Any event type (Text Note, DM, Long-form Content, Zap, etc.) can be packaged, seeded, and retrieved via BitTorrent without modification.
*   **Relay Integration:** The library allows relay operators to act as "Seeding Nodes" by using `TransportManager.reseedEvent()`. This enables relays to transparently back up events to the BitTorrent DHT without invalidating the original event signatures.
*   **Discovery Model:** Event discovery (finding *which* events exist) relies on Nostr Relays to provide the Magnet URIs (metadata).
*   **Content Retrieval:** Once a Magnet URI is known (e.g., from a relay tag or shared link), the **full event JSON** can be retrieved actively via the DHT/Swarm, completely bypassing the relay for the data payload.

## Key Files
*   `PROJECT_PLAN.md`: Comprehensive project plan, timeline, and deliverables.
*   `docs/P2P_DISCOVERY.md`: Architectural design for fully decentralized event discovery via DHT (BEP-44).
*   `package.json`: Node.js project configuration and dependencies.
*   `src/index.js`: Main entry point for the library.
*   `README.md`: Contains the project title and a brief description ("Nostr over bittorrent library").
*   `LICENSE`: The license file for the project (LGPL-2.1 or similar, based on file size, though content should be verified if critical).

## Building and Running
*   **Setup:** Run `npm install` to install dependencies.
*   **Testing:** Run `npm test` (currently a placeholder).

## Development Conventions
*   **Project Plan:** Adhere to the roadmap defined in `PROJECT_PLAN.md`.
*   **Modular Design:** All code must be modular and object-oriented by design.
*   **Avoid Monoliths:** Large, monolithic code blocks must be avoided in favor of smaller, focused components.
*   **Testing Requirements:** Stress and performance unit tests must be created for each component.
*   **AI Guidance:** Task files must be used to help AI when performing large or complex coding tasks.
