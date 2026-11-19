import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import type { Artist, Meta } from '../../core/models';
import { parseMoneyToCents } from '../../core/money';
import { checkImages, ImagePicker } from '../../shared/image-picker';

/** Builds the multipart body the API expects. Budget is typed in pesos and sent as integer cents. */
export function buildRequestForm(data: FormData, images: readonly File[]): { form: FormData } | { error: string } {
  const min = parseMoneyToCents(String(data.get('budgetMin') ?? ''));
  const max = parseMoneyToCents(String(data.get('budgetMax') ?? ''));
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: 'Budget must be an amount like 1500 or 1500.50.' };
  if (min !== null && max !== null && max < min) return { error: 'Maximum budget must be at least the minimum.' };
  if (images.length === 0) return { error: 'Add at least one reference image.' };

  const form = new FormData();
  for (const key of ['clientName', 'clientEmail', 'description', 'placement', 'widthCm', 'heightCm', 'style', 'colorMode', 'availabilityNotes', 'preferredArtistId']) {
    const value = data.get(key);
    if (typeof value === 'string' && value.trim() !== '') form.append(key, value.trim());
  }
  if (min !== null) form.append('budgetMinCents', String(min));
  if (max !== null) form.append('budgetMaxCents', String(max));
  for (const file of images) form.append('images', file, file.name);
  return { form };
}

@Component({
  selector: 'tq-request-form-page',
  imports: [ImagePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header"><h1>Request a quote</h1></div>
    <form class="card form-grid" (submit)="submit($event)" novalidate aria-describedby="form-intro">
      <p id="form-intro" class="span-all muted">
        Tell us about your idea. You will get a private link to follow the conversation and see the quote.
      </p>

      <fieldset class="span-all form-grid">
        <legend>About you</legend>
        <div class="field">
          <label for="clientName">Name</label>
          <input id="clientName" name="clientName" required minlength="2" maxlength="80" autocomplete="name" />
        </div>
        <div class="field">
          <label for="clientEmail">Email</label>
          <input id="clientEmail" name="clientEmail" type="email" required maxlength="254" autocomplete="email" />
        </div>
      </fieldset>

      <fieldset class="span-all form-grid">
        <legend>Your tattoo</legend>
        <div class="field span-all">
          <label for="description">Description</label>
          <textarea id="description" name="description" required minlength="10" maxlength="2000" rows="4"
            placeholder="What would you like? Any meaning, elements or details to include?"></textarea>
        </div>
        <div class="field">
          <label for="placement">Placement on body</label>
          <input id="placement" name="placement" required minlength="2" maxlength="80" list="placements" />
          <datalist id="placements">
            @for (p of meta()?.placements ?? []; track p) {
              <option [value]="p"></option>
            }
          </datalist>
        </div>
        <div class="field">
          <label for="style">Style</label>
          <select id="style" name="style" required>
            <option value="">Choose a style…</option>
            @for (s of meta()?.styles ?? []; track s.value) {
              <option [value]="s.value">{{ s.label }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="widthCm">Approx. width (cm)</label>
          <input id="widthCm" name="widthCm" type="number" required [min]="sizeMin()" [max]="sizeMax()" step="1" inputmode="numeric" />
        </div>
        <div class="field">
          <label for="heightCm">Approx. height (cm)</label>
          <input id="heightCm" name="heightCm" type="number" required [min]="sizeMin()" [max]="sizeMax()" step="1" inputmode="numeric" />
        </div>
        <div class="field span-all" role="radiogroup" aria-labelledby="color-label">
          <span id="color-label" class="label">Color</span>
          <div class="radio-row">
            @for (c of meta()?.colorModes ?? []; track c.value; let first = $first) {
              <label class="radio"><input type="radio" name="colorMode" [value]="c.value" [checked]="first" required /> {{ c.label }}</label>
            }
          </div>
        </div>
      </fieldset>

      <fieldset class="span-all form-grid">
        <legend>Budget and timing</legend>
        <div class="field">
          <label for="budgetMin">Budget from ({{ meta()?.currency ?? 'MXN' }}, optional)</label>
          <input id="budgetMin" name="budgetMin" inputmode="decimal" placeholder="e.g. 1500" />
        </div>
        <div class="field">
          <label for="budgetMax">Budget up to ({{ meta()?.currency ?? 'MXN' }}, optional)</label>
          <input id="budgetMax" name="budgetMax" inputmode="decimal" placeholder="e.g. 3000" />
        </div>
        <div class="field span-all">
          <label for="availabilityNotes">Preferred dates / availability (optional)</label>
          <textarea id="availabilityNotes" name="availabilityNotes" maxlength="1000" rows="2"
            placeholder="e.g. weekday afternoons, any time in December"></textarea>
        </div>
        <div class="field">
          <label for="preferredArtistId">Preferred artist (optional)</label>
          <select id="preferredArtistId" name="preferredArtistId">
            <option value="">No preference</option>
            @for (a of artists(); track a.id) {
              <option [value]="a.id">{{ a.name }}</option>
            }
          </select>
        </div>
      </fieldset>

      <fieldset class="span-all">
        <legend>Reference images</legend>
        <tq-image-picker
          [(files)]="images"
          inputId="reference-images"
          label="Add reference images"
          [maxFiles]="limits().maxFiles"
          [maxFileBytes]="limits().maxFileBytes"
          [acceptedTypes]="limits().acceptedTypes"
        />
      </fieldset>

      @if (error()) {
        <p class="alert error span-all" role="alert">{{ error() }}</p>
      }
      <div class="actions span-all">
        <button type="submit" class="btn primary" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Send request' }}</button>
      </div>
    </form>
  `,
})
export class RequestFormPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly meta = signal<Meta | null>(null);
  protected readonly artists = signal<Artist[]>([]);
  protected readonly images = signal<File[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly limits = computed(
    () => this.meta()?.uploads ?? { maxFiles: 6, maxFileBytes: 5 * 1024 * 1024, acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  );
  protected readonly sizeMin = computed(() => this.meta()?.sizeCm.min ?? 1);
  protected readonly sizeMax = computed(() => this.meta()?.sizeCm.max ?? 200);

  constructor() {
    this.api.meta().subscribe({ next: (m) => this.meta.set(m), error: (e) => this.error.set(errorMessage(e)) });
    this.api.artists().subscribe({ next: (a) => this.artists.set(a), error: () => this.artists.set([]) });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const formEl = event.target as HTMLFormElement;
    if (!formEl.reportValidity()) return;
    const problems = checkImages(this.images(), this.limits());
    if (problems.length) {
      this.error.set(problems.join(' '));
      return;
    }
    const built = buildRequestForm(new FormData(formEl), this.images());
    if ('error' in built) {
      this.error.set(built.error);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.createRequest(built.form).subscribe({
      next: (created) => {
        this.busy.set(false);
        void this.router.navigate(['/r', created.publicToken], { queryParams: { created: 1 } });
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
