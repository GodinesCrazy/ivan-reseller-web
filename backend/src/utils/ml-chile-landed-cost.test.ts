import { calculateMlChileLandedCost } from './ml-chile-landed-cost';

describe('calculateMlChileLandedCost', () => {
  it('calculates 19% VAT over product + shipping', () => {
    const result = calculateMlChileLandedCost({
      productCost: 10,
      shippingCost: 5,
      currency: 'USD',
    });

    expect(result.importTaxAmount).toBe(2.85);
    expect(result.totalCost).toBe(17.85);
    expect(result.landedCostCompleteness).toBe('complete');
  });
});
