import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryOne } from '../src/db/database.js';
import { HttpError } from '../src/http/errors.js';
import { incoming, png, serviceHarness, validRequestInput } from './helpers.js';

let h: ReturnType<typeof serviceHarness>;
let clockMs: number;

beforeEach(() => {
  clockMs = Date.UTC(2026, 10, 17, 18, 0, 0);
  h = serviceHarness({ clock: () => new Date(clockMs) });
});
afterEach(() => h.close());

const tick = (minutes = 1) => {
  clockMs += minutes * 60_000;
};

function createRequest(overrides: Partial<typeof validRequestInput> = {}, files = [png()]) {
  return h.services.requests.create({ ...validRequestInput, ...overrides }, files.map(incoming));
}

function expectHttpError(fn: () => unknown, status: number, message?: RegExp) {
  try {
    fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(status);
    if (message) expect((error as HttpError).message).toMatch(message);
  }
}

describe('RequestsService.create', () => {
  it('stores the request, its images and a "new" status event', () => {
    const view = createRequest({}, [png('a.png'), png('b.png', 'dots')]);
    expect(view).toMatchObject({
      status: 'new',
      clientEmail: 'client@example.com',
      currency: 'MXN',
      budgetMinCents: 150000,
      createdAt: '2026-11-17T18:00:00.000Z',
      assignedArtist: null,
      messages: [],
      quote: null,
      canMessage: true,
    });
    expect(view.publicToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(view.images.map((i) => i.originalName)).toEqual(['a.png', 'b.png']);
    expect(view.images[0]!.url).toMatch(/^\/api\/uploads\/img_.+\.png$/);
    expect(h.storedFiles()).toHaveLength(2);

    const detail = h.services.requests.getForArtist(1);
    expect(detail.statusHistory).toMatchObject([{ fromStatus: null, toStatus: 'new' }]);
    expect(detail.allowedTransitions).toEqual(['in_review', 'declined']);
  });

  it('rejects a request without images and writes nothing', () => {
    expectHttpError(() => createRequest({}, []), 400, /at least one reference image/);
    expect(h.storedFiles()).toEqual([]);
    expect(queryOne<{ n: number }>(h.db, 'SELECT COUNT(*) AS n FROM quote_requests')!.n).toBe(0);
  });

  it('rejects an unknown preferred artist before touching the disk', () => {
    expectHttpError(() => createRequest({ preferredArtistId: 999 } as never), 400, /Preferred artist/);
    expect(h.storedFiles()).toEqual([]);
  });

  it('removes already-written files when the database insert fails', () => {
    h.db.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    expect(() => createRequest({}, [png('a.png'), png('b.png')])).toThrow(/boom/);
    expect(h.storedFiles()).toEqual([]);
    expect(queryOne<{ n: number }>(h.db, 'SELECT COUNT(*) AS n FROM quote_requests')!.n).toBe(0);
  });

  it('gives every request a different private token', () => {
    const tokens = new Set([createRequest().publicToken, createRequest().publicToken, createRequest().publicToken]);
    expect(tokens.size).toBe(3);
  });
});

describe('status changes', () => {
  it('assigns the request to the first artist who acts and logs every change', () => {
    const [one, two] = h.artists;
    createRequest();
    tick();
    const reviewed = h.services.requests.changeStatus(1, one, 'in_review', 'Looking at it');
    expect(reviewed.status).toBe('in_review');
    expect(reviewed.assignedArtist).toEqual({ id: one.id, name: one.name });
    expect(reviewed.statusHistory.at(-1)).toMatchObject({
      fromStatus: 'new',
      toStatus: 'in_review',
      artistName: 'Artist One',
      note: 'Looking at it',
      createdAt: '2026-11-17T18:01:00.000Z',
    });
    expectHttpError(() => h.services.requests.changeStatus(1, two, 'declined'), 403, /assigned to Artist One/);
  });

  it('refuses invalid and quote-only transitions', () => {
    const [one] = h.artists;
    createRequest();
    expectHttpError(() => h.services.requests.changeStatus(1, one, 'accepted'), 409, /from "New" to "Accepted"/);
    h.services.requests.changeStatus(1, one, 'in_review');
    expectHttpError(() => h.services.requests.changeStatus(1, one, 'quoted'), 409, /reply with a price/);
    h.services.requests.changeStatus(1, one, 'declined');
    expectHttpError(() => h.services.requests.changeStatus(1, one, 'in_review'), 409);
    expect(h.services.requests.getForArtist(1).allowedTransitions).toEqual([]);
  });

  it('returns 404 for unknown requests', () => {
    expectHttpError(() => h.services.requests.changeStatus(42, h.artists[0], 'in_review'), 404);
    expectHttpError(() => h.services.requests.getPublic('nope-nope-nope-nope'), 404);
  });
});

describe('MessagesService', () => {
  const quote = { priceType: 'range' as const, amountMinCents: 300000, amountMaxCents: 450000, currency: 'MXN', estimatedSessions: 2, estimatedHours: 6 };

  it('moves a new request to in_review on the first artist reply', () => {
    const [one] = h.artists;
    createRequest();
    tick(30);
    const view = h.services.messages.addArtistReply(1, one, { body: 'Can you send a closer photo?', currency: 'MXN' }, [incoming(png('sketch.png'))]);
    expect(view.status).toBe('in_review');
    expect(view.assignedArtist?.id).toBe(one.id);
    expect(view.messages).toMatchObject([
      { authorType: 'artist', authorName: 'Artist One', body: 'Can you send a closer photo?', quote: null, attachments: [{ originalName: 'sketch.png', uploadedBy: 'artist' }] },
    ]);
    expect(view.images).toHaveLength(1); // the reply image is not mixed into the request's own references
    expect(view.statusHistory.map((e) => e.toStatus)).toEqual(['new', 'in_review']);
  });

  it('a reply with a price creates the quote and marks the request quoted', () => {
    const [one] = h.artists;
    createRequest();
    const view = h.services.messages.addArtistReply(1, one, { body: 'Here is my price', ...quote }, []);
    expect(view.status).toBe('quoted');
    expect(view.statusHistory.map((e) => e.toStatus)).toEqual(['new', 'in_review', 'quoted']);
    expect(view.quote).toMatchObject({ priceType: 'range', amountMinCents: 300000, amountMaxCents: 450000, estimatedSessions: 2, estimatedHours: 6, artist: { name: 'Artist One' } });
    expect(view.messages[0]!.quote?.id).toBe(view.quote!.id);
    expect(view.allowedTransitions).toEqual(['accepted', 'declined']);
    expect(view.canQuote).toBe(false);
  });

  it('allows only one quote per request', () => {
    const [one] = h.artists;
    createRequest();
    h.services.messages.addArtistReply(1, one, { body: 'Price', ...quote }, []);
    expectHttpError(() => h.services.messages.addArtistReply(1, one, { body: 'New price', ...quote }, []), 409, /already has a quote/);
    // plain follow-ups are still fine
    expect(h.services.messages.addArtistReply(1, one, { body: 'Any questions?', currency: 'MXN' }, []).messages).toHaveLength(2);
  });

  it('validates quote fields and leaves no files behind on failure', () => {
    const [one] = h.artists;
    createRequest();
    const before = h.storedFiles().length;
    expectHttpError(
      () => h.services.messages.addArtistReply(1, one, { body: 'Price', priceType: 'range', amountMinCents: 500, currency: 'MXN' }, [incoming(png())]),
      400,
    );
    expect(h.storedFiles()).toHaveLength(before);
    expect(h.services.requests.getForArtist(1).status).toBe('new');
  });

  it('blocks other artists and closed requests', () => {
    const [one, two] = h.artists;
    const { publicToken } = createRequest();
    h.services.messages.addArtistReply(1, one, { body: 'Mine', currency: 'MXN' }, []);
    expectHttpError(() => h.services.messages.addArtistReply(1, two, { body: 'Hi', currency: 'MXN' }, []), 403);
    h.services.requests.changeStatus(1, one, 'declined', 'Not my style');
    expectHttpError(() => h.services.messages.addArtistReply(1, one, { body: 'Hi', currency: 'MXN' }, []), 409, /declined/);
    expectHttpError(() => h.services.messages.addClientMessage(publicToken, { body: 'Hello?' }, []), 409, /declined/);
  });

  it('records client messages with images without changing the status', () => {
    const { publicToken } = createRequest();
    tick(5);
    const view = h.services.messages.addClientMessage(publicToken, { body: 'One more reference' }, [incoming(png('more.png'))]);
    expect(view.status).toBe('new');
    expect(view.updatedAt).toBe('2026-11-17T18:05:00.000Z');
    expect(view.messages).toMatchObject([{ authorType: 'client', authorName: 'Test Client', attachments: [{ uploadedBy: 'client' }] }]);
  });
});

describe('inbox', () => {
  it('filters by status, assignment and search, newest activity first, with counts', () => {
    const [one, two] = h.artists;
    createRequest({ clientName: 'Alpha', description: 'Koi fish on the calf, colorful.' });
    tick();
    createRequest({ clientName: 'Beta' });
    tick();
    createRequest({ clientName: 'Gamma 100%' });
    tick();
    h.services.requests.changeStatus(1, one, 'in_review');
    tick();
    h.services.messages.addArtistReply(2, two, { body: 'Hi', currency: 'MXN' }, []);

    const all = h.services.requests.inbox(one, { assigned: 'all', page: 1, pageSize: 20 });
    expect(all.items.map((i) => i.clientName)).toEqual(['Beta', 'Gamma 100%', 'Alpha']);
    expect(all.counts).toEqual({ all: 3, new: 1, in_review: 2, quoted: 0, accepted: 0, declined: 0 });
    expect(all.items[0]).toMatchObject({ messageCount: 1, imageCount: 1, assignedArtist: { name: 'Artist Two' } });
    expect(all.items[0]!.thumbnailUrl).toMatch(/^\/api\/uploads\//);

    const mine = h.services.requests.inbox(one, { assigned: 'me', page: 1, pageSize: 20 });
    expect(mine.items.map((i) => i.clientName)).toEqual(['Alpha']);
    expect(mine.counts.all).toBe(1);
    const unassigned = h.services.requests.inbox(one, { assigned: 'unassigned', page: 1, pageSize: 20 });
    expect(unassigned.items.map((i) => i.clientName)).toEqual(['Gamma 100%']);
    const reviewing = h.services.requests.inbox(one, { assigned: 'all', status: 'in_review', page: 1, pageSize: 1 });
    expect(reviewing).toMatchObject({ total: 2, pageCount: 2, page: 1 });
    expect(reviewing.items).toHaveLength(1);

    expect(h.services.requests.inbox(one, { assigned: 'all', q: 'koi', page: 1, pageSize: 20 }).items.map((i) => i.clientName)).toEqual(['Alpha']);
    // LIKE wildcards are matched literally
    expect(h.services.requests.inbox(one, { assigned: 'all', q: '100%', page: 1, pageSize: 20 }).total).toBe(1);
    expect(h.services.requests.inbox(one, { assigned: 'all', q: '%', page: 1, pageSize: 20 }).total).toBe(1);
  });
});
