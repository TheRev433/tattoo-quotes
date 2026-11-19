import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Quote } from '../core/models';
import { formatRange } from '../core/money';

@Component({
  selector: 'tq-quote-card',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quote-card" data-testid="quote">
      <div class="quote-price">{{ price() }}</div>
      <div class="quote-meta">
        {{ quote().priceType === 'fixed' ? 'Fixed price' : 'Estimated range' }} ·
        {{ quote().estimatedSessions }} {{ quote().estimatedSessions === 1 ? 'session' : 'sessions' }} ·
        about {{ quote().estimatedHours }} {{ quote().estimatedHours === 1 ? 'hour' : 'hours' }} in total
      </div>
      <div class="quote-meta">By {{ quote().artist.name }} on {{ quote().createdAt | date: 'medium' }}</div>
    </div>
  `,
})
export class QuoteCard {
  readonly quote = input.required<Quote>();
  protected readonly price = computed(() => {
    const q = this.quote();
    return formatRange(q.amountMinCents, q.amountMaxCents, q.currency);
  });
}
