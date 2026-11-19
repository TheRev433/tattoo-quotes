import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_LABELS } from '../core/labels';
import type { RequestStatus } from '../core/models';

@Component({
  selector: 'tq-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-status]="status()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<RequestStatus>();
  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
}
