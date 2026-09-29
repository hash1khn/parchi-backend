import { createHash, timingSafeEqual } from 'crypto';

export function hashPartnerKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim(), 'utf8').digest('hex');
}

export function hashedKeysEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
