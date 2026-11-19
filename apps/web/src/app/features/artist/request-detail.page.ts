import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { STATUS_LABELS } from '../../core/labels';
import type { ArtistRequest, Meta, PriceType, RequestStatus } from '../../core/models';
import { parseMoneyToCents } from '../../core/money';
import { ImageGallery } from '../../shared/image-gallery';
import { checkImages, ImagePicker } from '../../shared/image-picker';
import { QuoteCard } from '../../shared/quote-card';
import { RequestFacts } from '../../shared/request-facts';
import { StatusBadge } from '../../shared/status-badge';
import { Thread } from '../../shared/thread';

/**
 * Builds the multipart reply. With `includeQuote`, the amounts typed in pesos become integer cents.
 * Returns an error message instead when the quote fields are incomplete.
 */
export function buildReplyForm(data: FormData, images: readonly File[], includeQuote: boolean): { form: FormData } | { error: string } {
  const body = String(data.get('body') ?? '').trim();
  if (!body) return { error: 'Write a message.' };
  const form = new FormData();
  form.append('body', body);
  if (includeQuote) {
    const priceType = String(data.get('priceType') ?? 'fixed') as PriceType;
    const min = parseMoneyToCents(String(data.get('amountMin') ?? ''));
    const max = priceType === 'range' ? parseMoneyToCents(String(data.get('amountMax') ?? '')) : min;
    if (min === null || Number.isNaN(min) || min <= 0) return { error: 'Enter a price like 2500 or 2500.50.' };
    if (max === null || Number.isNaN(max)) return { error: 'Enter the maximum of the range.' };
    if (priceType === 'range' && max <= min) return { error: 'The maximum must be greater than the minimum.' };
    form.append('priceType', priceType);
    form.append('amountMinCents', String(min));
    if (priceType === 'range') form.append('amountMaxCents', String(max));
    form.append('estimatedSessions', String(data.get('estimatedSessions') ?? ''));
    form.append('estimatedHours', String(data.get('estimatedHours') ?? ''));
  }
  for (const f of images) form.append('images', f, f.name);
  return { form };
}

