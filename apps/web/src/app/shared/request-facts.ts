import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { COLOR_MODE_LABELS, styleLabel } from '../core/labels';
import type { Option, PublicRequest } from '../core/models';
import { formatRange } from '../core/money';

/** The tattoo details a client submitted, as a definition list. */
@Component({
  selector: 'tq-request-facts',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="facts">
      <div><dt>Style</dt><dd>{{ style() }}</dd></div>
      <div><dt>Color</dt><dd>{{ colorMode() }}</dd></div>
      <div><dt>Placement</dt><dd>{{ request().placement }}</dd></div>
      <div><dt>Approx. size</dt><dd>{{ request().widthCm }} × {{ request().heightCm }} cm</dd></div>
      <div><dt>Budget</dt><dd data-testid="budget">{{ budget() }}</dd></div>
      <div><dt>Preferred artist</dt><dd>{{ request().preferredArtist?.name ?? 'Any' }}</dd></div>
      <div class="span-all"><dt>Availability</dt><dd>{{ request().availabilityNotes || 'Not specified' }}</dd></div>
      <div><dt>Submitted</dt><dd>{{ request().createdAt | date: 'medium' }}</dd></div>
    </dl>
  `,
})
export class RequestFacts {
  readonly request = input.required<PublicRequest>();
  readonly styles = input<Option[]>([]);
  protected readonly style = computed(() => styleLabel(this.request().style, this.styles()));
  protected readonly colorMode = computed(() => COLOR_MODE_LABELS[this.request().colorMode]);
  protected readonly budget = computed(() => {
    const r = this.request();
    return formatRange(r.budgetMinCents, r.budgetMaxCents, r.currency);
  });
}
