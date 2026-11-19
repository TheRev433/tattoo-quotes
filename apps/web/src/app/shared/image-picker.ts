import { ChangeDetectionStrategy, Component, computed, effect, input, model, type OnDestroy, signal } from '@angular/core';
import { formatBytes } from '../core/money';

export interface PickedImage {
  file: File;
  previewUrl: string;
}

const DEFAULT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Problems with a selection, checked in the browser before upload (the API checks again). */
export function checkImages(files: readonly File[], limits: { maxFiles: number; maxFileBytes: number; acceptedTypes?: string[] }): string[] {
  const types = limits.acceptedTypes ?? DEFAULT_TYPES;
  const problems: string[] = [];
  if (files.length > limits.maxFiles) problems.push(`You can attach up to ${limits.maxFiles} images.`);
  for (const f of files) {
    if (!types.includes(f.type)) problems.push(`"${f.name}" is not a JPEG, PNG, WebP or GIF image.`);
    else if (f.size > limits.maxFileBytes) problems.push(`"${f.name}" is larger than ${formatBytes(limits.maxFileBytes)}.`);
  }
  return problems;
}

/** File input with thumbnails and remove buttons. Two-way bind `[(files)]`. */
@Component({
  selector: 'tq-image-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      <label class="btn" [attr.for]="inputId()">{{ label() }}</label>
      <input
        class="sr-only"
        type="file"
        multiple
        [id]="inputId()"
        [accept]="accept()"
        (change)="add($event)"
        [attr.aria-describedby]="inputId() + '-hint'"
      />
      <span class="hint" [id]="inputId() + '-hint'">
        Up to {{ maxFiles() }} images, {{ maxSize() }} each (JPEG, PNG, WebP, GIF).
      </span>
      @if (picked().length) {
        <ul class="picker-list">
          @for (p of picked(); track p.previewUrl; let i = $index) {
            <li>
              <img [src]="p.previewUrl" [alt]="'Preview of ' + p.file.name" width="72" height="72" />
              <span class="picker-name">{{ p.file.name }}</span>
              <button type="button" class="btn small" (click)="remove(i)" [attr.aria-label]="'Remove ' + p.file.name">Remove</button>
            </li>
          }
        </ul>
      }
      @for (problem of problems(); track problem) {
        <p class="field-error" role="alert">{{ problem }}</p>
      }
    </div>
  `,
})
export class ImagePicker implements OnDestroy {
  readonly files = model<File[]>([]);
  readonly inputId = input('images');
  readonly label = input('Add images');
  readonly maxFiles = input(6);
  readonly maxFileBytes = input(5 * 1024 * 1024);
  readonly acceptedTypes = input<string[]>(DEFAULT_TYPES);

  protected readonly picked = signal<PickedImage[]>([]);
  protected readonly accept = computed(() => this.acceptedTypes().join(','));
  protected readonly maxSize = computed(() => formatBytes(this.maxFileBytes()));
  protected readonly problems = computed(() =>
    checkImages(this.files(), { maxFiles: this.maxFiles(), maxFileBytes: this.maxFileBytes(), acceptedTypes: this.acceptedTypes() }),
  );

  constructor() {
    // Keep previews in sync when the parent resets the selection (e.g. after sending).
    effect(() => {
      const files = this.files();
      const current = this.picked();
      if (files.length === current.length && files.every((f, i) => current[i]?.file === f)) return;
      for (const p of current) URL.revokeObjectURL(p.previewUrl);
      this.picked.set(files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })));
    });
  }

  protected add(event: Event): void {
    const input = event.target as HTMLInputElement;
    const added = Array.from(input.files ?? []);
    input.value = '';
    if (added.length) this.files.update((files) => [...files, ...added]);
  }

  protected remove(index: number): void {
    this.files.update((files) => files.filter((_, i) => i !== index));
  }

  ngOnDestroy(): void {
    for (const p of this.picked()) URL.revokeObjectURL(p.previewUrl);
  }
}
