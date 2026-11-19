import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { migrations } from './migrations.js';

export type Db = DatabaseSync;
export type SqlParam = SQLInputValue;

/** Opens (creating if needed) the SQLite file and applies pending migrations. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

export function migrate(db: Db): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const applied = new Set(
    queryAll<{ version: number }>(db, 'SELECT version FROM schema_migrations').map((r) => r.version),
  );
  const ran: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    inTransaction(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    });
    ran.push(m.version);
  }
  return ran;
}

/** Runs `fn` inside BEGIN/COMMIT, rolling back on any thrown error. Not re-entrant. */
export function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function queryAll<T>(db: Db, sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T>(db: Db, sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function execute(db: Db, sql: string, ...params: SqlParam[]): { changes: number; lastId: number } {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}
