export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Append-only list. Never edit a migration that has shipped; add a new one.
 * Money is always stored as INTEGER cents with an ISO currency code next to it.
 * Timestamps are ISO-8601 UTC text (`2026-11-17T20:00:00.000Z`).
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE artists (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        bio TEXT NOT NULL DEFAULT '',
        specialties TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE quote_requests (
        id INTEGER PRIMARY KEY,
        public_token TEXT NOT NULL UNIQUE,
        client_name TEXT NOT NULL,
        client_email TEXT NOT NULL,
        description TEXT NOT NULL,
        placement TEXT NOT NULL,
        width_cm INTEGER NOT NULL CHECK (width_cm > 0),
        height_cm INTEGER NOT NULL CHECK (height_cm > 0),
        style TEXT NOT NULL,
        color_mode TEXT NOT NULL CHECK (color_mode IN ('color', 'black_grey')),
        availability_notes TEXT NOT NULL DEFAULT '',
        budget_min_cents INTEGER CHECK (budget_min_cents IS NULL OR budget_min_cents >= 0),
        budget_max_cents INTEGER CHECK (budget_max_cents IS NULL OR budget_max_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'MXN',
        status TEXT NOT NULL DEFAULT 'new'
          CHECK (status IN ('new', 'in_review', 'quoted', 'accepted', 'declined')),
        preferred_artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
        assigned_artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_requests_status ON quote_requests(status, created_at);
      CREATE INDEX idx_requests_assigned ON quote_requests(assigned_artist_id);

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
        author_type TEXT NOT NULL CHECK (author_type IN ('client', 'artist')),
        artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK ((author_type = 'artist') = (artist_id IS NOT NULL))
      );
      CREATE INDEX idx_messages_request ON messages(request_id, created_at);

      -- One quote per request in v1 (UNIQUE request_id).
      CREATE TABLE quotes (
        id INTEGER PRIMARY KEY,
        request_id INTEGER NOT NULL UNIQUE REFERENCES quote_requests(id) ON DELETE CASCADE,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        artist_id INTEGER NOT NULL REFERENCES artists(id),
        price_type TEXT NOT NULL CHECK (price_type IN ('fixed', 'range')),
        amount_min_cents INTEGER NOT NULL CHECK (amount_min_cents > 0),
        amount_max_cents INTEGER NOT NULL CHECK (amount_max_cents >= amount_min_cents),
        currency TEXT NOT NULL DEFAULT 'MXN',
        estimated_sessions INTEGER NOT NULL CHECK (estimated_sessions > 0),
        estimated_hours INTEGER NOT NULL CHECK (estimated_hours > 0),
        created_at TEXT NOT NULL
      );

      -- Reference images. message_id IS NULL means the image came with the original request.
      CREATE TABLE attachments (
        id INTEGER PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('client', 'artist')),
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_attachments_request ON attachments(request_id);

      -- Audit trail of every status change.
      CREATE TABLE status_events (
        id INTEGER PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_status_events_request ON status_events(request_id, id);
    `,
  },
];
