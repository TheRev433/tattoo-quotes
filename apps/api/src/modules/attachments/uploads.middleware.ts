import type { RequestHandler } from 'express';
import multer from 'multer';
import type { UploadLimits } from '../../config.js';

/** Field name used for image files in every multipart form. */
export const IMAGES_FIELD = 'images';

/**
 * Parses multipart bodies into memory (files are small and validated before
 * anything touches the disk). Non-multipart requests pass through untouched,
 * so the same routes also accept JSON when there are no files.
 */
export function imagesUpload(limits: UploadLimits): RequestHandler {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: limits.maxFileBytes,
      files: limits.maxFiles,
      fields: 30,
      fieldSize: 16 * 1024,
      parts: limits.maxFiles + 30,
    },
  }).array(IMAGES_FIELD, limits.maxFiles);
}

/** Files parsed by `imagesUpload` (empty for JSON requests). */
export function uploadedFiles(req: { files?: unknown }): Express.Multer.File[] {
  return Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
}
