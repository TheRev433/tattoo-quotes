import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http/errors.js';
import {
  assertManualTransition,
  assertTransition,
  canMessage,
  canQuote,
  canTransition,
  isFinal,
  isRequestStatus,
  manualTransitions,
  REQUEST_STATUSES,
  type RequestStatus,
} from '../src/modules/requests/request-status.js';

const ALLOWED: [RequestStatus, RequestStatus][] = [
  ['new', 'in_review'],
  ['new', 'declined'],
  ['in_review', 'quoted'],
  ['in_review', 'declined'],
  ['quoted', 'accepted'],
  ['quoted', 'declined'],
];

describe('request status rules', () => {
  it('allows exactly the documented transitions', () => {
    for (const from of REQUEST_STATUSES) {
      for (const to of REQUEST_STATUSES) {
        const expected = ALLOWED.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it('throws a 409 with the allowed targets for an invalid move', () => {
    try {
      assertTransition('new', 'accepted');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(409);
      expect((error as HttpError).details).toEqual({ from: 'new', to: 'accepted', allowed: ['in_review', 'declined'] });
    }
  });

  it('never lets a status transition to itself', () => {
    for (const s of REQUEST_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it('marks accepted and declined as final', () => {
    expect(REQUEST_STATUSES.filter(isFinal)).toEqual(['accepted', 'declined']);
  });

  it('keeps "quoted" out of the manual transitions (it needs a price)', () => {
    expect(manualTransitions('in_review')).toEqual(['declined']);
    expect(manualTransitions('new')).toEqual(['in_review', 'declined']);
    expect(manualTransitions('quoted')).toEqual(['accepted', 'declined']);
    expect(() => assertManualTransition('in_review', 'quoted')).toThrow(/reply with a price/);
    expect(() => assertManualTransition('new', 'quoted')).toThrow(/Cannot move/);
  });

  it('allows messages until declined and quotes only before a quote exists', () => {
    expect(REQUEST_STATUSES.filter(canMessage)).toEqual(['new', 'in_review', 'quoted', 'accepted']);
    expect(REQUEST_STATUSES.filter(canQuote)).toEqual(['new', 'in_review']);
  });

  it('recognises status strings', () => {
    expect(isRequestStatus('quoted')).toBe(true);
    expect(isRequestStatus('archived')).toBe(false);
    expect(isRequestStatus(3)).toBe(false);
  });
});
