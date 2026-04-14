import type { SupplyRowMeta } from './supply-quote.types';

/**
 * Merge CJ row meta after a successful `freightCalculate` (or cache hit).
 * Keeps unit cost as listing_price; shipping becomes API-backed for the line item only.
 */
export function mergeCjSupplyMetaForDeepQuote(
  base: SupplyRowMeta,
  input: {
    fromCache: boolean;
    method?: string;
    quotedAtIso: string;
  }
): SupplyRowMeta {
  const methodLabel =
    typeof input.method === 'string' && input.method.trim() ? input.method.trim() : undefined;
  const providers = [...(base.providersAttempted || [])];
  if (!providers.includes('cj_freight_calculate')) {
    providers.push('cj_freight_calculate');
  }

  return {
    ...base,
    shippingTruth: 'confirmed',
    landedCostTruth: 'estimated',
    quoteConfidence: 'high',
    shippingEstimateStatus: 'deep_quoted',
    shippingSource: 'cj_freight_calculate',
    deepQuotePerformed: true,
    deepQuoteAt: input.quotedAtIso,
    freightQuoteCachedAt: input.quotedAtIso,
    quoteFreshness: input.fromCache ? 'stale' : 'fresh',
    costSemantics: {
      unitCostKind: 'listing_price',
      shippingKind: 'cj_api_deep_quote',
      landedKind: 'landed_estimate',
    },
    providersAttempted: providers,
    deepQuoteFailureReason: undefined,
    cjFreightMethod: methodLabel,
  };
}
