import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'conflict', message, details);
export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message: string) => new HttpError(401, 'unauthorized', message);
export const invalidUpload = (message: string, details?: unknown) =>
  new HttpError(400, 'invalid_upload', message, details);

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const MULTER_MESSAGES: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: 'Image is too large',
  LIMIT_FILE_COUNT: 'Too many images',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field (use "images")',
  LIMIT_FIELD_VALUE: 'A form field is too long',
  LIMIT_PART_COUNT: 'Too many form parts',
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof z.ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
    return res.status(400).json(body);
  }
  if (err instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, details: err.details } };
    return res.status(err.status).json(body);
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const body: ApiErrorBody = {
      error: {
        code: 'invalid_upload',
        message: MULTER_MESSAGES[err.code] ?? err.message,
        details: err.field ? { field: err.field } : undefined,
      },
    };
    return res.status(status).json(body);
  }
  // body-parser / busboy errors (malformed JSON or multipart, payload too large) carry a status.
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) console.error(err);
  const body: ApiErrorBody = {
    error: {
      code: status >= 500 ? 'internal_error' : 'bad_request',
      message: status >= 500 ? 'Internal error' : String(err.message),
    },
  };
  return res.status(status).json(body);
};
export const forbidden = (message: string) => new HttpError(403, 'forbidden', message);
export const validationError = (details: { path: string; message: string }[]) =>
  new HttpError(400, 'validation_error', 'Request validation failed', details);
