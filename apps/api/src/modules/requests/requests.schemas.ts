import { z } from 'zod';
import { optionalInt, optionalText, requiredInt } from '../../http/schemas.js';
import { quoteFieldsSchema } from '../quotes/quote.js';
import { COLOR_MODE_KEYS, SIZE_LIMITS_CM, STYLE_KEYS } from './catalog.js';
import { REQUEST_STATUSES } from './request-status.js';

/** Highest budget accepted: 10,000,000.00. */
const MAX_BUDGET_CENTS = 1_000_000_000;
const sizeCm = z.number().int().min(SIZE_LIMITS_CM.min).max(SIZE_LIMITS_CM.max);

/** Fields of the public quote request form (multipart; images travel separately). */
export const createRequestSchema = z
  .object({
    clientName: z.string().trim().min(2).max(80),
    clientEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    description: z.string().trim().min(10).max(2000),
    placement: z.string().trim().min(2).max(80),
    widthCm: requiredInt(sizeCm),
    heightCm: requiredInt(sizeCm),
    style: z.enum(STYLE_KEYS),
    colorMode: z.enum(COLOR_MODE_KEYS),
    availabilityNotes: optionalText(1000),
    budgetMinCents: optionalInt(z.number().int().min(0).max(MAX_BUDGET_CENTS)),
    budgetMaxCents: optionalInt(z.number().int().min(0).max(MAX_BUDGET_CENTS)),
    preferredArtistId: optionalInt(z.number().int().positive()),
  })
  .refine((v) => v.budgetMinCents === undefined || v.budgetMaxCents === undefined || v.budgetMaxCents >= v.budgetMinCents, {
    path: ['budgetMaxCents'],
    message: 'Maximum budget must be at least the minimum',
  });
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(4000),
});

export const artistReplySchema = messageSchema.and(quoteFieldsSchema);
export type ArtistReplyInput = z.infer<typeof artistReplySchema>;

export const changeStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  note: optionalText(500),
});

export const inboxQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  assigned: z.enum(['me', 'unassigned', 'all']).default('all'),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InboxQuery = z.infer<typeof inboxQuerySchema>;
