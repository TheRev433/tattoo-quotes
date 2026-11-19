import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tq-home-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header"><h1>Tattoo Quotes</h1></div>
    <div class="cards two">
      <section class="card" aria-labelledby="client-heading">
        <h2 id="client-heading">Want a tattoo?</h2>
        <p>Describe your idea, add reference images and get a price and time estimate from one of our artists.</p>
        <a class="btn primary" routerLink="/request">Request a quote</a>
      </section>
      <section class="card" aria-labelledby="artist-heading">
        <h2 id="artist-heading">Studio artists</h2>
        <p>Review incoming requests, ask questions, share references and send quotes.</p>
        <a class="btn" routerLink="/artist">Open the artist inbox</a>
      </section>
    </div>
    <p class="muted">Already sent a request? Open the private link you got after submitting it.</p>
  `,
})
export class HomePage {}
