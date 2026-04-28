import type { TopDawgShopifyUsaPricingBreakdown, TopDawgShopifyUsaQualificationResult } from '../topdawg-shopify-usa.types';

// Pricing constants for US domestic TopDawg orders
const PAYMENT_FEE_PCT   = 0.029;   // 2.9% Shopify Payments
const PAYMENT_FEE_FIXED = 0.30;    // $0.30 per transaction
const PLATFORM_FEE_PCT  = 0.02;    // 2% platform/overhead
const PSYCHOLOGICAL_ENDINGS = [0.99, 0.95, 0.97];

function psychologicalPrice(raw: number): number {
  const base = Math.floor(raw);
  const ending = PSYCHOLOGICAL_ENDINGS.find(e => base + e >= raw) ?? 0.99;
  return parseFloat((base + ending).toFixed(2));
}

export class TopDawgShopifyUsaQualificationService {
  evaluate(input: {
    wholesaleCostUsd:    number;
    shippingEstimateUsd: number;
    msrpUsd?:            number;
    minMarginPct:        number;
    minProfitUsd:        number;
    maxShippingUsd:      number;
    minCostUsd:          number;
  }): TopDawgShopifyUsaQualificationResult {
    const { wholesaleCostUsd, shippingEstimateUsd, msrpUsd, minMarginPct, minProfitUsd, maxShippingUsd, minCostUsd } = input;

    if (wholesaleCostUsd < minCostUsd) {
      return { approved: false, reason: `Cost $${wholesaleCostUsd.toFixed(2)} below minimum $${minCostUsd.toFixed(2)}`, pricing: this.zeroBreakdown() };
    }

    if (shippingEstimateUsd > maxShippingUsd) {
      return { approved: false, reason: `Shipping $${shippingEstimateUsd.toFixed(2)} exceeds max $${maxShippingUsd.toFixed(2)}`, pricing: this.zeroBreakdown() };
    }

    // Calculate price needed to hit target margin
    const baseTotal = wholesaleCostUsd + shippingEstimateUsd;
    // suggestedPrice so that margin = (price - totalCost) / price >= minMarginPct/100
    // totalCost = wholesale + shipping + paymentFee(price) + platformFee(price)
    // paymentFee = price * 0.029 + 0.30
    // platformFee = price * 0.02
    // totalCost = baseTotal + price*(0.029+0.02) + 0.30
    // margin = (price - totalCost) / price = minMarginPct/100
    // price*(1 - 0.049) - baseTotal - 0.30 = price * minMarginPct/100
    // price*(1 - 0.049 - minMarginPct/100) = baseTotal + 0.30
    const targetMarginDec = minMarginPct / 100;
    const denominator = 1 - PAYMENT_FEE_PCT - PLATFORM_FEE_PCT - targetMarginDec;
    if (denominator <= 0) {
      return { approved: false, reason: 'Target margin too high to calculate', pricing: this.zeroBreakdown() };
    }

    const rawPrice = (baseTotal + PAYMENT_FEE_FIXED) / denominator;
    const suggestedPriceUsd = psychologicalPrice(rawPrice);

    const paymentFeeUsd  = parseFloat((suggestedPriceUsd * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED).toFixed(4));
    const platformFeeUsd = parseFloat((suggestedPriceUsd * PLATFORM_FEE_PCT).toFixed(4));
    const totalCostUsd   = parseFloat((wholesaleCostUsd + shippingEstimateUsd + paymentFeeUsd + platformFeeUsd).toFixed(4));
    const profitUsd      = parseFloat((suggestedPriceUsd - totalCostUsd).toFixed(4));
    const marginPct      = parseFloat(((profitUsd / suggestedPriceUsd) * 100).toFixed(2));

    // compare_at = MSRP if available, else 40% above suggested
    const compareAtPriceUsd = msrpUsd
      ? parseFloat(msrpUsd.toFixed(2))
      : parseFloat((suggestedPriceUsd * 1.40).toFixed(2));

    const pricing: TopDawgShopifyUsaPricingBreakdown = {
      wholesaleCostUsd, shippingEstimateUsd, paymentFeeUsd, platformFeeUsd,
      totalCostUsd, suggestedPriceUsd, compareAtPriceUsd, marginPct, profitUsd,
    };

    if (profitUsd < minProfitUsd) {
      return { approved: false, reason: `Profit $${profitUsd.toFixed(2)} below minimum $${minProfitUsd.toFixed(2)}`, pricing };
    }

    if (marginPct < minMarginPct) {
      return { approved: false, reason: `Margin ${marginPct.toFixed(1)}% below minimum ${minMarginPct}%`, pricing };
    }

    return { approved: true, reason: `Approved — ${marginPct.toFixed(1)}% margin, $${profitUsd.toFixed(2)} profit`, pricing };
  }

  private zeroBreakdown(): TopDawgShopifyUsaPricingBreakdown {
    return { wholesaleCostUsd: 0, shippingEstimateUsd: 0, paymentFeeUsd: 0, platformFeeUsd: 0, totalCostUsd: 0, suggestedPriceUsd: 0, compareAtPriceUsd: 0, marginPct: 0, profitUsd: 0 };
  }
}

export const topDawgShopifyUsaQualificationService = new TopDawgShopifyUsaQualificationService();
