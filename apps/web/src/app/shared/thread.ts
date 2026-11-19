import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ThreadMessage } from '../core/models';
import { ImageGallery } from './image-gallery';
import { QuoteCard } from './quote-card';

/** The conversation on a request, oldest first. `viewer` decides which side is "you". */
@Component({
  selector: 'tq-thread',
  imports: [DatePipe, ImageGallery, QuoteCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (messages().length === 0) {
      <p class="empty">No messages yet.</p>
    } @else {
      <ol class="thread">
        @for (m of messages(); track m.id) {
          <li class="message" [class.own]="m.authorType === viewer()" [attr.data-author]="m.authorType">
            <div class="message-head">
              <strong>{{ m.authorName }}</strong>
              <span class="muted">{{ m.authorType === 'artist' ? 'Artist' : 'Client' }} · {{ m.createdAt | date: 'medium' }}</span>
            </div>
            <p class="message-body">{{ m.body }}</p>
            @if (m.quote; as quote) {
              <tq-quote-card [quote]="quote" />
            }
            <tq-image-gallery [images]="m.attachments" label="Images in this message" />
          </li>
        }
      </ol>
    }
  `,
})
export class Thread {
  readonly messages = input.required<ThreadMessage[]>();
  readonly viewer = input<'client' | 'artist'>('client');
}
