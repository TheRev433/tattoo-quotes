import type { HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { ArtistRef } from './models';

const STORAGE_KEY = 'tattoo-quotes.artist';

function readStored(): ArtistRef | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ArtistRef>) : null;
    return parsed && typeof parsed.id === 'number' && typeof parsed.name === 'string' ? { id: parsed.id, name: parsed.name } : null;
  } catch {
    return null;
  }
}

/**
 * Which artist is using the inbox. v1 has no passwords: the artist picks their
 * name and the API trusts the X-Artist-Id header (see README, "Known limitations").
 */
@Injectable({ providedIn: 'root' })
export class ArtistSession {
  private readonly current = signal<ArtistRef | null>(readStored());
  readonly artist = this.current.asReadonly();

  set(artist: ArtistRef): void {
    this.current.set({ id: artist.id, name: artist.name });
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ id: artist.id, name: artist.name }));
  }

  clear(): void {
    this.current.set(null);
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  }
}

/** Adds the X-Artist-Id header to artist-only API calls. */
export const artistHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const artist = inject(ArtistSession).artist();
  if (artist && req.url.startsWith('/api/inbox')) {
    return next(req.clone({ setHeaders: { 'X-Artist-Id': String(artist.id) } }));
  }
  return next(req);
};

/** Route guard: artist pages need a picked artist. */
export const requireArtist: CanActivateFn = () =>
  inject(ArtistSession).artist() ? true : inject(Router).createUrlTree(['/artist']);
