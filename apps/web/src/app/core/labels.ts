import type { ColorMode, RequestStatus } from './models';

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'New',
  in_review: 'In review',
  quoted: 'Quoted',
  accepted: 'Accepted',
  declined: 'Declined',
};

/** What the client reads on their private page for each status. */
export const STATUS_HINTS: Record<RequestStatus, string> = {
  new: 'Your request was received. An artist will review it soon.',
  in_review: 'An artist is reviewing your idea and may ask a few questions.',
  quoted: 'You have a quote. Reply below if you have questions.',
  accepted: 'Quote accepted. The studio will contact you to book your session.',
  declined: 'This request was closed by the studio.',
};

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  color: 'Color',
  black_grey: 'Black & grey',
};

/** Fallback label for a style key (the API's /meta has the canonical list). */
export function styleLabel(key: string, options: { value: string; label: string }[] = []): string {
  return options.find((o) => o.value === key)?.label ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
