import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import os from 'os';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Auto-Discovery: Use CPU count as default concurrency
const CPU_COUNT = os.cpus().length;
const SEEDING_CONCURRENCY = parseInt(process.env.SEEDING_CONCURRENCY || CPU_COUNT.toString());

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export class SeedingQueue {
    /**
     * @param {TransportManager} transportManager 
     */
    constructor(transportManager) {
        console.log(`[Queue] Initializing with concurrency: ${SEEDING_CONCURRENCY} (System CPUs: ${CPU_COUNT})`);
        this.manager = transportManager;
        this.queueName = 'nostr-bt-seeding';

        // 1. Initialize the Queue
        this.queue = new Queue(this.queueName, { connection });

        // 2. Initialize the Worker
        this.worker = new Worker(this.queueName, async (job) => {
            const event = job.data;
            console.log(`[Worker] Seeding event ${event.id.substring(0, 8)}...`);
            
            // Perform the expensive P2P operations
            await this.manager.reseedEvent(event, false);
            
            return { status: 'seeded', id: event.id };
        }, { 
            connection,
            concurrency: SEEDING_CONCURRENCY
        });

        this.worker.on('completed', (job) => {
            console.log(`[Worker] Job ${job.id} completed.`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`[Worker] Job ${job.id} failed:`, err.message);
        });
    }

    /**
     * Enqueues an event for background seeding.
     * @param {object} event 
     */
    async enqueue(event) {
        await this.queue.add(`seed-${event.id}`, event, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: 1000 // Keep failures for debugging
        });
    }

    async close() {
        await this.queue.close();
        await this.worker.close();
        connection.disconnect();
    }
}