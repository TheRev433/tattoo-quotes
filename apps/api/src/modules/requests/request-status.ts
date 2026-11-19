import { conflict } from '../../http/errors.js';

export const REQUEST_STATUSES = ['new', 'in_review', 'quoted', 'accepted', 'declined'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'New',
  in_review: 'In review',
  quoted: 'Quoted',
  accepted: 'Accepted',
  declined: 'Declined',
};

/**
 * The request lifecycle. Every status change in the API goes through `assertTransition`.
 *
 *   new ──► in_review ──► quoted ──► accepted
 *    │          │           │
 *    └──────────┴───────────┴──────► declined
 *
 * `accepted` and `declined` are final.
 */
const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ['in_review', 'declined'],
  in_review: ['quoted', 'declined'],
  quoted: ['accepted', 'declined'],
  accepted: [],
  declined: [],
};

/** Statuses that need extra data and can only be reached through a dedicated action. */
const REQUIRES_ACTION: Partial<Record<RequestStatus, string>> = {
  quoted: 'Send a reply with a price to mark the request as quoted',
};

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isFinal(status: RequestStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw conflict(`Cannot move a request from "${STATUS_LABELS[from]}" to "${STATUS_LABELS[to]}"`, {
      from,
      to,
      allowed: TRANSITIONS[from],
    });
  }
}

/** Targets an artist may pick directly with the status endpoint (e.g. buttons in the UI). */
export function manualTransitions(from: RequestStatus): RequestStatus[] {
  return TRANSITIONS[from].filter((to) => !REQUIRES_ACTION[to]);
}

export function assertManualTransition(from: RequestStatus, to: RequestStatus): void {
  assertTransition(from, to);
  const reason = REQUIRES_ACTION[to];
  if (reason) throw conflict(reason, { from, to });
}

/** Messages can be exchanged until the request is declined. */
export function canMessage(status: RequestStatus): boolean {
  return status !== 'declined';
}

/** A price can be sent while the artist is still evaluating (v1 allows exactly one quote). */
export function canQuote(status: RequestStatus): boolean {
  return status === 'new' || status === 'in_review';
}
