import { z } from 'zod';
import { currencySchema, optionalInt } from '../../http/schemas.js';
import { DEFAULT_CURRENCY } from '../requests/catalog.js';

export const PRICE_TYPES = ['fixed', 'range'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

/** Upper bound for any single amount: 10,000,000.00 in the quote currency. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

const amount = z.number().int().positive().max(MAX_AMOUNT_CENTS);

/**
 * Quote fields as they arrive with an artist reply (multipart strings or JSON numbers).
 * All optional: a reply without `priceType` is a plain message.
 */
export const quoteFieldsSchema = z.object({
  priceType: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PRICE_TYPES).optional()),
  amountMinCents: optionalInt(amount),
  amountMaxCents: optionalInt(amount),
  currency: z.preprocess((v) => (v === '' || v === undefined ? DEFAULT_CURRENCY : v), currencySchema),
  estimatedSessions: optionalInt(z.number().int().min(1).max(50)),
  estimatedHours: optionalInt(z.number().int().min(1).max(200)),
});
export type QuoteFields = z.infer<typeof quoteFieldsSchema>;

export interface QuoteTerms {
  priceType: PriceType;
  amountMinCents: number;
  amountMaxCents: number;
  currency: string;
  estimatedSessions: number;
  estimatedHours: number;
}

export type QuoteParseResult = { ok: true; terms: QuoteTerms | null } | { ok: false; issues: { path: string; message: string }[] };

/**
 * Turns optional reply fields into quote terms.
 * - no priceType and no price fields  -> null (plain message)
 * - fixed: amountMinCents is the price (amountMaxCents must be absent or equal)
 * - range: both bounds required, max > min
 * - estimatedSessions and estimatedHours are required for any quote; hours >= sessions
 */
export function parseQuoteFields(fields: QuoteFields): QuoteParseResult {
  const priceFieldsGiven =
    fields.amountMinCents !== undefined ||
    fields.amountMaxCents !== undefined ||
    fields.estimatedSessions !== undefined ||
    fields.estimatedHours !== undefined;
  if (!fields.priceType) {
    return priceFieldsGiven
      ? { ok: false, issues: [{ path: 'priceType', message: 'Choose "fixed" or "range" to send a price' }] }
      : { ok: true, terms: null };
  }
  const issues: { path: string; message: string }[] = [];
  const min = fields.amountMinCents;
  let max = fields.amountMaxCents;
  if (min === undefined) issues.push({ path: 'amountMinCents', message: 'Price is required' });
  if (fields.priceType === 'fixed') {
    if (max !== undefined && min !== undefined && max !== min) {
      issues.push({ path: 'amountMaxCents', message: 'A fixed price has a single amount' });
    }
    max = min;
  } else if (max === undefined) {
    issues.push({ path: 'amountMaxCents', message: 'Maximum is required for a price range' });
  } else if (min !== undefined && max <= min) {
    issues.push({ path: 'amountMaxCents', message: 'Maximum must be greater than minimum' });
  }
  if (fields.estimatedSessions === undefined) issues.push({ path: 'estimatedSessions', message: 'Estimated sessions are required' });
  if (fields.estimatedHours === undefined) issues.push({ path: 'estimatedHours', message: 'Estimated hours are required' });
  if (
    fields.estimatedSessions !== undefined &&
    fields.estimatedHours !== undefined &&
    fields.estimatedHours < fields.estimatedSessions
  ) {
    issues.push({ path: 'estimatedHours', message: 'Each session needs at least one hour' });
  }
  if (issues.length || min === undefined || max === undefined) return { ok: false, issues };
  return {
    ok: true,
    terms: {
      priceType: fields.priceType,
      amountMinCents: min,
      amountMaxCents: max,
      currency: fields.currency,
      estimatedSessions: fields.estimatedSessions!,
      estimatedHours: fields.estimatedHours!,
    },
  };
}
