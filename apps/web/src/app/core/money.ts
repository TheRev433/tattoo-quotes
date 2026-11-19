/** Money is integer cents everywhere. These helpers only convert at the UI edge. */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
    formatters.set(currency, f);
  }
  return f;
}

/** 150000 -> "$1,500.00". Integer math only; the division is exact for display. */
export function formatCents(cents: number, currency = 'MXN'): string {
  return formatter(currency).format(cents / 100);
}

/**
 * Parses what a person types in a price field ("1500", "1,500.50", "$1500") into cents.
 * Returns null for empty input and NaN for anything that is not a valid amount.
 */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  const cleaned = (input ?? '').trim().replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function formatRange(minCents: number | null, maxCents: number | null, currency = 'MXN'): string {
  if (minCents !== null && maxCents !== null) {
    return minCents === maxCents
      ? `${formatCents(minCents, currency)} ${currency}`
      : `${formatCents(minCents, currency)} – ${formatCents(maxCents, currency)} ${currency}`;
  }
  if (maxCents !== null) return `Up to ${formatCents(maxCents, currency)} ${currency}`;
  if (minCents !== null) return `From ${formatCents(minCents, currency)} ${currency}`;
  return 'Not specified';
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
