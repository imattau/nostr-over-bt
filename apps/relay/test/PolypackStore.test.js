import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// @0xx0lostcause0xx0/polypack is an optional peer dependency (see
// src/store/index.js) - these tests only run when it's actually installed,
// e.g. `npm install --no-save @0xx0lostcause0xx0/polypack` before `npm test`.
let PolyGraph, BinaryStoreAdapter, PolypackStore;
let polypackAvailable = true;
try {
    ({ PolyGraph } = await import('@0xx0lostcause0xx0/polypack'));
    ({ BinaryStoreAdapter } = await import('@0xx0lostcause0xx0/polypack/persistence/node'));
    ({ PolypackStore } = await import('../src/store/PolypackStore.js'));
} catch {
    polypackAvailable = false;
}

const maybeDescribe = polypackAvailable ? describe : describe.skip;

maybeDescribe('PolypackStore', () => {
    let store;
    let storeDir;

    beforeEach(async () => {
        storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polypack-store-test-'));
        store = await PolypackStore.create({ storeDir, PolyGraph, BinaryStoreAdapter });
    });

    afterEach(async () => {
        await store.close();
        fs.rmSync(storeDir, { recursive: true, force: true });
    });

    test('should save and retrieve a basic event', async () => {
        const event = { id: '1', pubkey: 'abc', created_at: 100, kind: 1, content: 'hello', sig: 'sig', tags: [] };
        await store.saveEvent(event);

        const results = await store.queryEvents({ ids: ['1'] });
        expect(results).toHaveLength(1);
        expect(results[0].content).toBe('hello');
    });

    test('should not save a duplicate event id twice', async () => {
        const event = { id: '1', pubkey: 'abc', created_at: 100, kind: 1, content: 'hello', sig: 'sig', tags: [] };
        const first = await store.saveEvent(event);
        const second = await store.saveEvent(event);

        expect(first.changes).toBe(1);
        expect(second.changes).toBe(0);
        expect(await store.queryEvents({ ids: ['1'] })).toHaveLength(1);
    });

    test('NIP-09: should delete events', async () => {
        await store.saveEvent({ id: 'e1', pubkey: 'abc', created_at: 100, kind: 1, content: 'to delete', sig: 's', tags: [] });
        await store.saveEvent({
            id: 'd1', pubkey: 'abc', created_at: 101, kind: 5, content: '', sig: 's',
            tags: [['e', 'e1']]
        });

        const results = await store.queryEvents({ ids: ['e1'] });
        expect(results).toHaveLength(0);
    });

    test('NIP-09: deletion only applies when the delete event author matches', async () => {
        await store.saveEvent({ id: 'e1', pubkey: 'abc', created_at: 100, kind: 1, content: 'not yours', sig: 's', tags: [] });
        await store.saveEvent({
            id: 'd1', pubkey: 'someone-else', created_at: 101, kind: 5, content: '', sig: 's',
            tags: [['e', 'e1']]
        });

        const results = await store.queryEvents({ ids: ['e1'] });
        expect(results).toHaveLength(1);
    });

    test('NIP-50: should rank full-text search by relevance', async () => {
        await store.saveEvent({ id: 's1', pubkey: 'p', created_at: 100, kind: 1, content: 'quantum computing is neat', sig: 's', tags: [] });
        await store.saveEvent({ id: 's2', pubkey: 'p', created_at: 101, kind: 1, content: 'banana split with quantum sprinkles', sig: 's', tags: [] });
        await store.saveEvent({ id: 's3', pubkey: 'p', created_at: 102, kind: 1, content: 'totally unrelated cats', sig: 's', tags: [] });

        const results = await store.queryEvents({ search: 'quantum computing' });
        const ids = results.map(e => e.id);

        expect(ids).toContain('s1');
        expect(ids).not.toContain('s3');
        expect(ids.indexOf('s1')).toBeLessThan(ids.indexOf('s2'));
    });

    test('NIP-12: should filter by tags', async () => {
        await store.saveEvent({
            id: 't1', pubkey: 'p', created_at: 100, kind: 1, content: 'tag test',
            sig: 's', tags: [['p', 'target-pubkey'], ['t', 'nostr']]
        });

        const results = await store.queryEvents({ '#p': ['target-pubkey'] });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('t1');
    });

    test('replaceable events (kind 0) keep only the latest', async () => {
        await store.saveEvent({ id: 'm1', pubkey: 'p', created_at: 200, kind: 0, content: 'v1', sig: 's', tags: [] });
        await store.saveEvent({ id: 'm2', pubkey: 'p', created_at: 201, kind: 0, content: 'v2', sig: 's', tags: [] });

        const results = await store.queryEvents({ kinds: [0], authors: ['p'] });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('m2');
    });

    test('NIP-33: should replace parameterized replaceable events', async () => {
        await store.saveEvent({ id: 'a1', pubkey: 'p', created_at: 100, kind: 30000, content: 'first', sig: 's', tags: [['d', 'x']] });
        await store.saveEvent({ id: 'a2', pubkey: 'p', created_at: 101, kind: 30000, content: 'second', sig: 's', tags: [['d', 'x']] });

        const results = await store.queryEvents({ kinds: [30000], authors: ['p'] });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('a2');
    });

    test('since/until should filter by created_at range', async () => {
        await store.saveEvent({ id: 'r1', pubkey: 'p', created_at: 100, kind: 1, content: 'a', sig: 's', tags: [] });
        await store.saveEvent({ id: 'r2', pubkey: 'p', created_at: 200, kind: 1, content: 'b', sig: 's', tags: [] });
        await store.saveEvent({ id: 'r3', pubkey: 'p', created_at: 300, kind: 1, content: 'c', sig: 's', tags: [] });

        const results = await store.queryEvents({ since: 150, until: 250 });
        expect(results.map(e => e.id)).toEqual(['r2']);
    });

    test('limit should cap results after ordering by created_at desc', async () => {
        await store.saveEvent({ id: 'l1', pubkey: 'p', created_at: 100, kind: 1, content: 'a', sig: 's', tags: [] });
        await store.saveEvent({ id: 'l2', pubkey: 'p', created_at: 101, kind: 1, content: 'b', sig: 's', tags: [] });
        await store.saveEvent({ id: 'l3', pubkey: 'p', created_at: 102, kind: 1, content: 'c', sig: 's', tags: [] });

        const results = await store.queryEvents({ limit: 2 });
        expect(results.map(e => e.id)).toEqual(['l3', 'l2']);
    });
});

if (!polypackAvailable) {
    test.skip('PolypackStore: @0xx0lostcause0xx0/polypack is not installed, skipping', () => {});
}
