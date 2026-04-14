import type { OpportunityEconomicSupplyQuote } from './opportunity-finder.types';
import type { SupplyRowMeta } from './supply-quote.types';

/** Build optional Phase C economic block from discovery row + supply meta. */
export function buildOpportunityEconomicSupplyQuote(product: {
  price: number;
  currency: string;
  shippingCost?: number;
  shippingDaysMax?: number;
  estimatedDeliveryDays?: number;
  supplyMeta?: SupplyRowMeta;
}): OpportunityEconomicSupplyQuote | undefined {
  if (!product.supplyMeta) return undefined;
  const m = product.supplyMeta;
  const ship = Number(product.shippingCost ?? 0);
  const unit = Number(product.price ?? 0);
  if (!Number.isFinite(unit)) return undefined;
  const landed = unit + (Number.isFinite(ship) ? ship : 0);
  return {
    currency: product.currency || 'USD',
    unitCost: unit,
    shippingEstimate: Number.isFinite(ship) ? ship : 0,
    landedCostEstimate: landed,
    costConfidence: m.quoteConfidence,
    quoteFreshness: m.quoteFreshness ?? 'unknown',
    shippingEstimateStatus: m.shippingEstimateStatus ?? 'estimated',
    deepQuotePerformed: Boolean(m.deepQuotePerformed),
    deepQuoteAt: m.deepQuoteAt,
    freightQuoteCachedAt: m.freightQuoteCachedAt,
    shippingSource: m.shippingSource,
    costSemantics: m.costSemantics,
    deliveryDaysBandMax: product.estimatedDeliveryDays ?? product.shippingDaysMax,
    cjFreightMethod: m.cjFreightMethod,
  };
}
