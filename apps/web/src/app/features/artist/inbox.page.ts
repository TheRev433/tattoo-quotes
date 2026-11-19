import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { COLOR_MODE_LABELS, STATUS_LABELS, styleLabel } from '../../core/labels';
import type { AssignedFilter, InboxPage as InboxResult, RequestStatus } from '../../core/models';
import { StatusBadge } from '../../shared/status-badge';

const STATUS_TABS: (RequestStatus | 'all')[] = ['all', 'new', 'in_review', 'quoted', 'accepted', 'declined'];

@Component({
  selector: 'tq-inbox-page',
  imports: [RouterLink, DatePipe, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <h1>Inbox</h1>
      <div class="filters">
        <label for="assigned">Show</label>
        <select id="assigned" [value]="assigned()" (change)="setAssigned($event)">
          <option value="all">All requests</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <label for="search" class="sr-only">Search</label>
        <input id="search" type="search" placeholder="Search name, idea, placement…" [value]="q()" (input)="setQuery($event)" />
      </div>
    </div>

    <div class="tabs" role="tablist" aria-label="Filter by status">
      @for (tab of tabs; track tab) {
        <button
          type="button"
          role="tab"
          class="tab"
          [attr.data-status]="tab"
          [attr.aria-selected]="status() === tab"
          (click)="setStatus(tab)"
        >
          {{ tabLabel(tab) }} <span class="count">{{ result()?.counts?.[tab] ?? 0 }}</span>
        </button>
      }
    </div>

    @if (error()) {
      <p class="alert error" role="alert">{{ error() }}</p>
    }

    @if (result(); as page) {
      @if (page.items.length === 0) {
        <p class="empty card">No requests match these filters.</p>
      } @else {
        <ul class="inbox-list">
          @for (item of page.items; track item.id) {
            <li class="card inbox-item">
              @if (item.thumbnailUrl) {
                <img class="thumb" [src]="item.thumbnailUrl" alt="" width="72" height="72" />
              } @else {
                <span class="thumb placeholder" aria-hidden="true"></span>
              }
              <div class="inbox-main">
                <div class="inbox-title">
                  <a [routerLink]="['/artist/requests', item.id]">{{ item.clientName }}</a>
                  <tq-status-badge [status]="item.status" />
                </div>
                <p class="inbox-summary">{{ item.summary }}</p>
                <p class="muted small">
                  {{ style(item.style) }} · {{ colorMode(item.colorMode) }} · {{ item.placement }} · {{ item.widthCm }}×{{ item.heightCm }} cm ·
                  {{ item.imageCount }} {{ item.imageCount === 1 ? 'image' : 'images' }} · {{ item.messageCount }}
                  {{ item.messageCount === 1 ? 'message' : 'messages' }}
                </p>
              </div>
              <div class="inbox-side small">
                <div>{{ item.lastActivityAt | date: 'MMM d, HH:mm' }}</div>
                <div class="muted">{{ item.assignedArtist ? item.assignedArtist.name : 'Unassigned' }}</div>
                @if (item.preferredArtist && !item.assignedArtist) {
                  <div class="muted">Asked for {{ item.preferredArtist.name }}</div>
                }
              </div>
            </li>
          }
        </ul>
        @if (page.pageCount > 1) {
          <nav class="pager" aria-label="Pages">
            <button type="button" class="btn small" [disabled]="page.page <= 1" (click)="goTo(page.page - 1)">Previous</button>
            <span>Page {{ page.page }} of {{ page.pageCount }}</span>
            <button type="button" class="btn small" [disabled]="page.page >= page.pageCount" (click)="goTo(page.page + 1)">Next</button>
          </nav>
        }
      }
    }
  `,
})
export class InboxPage {
  private readonly api = inject(ApiService);
  protected readonly tabs = STATUS_TABS;
  protected readonly status = signal<RequestStatus | 'all'>('all');
  protected readonly assigned = signal<AssignedFilter>('all');
  protected readonly q = signal('');
  protected readonly page = signal(1);
  protected readonly result = signal<InboxResult | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly query = computed(() => ({
    status: this.status() === 'all' ? undefined : (this.status() as RequestStatus),
    assigned: this.assigned(),
    q: this.q().trim() || undefined,
    page: this.page(),
    pageSize: 20,
  }));

  constructor() {
    effect((onCleanup) => {
      const sub = this.api.inbox(this.query()).subscribe({
        next: (r) => {
          this.error.set(null);
          this.result.set(r);
        },
        error: (e) => this.error.set(errorMessage(e)),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected tabLabel(tab: RequestStatus | 'all'): string {
    return tab === 'all' ? 'All' : STATUS_LABELS[tab];
  }
  protected style(key: string): string {
    return styleLabel(key);
  }
  protected colorMode(key: keyof typeof COLOR_MODE_LABELS): string {
    return COLOR_MODE_LABELS[key];
  }
  protected setStatus(tab: RequestStatus | 'all'): void {
    this.status.set(tab);
    this.page.set(1);
  }
  protected setAssigned(event: Event): void {
    this.assigned.set((event.target as HTMLSelectElement).value as AssignedFilter);
    this.page.set(1);
  }
  protected setQuery(event: Event): void {
    this.q.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }
  protected goTo(page: number): void {
    this.page.set(page);
  }
}
