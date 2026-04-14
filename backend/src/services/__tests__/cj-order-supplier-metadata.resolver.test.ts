import { extractEbayOrderIdFromPaypalRef } from '../cj-order-supplier-metadata.resolver';

describe('extractEbayOrderIdFromPaypalRef', () => {
  it('parses ebay: prefix', () => {
    expect(extractEbayOrderIdFromPaypalRef('ebay:12-34567-89012')).toBe('12-34567-89012');
  });
  it('parses phase-d-cj smoke prefix', () => {
    expect(extractEbayOrderIdFromPaypalRef('phase-d-cj:12-34567-89012:1713000000000')).toBe('12-34567-89012');
  });
  it('returns null for fallback smoke', () => {
    expect(extractEbayOrderIdFromPaypalRef('phase-d-cj:fallback:1713000000000')).toBeNull();
  });
});
