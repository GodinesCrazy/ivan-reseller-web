import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';

export interface PricingBreakdown {
  supplierCostUsd: number;
  shippingCostUsd: number;
  totalCostUsd: number;
  paymentProcessingFeeUsd: number; // For non-Shopify-Payments e.g., PayPal Express
  targetProfitUsd: number;
  suggestedSellPriceUsd: number;
}

export class CjShopifyUsaQualificationService {
  async evaluate(userId: number, cjCostUsd: number, estimatedShippingUsd: number) {
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    
    // Model realistic fees since Shopify Payments is blocked in Chile by default. 
    // We assume typical cross-border PayPal Express: ~5.4% + 0.30 fixed
    const providerFeePct = Number(settings.defaultPaymentFeePct ?? 5.4);
    const providerFeeFixed = Number(settings.defaultPaymentFixedFeeUsd ?? 0.30);
    const marginPct = Number(settings.minMarginPct ?? 15);

    const totalCostUsd = cjCostUsd + estimatedShippingUsd;
    
    // Math to solve suggested price:
    // Profit = Price - Cost - (Price * providerFeePct / 100) - providerFeeFixed
    // Target Profit = Price * marginPct / 100
    // Price = (Cost + providerFeeFixed) / (1 - providerFeePct/100 - marginPct/100)
    
    const combinedPctDivisor = 1 - (providerFeePct / 100) - (marginPct / 100);
    const suggestedSellPriceUsd = combinedPctDivisor > 0 
      ? (totalCostUsd + providerFeeFixed) / combinedPctDivisor
      : totalCostUsd * 2; // Fallback if percentages are weird

    const targetProfitUsd = suggestedSellPriceUsd * (marginPct / 100);
    const paymentProcessingFeeUsd = (suggestedSellPriceUsd * (providerFeePct / 100)) + providerFeeFixed;

    return {
      decision: 'APPROVED',
      breakdown: {
        supplierCostUsd: cjCostUsd,
        shippingCostUsd: estimatedShippingUsd,
        totalCostUsd,
        paymentProcessingFeeUsd,
        targetProfitUsd,
        suggestedSellPriceUsd,
      } as PricingBreakdown
    };
  }
}

export const cjShopifyUsaQualificationService = new CjShopifyUsaQualificationService();
