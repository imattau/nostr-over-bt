/**
 * Finds a tag in a Nostr event by its key.
 * @param {object} event - The Nostr event.
 * @param {string} key - The tag key (e.g. 'p', 'e', 'bt').
 * @returns {string|null} - The tag value or null.
 */
export function findTagValue(event, key) {
    if (!event || !event.tags) return null;
    const tag = event.tags.find(t => t[0] === key);
    return tag ? tag[1] : null;
}

/**
 * Finds all values for a specific tag key.
 * @param {object} event - The Nostr event.
 * @param {string} key - The tag key.
 * @returns {Array<string>} - List of tag values.
 */
export function findAllTagValues(event, key) {
    if (!event || !event.tags) return [];
    return event.tags
        .filter(t => t[0] === key)
        .map(t => t[1]);
}
