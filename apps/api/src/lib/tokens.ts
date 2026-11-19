import { randomBytes } from 'node:crypto';

/** URL-safe random token (base64url). 24 bytes -> 32 characters, 192 bits of entropy. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}
