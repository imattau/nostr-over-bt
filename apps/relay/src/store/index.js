import { RelayDatabase } from '../Database.js';

// Picks the event store backend.
//
// STORAGE_BACKEND=sqlite   forces better-sqlite3 (default, always available).
// STORAGE_BACKEND=polypack forces @0xx0lostcause0xx0/polypack and throws if it
//                           isn't installed.
// unset                    uses polypack automatically when the host app has
//                           it installed (e.g. it already depends on it for
//                           its own graph/vector storage), otherwise sqlite.
//
// POLYPACK_EMBEDDING_MODULE, when set, is imported and its default (or named
// "embedding") export is used as the polypack EmbeddingProvider for NIP-50
// search - e.g. a real semantic model instead of the built-in lexical one.
// A bad module here throws immediately rather than silently falling back,
// since setting it is a deliberate opt-in.
export async function createStore(dbPath) {
    const backend = (process.env.STORAGE_BACKEND || '').toLowerCase();

    if (backend !== 'sqlite') {
        const embedding = await loadEmbeddingProvider();

        try {
            const [{ PolyGraph }, { BinaryStoreAdapter }] = await Promise.all([
                import('@0xx0lostcause0xx0/polypack'),
                import('@0xx0lostcause0xx0/polypack/persistence/node'),
            ]);
            const { PolypackStore } = await import('./PolypackStore.js');
            const storeDir = `${dbPath}.polypack`;
            console.log(`[DB] Using polypack graph store at ${storeDir}${embedding ? ' with custom embedding provider' : ''}`);
            return await PolypackStore.create({ storeDir, PolyGraph, BinaryStoreAdapter, embedding });
        } catch (err) {
            if (backend === 'polypack') {
                throw new Error(`STORAGE_BACKEND=polypack was requested but @0xx0lostcause0xx0/polypack could not be loaded: ${err.message}`);
            }
            // Not installed by the host app - fall back to sqlite below.
        }
    }

    console.log(`[DB] Using sqlite store at ${dbPath}`);
    return new RelayDatabase(dbPath);
}

async function loadEmbeddingProvider() {
    const modulePath = process.env.POLYPACK_EMBEDDING_MODULE;
    if (!modulePath) return undefined;

    const mod = await import(modulePath);
    const embedding = mod.default ?? mod.embedding;
    if (!embedding || typeof embedding.embed !== 'function') {
        throw new Error(`POLYPACK_EMBEDDING_MODULE=${modulePath} must export (default or "embedding") an EmbeddingProvider with an embed(text) method`);
    }
    return embedding;
}
