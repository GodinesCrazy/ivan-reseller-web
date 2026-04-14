import { buildOpportunityEconomicSupplyQuote } from '../opportunity-economic-quote.mapper';

describe('buildOpportunityEconomicSupplyQuote', () => {
  it('returns undefined without supplyMeta', () => {
    expect(
      buildOpportunityEconomicSupplyQuote({
        price: 10,
        currency: 'USD',
        shippingCost: 2,
      })
    ).toBeUndefined();
  });

  it('builds landed from unit + shipping', () => {
    const q = buildOpportunityEconomicSupplyQuote({
      price: 10,
      currency: 'USD',
      shippingCost: 3.5,
      supplyMeta: {
        supplier: 'cj',
        unitCostTruth: 'listing',
        shippingTruth: 'confirmed',
        landedCostTruth: 'estimated',
        preferredSupplierSatisfied: true,
        fallbackUsed: false,
        quoteConfidence: 'high',
        providersAttempted: ['cj'],
        shippingEstimateStatus: 'deep_quoted',
        shippingSource: 'cj_freight_calculate',
        deepQuotePerformed: true,
      },
    });
    expect(q?.landedCostEstimate).toBe(13.5);
    expect(q?.shippingEstimateStatus).toBe('deep_quoted');
    expect(q?.deepQuotePerformed).toBe(true);
  });
});
