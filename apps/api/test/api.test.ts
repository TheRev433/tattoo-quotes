import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { samplePng } from '../src/lib/png.js';
import { png, startTestServer, validRequestFields, type TestServer } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- response bodies are asserted structurally */
let t: TestServer;
let one: number;
let two: number;
const as = (id: number) => ({ 'x-artist-id': String(id) });

beforeEach(async () => {
  t = await startTestServer();
  t.db.exec(`INSERT INTO artists (name, slug) VALUES ('Artist One', 'artist-one'), ('Artist Two', 'artist-two')`);
  [one, two] = [1, 2];
});
afterEach(async () => {
  await t.close();
});

async function submit(fields: Record<string, string | number | undefined> = {}, files = [png()]) {
  return t.upload<any>('/api/requests', { ...validRequestFields, ...fields }, files);
}

describe('health, meta and errors', () => {
  it('reports health and form options', async () => {
    expect((await t.request('GET', '/api/health')).body).toEqual({ status: 'ok' });
    const meta = await t.request<any>('GET', '/api/meta');
    expect(meta.body.currency).toBe('MXN');
    expect(meta.body.styles).toContainEqual({ value: 'fine_line', label: 'Fine line' });
    expect(meta.body.uploads).toEqual({ maxFileBytes: 64 * 1024, maxFiles: 3, acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] });
  });

  it('lists active artists publicly', async () => {
    const res = await t.request<any>('GET', '/api/artists');
    expect(res.body.map((a: any) => a.name)).toEqual(['Artist One', 'Artist Two']);
  });

  it('returns JSON errors for unknown routes and malformed JSON', async () => {
    expect(await t.request('GET', '/api/nope')).toMatchObject({ status: 404, body: { error: { code: 'not_found' } } });
    const res = await fetch(`${t.base}/api/inbox/requests/1/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...as(one) },
      body: '{bad',
    });
    expect(res.status).toBe(400);
  });
});

describe('client: submit a quote request', () => {
  it('creates a request from multipart fields and images, then shows it via the private link', async () => {
    const res = await submit({ preferredArtistId: two }, [png('front.png'), png('side.png', 'rose')]);
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toBe(`/api/requests/${res.body.publicToken}`);
    expect(res.body).toMatchObject({
      status: 'new',
      clientEmail: 'client@example.com',
      widthCm: 5,
      budgetMaxCents: 250000,
      preferredArtist: { id: two, name: 'Artist Two' },
      canMessage: true,
    });
    expect(res.body.images).toHaveLength(2);

    const view = await t.request<any>('GET', `/api/requests/${res.body.publicToken}`);
    expect(view.status).toBe(200);
    expect(view.body).not.toHaveProperty('statusHistory');
    expect(view.body).not.toHaveProperty('id');

    const image = await fetch(t.base + view.body.images[1].url);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await image.arrayBuffer()).equals(samplePng('rose', 16))).toBe(true);
  });

  it('treats empty optional fields as not provided', async () => {
    const res = await submit({ budgetMinCents: '', budgetMaxCents: '', availabilityNotes: undefined, preferredArtistId: '' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ budgetMinCents: null, budgetMaxCents: null, availabilityNotes: '', preferredArtist: null });
  });

  it('validates fields with per-field details', async () => {
    const res = await submit({ clientEmail: 'nope', widthCm: '0', style: 'cubism', budgetMinCents: 5000, budgetMaxCents: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.map((d: any) => d.path).sort()).toEqual(['clientEmail', 'style', 'widthCm']);
    const range = await submit({ budgetMinCents: 5000, budgetMaxCents: 100 });
    expect(range.body.error.details).toEqual([{ path: 'budgetMaxCents', message: 'Maximum budget must be at least the minimum' }]);
    expect((await submit({ preferredArtistId: 99 })).status).toBe(400);
  });

  it('rejects requests without images, with fake images, too many or too large files', async () => {
    const none = await submit({}, []);
    expect(none).toMatchObject({ status: 400, body: { error: { code: 'invalid_upload', message: 'Add at least one reference image' } } });

    const fake = await submit({}, [{ name: 'evil.png', bytes: new TextEncoder().encode('<script>alert(1)</script>'), type: 'image/png' }]);
    expect(fake).toMatchObject({ status: 400, body: { error: { code: 'invalid_upload' } } });
    expect(fake.body.error.message).toContain('not a supported image');

    const tooMany = await submit({}, [png('1.png'), png('2.png'), png('3.png'), png('4.png')]);
    expect(tooMany).toMatchObject({ status: 400, body: { error: { code: 'invalid_upload', message: 'Too many images' } } });

    const huge = new Uint8Array(65 * 1024);
    huge.set(samplePng('dots', 4));
    const tooBig = await submit({}, [{ name: 'huge.png', bytes: huge, type: 'image/png' }]);
    expect(tooBig).toMatchObject({ status: 413, body: { error: { code: 'invalid_upload', message: 'Image is too large' } } });

    const wrongField = new FormData();
    wrongField.append('photo', new Blob([new Uint8Array(samplePng('dots', 4))]), 'x.png');
    const res = await fetch(`${t.base}/api/requests`, { method: 'POST', body: wrongField });
    expect(res.status).toBe(400);

    expect((await t.request<any>('GET', '/api/inbox/requests', undefined, as(one))).body.total).toBe(0);
    expect(fs.existsSync(t.uploadsDir) ? fs.readdirSync(t.uploadsDir) : []).toEqual([]);
  });

  it('404s unknown tokens and 400s malformed ones', async () => {
    expect((await t.request('GET', '/api/requests/aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
    expect((await t.request('GET', '/api/requests/bad!')).status).toBe(400);
    expect((await t.request('GET', '/api/uploads/img_aaaaaaaaaaaaaaaaaaaaaaaa.png')).status).toBe(404);
    expect((await t.request('GET', '/api/uploads/..%2F..%2Fpackage.json')).status).toBe(404);
  });

  it('lets the client add messages with images', async () => {
    const { body } = await submit();
    const res = await t.upload<any>(`/api/requests/${body.publicToken}/messages`, { body: 'Another angle' }, [png('angle.png')]);
    expect(res.status).toBe(201);
    expect(res.body.messages).toMatchObject([{ authorType: 'client', body: 'Another angle', attachments: [{ originalName: 'angle.png' }] }]);
    const json = await t.request<any>('POST', `/api/requests/${body.publicToken}/messages`, { body: 'Plain JSON works too' });
    expect(json.status).toBe(201);
    expect((await t.request<any>('POST', `/api/requests/${body.publicToken}/messages`, { body: '  ' })).status).toBe(400);
  });
});

describe('artist inbox', () => {
  it('requires a known artist', async () => {
    expect((await t.request<any>('GET', '/api/inbox/requests')).body.error.code).toBe('unauthorized');
    expect((await t.request('GET', '/api/inbox/requests', undefined, { 'x-artist-id': '99' })).status).toBe(401);
    expect((await t.request('GET', '/api/inbox/requests', undefined, { 'x-artist-id': 'abc' })).status).toBe(401);
    expect((await t.request<any>('GET', '/api/inbox/me', undefined, as(two))).body.name).toBe('Artist Two');
  });

  it('lists requests with status filter, counts and validation of the query', async () => {
    await submit({ clientName: 'First Client' });
    await submit({ clientName: 'Second Client' });
    await t.request('POST', '/api/inbox/requests/1/status', { status: 'declined', note: 'No' }, as(one));

    const all = await t.request<any>('GET', '/api/inbox/requests', undefined, as(one));
    expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 20, counts: { all: 2, new: 1, declined: 1 } });
    const declined = await t.request<any>('GET', '/api/inbox/requests?status=declined', undefined, as(one));
    expect(declined.body.items.map((i: any) => i.clientName)).toEqual(['First Client']);
    expect((await t.request('GET', '/api/inbox/requests?status=archived', undefined, as(one))).status).toBe(400);
    expect((await t.request('GET', '/api/inbox/requests?pageSize=500', undefined, as(one))).status).toBe(400);
  });

  it('walks a request through review, quote and acceptance', async () => {
    const { body: created } = await submit();
    const id = 1;

    const reviewing = await t.request<any>('POST', `/api/inbox/requests/${id}/status`, { status: 'in_review' }, as(one));
    expect(reviewing.status).toBe(200);
    expect(reviewing.body).toMatchObject({ status: 'in_review', assignedArtist: { id: one }, allowedTransitions: ['declined'], canQuote: true });

    const direct = await t.request<any>('POST', `/api/inbox/requests/${id}/status`, { status: 'quoted' }, as(one));
    expect(direct.status).toBe(409);

    const reply = await t.upload<any>(
      `/api/inbox/requests/${id}/replies`,
      { body: 'Here is the price, plus a placement idea.', priceType: 'range', amountMinCents: 300000, amountMaxCents: 420000, estimatedSessions: 2, estimatedHours: 6 },
      [png('placement.png', 'wave')],
      as(one),
    );
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({
      status: 'quoted',
      quote: { priceType: 'range', amountMinCents: 300000, amountMaxCents: 420000, currency: 'MXN', estimatedSessions: 2, estimatedHours: 6 },
      allowedTransitions: ['accepted', 'declined'],
    });
    expect(reply.body.messages[0].attachments[0]).toMatchObject({ originalName: 'placement.png', uploadedBy: 'artist' });

    const clientView = await t.request<any>('GET', `/api/requests/${created.publicToken}`);
    expect(clientView.body).toMatchObject({ status: 'quoted', quote: { amountMinCents: 300000 }, assignedArtist: { name: 'Artist One' } });

    const other = await t.request<any>('POST', `/api/inbox/requests/${id}/status`, { status: 'accepted' }, as(two));
    expect(other.status).toBe(403);
    const accepted = await t.request<any>('POST', `/api/inbox/requests/${id}/status`, { status: 'accepted', note: 'Confirmed in studio' }, as(one));
    expect(accepted.body.status).toBe('accepted');
    expect(accepted.body.statusHistory.map((e: any) => e.toStatus)).toEqual(['new', 'in_review', 'quoted', 'accepted']);
    expect((await t.request('POST', `/api/inbox/requests/${id}/status`, { status: 'declined' }, as(one))).status).toBe(409);
  });

  it('accepts a fixed price as JSON and rejects bad quote fields', async () => {
    await submit();
    const bad = await t.request<any>('POST', '/api/inbox/requests/1/replies', { body: 'Price', priceType: 'fixed' }, as(one));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: any) => d.path)).toEqual(['amountMinCents', 'estimatedSessions', 'estimatedHours']);
    const float = await t.request<any>('POST', '/api/inbox/requests/1/replies', { body: 'Price', priceType: 'fixed', amountMinCents: 10.5, estimatedSessions: 1, estimatedHours: 1 }, as(one));
    expect(float.status).toBe(400);

    const ok = await t.request<any>(
      'POST',
      '/api/inbox/requests/1/replies',
      { body: 'Fixed price', priceType: 'fixed', amountMinCents: 250000, estimatedSessions: 1, estimatedHours: 3 },
      as(one),
    );
    expect(ok.status).toBe(201);
    expect(ok.body.quote).toMatchObject({ priceType: 'fixed', amountMinCents: 250000, amountMaxCents: 250000 });
    const again = await t.request<any>(
      'POST',
      '/api/inbox/requests/1/replies',
      { body: 'Cheaper', priceType: 'fixed', amountMinCents: 200000, estimatedSessions: 1, estimatedHours: 3 },
      as(one),
    );
    expect(again).toMatchObject({ status: 409, body: { error: { message: 'This request already has a quote' } } });
  });

  it('returns 404 for unknown request ids and 400 for bad ids', async () => {
    expect((await t.request('GET', '/api/inbox/requests/9', undefined, as(one))).status).toBe(404);
    expect((await t.request('GET', '/api/inbox/requests/abc', undefined, as(one))).status).toBe(400);
    expect((await t.request('POST', '/api/inbox/requests/9/status', { status: 'declined' }, as(one))).status).toBe(404);
  });
});
