/**
 * Simple internal queue to handle background BitTorrent seeding.
 */
export class SeedingQueue {
    /**
     * @param {TransportManager} transportManager 
     */
    constructor(transportManager) {
        this.manager = transportManager;
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * Adds an event to the background seeding queue.
     * @param {object} event 
     */
    enqueue(event) {
        this.queue.push(event);
        console.log(`[Queue] Enqueued event ${event.id.substring(0, 8)}. Size: ${this.queue.length}`);
        this.process();
    }

    async process() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        const event = this.queue.shift();
        try {
            // Use reseedEvent with background=false here because the QUEUE 
            // is already the background mechanism.
            await this.manager.reseedEvent(event, false);
            console.log(`[Queue] Successfully seeded event ${event.id.substring(0, 8)}`);
        } catch (err) {
            console.error(`[Queue] Failed to seed ${event.id}:`, err.message);
        }

        this.isProcessing = false;
        // Move to next immediately
        setImmediate(() => this.process());
    }
}
