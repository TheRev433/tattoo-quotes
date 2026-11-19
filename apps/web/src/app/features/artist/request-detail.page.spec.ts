import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ArtistRequest } from '../../core/models';
import { buildReplyForm, RequestDetailPage } from './request-detail.page';

function fields(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.append(k, v);
  return data;
}

describe('buildReplyForm', () => {
  it('sends a plain message without quote fields', () => {
    const built = buildReplyForm(fields({ body: ' Hello ', amountMin: '100' }), [], false) as { form: FormData };
    expect(built.form.get('body')).toBe('Hello');
    expect(built.form.has('priceType')).toBe(false);
    expect(built.form.has('amountMinCents')).toBe(false);
  });

  it('converts a fixed price and a range to integer cents', () => {
    const fixed = buildReplyForm(fields({ body: 'Price', priceType: 'fixed', amountMin: '2,500', estimatedSessions: '1', estimatedHours: '3' }), [], true) as {
      form: FormData;
    };
    expect(fixed.form.get('amountMinCents')).toBe('250000');
    expect(fixed.form.has('amountMaxCents')).toBe(false);
    const range = buildReplyForm(
      fields({ body: 'Range', priceType: 'range', amountMin: '3000', amountMax: '4200.50', estimatedSessions: '2', estimatedHours: '6' }),
      [],
      true,
    ) as { form: FormData };
    expect(range.form.get('amountMinCents')).toBe('300000');
    expect(range.form.get('amountMaxCents')).toBe('420050');
    expect(range.form.get('estimatedSessions')).toBe('2');
  });

  it('explains what is wrong with incomplete quotes', () => {
    expect(buildReplyForm(fields({ body: '' }), [], false)).toEqual({ error: 'Write a message.' });
    expect(buildReplyForm(fields({ body: 'x', priceType: 'fixed', amountMin: '' }), [], true)).toEqual({ error: 'Enter a price like 2500 or 2500.50.' });
    expect(buildReplyForm(fields({ body: 'x', priceType: 'range', amountMin: '500', amountMax: '400' }), [], true)).toEqual({
      error: 'The maximum must be greater than the minimum.',
    });
  });
});

const request: ArtistRequest = {
  id: 5,
  publicToken: 'tok_abcdefghijklmnopqrstuv',
  clientLink: '/r/tok_abcdefghijklmnopqrstuv',
  clientName: 'Fernando Inventado',
  clientEmail: 'fernando@example.com',
  description: 'Neo-traditional tiger head with flowers.',
  placement: 'Thigh',
  widthCm: 20,
  heightCm: 22,
  style: 'neo_traditional',
  colorMode: 'color',
  availabilityNotes: '',
  budgetMinCents: 700000,
  budgetMaxCents: 1000000,
  currency: 'MXN',
  status: 'quoted',
  createdAt: '2026-11-11T18:00:00.000Z',
  updatedAt: '2026-11-13T00:00:00.000Z',
  preferredArtist: null,
  assignedArtist: { id: 2, name: 'Diego Salas' },
  images: [],
  messages: [],
  quote: {
    id: 1,
    messageId: 3,
    priceType: 'fixed',
    amountMinCents: 850000,
    amountMaxCents: 850000,
    currency: 'MXN',
    estimatedSessions: 2,
    estimatedHours: 7,
    createdAt: '2026-11-13T00:00:00.000Z',
    artist: { id: 2, name: 'Diego Salas' },
  },
  canMessage: true,
  canQuote: false,
  allowedTransitions: ['accepted', 'declined'],
  statusHistory: [],
};

describe('RequestDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RequestDetailPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows the quote, budget and only the allowed status actions, and posts a transition', async () => {
    const fixture = TestBed.createComponent(RequestDetailPage);
    fixture.componentRef.setInput('id', '5');
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/meta').flush({ styles: [{ value: 'neo_traditional', label: 'Neo-traditional' }], uploads: { maxFiles: 6, maxFileBytes: 5242880 } });
    http.expectOne('/api/inbox/requests/5').flush(request);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="quote"] .quote-price')!.textContent!.trim()).toBe('$8,500.00 MXN');
    expect(el.querySelector('[data-testid="budget"]')!.textContent!.trim()).toBe('$7,000.00 – $10,000.00 MXN');
    expect(el.textContent).toContain('Neo-traditional');
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.status-actions button'));
    expect(buttons.map((b) => b.dataset['to'])).toEqual(['accepted', 'declined']);
    expect(el.textContent).not.toContain('Include a price');

    buttons[0]!.click();
    const req = http.expectOne('/api/inbox/requests/5/status');
    expect(req.request.body).toEqual({ status: 'accepted', note: '' });
    req.flush({ ...request, status: 'accepted', allowedTransitions: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.status-actions')).toBeNull();
    expect(el.querySelector('tq-status-badge')!.textContent!.trim()).toBe('Accepted');
  });
});
