import { ITransport } from '../interfaces/ITransport.js';
import WebTorrent from 'webtorrent';

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
        if (this.client.destroyed) throw new Error("Client was destroyed.");
        console.log(`BitTorrentTransport: Online (DHT: ${this.client.dht ? 'Enabled' : 'Disabled'}).`);
    }

    async disconnect() {
        return new Promise((resolve) => {
            console.log("BitTorrentTransport: Shutting down client...");
            this.client.destroy((err) => {
                if (err) console.error("Error during BT shutdown:", err.message);
                resolve();
            });
        });
    }

    addTracker(url) {
        if (!this.announce.includes(url)) {
            this.announce.push(url);
            console.log(`BitTorrentTransport: Added tracker ${url}`);
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
                // console.log(`BitTorrentTransport: Seeding ${filename}. Magnet: ${torrent.magnetURI}`);
                resolve(torrent.magnetURI);
            });

            // Error handling for the client
            this.client.on('error', (err) => {
                reject(err);
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
                // this.client.remove(magnetUri); // Cleanup?
                reject(new Error("BitTorrent fetch timed out"));
            }, 5000); // 5s timeout for demo

            this.client.add(magnetUri, (torrent) => {
                // Assume single file for simplicity
                const file = torrent.files[0];
                if (!file) {
                    clearTimeout(timeout);
                    reject(new Error("No files in torrent"));
                    return;
                }

                file.getBuffer((err, buffer) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(buffer);
                    
                    // Optional: Destroy torrent after fetch if we don't want to seed
                    // torrent.destroy();
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
                reject(new Error("DHT bootstrap timed out."));
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

    async subscribe(filter, _onEvent) {
        console.log("BitTorrentTransport: Listening for DHT matches", filter);
    }

    /**
     * Returns the underlying DHT instance.
     * @returns {object}
     */
    getDHT() {
        return this.client.dht || this.client._dht;
    }
}
