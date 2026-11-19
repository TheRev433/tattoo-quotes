import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { artistHeaderInterceptor, ArtistSession } from '../../core/artist-session';
import type { InboxPage as InboxResult } from '../../core/models';
import { InboxPage } from './inbox.page';

const page: InboxResult = {
  items: [
    {
      id: 7,
      clientName: 'Daniel Demo',
      summary: 'Geometric mandala on the shoulder',
      placement: 'Shoulder',
      widthCm: 14,
      heightCm: 14,
      style: 'geometric',
      colorMode: 'black_grey',
      status: 'in_review',
      createdAt: '2026-11-14T18:00:00.000Z',
      lastActivityAt: '2026-11-16T02:00:00.000Z',
      assignedArtist: { id: 1, name: 'Mara Quintero' },
      preferredArtist: null,
      imageCount: 2,
      messageCount: 1,
      thumbnailUrl: '/api/uploads/img_abc.png',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  pageCount: 1,
  counts: { all: 10, new: 3, in_review: 2, quoted: 2, accepted: 1, declined: 2 },
};

describe('InboxPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [InboxPage],
      providers: [provideHttpClient(withInterceptors([artistHeaderInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(ArtistSession).set({ id: 1, name: 'Mara Quintero' });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  async function render() {
    const fixture = TestBed.createComponent(InboxPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('loads the inbox as the picked artist and shows counts per status', async () => {
    const fixture = await render();
    const req = http.expectOne((r) => r.url === '/api/inbox/requests');
    expect(req.request.headers.get('X-Artist-Id')).toBe('1');
    expect(req.request.params.get('assigned')).toBe('all');
    expect(req.request.params.has('status')).toBe(false);
    req.flush(page);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('.tab')).map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(tabs).toEqual(['All 10', 'New 3', 'In review 2', 'Quoted 2', 'Accepted 1', 'Declined 2']);
    const item = el.querySelector('.inbox-item')!;
    expect(item.querySelector('a')!.getAttribute('href')).toBe('/artist/requests/7');
    expect(item.textContent).toContain('Geometric · Black & grey · Shoulder · 14×14 cm · 2 images · 1 message');
    expect(item.querySelector('.badge')!.textContent!.trim()).toBe('In review');
  });

  it('refetches with the status filter when a tab is clicked', async () => {
    const fixture = await render();
    http.expectOne((r) => r.url === '/api/inbox/requests').flush(page);
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.tab[data-status="quoted"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === '/api/inbox/requests' && r.params.get('status') === 'quoted');
    req.flush({ ...page, items: [], total: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No requests match these filters.');
  });
});
