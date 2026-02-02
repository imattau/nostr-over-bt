import Database from 'better-sqlite3';
import os from 'os';

export class RelayDatabase {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        // Auto-Discovery: Tune cache based on available RAM (target ~5% of system RAM)
        const totalRAM = os.totalmem();
        const cacheSizeMB = Math.floor((totalRAM / (1024 * 1024)) * 0.05);
        const cachePages = cacheSizeMB * -1024; // negative value means KiB in SQLite

        console.log(`[DB] System RAM: ${Math.round(totalRAM / 1024 / 1024 / 1024)}GB. Setting cache to: ${cacheSizeMB}MB`);

        this.db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = ${cachePages};
            PRAGMA temp_store = MEMORY;
            
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                pubkey TEXT,
                created_at INTEGER,
                kind INTEGER,
                content TEXT,
                sig TEXT,
                magnet_uri TEXT
            );
            
            CREATE TABLE IF NOT EXISTS tags (
                event_id TEXT,
                name TEXT,
                value TEXT,
                FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
            );

            -- NIP-50: Full Text Search Engine
            CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
                id UNINDEXED,
                content
            );

            -- Triggers to keep FTS in sync
            CREATE TRIGGER IF NOT EXISTS after_event_insert AFTER INSERT ON events BEGIN
                INSERT INTO events_fts(id, content) VALUES (new.id, new.content);
            END;
            CREATE TRIGGER IF NOT EXISTS after_event_delete AFTER DELETE ON events BEGIN
                DELETE FROM events_fts WHERE id = old.id;
            END;

            CREATE INDEX IF NOT EXISTS idx_kind ON events(kind);
            CREATE INDEX IF NOT EXISTS idx_pubkey ON events(pubkey);
            CREATE INDEX IF NOT EXISTS idx_created_at ON events(created_at);
            CREATE INDEX IF NOT EXISTS idx_tags_nv ON tags(name, value);
        `);
    }

    saveEvent(event, magnetUri = null) {
        const isReplaceable = (event.kind >= 10000 && event.kind < 20000) || [0, 3].includes(event.kind);
        const isParameterized = (event.kind >= 30000 && event.kind < 40000);

        const transaction = this.db.transaction(() => {
            if (isReplaceable) {
                this.db.prepare('DELETE FROM events WHERE pubkey = ? AND kind = ? AND created_at < ?')
                    .run(event.pubkey, event.kind, event.created_at);
            } else if (isParameterized) {
                const dTag = event.tags.find(t => t[0] === 'd')?.[1] || '';
                this.db.prepare(`
                    DELETE FROM events WHERE pubkey = ? AND kind = ? AND id IN (
                        SELECT event_id FROM tags WHERE name = 'd' AND value = ?
                    ) AND created_at < ?
                `).run(event.pubkey, event.kind, dTag, event.created_at);
            }

            if (event.kind === 5) {
                const targets = event.tags.filter(t => t[0] === 'e').map(t => t[1]);
                if (targets.length > 0) {
                    const placeholders = targets.map(() => '?').join(',');
                    this.db.prepare(`DELETE FROM events WHERE pubkey = ? AND id IN (${placeholders})`)
                        .run(event.pubkey, ...targets);
                }
            }

            const stmt = this.db.prepare(`
                INSERT OR IGNORE INTO events (id, pubkey, created_at, kind, content, sig, magnet_uri)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(event.id, event.pubkey, event.created_at, event.kind, event.content, event.sig, magnetUri);

            if (result.changes > 0) {
                const tagStmt = this.db.prepare('INSERT INTO tags (event_id, name, value) VALUES (?, ?, ?)');
                for (const tag of event.tags) {
                    if (tag[0].length === 1 || tag[0] === 'd') {
                        tagStmt.run(event.id, tag[0], tag[1]);
                    }
                }
            }
            return result;
        });

        return transaction();
    }

    queryEvents(filter) {
        let sql = 'SELECT DISTINCT e.* FROM events e';
        const params = [];
        const joins = [];
        const where = ['1=1'];

        // NIP-50: Search Support
        if (filter.search) {
            joins.push('JOIN events_fts fts ON e.id = fts.id');
            where.push('events_fts MATCH ?');
            params.push(filter.search);
        }

        if (filter.ids) {
            where.push(`e.id IN (${filter.ids.map(() => '?').join(',')})`);
            params.push(...filter.ids);
        }
        if (filter.authors) {
            where.push(`e.pubkey IN (${filter.authors.map(() => '?').join(',')})`);
            params.push(...filter.authors);
        }
        if (filter.kinds) {
            where.push(`e.kind IN (${filter.kinds.map(() => '?').join(',')})`);
            params.push(...filter.kinds);
        }
        
        Object.keys(filter).forEach(key => {
            if (key.startsWith('#') && Array.isArray(filter[key])) {
                const tagName = key.substring(1);
                const values = filter[key];
                const alias = `t${joins.length}`;
                joins.push(`JOIN tags ${alias} ON e.id = ${alias}.event_id`);
                where.push(`${alias}.name = ? AND ${alias}.value IN (${values.map(() => '?').join(',')})`);
                params.push(tagName, ...values);
            }
        });

        if (filter.since) {
            where.push('e.created_at >= ?');
            params.push(filter.since);
        }
        if (filter.until) {
            where.push('e.created_at <= ?');
            params.push(filter.until);
        }

        const query = `${sql} ${joins.join(' ')} WHERE ${where.join(' AND ')} ORDER BY e.created_at DESC ${filter.limit ? 'LIMIT ?' : ''}`;
        if (filter.limit) params.push(filter.limit);

        const rows = this.db.prepare(query).all(...params);
        return rows.map(row => {
            const tags = this.db.prepare('SELECT name, value FROM tags WHERE event_id = ?').all(row.id);
            return {
                ...row,
                tags: tags.map(t => [t.name, t.value])
            };
        });
    }
}
