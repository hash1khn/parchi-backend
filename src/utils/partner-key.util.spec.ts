import {
  hashedKeysEqual,
  hashPartnerKey,
  isStrongPartnerKey,
  MIN_PARTNER_KEY_LENGTH,
  PLACEHOLDER_PARTNER_KEY_HASH,
} from './partner-key.util';

describe('partner-key.util', () => {
  it('hashes deterministically and trims whitespace', () => {
    expect(hashPartnerKey('  abc  ')).toBe(hashPartnerKey('abc'));
    expect(hashPartnerKey('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compares hashes safely, including different lengths', () => {
    const h = hashPartnerKey('k');
    expect(hashedKeysEqual(h, h)).toBe(true);
    expect(hashedKeysEqual(h, hashPartnerKey('other'))).toBe(false);
    expect(hashedKeysEqual(h, 'short')).toBe(false);
  });

  it('enforces a minimum key length', () => {
    expect(isStrongPartnerKey('x'.repeat(MIN_PARTNER_KEY_LENGTH))).toBe(true);
    expect(isStrongPartnerKey('x'.repeat(MIN_PARTNER_KEY_LENGTH - 1))).toBe(false);
  });

  it('placeholder hash constant matches the published placeholder key', () => {
    expect(hashPartnerKey('REPLACE_ME_SET_INSIDE_KARACHI_PARTNER_KEY')).toBe(
      PLACEHOLDER_PARTNER_KEY_HASH,
    );
  });
});
