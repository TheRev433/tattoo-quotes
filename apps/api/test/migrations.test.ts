import { describe, expect, it } from 'vitest';
import { migrate, openDatabase, queryAll } from '../src/db/database.js';
import { migrations } from '../src/db/migrations.js';

describe('migrations', () => {
  it('applies every migration once and is idempotent', () => {
    const db = openDatabase(':memory:');
    try {
      const applied = queryAll<{ version: number }>(db, 'SELECT version FROM schema_migrations ORDER BY version');
      expect(applied.map((r) => r.version)).toEqual(migrations.map((m) => m.version));
      expect(migrate(db)).toEqual([]);
      const tables = queryAll<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((t) => t.name);
      expect(tables).toEqual(expect.arrayContaining(['artists', 'attachments', 'messages', 'quote_requests', 'quotes', 'status_events']));
    } finally {
      db.close();
    }
  });

  it('enforces status and money constraints in the schema itself', () => {
    const db = openDatabase(':memory:');
    try {
      const insert = (status: string) =>
        db
          .prepare(
            `INSERT INTO quote_requests (public_token, client_name, client_email, description, placement, width_cm, height_cm,
               style, color_mode, status, created_at, updated_at)
             VALUES (?, 'a', 'a@example.com', 'd', 'p', 1, 1, 'other', 'color', ?, 'now', 'now')`,
          )
          .run(`tok-${status}`, status);
      expect(() => insert('new')).not.toThrow();
      expect(() => insert('archived')).toThrow(/CHECK/);
      expect(() => db.exec(`INSERT INTO artists (name, slug) VALUES ('A', 'a'), ('B', 'a')`)).toThrow(/UNIQUE/);
    } finally {
      db.close();
    }
  });
});
