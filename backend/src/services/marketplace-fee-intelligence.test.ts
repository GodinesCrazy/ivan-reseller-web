import { calculateFeeIntelligence } from './marketplace-fee-intelligence.service';

describe('marketplace fee intelligence - MercadoLibre Chile', () => {
  it('applies fixed CLP fee in marketplace currency for low-tier listings', () => {
    const result = calculateFeeIntelligence({
      marketplace: 'mercadolibre',
      listingPrice: 9500,
      supplierCost: 4000,
      shippingCostToCustomer: 0,
      currency: 'CLP',
    });

    expect(result.breakdown.taxesOrOther).toBe(700);
    expect(result.totalMarketplaceCost).toBe(1840);
    expect(result.totalOperationalCost).toBe(5840);
    expect(result.expectedProfit).toBe(3660);
  });

  it('applies mid-tier fixed CLP fee correctly', () => {
    const result = calculateFeeIntelligence({
      marketplace: 'mercadolibre',
      listingPrice: 15000,
      supplierCost: 6000,
      shippingCostToCustomer: 500,
      currency: 'CLP',
    });

    expect(result.breakdown.taxesOrOther).toBe(1000);
    expect(result.totalMarketplaceCost).toBe(2800);
    expect(result.totalOperationalCost).toBe(9300);
    expect(result.expectedProfit).toBe(5700);
  });
});
