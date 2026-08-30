// Nostr event storage backed by @0xx0lostcause0xx0/polypack's PolyGraph.
// Mirrors RelayDatabase's saveEvent/queryEvents contract so the two stores
// are interchangeable from index.js. See store/index.js for backend selection.
export class PolypackStore {
    constructor(graph) {
        this.graph = graph;
    }

    static async create({ storeDir, PolyGraph, BinaryStoreAdapter, embedding }) {
        const adapter = new BinaryStoreAdapter({ storeDir });
        // embedding defaults to PolyGraph's built-in FeatureHashEmbedding (lexical,
        // dependency-free) when omitted; pass a custom EmbeddingProvider via
        // POLYPACK_EMBEDDING_MODULE for model-backed semantic search instead.
        const graph = new PolyGraph(adapter, undefined, embedding);
        await graph.warm();
        return new PolypackStore(graph);
    }

    async saveEvent(event, magnetUri = null) {
        const isReplaceable = (event.kind >= 10000 && event.kind < 20000) || [0, 3].includes(event.kind);
        const isParameterized = event.kind >= 30000 && event.kind < 40000;

        if (isReplaceable || isParameterized) {
            const dTag = isParameterized ? (event.tags.find(t => t[0] === 'd')?.[1] || '') : null;
            const candidates = await this.graph.queryPersisted()
                .whereNodeType('event')
                .where('pubkey', event.pubkey)
                .where('kind', event.kind)
                .toArray();

            for (const node of candidates) {
                if (node.data.created_at >= event.created_at) continue;
                if (isParameterized) {
                    const nodeDTag = (node.data.tags || []).find(t => t[0] === 'd')?.[1] || '';
                    if (nodeDTag !== dTag) continue;
                }
                await this.graph.removeNodeSafe(node.id);
            }
        }

        if (event.kind === 5) {
            const targets = event.tags.filter(t => t[0] === 'e').map(t => t[1]);
            for (const id of targets) {
                const target = await this.graph.getNodeSafe(id);
                if (target && target.data.pubkey === event.pubkey) {
                    await this.graph.removeNodeSafe(id);
                }
            }
        }

        const existing = await this.graph.getNodeSafe(event.id);
        if (existing) {
            return { changes: 0 };
        }

        const now = Date.now();
        // addNodeWithEmbedding indexes event.content for NIP-50 similarity search
        // (queryPersistedText below), instead of a plain substring match.
        await this.graph.addNodeWithEmbedding({
            id: event.id,
            type: 'event',
            insertedAt: now,
            updatedAt: now,
            data: {
                pubkey: event.pubkey,
                created_at: event.created_at,
                kind: event.kind,
                content: event.content,
                sig: event.sig,
                magnet_uri: magnetUri,
                tags: event.tags,
            },
        }, event.content);
        await this.graph.flush();
        return { changes: 1 };
    }

    async queryEvents(filter) {
        // NIP-50: rank by embedding similarity to the search text (lexical by
        // default, or whatever EmbeddingProvider the graph was built with)
        // instead of a plain substring match.
        let query = filter.search
            ? await this.graph.queryPersistedText(filter.search, 0.1, filter.limit ? filter.limit * 4 : 500)
            : this.graph.queryPersisted();
        query = query.whereNodeType('event');

        if (filter.since != null || filter.until != null) {
            query = query.whereAttributeRange('created_at', {
                above: filter.since != null ? filter.since - 1 : undefined,
                below: filter.until != null ? filter.until + 1 : undefined,
            });
        }
        query = query.orderBy('created_at', 'desc');

        const nodes = await query.toArray();
        let events = nodes.map(n => ({
            id: n.id,
            pubkey: n.data.pubkey,
            created_at: n.data.created_at,
            kind: n.data.kind,
            content: n.data.content,
            sig: n.data.sig,
            magnet_uri: n.data.magnet_uri ?? null,
            tags: n.data.tags || [],
        }));

        if (filter.ids) {
            const idSet = new Set(filter.ids);
            events = events.filter(e => idSet.has(e.id));
        }
        if (filter.authors) {
            const authorSet = new Set(filter.authors);
            events = events.filter(e => authorSet.has(e.pubkey));
        }
        if (filter.kinds) {
            const kindSet = new Set(filter.kinds);
            events = events.filter(e => kindSet.has(e.kind));
        }
        Object.keys(filter).forEach(key => {
            if (key.startsWith('#') && Array.isArray(filter[key])) {
                const tagName = key.substring(1);
                const values = new Set(filter[key]);
                events = events.filter(e => e.tags.some(t => t[0] === tagName && values.has(t[1])));
            }
        });
        if (filter.limit) {
            events = events.slice(0, filter.limit);
        }
        return events;
    }

    async close() {
        await this.graph.dispose();
    }
}
