import { buildListingFeeLedger } from '../../services/listing-fee-ledger.service';

describe('listing-fee-ledger.service', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('blocks eBay US when fee config is missing', () => {
    delete process.env.EBAY_FVF_PCT;
    delete process.env.EBAY_INSERTION_FEE_USD;

    const ledger = buildListingFeeLedger({
      marketplace: 'ebay',
      country: 'US',
      listingCurrency: 'USD',
      revenueEstimate: 25,
      supplierCost: 8,
      shippingCost: 3,
      marketplaceFeeEstimate: 3,
      paymentFeeEstimate: 0,
      listingFeeEstimate: 0.35,
      supplierCurrency: 'USD',
    });

    expect(ledger.blockedByFinancialIncompleteness).toBe(true);
    expect(ledger.missingFeeClasses).toContain('marketplaceFeeEstimate');
    expect(ledger.missingFeeClasses).toContain('listingFeeEstimate');
  });

  it('passes completeness when eBay US fee config is explicit and no fx fee is needed', () => {
    process.env.EBAY_FVF_PCT = '13.25';
    process.env.EBAY_INSERTION_FEE_USD = '0.35';

    const ledger = buildListingFeeLedger({
      marketplace: 'ebay',
      country: 'US',
      listingCurrency: 'USD',
      revenueEstimate: 25,
      supplierCost: 8,
      shippingCost: 3,
      marketplaceFeeEstimate: 3.31,
      paymentFeeEstimate: 0,
      listingFeeEstimate: 0.35,
      supplierCurrency: 'USD',
    });

    expect(ledger.blockedByFinancialIncompleteness).toBe(false);
    expect(ledger.completenessState).toBe('complete');
    expect(ledger.estimatedFeeClasses).toContain('marketplaceFeeEstimate');
  });

  it('passes MercadoLibre CL completeness with the default commission model and explicit FX buffer model', () => {
    delete process.env.ML_COMMISSION_PCT;
    delete process.env.FX_FEE_BUFFER_PCT;

    const ledger = buildListingFeeLedger({
      marketplace: 'mercadolibre',
      country: 'CL',
      listingCurrency: 'CLP',
      revenueEstimate: 15000,
      supplierCost: 4500,
      shippingCost: 2500,
      marketplaceFeeEstimate: 1800,
      paymentFeeEstimate: 0,
      listingFeeEstimate: 0,
      supplierCurrency: 'USD',
    });

    expect(ledger.blockedByFinancialIncompleteness).toBe(false);
    expect(ledger.marketplaceFeeEstimate.state).toBe('estimated');
    expect(ledger.marketplaceFeeModel).toBe('default_mercadolibre_cl_commission_with_fixed_tiers');
    expect(ledger.marketplaceFeeInputs.commissionPct).toBe(12);
    expect(ledger.fxFeeEstimate.state).toBe('estimated');
    expect(ledger.fxFeeEstimate.amount).toBeCloseTo((4500 + 2500) * 0.03, 5);
    expect(ledger.fxModel).toBe('default_cross_currency_buffer_pct');
    expect(ledger.fxInputs.bufferPct).toBe(3);
    expect(ledger.currencySafety).toMatchObject({
      sourceCurrency: 'USD',
      listingCurrency: 'CLP',
      fxRequired: true,
      state: 'buffered',
    });
  });

  it('uses configured ML and FX inputs when present', () => {
    process.env.ML_COMMISSION_PCT = '14';
    process.env.FX_FEE_BUFFER_PCT = '4';

    const ledger = buildListingFeeLedger({
      marketplace: 'mercadolibre',
      country: 'CL',
      listingCurrency: 'CLP',
      revenueEstimate: 18000,
      supplierCost: 5000,
      shippingCost: 2000,
      marketplaceFeeEstimate: 2520,
      paymentFeeEstimate: 0,
      listingFeeEstimate: 0,
      supplierCurrency: 'USD',
    });

    expect(ledger.marketplaceFeeModel).toBe('configured_mercadolibre_cl_commission_with_fixed_tiers');
    expect(ledger.marketplaceFeeInputs.commissionPct).toBe(14);
    expect(ledger.fxModel).toBe('configured_cross_currency_buffer_pct');
    expect(ledger.fxInputs.bufferPct).toBe(4);
    expect(ledger.fxFeeEstimate.amount).toBeCloseTo((5000 + 2000) * 0.04, 5);
  });
});
