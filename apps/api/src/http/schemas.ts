import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const tokenParam = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Invalid link') });
export const centsSchema = z.number().int().safe();
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Expected a 3-letter ISO currency code');

/**
 * Multipart forms send every field as a string. Empty strings mean "not provided".
 * These helpers turn them into optional numbers before validation.
 */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
export const optionalInt = (schema: z.ZodNumber) => z.preprocess(emptyToUndefined, z.coerce.number().pipe(schema).optional());
export const requiredInt = (schema: z.ZodNumber) => z.preprocess(emptyToUndefined, z.coerce.number().pipe(schema));
export const optionalText = (max: number) =>
  z.preprocess((v) => (v === undefined || v === null ? '' : v), z.string().trim().max(max));
