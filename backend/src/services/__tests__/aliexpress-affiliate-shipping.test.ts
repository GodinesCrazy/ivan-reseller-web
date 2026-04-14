import {
  normalizeAffiliateApiShippingInfo,
  parseAffiliateDeliveryDaysMax,
} from '../aliexpress-affiliate-api.service';

describe('parseAffiliateDeliveryDaysMax', () => {
  it('parses integers and ranges', () => {
    expect(parseAffiliateDeliveryDaysMax(12)).toBe(12);
    expect(parseAffiliateDeliveryDaysMax('7-15')).toBe(15);
    expect(parseAffiliateDeliveryDaysMax('7–12')).toBe(12);
    expect(parseAffiliateDeliveryDaysMax('12-20 business days')).toBe(20);
  });

  it('returns undefined for empty or invalid', () => {
    expect(parseAffiliateDeliveryDaysMax(null)).toBeUndefined();
    expect(parseAffiliateDeliveryDaysMax('')).toBeUndefined();
    expect(parseAffiliateDeliveryDaysMax(0)).toBeUndefined();
  });
});

describe('normalizeAffiliateApiShippingInfo', () => {
  it('reads delivery_days and shipping_cost', () => {
    const sh = normalizeAffiliateApiShippingInfo(
      { ship_to_country: 'US', delivery_days: '10-18', shipping_cost: '2.5', shipping_cost_currency: 'USD' },
      'USD'
    );
    expect(sh?.deliveryDaysMax).toBe(18);
    expect(sh?.shippingCost).toBe(2.5);
    expect(sh?.shipToCountry).toBe('US');
  });

  it('merges array of methods taking max delivery days', () => {
    const sh = normalizeAffiliateApiShippingInfo(
      [
        { delivery_days: '7-10', shipping_cost: '0' },
        { delivery_days: '15', shipping_cost: '3' },
      ],
      'USD'
    );
    expect(sh?.deliveryDaysMax).toBe(15);
    expect(sh?.shippingCost).toBe(3);
  });

  it('unwraps { string: single object }', () => {
    const sh = normalizeAffiliateApiShippingInfo(
      { string: [{ delivery_days: '5-9', ship_to_country: 'US' }] },
      'USD'
    );
    expect(sh?.deliveryDaysMax).toBe(9);
  });
});
