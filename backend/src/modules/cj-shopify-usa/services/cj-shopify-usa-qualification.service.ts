import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import {
  CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD,
  resolveMaxSellPriceUsd,
} from './cj-shopify-usa-policy.service';

export interface PricingBreakdown {
  supplierCostUsd: number;
  shippingCostUsd: number;
  incidentBufferUsd: number;
  totalCostUsd: number;
  paymentProcessingFeeUsd: number;
  targetProfitUsd: number;
  netProfitUsd: number;
  netMarginPct: number;
  suggestedSellPriceUsd: number;
}

export interface QualificationResult {
  decision: 'APPROVED' | 'REJECTED';
  reasons: string[];
  breakdown: PricingBreakdown;
}

const PRICING_DEFAULTS = {
  paymentFeePct: 5.4,           // PayPal Express cross-border
  paymentFixedFeeUsd: 0.30,     // Fixed fee per transaction
  incidentBufferPct: 3.0,       // Risk buffer on cost+shipping
  minMarginPct: 12,             // Operational default to avoid over-rejecting valid candidates
  minProfitUsd: 1.50,           // Operational default for low-ticket discovery phase
  maxShippingUsd: 15.00,        // Allow broader candidate set before operator filtering
  minCostUsd: 2.00,             // Minimum supplier cost to ensure sellable margin
  minSellPriceUsd: 9.99,        // Psychological floor for viable product
  maxSellPriceUsd: CJ_SHOPIFY_USA_DEFAULT_MAX_SELL_PRICE_USD,
} as const;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Redondeo psicológico para Shopify USA:
 * - Precios < $10: redondea a .99 (ej: $7.34 → $7.99)
 * - Precios $10-$30: redondea a .99 o .95 (ej: $14.20 → $14.99)
 * - Precios > $30: redondea a .99 (ej: $34.50 → $34.99)
 */
function applyPsychologicalRounding(price: number): number {
  if (price <= 0) return 0.99;

  const floor = Math.floor(price);
  const remainder = price - floor;

  // Si ya está cerca de .99, mantener
  if (remainder >= 0.95) {
    return floor + 0.99;
  }

  // Subir al siguiente .99
  let rounded = floor + 0.99;

  // Sanity: nunca bajar el precio, solo subir al punto psicológico
  if (rounded < price) {
    rounded = floor + 0.99;
  }

  return roundMoney(rounded);
}

export class CjShopifyUsaQualificationService {
  async evaluate(userId: number, cjCostUsd: number, estimatedShippingUsd: number): Promise<QualificationResult> {
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const reasons: string[] = [];

    // === CONFIGURACIÓN CON DEFAULTS MEJORADOS ===
    // safeNum: guard against NaN/null/undefined from settings.
    // Note: Number(null)=0 which is finite — must check null/undefined first.
    const safeNum = (v: unknown, fallback: number): number => {
      if (v === null || v === undefined) return fallback;
      const n = Number(v);
      return isFinite(n) ? n : fallback;
    };

    const providerFeePct    = safeNum(settings.defaultPaymentFeePct,      PRICING_DEFAULTS.paymentFeePct);
    const providerFeeFixed  = safeNum(settings.defaultPaymentFixedFeeUsd,  PRICING_DEFAULTS.paymentFixedFeeUsd);
    const incidentBufferPct = safeNum(settings.incidentBufferPct,          PRICING_DEFAULTS.incidentBufferPct);
    const marginPct         = safeNum(settings.minMarginPct,               PRICING_DEFAULTS.minMarginPct);
    const maxShippingUsd    = safeNum(settings.maxShippingUsd,             PRICING_DEFAULTS.maxShippingUsd);
    const maxSellPriceUsd   = resolveMaxSellPriceUsd(settings.maxSellPriceUsd);
    const minProfitUsd      = safeNum(settings.minProfitUsd,               PRICING_DEFAULTS.minProfitUsd);
    const minCostUsd        = safeNum(settings.minCostUsd,                 PRICING_DEFAULTS.minCostUsd);

    // === CÁLCULO DE COSTOS BASE ===
    const baseCostUsd = cjCostUsd + estimatedShippingUsd;

    // Buffer de incidentes: % sobre (costo + shipping) para cubrir riesgos
    const incidentBufferUsd = roundMoney(baseCostUsd * (incidentBufferPct / 100));

    // Costo total con buffer incluido
    const totalCostWithBufferUsd = roundMoney(baseCostUsd + incidentBufferUsd);

    // === REGLAS DE RECHAZO POR ECONOMÍA ===

    // 1. Rechazar si el shipping destruye la economía
    if (estimatedShippingUsd > maxShippingUsd) {
      reasons.push(`Shipping too expensive: $${estimatedShippingUsd.toFixed(2)} > max $${maxShippingUsd.toFixed(2)}`);
      return {
        decision: 'REJECTED',
        reasons,
        breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, 0, providerFeePct, providerFeeFixed, marginPct),
      };
    }

