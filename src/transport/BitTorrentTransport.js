import { ITransport } from '../interfaces/ITransport.js';
import WebTorrent from 'webtorrent';
import { logger } from '../utils/Logger.js';
import { TransportError, TimeoutError } from '../utils/Errors.js';

export class BitTorrentTransport extends ITransport {
    constructor(options = {}) {
        super();
        this.announce = options.announce || []; 
        this.client = new WebTorrent({
            ...options,
            dht: options.dht !== undefined ? options.dht : true, 
            tracker: options.tracker !== false,
            webSeeds: options.webSeeds !== false
        });

        // Resilience: Prevent memory leak warnings in complex simulations
        this.client.setMaxListeners(100);
    }

    async connect() {
        if (this.client.destroyed) throw new TransportError("Client was destroyed.", "bittorrent");
        logger.log(`Online (DHT: ${this.client.dht ? 'Enabled' : 'Disabled'}).`);
    }

    async disconnect() {
        return new Promise((resolve) => {
            logger.log("Shutting down client...");
            this.client.destroy((err) => {
                if (err) logger.error("Error during BT shutdown:", err.message);
                resolve();
            });
        });
    }

    addTracker(url) {
        if (!this.announce.includes(url)) {
            this.announce.push(url);
            logger.log(`Added tracker ${url}`);
            // Note: For existing torrents, we'd need to call announce on them
            this.client.torrents.forEach(t => t.announce([url]));
        }
    }

    /**
     * Seeds data via BitTorrent.
     * @param {object} data - { buffer, filename }
     * @returns {Promise<string>} - The magnet URI.
     */
    async publish(data) {
        return new Promise((resolve, reject) => {
            const { buffer, filename } = data;
            
            const opts = { name: filename };
            if (this.announce.length > 0) {
                opts.announce = this.announce;
            }

            this.client.seed(buffer, opts, (torrent) => {
                resolve(torrent.magnetURI);
            });

            // Error handling for the client
            this.client.once('error', (err) => {
                reject(new TransportError(err.message, "bittorrent"));
            });
        });
    }

    /**
     * Fetches a file via BitTorrent.
     * @param {string} magnetUri 
     * @returns {Promise<Buffer>}
     */
    async fetch(magnetUri) {
        return new Promise((resolve, reject) => {
            // Set a timeout for the fetch
            const timeout = setTimeout(() => {
                reject(new TimeoutError("BitTorrent fetch timed out", 5000));
            }, 5000); // 5s timeout for demo

            this.client.add(magnetUri, (torrent) => {
                // Assume single file for simplicity
                const file = torrent.files[0];
                if (!file) {
                    clearTimeout(timeout);
                    reject(new TransportError("No files in torrent", "bittorrent"));
                    return;
                }

                file.getBuffer((err, buffer) => {
                    clearTimeout(timeout);
                    if (err) reject(new TransportError(err.message, "bittorrent"));
                    else resolve(buffer);
                });
            });
        });
    }

    /**
     * Waits for the DHT to bootstrap and find at least one node.
     * @param {number} [timeout=10000] 
     * @returns {Promise<void>}
     */
    async waitForDHT(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const dht = this.getDHT();
            if (!dht) return resolve(); // No DHT, no wait

            if (dht.nodes.length > 0) return resolve();

            const timer = setTimeout(() => {
                dht.removeListener('node', onNode);
                reject(new TimeoutError("DHT bootstrap timed out.", timeout));
            }, timeout);

            const onNode = () => {
                if (dht.nodes.length > 0) {
                    clearTimeout(timer);
                    dht.removeListener('node', onNode);
                    resolve();
                }
            };

            dht.on('node', onNode);
        });
    }

    subscribe(filter, _onEvent) {
        logger.log("Listening for DHT matches", filter);
        return {
            close: () => logger.log("DHT subscription closed")
        };
    }

    /**
     * Returns the underlying DHT instance.
     * @returns {object}
     */
    getDHT() {
        return this.client.dht || this.client._dht;
    }
}
