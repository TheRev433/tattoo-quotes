import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http/errors.js';
import { sniffImageType } from '../src/lib/image-sniff.js';
import { encodePng, samplePng } from '../src/lib/png.js';
import { FileStore } from '../src/modules/attachments/file-store.js';
import { cleanFileName, formatBytes, validateImages } from '../src/modules/attachments/upload-validation.js';
import { incoming, png, tempDir, TEST_LIMITS } from './helpers.js';

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe('sniffImageType', () => {
  it('detects the four supported formats from magic bytes', () => {
    expect(sniffImageType(samplePng('dots', 8))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(sniffImageType(bytes('GIF89a', 1, 0))).toBe('image/gif');
    expect(sniffImageType(bytes('GIF87a'))).toBe('image/gif');
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
  });

  it('rejects other content, including look-alikes and truncated headers', () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(bytes('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WAVEfmt '))).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('encodePng', () => {
  it('produces a valid PNG header with the requested size', () => {
    const buf = encodePng(3, 2, () => [255, 0, 0]);
    expect(sniffImageType(buf)).toBe('image/png');
    expect(buf.readUInt32BE(16)).toBe(3);
    expect(buf.readUInt32BE(20)).toBe(2);
    expect(buf.subarray(-8, -4).toString('ascii')).toBe('IEND');
  });
});

describe('validateImages', () => {
  const expectUploadError = (fn: () => unknown, message: RegExp) => {
    try {
      fn();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe('invalid_upload');
      expect((error as HttpError).message).toMatch(message);
    }
  };

  it('returns sniffed metadata and ignores the client-supplied name extension', () => {
    const [image] = validateImages([incoming({ ...png(), name: 'photo.jpg' })], TEST_LIMITS);
    expect(image).toMatchObject({ originalName: 'photo.jpg', mimeType: 'image/png', extension: '.png' });
    expect(image!.sizeBytes).toBeGreaterThan(0);
  });

  it('enforces a minimum and maximum count', () => {
    expectUploadError(() => validateImages([], TEST_LIMITS, { min: 1 }), /at least one reference image/);
    expect(validateImages([], TEST_LIMITS)).toEqual([]);
    const four = Array.from({ length: 4 }, (_, i) => incoming(png(`r${i}.png`)));
    expectUploadError(() => validateImages(four, TEST_LIMITS), /Too many images \(max 3\)/);
  });

  it('rejects empty, oversized and non-image files', () => {
    expectUploadError(() => validateImages([{ originalname: 'a.png', size: 0, buffer: Buffer.alloc(0) }], TEST_LIMITS), /is empty/);
    const big = Buffer.concat([samplePng('dots', 8), Buffer.alloc(TEST_LIMITS.maxFileBytes)]);
    expectUploadError(() => validateImages([{ originalname: 'big.png', size: big.length, buffer: big }], TEST_LIMITS), /larger than 64 KB/);
    const text = Buffer.from('definitely not an image');
    expectUploadError(
      () => validateImages([{ originalname: 'notes.png', size: text.length, buffer: text }], TEST_LIMITS),
      /"notes.png" is not a supported image/,
    );
  });
});

describe('cleanFileName / formatBytes', () => {
  it('strips paths and control characters', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('C:\\Users\\me\\tattoo.png')).toBe('tattoo.png');
    expect(cleanFileName('a\u0000b\nc.png')).toBe('abc.png');
    expect(cleanFileName('   ')).toBe('image');
    expect(cleanFileName('x'.repeat(300))).toHaveLength(120);
  });

  it('formats byte counts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(64 * 1024)).toBe('64 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('FileStore', () => {
  it('saves under random names and only resolves names it could have produced', () => {
    const tmp = tempDir('store');
    try {
      const store = new FileStore(path.join(tmp.dir, 'nested', 'uploads'));
      const name = store.save(Buffer.from('abc'), '.png');
      expect(name).toMatch(/^img_[A-Za-z0-9_-]{24}\.png$/);
      expect(fs.readFileSync(store.resolve(name)!, 'utf8')).toBe('abc');
      expect(store.exists(name)).toBe(true);
      expect(store.save(Buffer.from('abc'), '.png')).not.toBe(name);
      expect(store.resolve('../secret.png')).toBeNull();
      expect(store.resolve('img_short.png')).toBeNull();
      expect(store.resolve(`${name}.exe`)).toBeNull();
      store.remove(name);
      expect(store.exists(name)).toBe(false);
    } finally {
      tmp.cleanup();
    }
  });
});
