import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ArtistSession } from './core/artist-session';

@Component({
  selector: 'tq-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="app-header">
      <a class="brand" routerLink="/">Tattoo Quotes</a>
      <nav aria-label="Main">
        <ul class="nav">
          <li><a routerLink="/request" routerLinkActive="active" ariaCurrentWhenActive="page">Request a quote</a></li>
          <li>
            <a [routerLink]="session.artist() ? '/artist/inbox' : '/artist'" routerLinkActive="active" ariaCurrentWhenActive="page"
              >Artist inbox</a
            >
          </li>
        </ul>
      </nav>
      @if (session.artist(); as artist) {
        <div class="whoami">
          <span>Signed in as <strong>{{ artist.name }}</strong></span>
          <button type="button" class="btn small ghost-light" (click)="signOut()">Switch</button>
        </div>
      }
    </header>
    <main id="main" class="container" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly session = inject(ArtistSession);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.session.clear();
    void this.router.navigateByUrl('/artist');
  }
}
