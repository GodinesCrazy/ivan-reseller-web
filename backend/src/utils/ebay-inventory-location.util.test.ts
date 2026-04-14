import { pickMerchantLocationKey } from './ebay-inventory-location.util';

describe('pickMerchantLocationKey', () => {
  const rows = [
    { merchantLocationKey: 'us_wh', location: { address: { country: 'US' } } },
    { merchantLocationKey: 'cn_wh', location: { address: { country: 'CN' } } },
  ];

  it('selects CN when mode is CN', () => {
    expect(pickMerchantLocationKey(rows, 'CN')).toBe('cn_wh');
  });

  it('selects US when mode is US', () => {
    expect(pickMerchantLocationKey(rows, 'US')).toBe('us_wh');
  });

  it('LEGACY prefers CL then falls back to first', () => {
    expect(
      pickMerchantLocationKey(
        [
          { merchantLocationKey: 'first', location: { address: { country: 'US' } } },
          { merchantLocationKey: 'cl', location: { address: { country: 'CL' } } },
        ],
        'LEGACY',
      ),
    ).toBe('cl');
    expect(
      pickMerchantLocationKey(
        [{ merchantLocationKey: 'only', location: { address: { country: 'DE' } } }],
        'LEGACY',
      ),
    ).toBe('only');
  });

  it('returns null for empty list', () => {
    expect(pickMerchantLocationKey([], 'CN')).toBeNull();
  });
});
