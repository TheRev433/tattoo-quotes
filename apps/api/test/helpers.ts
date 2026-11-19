import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import type { UploadLimits } from '../src/config.js';
import { openDatabase, type Db } from '../src/db/database.js';
import { samplePng } from '../src/lib/png.js';
import type { IncomingFile } from '../src/modules/attachments/upload-validation.js';
import { createServices, type ServiceOptions } from '../src/services.js';

export const TEST_LIMITS: UploadLimits = { maxFileBytes: 64 * 1024, maxFiles: 3 };

export interface TestFile {
  name: string;
  bytes: Uint8Array;
  type?: string;
}

export interface TestResponse<T> {
  status: number;
  body: T;
  headers: Headers;
}

export interface TestServer {
  db: Db;
  uploadsDir: string;
  base: string;
  request<T = unknown>(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse<T>>;
  /** Sends multipart/form-data with string fields and files under `images`. */
  upload<T = unknown>(
    url: string,
    fields: Record<string, string | number | undefined>,
    files: TestFile[],
    headers?: Record<string, string>,
  ): Promise<TestResponse<T>>;
  close(): Promise<void>;
}

/** A temporary folder that is removed by the returned cleanup function. */
export function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tattoo-quotes-${prefix}-`));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export function png(name = 'ref.png', pattern: Parameters<typeof samplePng>[0] = 'stripes'): TestFile {
  return { name, bytes: samplePng(pattern, 16), type: 'image/png' };
}

export function incoming(file: TestFile): IncomingFile {
  const buffer = Buffer.from(file.bytes);
  return { originalname: file.name, size: buffer.length, buffer };
}

/** A database + services pair for service-level tests. */
export function serviceHarness(options: ServiceOptions = {}) {
  const tmp = tempDir('svc');
  const db = openDatabase(path.join(tmp.dir, 'test.sqlite'));
  const uploadsDir = path.join(tmp.dir, 'uploads');
  const services = createServices(db, { uploadsDir, uploadLimits: TEST_LIMITS, ...options });
  const artists = [
    services.artists.create({ name: 'Artist One' }),
    services.artists.create({ name: 'Artist Two' }),
  ] as const;
  return {
    db,
    services,
    uploadsDir,
    artists,
    storedFiles: () => (fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []),
    close() {
      db.close();
      tmp.cleanup();
    },
  };
}

/** Starts the real Express app on a random port against a throwaway SQLite file and uploads folder. */
export async function startTestServer(limits: UploadLimits = TEST_LIMITS): Promise<TestServer> {
  const tmp = tempDir('api');
  const db = openDatabase(path.join(tmp.dir, 'test.sqlite'));
  const uploadsDir = path.join(tmp.dir, 'uploads');
  const server = createApp(db, { uploadsDir, uploadLimits: limits }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function parse<T>(res: Response): Promise<TestResponse<T>> {
    const text = await res.text();
    const isJson = res.headers.get('content-type')?.includes('application/json');
    return { status: res.status, body: (isJson && text ? JSON.parse(text) : text) as T, headers: res.headers };
  }

  return {
    db,
    uploadsDir,
    base,
    async request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
      const res = await fetch(base + url, {
        method,
        headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return parse<T>(res);
    },
    async upload<T>(url: string, fields: Record<string, string | number | undefined>, files: TestFile[], headers = {}) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.append(key, String(value));
      for (const f of files) form.append('images', new Blob([new Uint8Array(f.bytes)], { type: f.type ?? 'application/octet-stream' }), f.name);
      return parse<T>(await fetch(base + url, { method: 'POST', body: form, headers }));
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      tmp.cleanup();
    },
  };
}

export const validRequestFields = {
  clientName: 'Test Client',
  clientEmail: 'Client@Example.com',
  description: 'A small fine line moon on the inner forearm.',
  placement: 'Forearm (inner)',
  widthCm: 5,
  heightCm: 7,
  style: 'fine_line',
  colorMode: 'black_grey',
  availabilityNotes: 'Weekends',
  budgetMinCents: 150000,
  budgetMaxCents: 250000,
};

/** Same fields with numbers, for direct service calls. */
export const validRequestInput = {
  ...validRequestFields,
  clientEmail: 'client@example.com',
  style: 'fine_line' as const,
  colorMode: 'black_grey' as const,
  preferredArtistId: undefined,
};
