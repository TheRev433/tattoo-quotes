import { describe, expect, it } from 'vitest';
import { parseQuoteFields, quoteFieldsSchema } from '../src/modules/quotes/quote.js';

const parse = (raw: Record<string, unknown>) => parseQuoteFields(quoteFieldsSchema.parse(raw));

describe('quote fields', () => {
  it('treats a reply without price fields as a plain message', () => {
    expect(parse({})).toEqual({ ok: true, terms: null });
    expect(parse({ priceType: '', amountMinCents: '', estimatedHours: '' })).toEqual({ ok: true, terms: null });
  });

  it('parses a fixed price from multipart strings and defaults to MXN', () => {
    expect(parse({ priceType: 'fixed', amountMinCents: '850000', estimatedSessions: '2', estimatedHours: '7' })).toEqual({
      ok: true,
      terms: { priceType: 'fixed', amountMinCents: 850000, amountMaxCents: 850000, currency: 'MXN', estimatedSessions: 2, estimatedHours: 7 },
    });
  });

  it('parses a range and keeps an explicit currency', () => {
    const result = parse({ priceType: 'range', amountMinCents: 100, amountMaxCents: 200, currency: 'usd', estimatedSessions: 1, estimatedHours: 1 });
    expect(result).toMatchObject({ ok: true, terms: { amountMinCents: 100, amountMaxCents: 200, currency: 'USD' } });
  });

  it('rejects price fields without a price type', () => {
    expect(parse({ amountMinCents: 100 })).toEqual({
      ok: false,
      issues: [{ path: 'priceType', message: 'Choose "fixed" or "range" to send a price' }],
    });
  });

  it('requires every quote field and sane ranges', () => {
    const missing = parse({ priceType: 'range' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.issues.map((i) => i.path)).toEqual(['amountMinCents', 'amountMaxCents', 'estimatedSessions', 'estimatedHours']);
    }
    const inverted = parse({ priceType: 'range', amountMinCents: 500, amountMaxCents: 500, estimatedSessions: 1, estimatedHours: 2 });
    expect(inverted).toMatchObject({ ok: false, issues: [{ path: 'amountMaxCents', message: 'Maximum must be greater than minimum' }] });
    const fixedTwoAmounts = parse({ priceType: 'fixed', amountMinCents: 500, amountMaxCents: 600, estimatedSessions: 1, estimatedHours: 2 });
    expect(fixedTwoAmounts).toMatchObject({ ok: false, issues: [{ path: 'amountMaxCents' }] });
    const tooFewHours = parse({ priceType: 'fixed', amountMinCents: 500, estimatedSessions: 3, estimatedHours: 2 });
    expect(tooFewHours).toMatchObject({ ok: false, issues: [{ path: 'estimatedHours', message: 'Each session needs at least one hour' }] });
  });

  it('rejects non-integer cents, zero and absurd values at the schema level', () => {
    expect(() => quoteFieldsSchema.parse({ priceType: 'fixed', amountMinCents: '12.5' })).toThrow();
    expect(() => quoteFieldsSchema.parse({ priceType: 'fixed', amountMinCents: '0' })).toThrow();
    expect(() => quoteFieldsSchema.parse({ priceType: 'fixed', amountMinCents: '1000000001' })).toThrow();
    expect(() => quoteFieldsSchema.parse({ priceType: 'hourly' })).toThrow();
    expect(() => quoteFieldsSchema.parse({ estimatedSessions: '51' })).toThrow();
    expect(() => quoteFieldsSchema.parse({ currency: 'pesos' })).toThrow();
  });
});
