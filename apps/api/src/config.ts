import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Both src/ (tsx) and dist/ (compiled) sit one level below apps/api.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(apiRoot, '../..');

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return value;
}

export interface UploadLimits {
  /** Maximum size of one image in bytes. */
  maxFileBytes: number;
  /** Maximum number of images in one request or message. */
  maxFiles: number;
}

export const config = {
  port: intFromEnv('PORT', 4410),
  host: process.env['HOST'] ?? '127.0.0.1',
  dbPath: path.resolve(process.env['DB_PATH'] ?? path.join(repoRoot, 'data', 'tattoo-quotes.sqlite')),
  uploadsDir: path.resolve(process.env['UPLOADS_DIR'] ?? path.join(repoRoot, 'uploads')),
  uploads: {
    maxFileBytes: intFromEnv('MAX_UPLOAD_BYTES', 5 * 1024 * 1024),
    maxFiles: intFromEnv('MAX_UPLOAD_FILES', 6),
  } satisfies UploadLimits,
  webDist: path.join(repoRoot, 'apps', 'web', 'dist', 'web', 'browser'),
};
