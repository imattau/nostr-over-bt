# Development Guide: nostr-over-bt

This document provides instructions for developers who want to contribute to the `nostr-over-bt` project or understand its internals.

## Setup
1.  **Node.js**: Ensure you have Node.js >= 18.0.0 installed.
2.  **Dependencies**: Install the required packages.
    ```bash
    npm install
    ```

## Scripts
The following scripts are available in `package.json`:

*   `npm test`: Runs the test suite using Jest.
*   `npm run lint`: Runs ESLint on the `src/` directory.
*   `npm run bench`: Runs a basic performance benchmark.
*   `npm run bench:realistic`: Runs a more realistic benchmark simulating network latency and varied payloads.

## Project Structure
*   `src/`: Main source code.
    *   `core/`: Core business logic (Managers, Packager, etc.).
    *   `transport/`: Network transport implementations (BitTorrent, Nostr, Hybrid).
    *   `utils/`: Shared utilities (Logger, TagUtils, etc.).
    *   `Constants.js`: Protocol constants and default limits.
*   `apps/`: Sub-applications (CLI client, Reference Relay).
*   `examples/`: Sample scripts demonstrating library usage.
*   `test/`: Unit and integration tests.
*   `scripts/`: Utility scripts and stress tests.

## Testing Strategy
The project uses Jest for testing. Tests are categorized into:
*   **Unit Tests**: Test individual components (e.g., `EventPackager`, `TransportManager`).
*   **Integration Tests**: Test multiple components working together.
*   **Stress Tests**: Simulate high-load or complex WoT scenarios (see `scripts/wot-stress-test.js`).

To run a specific test file:
```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js test/TransportManager.test.js
```

## Contributing
*   **Modularity**: Maintain the modular architecture. Avoid adding heavy dependencies unless necessary.
*   **Coding Style**: Follow the project's ESLint configuration (`eslint.config.js`).
*   **Documentation**: Update `docs/API.md` and `docs/P2P_DISCOVERY.md` when adding or changing public interfaces.
*   **Testing**: Add unit tests for every new feature or bug fix.