@Component({
  selector: 'tq-request-detail-page',
  imports: [RouterLink, DatePipe, StatusBadge, RequestFacts, ImageGallery, QuoteCard, Thread, ImagePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p><a routerLink="/artist/inbox">← Back to inbox</a></p>
    @if (loadError()) {
      <p class="alert error" role="alert">{{ loadError() }}</p>
    }
    @if (request(); as r) {
      <div class="page-header">
        <div>
          <h1>{{ r.clientName }}</h1>
          <p class="muted">
            Request #{{ r.id }} · {{ r.clientEmail }} · {{ r.assignedArtist ? 'Assigned to ' + r.assignedArtist.name : 'Unassigned' }}
          </p>
        </div>
        <tq-status-badge [status]="r.status" />
      </div>

      @if (actionError()) {
        <p class="alert error" role="alert">{{ actionError() }}</p>
      }

      @if (r.allowedTransitions.length) {
        <section class="card status-actions" aria-labelledby="status-heading">
          <h2 id="status-heading">Status</h2>
          <div class="field">
            <label for="status-note">Note (optional, internal)</label>
            <input id="status-note" #note maxlength="500" placeholder="e.g. Client confirmed by phone" />
          </div>
          <div class="actions">
            @for (to of r.allowedTransitions; track to) {
              <button type="button" class="btn" [class.danger]="to === 'declined'" [attr.data-to]="to" [disabled]="busy()" (click)="move(to, note.value); note.value = ''">
                {{ actionLabel(to) }}
              </button>
            }
          </div>
          @if (r.canQuote) {
            <p class="muted small">To mark it as quoted, send a reply with a price below.</p>
          }
        </section>
      }

      @if (r.quote; as quote) {
        <section class="card" aria-labelledby="quote-heading">
          <h2 id="quote-heading">Quote sent</h2>
          <tq-quote-card [quote]="quote" />
        </section>
      }

      <section class="card" aria-labelledby="details-heading">
        <h2 id="details-heading">Request</h2>
        <p class="description">{{ r.description }}</p>
        <tq-request-facts [request]="r" [styles]="meta()?.styles ?? []" />
        <h3>Client reference images</h3>
        <tq-image-gallery [images]="r.images" label="Client reference images" />
        <p class="muted small">Client link: <code>{{ r.clientLink }}</code></p>
      </section>

      <section class="card" aria-labelledby="thread-heading">
        <h2 id="thread-heading">Conversation</h2>
        <tq-thread [messages]="r.messages" viewer="artist" />

        @if (r.canMessage) {
          <form class="composer" (submit)="reply($event)">
            <label for="reply-body">Reply to {{ r.clientName }}</label>
            <textarea id="reply-body" name="body" rows="3" maxlength="4000" required></textarea>
            <tq-image-picker
              [(files)]="images"
              inputId="reply-images"
              label="Attach reference images"
              [maxFiles]="meta()?.uploads?.maxFiles ?? 6"
              [maxFileBytes]="meta()?.uploads?.maxFileBytes ?? 5242880"
            />
            @if (r.canQuote) {
              <label class="checkbox"><input type="checkbox" [checked]="includeQuote()" (change)="toggleQuote($event)" /> Include a price</label>
              @if (includeQuote()) {
                <fieldset class="form-grid quote-fields">
                  <legend>Price ({{ r.currency }})</legend>
                  <div class="field span-all radio-row" role="radiogroup" aria-label="Price type">
                    <label class="radio"><input type="radio" name="priceType" value="fixed" [checked]="priceType() === 'fixed'" (change)="priceType.set('fixed')" /> Fixed</label>
                    <label class="radio"><input type="radio" name="priceType" value="range" [checked]="priceType() === 'range'" (change)="priceType.set('range')" /> Range</label>
                  </div>
                  <div class="field">
                    <label for="amountMin">{{ priceType() === 'range' ? 'From' : 'Price' }}</label>
                    <input id="amountMin" name="amountMin" inputmode="decimal" required placeholder="e.g. 2500" />
                  </div>
                  @if (priceType() === 'range') {
                    <div class="field">
                      <label for="amountMax">Up to</label>
                      <input id="amountMax" name="amountMax" inputmode="decimal" required placeholder="e.g. 3500" />
                    </div>
                  }
                  <div class="field">
                    <label for="estimatedSessions">Sessions</label>
                    <input id="estimatedSessions" name="estimatedSessions" type="number" min="1" max="50" step="1" value="1" required />
                  </div>
                  <div class="field">
                    <label for="estimatedHours">Total hours</label>
                    <input id="estimatedHours" name="estimatedHours" type="number" min="1" max="200" step="1" value="2" required />
                  </div>
                </fieldset>
              }
            }
            @if (replyError()) {
              <p class="alert error" role="alert">{{ replyError() }}</p>
            }
            <div class="actions">
              <button type="submit" class="btn primary" [disabled]="busy()">{{ includeQuote() && r.canQuote ? 'Send quote' : 'Send reply' }}</button>
            </div>
          </form>
        } @else {
          <p class="muted">This request is closed for messages.</p>
        }
      </section>

      <section class="card" aria-labelledby="history-heading">
        <h2 id="history-heading">History</h2>
        <ol class="history">
          @for (e of r.statusHistory; track e.id) {
            <li>
              <span class="muted">{{ e.createdAt | date: 'medium' }}</span>
              {{ e.fromStatus ? label(e.fromStatus) + ' → ' : 'Submitted as ' }}{{ label(e.toStatus) }}
              @if (e.artistName) {
                by {{ e.artistName }}
              }
              @if (e.note) {
                <em>— {{ e.note }}</em>
              }
            </li>
          }
        </ol>
      </section>
    }
  `,
})
export class RequestDetailPage {
  private readonly api = inject(ApiService);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly request = signal<ArtistRequest | null>(null);
  protected readonly meta = signal<Meta | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly replyError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly images = signal<File[]>([]);
  protected readonly includeQuote = signal(false);
  protected readonly priceType = signal<PriceType>('fixed');

  constructor() {
    this.api.meta().subscribe({ next: (m) => this.meta.set(m), error: () => this.meta.set(null) });
    effect(() => {
      const id = this.id();
      this.api.inboxRequest(id).subscribe({
        next: (r) => {
          this.loadError.set(null);
          this.request.set(r);
        },
        error: (e) => this.loadError.set(errorMessage(e)),
      });
    });
  }

  protected label(status: RequestStatus): string {
    return STATUS_LABELS[status];
  }

  protected actionLabel(to: RequestStatus): string {
    switch (to) {
      case 'in_review':
        return 'Start review';
      case 'accepted':
        return 'Mark accepted by client';
      case 'declined':
        return 'Decline';
      default:
        return STATUS_LABELS[to];
    }
  }

  protected toggleQuote(event: Event): void {
    this.includeQuote.set((event.target as HTMLInputElement).checked);
  }

  protected move(to: RequestStatus, note: string): void {
    this.busy.set(true);
    this.api.changeStatus(this.id(), to, note.trim()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.actionError.set(null);
        this.request.set(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.actionError.set(errorMessage(e));
      },
    });
  }

  protected reply(event: Event): void {
    event.preventDefault();
    const formEl = event.target as HTMLFormElement;
    if (!formEl.reportValidity()) return;
    const limits = this.meta()?.uploads ?? { maxFiles: 6, maxFileBytes: 5 * 1024 * 1024 };
    const problems = checkImages(this.images(), limits);
    if (problems.length) {
      this.replyError.set(problems.join(' '));
      return;
    }
    const built = buildReplyForm(new FormData(formEl), this.images(), this.includeQuote() && !!this.request()?.canQuote);
    if ('error' in built) {
      this.replyError.set(built.error);
      return;
    }
    this.busy.set(true);
    this.api.reply(this.id(), built.form).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.replyError.set(null);
        this.request.set(r);
        this.images.set([]);
        this.includeQuote.set(false);
        formEl.reset();
      },
      error: (e) => {
        this.busy.set(false);
        this.replyError.set(errorMessage(e));
      },
    });
  }
}
