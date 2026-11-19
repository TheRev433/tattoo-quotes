import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase, queryAll, queryOne } from '../src/db/database.js';
import { sniffImageType } from '../src/lib/image-sniff.js';
import { seed } from '../src/seed.js';
import { tempDir } from './helpers.js';

describe('seed', () => {
  it('creates artists and requests in every status, with images on disk, and can be re-run', () => {
    const tmp = tempDir('seed');
    const dbPath = path.join(tmp.dir, 'seed.sqlite');
    const uploadsDir = path.join(tmp.dir, 'uploads');
    try {
      const today = new Date('2026-11-17T18:00:00Z');
      const first = seed(dbPath, uploadsDir, today);
      fs.writeFileSync(path.join(uploadsDir, 'keep-me.txt'), 'not ours');
      const second = seed(dbPath, uploadsDir, today);
      expect(second.requests.map((r) => [r.clientName, r.status])).toEqual(first.requests.map((r) => [r.clientName, r.status]));
      expect(second.artists).toBe(3);
      expect(second.requests).toHaveLength(10);

      const statuses = new Set(second.requests.map((r) => r.status));
      expect([...statuses].sort()).toEqual(['accepted', 'declined', 'in_review', 'new', 'quoted']);

      const files = fs.readdirSync(uploadsDir);
      // old images were removed, unrelated files were kept
      expect(files.filter((f) => f.endsWith('.png'))).toHaveLength(second.images);
      expect(files).toContain('keep-me.txt');
      for (const f of files.filter((f) => f.endsWith('.png'))) {
        expect(sniffImageType(fs.readFileSync(path.join(uploadsDir, f)))).toBe('image/png');
      }

      const db = openDatabase(dbPath);
      try {
        expect(queryOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM attachments')!.n).toBe(second.images);
        expect(queryOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM quotes')!.n).toBe(4);
        const latest = queryOne<{ t: string }>(db, 'SELECT MAX(created_at) AS t FROM messages')!.t;
        expect(latest <= today.toISOString()).toBe(true);
        const emails = queryAll<{ e: string }>(db, 'SELECT client_email AS e FROM quote_requests').map((r) => r.e);
        expect(emails.every((e) => e.endsWith('@example.com'))).toBe(true);
      } finally {
        db.close();
      }
    } finally {
      tmp.cleanup();
    }
  });
});
