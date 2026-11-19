/**
 * Resets the database and the uploads folder, then fills them with synthetic
 * artists, quote requests, conversations, quotes and generated sample images.
 * Everything goes through the real services, so validation and status rules apply.
 *
 *   npm run seed            # uses DB_PATH / UPLOADS_DIR or ./data and ./uploads
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { openDatabase } from './db/database.js';
import type { Clock } from './lib/clock.js';
import { samplePng, type SamplePattern } from './lib/png.js';
import type { Artist } from './modules/artists/artists.repository.js';
import type { IncomingFile } from './modules/attachments/upload-validation.js';
import type { RequestStatus } from './modules/requests/request-status.js';
import { SEED_ARTISTS, SEED_REQUESTS, type SeedArtistName } from './seed-data.js';
import { createServices } from './services.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function sampleFiles(patterns: readonly SamplePattern[], prefix: string): IncomingFile[] {
  return patterns.map((pattern, i) => {
    const buffer = samplePng(pattern, 96);
    return { originalname: `${prefix}-${i + 1}-${pattern}.png`, size: buffer.length, buffer };
  });
}

export interface SeedResult {
  artists: number;
  requests: { id: number; clientName: string; status: RequestStatus; link: string }[];
  images: number;
}

export function seed(dbPath: string, uploadsDir: string, today = new Date()): SeedResult {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  // Only remove files that look like ours, so a misconfigured UPLOADS_DIR cannot wipe unrelated data.
  if (fs.existsSync(uploadsDir)) {
    for (const name of fs.readdirSync(uploadsDir)) {
      if (/^[A-Za-z0-9_-]{20,64}\.(jpg|png|webp|gif)$/.test(name)) fs.rmSync(path.join(uploadsDir, name), { force: true });
    }
  }

  let now = today.getTime();
  const clock: Clock = () => new Date(now);
  const db = openDatabase(dbPath);
  try {
    const s = createServices(db, { uploadsDir, clock });
    const artists = new Map<SeedArtistName, Artist>(
      SEED_ARTISTS.map((a) => [a.name, s.artists.create({ name: a.name, bio: a.bio, specialties: [...a.specialties] })]),
    );
    const artist = (name: SeedArtistName) => artists.get(name)!;

    let images = 0;
    const requests: SeedResult['requests'] = [];
    // Oldest first so ids follow submission order.
    const ordered = [...SEED_REQUESTS].sort((a, b) => b.daysAgo - a.daysAgo);
    ordered.forEach((spec, index) => {
      const submittedAt = today.getTime() - spec.daysAgo * DAY;
      now = submittedAt;
      const { preferredArtist, ...input } = spec.input;
      const created = s.requests.create(
        { ...input, preferredArtistId: preferredArtist ? artist(preferredArtist).id : undefined },
        sampleFiles(spec.images, `request-${index + 1}`),
      );
      images += spec.images.length;
      const token = created.publicToken;
      const id = s.requests.findByToken(token).id;

      for (const step of spec.steps) {
        now = submittedAt + step.hours * HOUR;
        if (now > today.getTime()) throw new Error(`Seed step for ${input.clientName} is in the future`);
        if (step.kind === 'client') {
          s.messages.addClientMessage(token, { body: step.body }, sampleFiles(step.images ?? [], 'client'));
          images += step.images?.length ?? 0;
        } else if (step.kind === 'status') {
          s.requests.changeStatus(id, artist(step.artist), step.to, step.note ?? '');
        } else {
          const quote = step.quote ? { currency: 'MXN', estimatedSessions: 1, estimatedHours: 1, ...step.quote } : { currency: 'MXN' };
          s.messages.addArtistReply(id, artist(step.artist), { body: step.body, ...quote }, sampleFiles(step.images ?? [], 'artist'));
          images += step.images?.length ?? 0;
        }
      }

      const final = s.requests.findByToken(token);
      if (final.status !== spec.expect) {
        throw new Error(`Seed request for ${input.clientName} ended as ${final.status}, expected ${spec.expect}`);
      }
      requests.push({ id: final.id, clientName: final.clientName, status: final.status, link: `/r/${token}` });
    });
    return { artists: artists.size, requests, images };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = seed(config.dbPath, config.uploadsDir);
  console.log(`Seeded ${config.dbPath}`);
  console.log(`  ${result.artists} artists, ${result.requests.length} quote requests, ${result.images} sample images in ${config.uploadsDir}`);
  console.log('  Client links (open on the web app, e.g. http://localhost:4400<link>):');
  for (const r of result.requests) console.log(`    #${r.id} ${r.status.padEnd(9)} ${r.clientName.padEnd(20)} ${r.link}`);
}
