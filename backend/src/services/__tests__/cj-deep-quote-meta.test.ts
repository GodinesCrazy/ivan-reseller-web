import { mergeCjSupplyMetaForDeepQuote } from '../cj-deep-quote-meta';
import type { SupplyRowMeta } from '../supply-quote.types';

describe('mergeCjSupplyMetaForDeepQuote', () => {
  const base: SupplyRowMeta = {
    supplier: 'cj',
    unitCostTruth: 'listing',
    shippingTruth: 'estimated',
    landedCostTruth: 'estimated_partial',
    preferredSupplierSatisfied: true,
    fallbackUsed: false,
    quoteConfidence: 'medium',
    providersAttempted: ['cj_open_api_listv2'],
    shippingEstimateStatus: 'estimated',
    shippingSource: 'default_commerce_settings',
  };

  it('marks deep quote fresh and confirms shipping line', () => {
    const out = mergeCjSupplyMetaForDeepQuote(base, {
      fromCache: false,
      method: 'CJEVIPUSZ',
      quotedAtIso: '2026-04-13T12:00:00.000Z',
    });
    expect(out.shippingEstimateStatus).toBe('deep_quoted');
    expect(out.shippingSource).toBe('cj_freight_calculate');
    expect(out.shippingTruth).toBe('confirmed');
    expect(out.quoteFreshness).toBe('fresh');
    expect(out.deepQuotePerformed).toBe(true);
    expect(out.cjFreightMethod).toBe('CJEVIPUSZ');
    expect(out.costSemantics?.shippingKind).toBe('cj_api_deep_quote');
    expect(out.providersAttempted).toContain('cj_freight_calculate');
  });

  it('marks cache hit as stale freshness', () => {
    const out = mergeCjSupplyMetaForDeepQuote(base, {
      fromCache: true,
      method: 'Economy',
      quotedAtIso: '2026-04-13T10:00:00.000Z',
    });
    expect(out.quoteFreshness).toBe('stale');
  });
});