    // 2. Rechazar productos de costo muy bajo (difíciles de vender con margen sano)
    if (cjCostUsd < minCostUsd) {
      reasons.push(`Product cost too low: $${cjCostUsd.toFixed(2)} < $${minCostUsd.toFixed(2)} minimum`);
      return {
        decision: 'REJECTED',
        reasons,
        breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, 0, providerFeePct, providerFeeFixed, marginPct),
      };
    }

    // === FÓRMULA DE PRECIO SUGERIDO ===
    //
    // Profit = Price - TotalCostWithBuffer - (Price * Fee%) - FixedFee
    // Target Profit = Price * Margin%
    //
    // Despejando Price:
    // Price = (TotalCostWithBuffer + FixedFee) / (1 - Fee% - Margin%)

    const combinedPctDivisor = 1 - (providerFeePct / 100) - (marginPct / 100);

    let rawSuggestedPrice: number;
    if (combinedPctDivisor <= 0.001) {
      reasons.push('Fee and margin percentages exceed 100% - invalid configuration');
      return {
        decision: 'REJECTED',
        reasons,
        breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, 0, providerFeePct, providerFeeFixed, marginPct),
      };
    }

    rawSuggestedPrice = (totalCostWithBufferUsd + providerFeeFixed) / combinedPctDivisor;

    // === REDONDEO PSICOLÓGICO ===
    const suggestedSellPriceUsd = applyPsychologicalRounding(rawSuggestedPrice);

    // === RECHAZO POR PRECIO FUERA DE RANGO COMERCIAL ===
    if (suggestedSellPriceUsd < PRICING_DEFAULTS.minSellPriceUsd) {
      reasons.push(`Suggested price too low: $${suggestedSellPriceUsd.toFixed(2)} < $${PRICING_DEFAULTS.minSellPriceUsd} minimum`);
      return {
        decision: 'REJECTED',
        reasons,
        breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct),
      };
    }

    if (suggestedSellPriceUsd > maxSellPriceUsd) {
      reasons.push(`Suggested price too high: $${suggestedSellPriceUsd.toFixed(2)} > $${maxSellPriceUsd.toFixed(2)} maximum`);
      return {
        decision: 'REJECTED',
        reasons,
        breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct),
      };
    }

    // === CÁLCULO DE PROFIT REAL ===
    const paymentProcessingFeeUsd = roundMoney((suggestedSellPriceUsd * (providerFeePct / 100)) + providerFeeFixed);
    const totalAllCostsUsd = roundMoney(totalCostWithBufferUsd + paymentProcessingFeeUsd);
    const netProfitUsd = roundMoney(suggestedSellPriceUsd - totalAllCostsUsd);
    const netMarginPct = suggestedSellPriceUsd > 0 ? roundMoney((netProfitUsd / suggestedSellPriceUsd) * 100) : 0;

    // 3. Rechazar si el margen neto real es insuficiente
    if (netMarginPct < marginPct) {
      reasons.push(`Net margin too low: ${netMarginPct.toFixed(1)}% < ${marginPct.toFixed(1)}% minimum`);
      return {
        decision: 'REJECTED',
        reasons,
        breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct, netProfitUsd, netMarginPct),
      };
    }

    if (netProfitUsd < minProfitUsd) {
      reasons.push(`Net profit too low: $${netProfitUsd.toFixed(2)} < $${minProfitUsd.toFixed(2)} minimum`);
      return {
        decision: 'REJECTED',
        reasons,
        breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct, netProfitUsd, netMarginPct),
      };
    }

    // === APROBADO ===
    return {
      decision: 'APPROVED',
      reasons: ['Product meets all pricing criteria for Shopify USA'],
      breakdown: this.buildBreakdown(cjCostUsd, estimatedShippingUsd, incidentBufferUsd, suggestedSellPriceUsd, providerFeePct, providerFeeFixed, marginPct, netProfitUsd, netMarginPct),
    };
  }

  private buildBreakdown(
    supplierCostUsd: number,
    shippingCostUsd: number,
    incidentBufferUsd: number,
    suggestedSellPriceUsd: number,
    providerFeePct: number,
    providerFeeFixed: number,
    targetMarginPct: number,
    netProfitUsd?: number,
    netMarginPct?: number,
  ): PricingBreakdown {
    const paymentProcessingFeeUsd = roundMoney((suggestedSellPriceUsd * (providerFeePct / 100)) + providerFeeFixed);
    const totalCostUsd = roundMoney(supplierCostUsd + shippingCostUsd + incidentBufferUsd);
    const calculatedNetProfit = netProfitUsd ?? roundMoney(suggestedSellPriceUsd - totalCostUsd - paymentProcessingFeeUsd);
    const calculatedNetMargin = netMarginPct ?? (suggestedSellPriceUsd > 0 ? roundMoney((calculatedNetProfit / suggestedSellPriceUsd) * 100) : 0);
    const targetProfitUsd = roundMoney(suggestedSellPriceUsd * (targetMarginPct / 100));

    return {
      supplierCostUsd: roundMoney(supplierCostUsd),
      shippingCostUsd: roundMoney(shippingCostUsd),
      incidentBufferUsd,
      totalCostUsd,
      paymentProcessingFeeUsd,
      targetProfitUsd,
      netProfitUsd: calculatedNetProfit,
      netMarginPct: calculatedNetMargin,
      suggestedSellPriceUsd,
    };
  }
}

export const cjShopifyUsaQualificationService = new CjShopifyUsaQualificationService();
