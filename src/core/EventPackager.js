import { z } from 'zod';
import { verifyEvent } from 'nostr-tools';
import { ValidationError } from '../utils/Errors.js';
import { logger } from '../utils/Logger.js';

/**
 * Event Schema for validation.
 */
const EventSchema = z.object({
    id: z.string().min(1),
    pubkey: z.string().min(1).optional(),
    created_at: z.number().optional(),
    kind: z.number().optional(),
    tags: z.array(z.array(z.string())).optional(),
    content: z.string().optional(),
    sig: z.string().min(1).optional()
});

/**
 * EventPackager handles the conversion of Nostr events to/from 
 * BitTorrent-compatible data structures.
 */
export class EventPackager {
    /**
     * Packages a Nostr event into a Buffer for seeding.
     * @param {object} event - The Nostr event.
     * @returns {Buffer} - The JSON buffer of the event.
     */
    package(event) {
        try {
            const validEvent = EventSchema.parse(event);
            const data = JSON.stringify(validEvent);
            return Buffer.from(data);
        } catch (error) {
            throw new ValidationError(`Invalid Nostr event: ${error.message}`);
        }
    }

    /**
     * Unpacks a buffer back into a Nostr event.
     * @param {Buffer|string} data - The data from BitTorrent.
     * @returns {object} - The Nostr event.
     */
    unpack(data) {
        try {
            const jsonString = data.toString();
            const event = JSON.parse(jsonString);
            const validEvent = EventSchema.parse(event);

            // Defense-in-depth: Verify signature if full event is present
            if (validEvent.pubkey && validEvent.sig && validEvent.content && validEvent.id.length === 64) {
                try {
                    if (!verifyEvent(validEvent)) {
                        logger.warn(`Signature verification failed for ${validEvent.id}`);
                    }
                } catch {
                    // Skip verification if nostr-tools throws (e.g. malformed but passed zod)
                }
            }

            return validEvent;
        } catch (error) {
            throw new ValidationError(`Failed to unpack event: ${error.message}`);
        }
    }

    /**
     * Generates a unique filename for the event.
     * @param {object} event 
     * @returns {string}
     */
    getFilename(event) {
        return `${event.id}.json`;
    }
}
