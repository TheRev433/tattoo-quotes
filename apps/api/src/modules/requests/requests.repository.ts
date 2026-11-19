import { execute, queryAll, queryOne, type Db, type SqlParam } from '../../db/database.js';
import type { ColorMode, TattooStyle } from './catalog.js';
import type { RequestStatus } from './request-status.js';

export interface QuoteRequestRow {
  id: number;
  publicToken: string;
  clientName: string;
  clientEmail: string;
  description: string;
  placement: string;
  widthCm: number;
  heightCm: number;
  style: TattooStyle;
  colorMode: ColorMode;
  availabilityNotes: string;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  currency: string;
  status: RequestStatus;
  preferredArtistId: number | null;
  assignedArtistId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewQuoteRequest {
  publicToken: string;
  clientName: string;
  clientEmail: string;
  description: string;
  placement: string;
  widthCm: number;
  heightCm: number;
  style: TattooStyle;
  colorMode: ColorMode;
  availabilityNotes: string;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  currency: string;
  preferredArtistId: number | null;
  createdAt: string;
}

export interface InboxRow {
  id: number;
  clientName: string;
  description: string;
  placement: string;
  widthCm: number;
  heightCm: number;
  style: TattooStyle;
  colorMode: ColorMode;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  assignedArtistId: number | null;
  assignedArtistName: string | null;
  preferredArtistId: number | null;
  preferredArtistName: string | null;
  imageCount: number;
  messageCount: number;
  lastActivityAt: string;
  thumbnailStoredName: string | null;
}

export interface InboxFilter {
  status?: RequestStatus;
  /** `me` = assigned to artistId, `unassigned` = nobody yet, `all` = everything. */
  assigned: 'me' | 'unassigned' | 'all';
  artistId: number;
  q?: string;
  limit: number;
  offset: number;
}

export interface StatusEventRow {
  id: number;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  artistId: number | null;
  artistName: string | null;
  note: string;
  createdAt: string;
}

const SELECT = `
  SELECT id, public_token AS publicToken, client_name AS clientName, client_email AS clientEmail,
         description, placement, width_cm AS widthCm, height_cm AS heightCm, style,
         color_mode AS colorMode, availability_notes AS availabilityNotes,
         budget_min_cents AS budgetMinCents, budget_max_cents AS budgetMaxCents, currency, status,
         preferred_artist_id AS preferredArtistId, assigned_artist_id AS assignedArtistId,
         created_at AS createdAt, updated_at AS updatedAt
  FROM quote_requests`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class RequestsRepository {
  constructor(private readonly db: Db) {}

  insert(r: NewQuoteRequest): number {
    return execute(
      this.db,
      `INSERT INTO quote_requests (public_token, client_name, client_email, description, placement, width_cm, height_cm,
         style, color_mode, availability_notes, budget_min_cents, budget_max_cents, currency, preferred_artist_id,
         status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
      r.publicToken,
      r.clientName,
      r.clientEmail,
      r.description,
      r.placement,
      r.widthCm,
      r.heightCm,
      r.style,
      r.colorMode,
      r.availabilityNotes,
      r.budgetMinCents,
      r.budgetMaxCents,
      r.currency,
      r.preferredArtistId,
      r.createdAt,
      r.createdAt,
    ).lastId;
  }

  findById(id: number): QuoteRequestRow | undefined {
    return queryOne<QuoteRequestRow>(this.db, `${SELECT} WHERE id = ?`, id);
  }

  findByToken(token: string): QuoteRequestRow | undefined {
    return queryOne<QuoteRequestRow>(this.db, `${SELECT} WHERE public_token = ?`, token);
  }

  setStatus(id: number, status: RequestStatus, at: string): void {
    execute(this.db, 'UPDATE quote_requests SET status = ?, updated_at = ? WHERE id = ?', status, at, id);
  }

  assign(id: number, artistId: number, at: string): void {
    execute(this.db, 'UPDATE quote_requests SET assigned_artist_id = ?, updated_at = ? WHERE id = ?', artistId, at, id);
  }

  touch(id: number, at: string): void {
    execute(this.db, 'UPDATE quote_requests SET updated_at = ? WHERE id = ?', at, id);
  }

  addStatusEvent(e: {
    requestId: number;
    fromStatus: RequestStatus | null;
    toStatus: RequestStatus;
    artistId: number | null;
    note: string;
    createdAt: string;
  }): void {
    execute(
      this.db,
      'INSERT INTO status_events (request_id, from_status, to_status, artist_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      e.requestId,
      e.fromStatus,
      e.toStatus,
      e.artistId,
      e.note,
      e.createdAt,
    );
  }

  statusEvents(requestId: number): StatusEventRow[] {
    return queryAll<StatusEventRow>(
      this.db,
      `SELECT e.id, e.from_status AS fromStatus, e.to_status AS toStatus, e.artist_id AS artistId,
              a.name AS artistName, e.note, e.created_at AS createdAt
       FROM status_events e LEFT JOIN artists a ON a.id = e.artist_id
       WHERE e.request_id = ? ORDER BY e.id`,
      requestId,
    );
  }

  private inboxWhere(f: Omit<InboxFilter, 'status' | 'limit' | 'offset'>): { sql: string; params: SqlParam[] } {
    const clauses: string[] = [];
    const params: SqlParam[] = [];
    if (f.assigned === 'me') {
      clauses.push('r.assigned_artist_id = ?');
      params.push(f.artistId);
    } else if (f.assigned === 'unassigned') {
      clauses.push('r.assigned_artist_id IS NULL');
    }
    if (f.q) {
      const like = `%${escapeLike(f.q)}%`;
      clauses.push(
        "(r.client_name LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\' OR r.placement LIKE ? ESCAPE '\\' OR r.client_email LIKE ? ESCAPE '\\')",
      );
      params.push(like, like, like, like);
    }
    return { sql: clauses.length ? clauses.join(' AND ') : '1 = 1', params };
  }

  inbox(f: InboxFilter): { rows: InboxRow[]; total: number } {
    const base = this.inboxWhere(f);
    const where = f.status ? `${base.sql} AND r.status = ?` : base.sql;
    const params = f.status ? [...base.params, f.status] : base.params;
    const total = queryOne<{ n: number }>(this.db, `SELECT COUNT(*) AS n FROM quote_requests r WHERE ${where}`, ...params)!.n;
    const rows = queryAll<InboxRow>(
      this.db,
      `SELECT r.id, r.client_name AS clientName, r.description, r.placement, r.width_cm AS widthCm,
              r.height_cm AS heightCm, r.style, r.color_mode AS colorMode, r.status,
              r.created_at AS createdAt, r.updated_at AS updatedAt,
              r.assigned_artist_id AS assignedArtistId, aa.name AS assignedArtistName,
              r.preferred_artist_id AS preferredArtistId, pa.name AS preferredArtistName,
              (SELECT COUNT(*) FROM attachments x WHERE x.request_id = r.id) AS imageCount,
              (SELECT COUNT(*) FROM messages m WHERE m.request_id = r.id) AS messageCount,
              COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.request_id = r.id), r.created_at) AS lastActivityAt,
              (SELECT x.stored_name FROM attachments x WHERE x.request_id = r.id AND x.message_id IS NULL
                 ORDER BY x.id LIMIT 1) AS thumbnailStoredName
       FROM quote_requests r
       LEFT JOIN artists aa ON aa.id = r.assigned_artist_id
       LEFT JOIN artists pa ON pa.id = r.preferred_artist_id
       WHERE ${where}
       ORDER BY lastActivityAt DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      ...params,
      f.limit,
      f.offset,
    );
    return { rows, total };
  }

  /** Request counts per status for the same assignment/search filter (ignores the status filter). */
  statusCounts(f: Omit<InboxFilter, 'status' | 'limit' | 'offset'>): Record<string, number> {
    const { sql, params } = this.inboxWhere(f);
    const rows = queryAll<{ status: string; n: number }>(
      this.db,
      `SELECT r.status, COUNT(*) AS n FROM quote_requests r WHERE ${sql} GROUP BY r.status`,
      ...params,
    );
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
}
