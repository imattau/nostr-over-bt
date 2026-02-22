import { z } from 'zod';
import { Limits } from '../Constants.js';

/**
 * Feed Index Schema.
 */
const FeedIndexSchema = z.object({
    updated_at: z.number(),
    items: z.array(z.object({
        id: z.string().min(1),
        magnet: z.string().startsWith('magnet:'),
        ts: z.number(),
        kind: z.number().optional()
    }))
});

/**
 * FeedIndex manages the list of events in a user's P2P feed.
 * It handles the data structure serialized into the 'index.json' file.
 */
export class FeedIndex {
    /**
     * @param {number} [limit=Limits.FEED_INDEX_LIMIT] - Maximum number of events to keep in the index.
     */
    constructor(limit = Limits.FEED_INDEX_LIMIT) {
        this.limit = limit;
        this.items = []; // Array of { id, magnet, ts, kind }
        this.updatedAt = 0;
    }

    /**
     * Adds an event to the index.
     * @param {object} event - The Nostr event.
     * @param {string} magnetUri - The magnet URI for the event content.
     */
    add(event, magnetUri) {
        // Prevent duplicates
        if (this.items.some(i => i.id === event.id)) return;

        const item = {
            id: event.id,
            magnet: magnetUri,
            ts: event.created_at,
            kind: event.kind
        };

        // Add to front
        this.items.unshift(item);

        // Sort by timestamp descending (just in case)
        this.items.sort((a, b) => b.ts - a.ts);

        // Trim to limit
        if (this.items.length > this.limit) {
            this.items = this.items.slice(0, this.limit);
        }

        this.updatedAt = Math.floor(Date.now() / 1000);
    }

    /**
     * Serializes the index to a Buffer.
     * @returns {Buffer}
     */
    toBuffer() {
        const data = {
            updated_at: this.updatedAt,
            items: this.items
        };
        return Buffer.from(JSON.stringify(data));
    }

    /**
     * Loads the index from a Buffer.
     * @param {Buffer} buffer 
     */
    loadFromBuffer(buffer) {
        try {
            const rawData = JSON.parse(buffer.toString());
            const data = FeedIndexSchema.parse(rawData);
            this.items = data.items;
            this.updatedAt = data.updated_at;
        } catch (error) {
            console.warn("FeedIndex: Failed to load from buffer", error.message);
            // Start fresh if corrupted
            this.items = [];
        }
    }
}
