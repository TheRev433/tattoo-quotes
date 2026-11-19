import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { STATUS_HINTS } from '../../core/labels';
import type { Meta, PublicRequest } from '../../core/models';
import { ImageGallery } from '../../shared/image-gallery';
import { checkImages, ImagePicker } from '../../shared/image-picker';
import { QuoteCard } from '../../shared/quote-card';
import { RequestFacts } from '../../shared/request-facts';
import { StatusBadge } from '../../shared/status-badge';
import { Thread } from '../../shared/thread';

/** The client's private page, reached through /r/:token. */
@Component({
  selector: 'tq-client-request-page',
  imports: [StatusBadge, RequestFacts, ImageGallery, QuoteCard, Thread, ImagePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError()) {
      <p class="alert error" role="alert">{{ loadError() }}</p>
    }
    @if (request(); as r) {
      <div class="page-header">
        <h1>Your tattoo request</h1>
        <tq-status-badge [status]="r.status" />
      </div>

      @if (created()) {
        <div class="alert success" role="status">
          <p><strong>Request sent!</strong> Save this private link to check replies and your quote:</p>
          <p><code data-testid="private-link">{{ link() }}</code></p>
        </div>
      }

      <p class="status-hint">{{ hint() }}</p>

      @if (r.quote; as quote) {
        <section class="card" aria-labelledby="quote-heading">
          <h2 id="quote-heading">Your quote</h2>
          <tq-quote-card [quote]="quote" />
        </section>
      }

      <section class="card" aria-labelledby="details-heading">
        <h2 id="details-heading">What you asked for</h2>
        <p class="description">{{ r.description }}</p>
        <tq-request-facts [request]="r" [styles]="meta()?.styles ?? []" />
        <h3>Your reference images</h3>
        <tq-image-gallery [images]="r.images" label="Your reference images" />
      </section>

      <section class="card" aria-labelledby="thread-heading">
        <h2 id="thread-heading">Conversation</h2>
        <tq-thread [messages]="r.messages" viewer="client" />

        @if (r.canMessage) {
          <form class="composer" (submit)="send($event)">
            <label for="client-message">Write a message</label>
            <textarea id="client-message" name="body" rows="3" maxlength="4000" required></textarea>
            <tq-image-picker
              [(files)]="images"
              inputId="client-images"
              label="Attach images"
              [maxFiles]="meta()?.uploads?.maxFiles ?? 6"
              [maxFileBytes]="meta()?.uploads?.maxFileBytes ?? 5242880"
            />
            @if (sendError()) {
              <p class="alert error" role="alert">{{ sendError() }}</p>
            }
            <div class="actions">
              <button type="submit" class="btn primary" [disabled]="busy()">Send message</button>
            </div>
          </form>
        } @else {
          <p class="muted">This conversation is closed.</p>
        }
      </section>
    }
  `,
})
export class ClientRequestPage {
  private readonly api = inject(ApiService);
  readonly token = input.required<string>();
  /** `?created=1` right after submitting. */
  readonly createdParam = input<string | undefined>(undefined, { alias: 'created' });

  protected readonly request = signal<PublicRequest | null>(null);
  protected readonly meta = signal<Meta | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly sendError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly images = signal<File[]>([]);
  protected readonly created = computed(() => this.createdParam() === '1');
  protected readonly hint = computed(() => {
    const r = this.request();
    return r ? STATUS_HINTS[r.status] : '';
  });
  protected readonly link = computed(() => `${globalThis.location?.origin ?? ''}/r/${this.token()}`);

  constructor() {
    this.api.meta().subscribe({ next: (m) => this.meta.set(m), error: () => this.meta.set(null) });
    effect(() => {
      const token = this.token();
      this.api.publicRequest(token).subscribe({
        next: (r) => {
          this.loadError.set(null);
          this.request.set(r);
        },
        error: (e) => this.loadError.set(errorMessage(e)),
      });
    });
  }

  protected send(event: Event): void {
    event.preventDefault();
    const formEl = event.target as HTMLFormElement;
    if (!formEl.reportValidity()) return;
    const limits = this.meta()?.uploads ?? { maxFiles: 6, maxFileBytes: 5 * 1024 * 1024 };
    const problems = checkImages(this.images(), limits);
    if (problems.length) {
      this.sendError.set(problems.join(' '));
      return;
    }
    const form = new FormData();
    form.append('body', String(new FormData(formEl).get('body') ?? '').trim());
    for (const f of this.images()) form.append('images', f, f.name);
    this.busy.set(true);
    this.api.sendClientMessage(this.token(), form).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.sendError.set(null);
        this.request.set(r);
        this.images.set([]);
        formEl.reset();
      },
      error: (e) => {
        this.busy.set(false);
        this.sendError.set(errorMessage(e));
      },
    });
  }
}
