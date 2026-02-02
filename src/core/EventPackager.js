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
        if (!event || !event.id) {
            throw new Error("Invalid Nostr event: missing ID.");
        }
        const data = JSON.stringify(event);
        return Buffer.from(data);
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
            if (!event.id || !event.sig) {
                throw new Error("Invalid unpacked event: missing signature or ID.");
            }
            return event;
        } catch (error) {
            throw new Error(`Failed to unpack event: ${error.message}`);
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
