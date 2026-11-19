import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { ArtistSession } from '../../core/artist-session';
import { styleLabel } from '../../core/labels';
import type { Artist } from '../../core/models';

@Component({
  selector: 'tq-pick-artist-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header"><h1>Who is working?</h1></div>
    <p class="muted">Pick your name to open the inbox. (v1 has no passwords; this is for a trusted studio computer.)</p>
    @if (error()) {
      <p class="alert error" role="alert">{{ error() }}</p>
    }
    @if (artists().length === 0 && !error()) {
      <p class="empty">No artists yet. Run <code>npm run seed</code> to create the sample studio.</p>
    }
    <ul class="artist-list">
      @for (a of artists(); track a.id) {
        <li class="card">
          <h2>{{ a.name }}</h2>
          <p>{{ a.bio }}</p>
          @if (a.specialties.length) {
            <p class="muted">{{ specialties(a) }}</p>
          }
          <button type="button" class="btn primary" (click)="pick(a)">Continue as {{ a.name }}</button>
        </li>
      }
    </ul>
  `,
})
export class PickArtistPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(ArtistSession);
  private readonly router = inject(Router);
  protected readonly artists = signal<Artist[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.artists().subscribe({ next: (a) => this.artists.set(a), error: (e) => this.error.set(errorMessage(e)) });
  }

  protected specialties(a: Artist): string {
    return a.specialties.map((s) => styleLabel(s)).join(' · ');
  }

  protected pick(artist: Artist): void {
    this.session.set(artist);
    void this.router.navigateByUrl('/artist/inbox');
  }
}
