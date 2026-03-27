import { selectMlChileFreightOption } from './ml-chile-freight-selector';

describe('selectMlChileFreightOption', () => {
  it('prefers the cheapest tracked-like option', () => {
    const result = selectMlChileFreightOption([
      {
        serviceName: 'Economy Shipping',
        freightAmount: 1.5,
        freightCurrency: 'USD',
        isTrackedLike: false,
        isFreeShipping: false,
        raw: {},
      },
      {
        serviceName: 'AliExpress Standard Shipping',
        freightAmount: 2,
        freightCurrency: 'USD',
        isTrackedLike: true,
        isFreeShipping: false,
        raw: {},
      },
    ]);

    expect(result.selected?.serviceName).toBe('AliExpress Standard Shipping');
  });

  it('falls back to the cheapest usable option when none are tracked-like', () => {
    const result = selectMlChileFreightOption([
      {
        serviceName: 'Economy Shipping',
        freightAmount: 3,
        freightCurrency: 'USD',
        isTrackedLike: false,
        isFreeShipping: false,
        raw: {},
      },
      {
        serviceName: 'Budget Mail',
        freightAmount: 1,
        freightCurrency: 'USD',
        isTrackedLike: false,
        isFreeShipping: false,
        raw: {},
      },
    ]);

    expect(result.selected?.serviceName).toBe('Budget Mail');
  });
});
