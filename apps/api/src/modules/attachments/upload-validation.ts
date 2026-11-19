import path from 'node:path';
import type { UploadLimits } from '../../config.js';
import { invalidUpload } from '../../http/errors.js';
import { IMAGE_EXTENSIONS, sniffImageType, type ImageType } from '../../lib/image-sniff.js';

/** The part of a multer file we rely on (memory storage). */
export interface IncomingFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedImage {
  originalName: string;
  mimeType: ImageType;
  extension: string;
  sizeBytes: number;
  bytes: Buffer;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Keeps only the file name part, strips control characters and caps the length. */
export function cleanFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const base = path.basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'image').slice(0, 120);
}

/**
 * Checks count, size and real content type of uploaded images.
 * Multer already enforces the limits while streaming; this repeats them so the
 * service is safe to call directly (seed, tests) and adds the content sniffing.
 */
export function validateImages(
  files: readonly IncomingFile[],
  limits: UploadLimits,
  options: { min?: number } = {},
): ValidatedImage[] {
  const min = options.min ?? 0;
  if (files.length < min) {
    throw invalidUpload(min === 1 ? 'Add at least one reference image' : `Add at least ${min} images`);
  }
  if (files.length > limits.maxFiles) {
    throw invalidUpload(`Too many images (max ${limits.maxFiles})`);
  }
  return files.map((file) => {
    const originalName = cleanFileName(file.originalname);
    if (file.size === 0 || file.buffer.length === 0) {
      throw invalidUpload(`"${originalName}" is empty`);
    }
    if (file.size > limits.maxFileBytes || file.buffer.length > limits.maxFileBytes) {
      throw invalidUpload(`"${originalName}" is larger than ${formatBytes(limits.maxFileBytes)}`);
    }
    const mimeType = sniffImageType(file.buffer);
    if (!mimeType) {
      throw invalidUpload(`"${originalName}" is not a supported image (JPEG, PNG, WebP or GIF)`);
    }
    return { originalName, mimeType, extension: IMAGE_EXTENSIONS[mimeType], sizeBytes: file.buffer.length, bytes: file.buffer };
  });
}
