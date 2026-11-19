import { execute, queryOne, type Db } from '../../db/database.js';
import type { PriceType } from './quote.js';

export interface QuoteRow {
  id: number;
  requestId: number;
  messageId: number;
  artistId: number;
  artistName: string;
  priceType: PriceType;
  amountMinCents: number;
  amountMaxCents: number;
  currency: string;
  estimatedSessions: number;
  estimatedHours: number;
  createdAt: string;
}

export class QuotesRepository {
  constructor(private readonly db: Db) {}

  insert(q: Omit<QuoteRow, 'id' | 'artistName'>): number {
    return execute(
      this.db,
      `INSERT INTO quotes (request_id, message_id, artist_id, price_type, amount_min_cents, amount_max_cents, currency,
         estimated_sessions, estimated_hours, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      q.requestId,
      q.messageId,
      q.artistId,
      q.priceType,
      q.amountMinCents,
      q.amountMaxCents,
      q.currency,
      q.estimatedSessions,
      q.estimatedHours,
      q.createdAt,
    ).lastId;
  }

  findForRequest(requestId: number): QuoteRow | undefined {
    return queryOne<QuoteRow>(
      this.db,
      `SELECT q.id, q.request_id AS requestId, q.message_id AS messageId, q.artist_id AS artistId, a.name AS artistName,
              q.price_type AS priceType, q.amount_min_cents AS amountMinCents, q.amount_max_cents AS amountMaxCents,
              q.currency, q.estimated_sessions AS estimatedSessions, q.estimated_hours AS estimatedHours,
              q.created_at AS createdAt
       FROM quotes q JOIN artists a ON a.id = q.artist_id
       WHERE q.request_id = ?`,
      requestId,
    );
  }
}
