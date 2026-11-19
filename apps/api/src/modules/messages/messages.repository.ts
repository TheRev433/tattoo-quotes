import { execute, queryAll, type Db } from '../../db/database.js';

export type AuthorType = 'client' | 'artist';

export interface MessageRow {
  id: number;
  requestId: number;
  authorType: AuthorType;
  artistId: number | null;
  artistName: string | null;
  body: string;
  createdAt: string;
}

export class MessagesRepository {
  constructor(private readonly db: Db) {}

  insert(m: { requestId: number; authorType: AuthorType; artistId: number | null; body: string; createdAt: string }): number {
    return execute(
      this.db,
      'INSERT INTO messages (request_id, author_type, artist_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      m.requestId,
      m.authorType,
      m.artistId,
      m.body,
      m.createdAt,
    ).lastId;
  }

  listForRequest(requestId: number): MessageRow[] {
    return queryAll<MessageRow>(
      this.db,
      `SELECT m.id, m.request_id AS requestId, m.author_type AS authorType, m.artist_id AS artistId,
              a.name AS artistName, m.body, m.created_at AS createdAt
       FROM messages m LEFT JOIN artists a ON a.id = m.artist_id
       WHERE m.request_id = ? ORDER BY m.created_at, m.id`,
      requestId,
    );
  }
}
