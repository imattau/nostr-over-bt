/**
 * Utility for awaiting a specific Nostr event with a timeout.
 * Centralizes the boilerplate for one-shot subscriptions.
 * 
 * @param {ITransport} transport - The transport instance to subscribe to.
 * @param {object|Array} filter - The Nostr filter(s).
 * @param {number} [timeoutMs=5000] - Timeout in milliseconds.
 * @param {function} [matcher] - Optional predicate to match the specific event.
 * @returns {Promise<object|null>} - The matched event or null if timeout.
 */
export async function awaitEventWithTimeout(transport, filter, timeoutMs = 5000, matcher = () => true) {
    return new Promise((resolve) => {
        let sub;
        const timer = setTimeout(() => {
            if (sub && typeof sub.close === 'function') sub.close();
            resolve(null);
        }, timeoutMs);

        sub = transport.subscribe(filter, (event) => {
            if (matcher(event)) {
                clearTimeout(timer);
                if (sub && typeof sub.close === 'function') sub.close();
                resolve(event);
            }
        });
    });
}
