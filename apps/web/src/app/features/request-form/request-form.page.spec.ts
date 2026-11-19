import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { buildRequestForm, RequestFormPage } from './request-form.page';

const meta = {
  styles: [{ value: 'fine_line', label: 'Fine line' }, { value: 'realism', label: 'Realism' }],
  colorModes: [{ value: 'color', label: 'Color' }, { value: 'black_grey', label: 'Black & grey' }],
  placements: ['Wrist'],
  statuses: [],
  priceTypes: ['fixed', 'range'],
  currency: 'MXN',
  sizeCm: { min: 1, max: 200 },
  uploads: { maxFileBytes: 1024, maxFiles: 2, acceptedTypes: ['image/png'] },
};

function fields(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.append(k, v);
  return data;
}

const image = (name = 'ref.png', size = 10, type = 'image/png') => new File([new Uint8Array(size)], name, { type });

describe('buildRequestForm', () => {
  it('converts the budget typed in pesos to integer cents and drops empty fields', () => {
    const built = buildRequestForm(
      fields({ clientName: ' Ana ', clientEmail: 'ana@example.com', budgetMin: '1,500', budgetMax: '2500.5', preferredArtistId: '', availabilityNotes: '' }),
      [image()],
    );
    expect('form' in built).toBe(true);
    const form = (built as { form: FormData }).form;
    expect(form.get('clientName')).toBe('Ana');
    expect(form.get('budgetMinCents')).toBe('150000');
    expect(form.get('budgetMaxCents')).toBe('250050');
    expect(form.has('preferredArtistId')).toBe(false);
    expect(form.has('availabilityNotes')).toBe(false);
    expect(form.has('budgetMin')).toBe(false);
    expect(form.getAll('images')).toHaveLength(1);
  });

  it('rejects bad budgets and missing images', () => {
    expect(buildRequestForm(fields({ budgetMin: 'lots' }), [image()])).toEqual({ error: 'Budget must be an amount like 1500 or 1500.50.' });
    expect(buildRequestForm(fields({ budgetMin: '300', budgetMax: '200' }), [image()])).toEqual({ error: 'Maximum budget must be at least the minimum.' });
    expect(buildRequestForm(fields({}), [])).toEqual({ error: 'Add at least one reference image.' });
  });
});

describe('RequestFormPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RequestFormPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(RequestFormPage);
    fixture.detectChanges();
    http.expectOne('/api/meta').flush(meta);
    http.expectOne('/api/artists').flush([{ id: 2, name: 'Diego Salas', slug: 'diego-salas', bio: '', specialties: [], active: true }]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders styles, color modes and artists from the API', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    const styles = Array.from(el.querySelectorAll<HTMLOptionElement>('#style option')).map((o) => o.textContent!.trim());
    expect(styles).toEqual(['Choose a style…', 'Fine line', 'Realism']);
    expect(el.querySelectorAll('input[name="colorMode"]')).toHaveLength(2);
    expect(el.querySelector('#preferredArtistId')!.textContent).toContain('Diego Salas');
    expect(el.textContent).toContain('Up to 2 images, 1 KB each');
  });

  it('submits multipart data and opens the private link page', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const set = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
      input.value = value;
    };
    set('#clientName', 'Ana Ejemplo');
    set('#clientEmail', 'ana@example.com');
    set('#description', 'A small lavender sprig on the wrist.');
    set('#placement', 'Wrist');
    set('#style', 'fine_line');
    set('#widthCm', '3');
    set('#heightCm', '8');
    set('#budgetMax', '2500');
    const picker = el.querySelector<HTMLInputElement>('#reference-images')!;
    Object.defineProperty(picker, 'files', { value: [image('wrist.png')] });
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelectorAll('.picker-list li')).toHaveLength(1);

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne('/api/requests');
    const body = req.request.body as FormData;
    expect(body.get('budgetMaxCents')).toBe('250000');
    expect(body.get('colorMode')).toBe('color');
    expect((body.get('images') as File).name).toBe('wrist.png');
    req.flush({ publicToken: 'tok_abcdefghijklmnopqrstuv' });
    expect(navigate).toHaveBeenCalledWith(['/r', 'tok_abcdefghijklmnopqrstuv'], { queryParams: { created: 1 } });
  });

  it('blocks oversized images before uploading', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const picker = el.querySelector<HTMLInputElement>('#reference-images')!;
    Object.defineProperty(picker, 'files', { value: [image('huge.png', 4096)] });
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('.field-error')!.textContent).toContain('"huge.png" is larger than 1 KB.');
  });
});
