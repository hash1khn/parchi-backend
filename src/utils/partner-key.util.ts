import { createHash, timingSafeEqual } from 'crypto';

/** SHA-256 of the placeholder key that shipped in the first migration. Never valid. */
export const PLACEHOLDER_PARTNER_KEY_HASH =
  '34b7be74b5ef512ef9ae89db55e5f1775ffb58366422c384ba9ec2f3a2d16c60';

/** Partner keys are only hashed with SHA-256, so they must be long and random. */
export const MIN_PARTNER_KEY_LENGTH = 32;

export function hashPartnerKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim(), 'utf8').digest('hex');
}

export function hashedKeysEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isStrongPartnerKey(rawKey: string): boolean {
  return rawKey.trim().length >= MIN_PARTNER_KEY_LENGTH;
}
