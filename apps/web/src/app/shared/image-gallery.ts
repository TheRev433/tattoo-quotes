import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Attachment } from '../core/models';

@Component({
  selector: 'tq-image-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (images().length) {
      <ul class="gallery" [attr.aria-label]="label()">
        @for (img of images(); track img.id) {
          <li>
            <a [href]="img.url" target="_blank" rel="noopener">
              <img [src]="img.url" [alt]="img.originalName" loading="lazy" width="120" height="120" />
            </a>
            <span class="gallery-name" [title]="img.originalName">{{ img.originalName }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class ImageGallery {
  readonly images = input.required<Attachment[]>();
  readonly label = input('Images');
}
