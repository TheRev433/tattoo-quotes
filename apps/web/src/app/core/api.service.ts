import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Artist, ArtistRequest, InboxPage, InboxQuery, Meta, PublicRequest, RequestStatus } from './models';

function params(values: Record<string, string | number | undefined>): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') p = p.set(key, String(value));
  }
  return p;
}

/** Thin typed client for the Tattoo Quotes REST API (proxied at /api). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  meta(): Observable<Meta> {
    return this.http.get<Meta>(`${this.base}/meta`);
  }
  artists(): Observable<Artist[]> {
    return this.http.get<Artist[]>(`${this.base}/artists`);
  }

  // Client side (private link)
  createRequest(form: FormData): Observable<PublicRequest> {
    return this.http.post<PublicRequest>(`${this.base}/requests`, form);
  }
  publicRequest(token: string): Observable<PublicRequest> {
    return this.http.get<PublicRequest>(`${this.base}/requests/${encodeURIComponent(token)}`);
  }
  sendClientMessage(token: string, form: FormData): Observable<PublicRequest> {
    return this.http.post<PublicRequest>(`${this.base}/requests/${encodeURIComponent(token)}/messages`, form);
  }

  // Artist side (X-Artist-Id added by artistHeaderInterceptor)
  inbox(query: InboxQuery): Observable<InboxPage> {
    return this.http.get<InboxPage>(`${this.base}/inbox/requests`, { params: params({ ...query }) });
  }
  inboxRequest(id: number): Observable<ArtistRequest> {
    return this.http.get<ArtistRequest>(`${this.base}/inbox/requests/${id}`);
  }
  changeStatus(id: number, status: RequestStatus, note = ''): Observable<ArtistRequest> {
    return this.http.post<ArtistRequest>(`${this.base}/inbox/requests/${id}/status`, { status, note });
  }
  reply(id: number, form: FormData): Observable<ArtistRequest> {
    return this.http.post<ArtistRequest>(`${this.base}/inbox/requests/${id}/replies`, form);
  }
}

/** Human-readable message from an API error response. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: { message?: string; details?: unknown } } | null;
    const details = body?.error?.details;
    if (Array.isArray(details) && details.length && typeof details[0] === 'object' && details[0] && 'path' in details[0]) {
      return (details as { path: string; message: string }[]).map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join('; ');
    }
    if (body?.error?.message) return body.error.message;
    if (error.status === 0) return 'Cannot reach the API. Is it running (npm run dev)?';
    return `Request failed (${error.status})`;
  }
  return 'Unexpected error';
}
