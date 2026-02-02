import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { RelayDatabase } from '../src/Database.js';
import fs from 'fs';

describe('Relay Logic & Database', () => {
    let db;
    const TEST_DB = './test-relay.db';

    beforeEach(() => {
        if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
        db = new RelayDatabase(TEST_DB);
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    });

    test('should save and retrieve a basic event', () => {
        const event = {
            id: '1', pubkey: 'abc', created_at: 100, kind: 1, content: 'hello', sig: 'sig', tags: []
        };
        db.saveEvent(event);
        const results = db.queryEvents({ ids: ['1'] });
        expect(results).toHaveLength(1);
        expect(results[0].content).toBe('hello');
    });

    test('NIP-09: should delete events', () => {
        const event1 = { id: 'e1', pubkey: 'abc', created_at: 100, kind: 1, content: 'to delete', sig: 's', tags: [] };
        db.saveEvent(event1);
        
        const deleteEvent = {
            id: 'd1', pubkey: 'abc', created_at: 101, kind: 5, content: '', sig: 's',
            tags: [['e', 'e1']]
        };
        db.saveEvent(deleteEvent);

        const results = db.queryEvents({ ids: ['e1'] });
        expect(results).toHaveLength(0);
    });

    test('NIP-50: should perform full-text search', () => {
        db.saveEvent({ id: 's1', pubkey: 'p', created_at: 100, kind: 1, content: 'apple pie', sig: 's', tags: [] });
        db.saveEvent({ id: 's2', pubkey: 'p', created_at: 101, kind: 1, content: 'banana split', sig: 's', tags: [] });

        const results = db.queryEvents({ search: 'apple' });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('s1');
    });

    test('NIP-12: should filter by tags', () => {
        db.saveEvent({ 
            id: 't1', pubkey: 'p', created_at: 100, kind: 1, content: 'tag test', sig: 's', 
            tags: [['p', 'target-pubkey'], ['t', 'nostr']] 
        });

        const results = db.queryEvents({ '#p': ['target-pubkey'] });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('t1');
    });

    test('NIP-33: should replace parameterized replaceable events', () => {
        const e1 = { id: 'p1', pubkey: 'abc', created_at: 100, kind: 30023, content: 'v1', sig: 's', tags: [['d', 'my-post']] };
        const e2 = { id: 'p2', pubkey: 'abc', created_at: 101, kind: 30023, content: 'v2', sig: 's', tags: [['d', 'my-post']] };
        
        db.saveEvent(e1);
        db.saveEvent(e2);

        const results = db.queryEvents({ kinds: [30023] });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('p2');
    });
});
