/**
 * CANONICAL COST ENGINE — Única Fuente de Verdad del Cálculo Económico
 *
 * FASE 0 — Fix #1: Unificación del motor económico
 * Reemplaza la divergencia entre cost-calculator.service.ts y profit-guard.service.ts.
 *
 * Regla fundamental: TODO cálculo de margen/costo/profit en el sistema
 * debe pasar por este servicio. No se permite calcular costos en otro lugar.
 *
 * Correcciones aplicadas vs. implementaciones previas:
 *  1. Payment fee unificado: 3.49% + USD 0.49 fijo (estándar PayPal Business)
 *  2. Marketplace fees reales por marketplace + región (no flat 15%)
 *  3. Import duties activados desde tax-calculator.service.ts (no default 0)
 *  4. FX conversion segura: falla explícitamente con warning, nunca silenciosa
 *  5. Buffer de riesgo configurable (devoluciones + chargebacks)
 *  6. Breakdown auditado: cada componente nombrado y trazable
 */

import { trace } from '../utils/boot-trace';
trace('loading canonical-cost-engine.service');

import fxService from './fx.service';
import taxCalculatorService from './tax-calculator.service';
import { getDefaultShippingCost } from '../utils/shipping.utils';
import { logger } from '../config/logger';

// ─── Tipos Públicos ───────────────────────────────────────────────────────────

export type SupportedMarketplace = 'ebay' | 'amazon' | 'mercadolibre';
export type SupportedRegion = string; // ISO-2: 'US', 'CL', 'MX', 'AR', 'BR', 'UK', 'DE', etc.

export interface CanonicalCostInput {
  /** Precio del producto en el proveedor (AliExpress), en supplierCurrency */
  supplierPriceRaw: number;
  supplierCurrency: string;

  /** Moneda en que se vende en el marketplace */
  saleCurrency: string;

  /** Precio de venta en saleCurrency (si ya conocido; si no, se estima con pricing engine) */
  salePriceRaw?: number;

  /** Costo de envío al cliente en saleCurrency (si omitido usa default 5.99 USD convertido) */
  shippingToCustomerRaw?: number;

  marketplace: SupportedMarketplace;

  /** Código ISO-2 del país destino (para fees regionales y tax) */
  region: SupportedRegion;

  /** Override tasa FX manual (útil si la API FX no está disponible) */
  fxRateOverride?: number;

  /** Fee de listing promovido (porcentaje, ej: 0.02 para 2%) */
  promotedListingFeePct?: number;

  /** Otros costos ad-hoc en USD */
  otherCostsUsd?: number;

  /** Tasa de riesgo de devolución (default: RETURN_RISK_PCT env o 0.02) */
  returnRiskPct?: number;

  /** Tasa de riesgo de chargeback (default: CHARGEBACK_RISK_PCT env o 0.01) */
  chargebackRiskPct?: number;

  /** Si true, no incluye import duties (ej: si el proveedor ya los paga - raro) */
  skipImportDuties?: boolean;
}

export interface CanonicalCostBreakdown {
  supplierCostUsd: number;
  shippingToCustomerUsd: number;
  marketplaceFeeUsd: number;
  paymentFeeUsd: number;         // 3.49% + $0.49 fijo
  importDutiesUsd: number;       // IVA + arancel por país destino
  returnRiskUsd: number;
  chargebackRiskUsd: number;
  promotedListingFeeUsd: number;
  otherCostsUsd: number;
  totalCostUsd: number;
}

export interface CanonicalCostResult {
  success: boolean;

  /** Precio venta usado (en USD) */
  salePriceUsd: number;

  breakdown: CanonicalCostBreakdown;

  netProfitUsd: number;
  marginPct: number;       // (netProfit / salePrice) * 100
  roi: number;             // (netProfit / totalCost) * 100

  /** true si el margin >= mínimo configurado */
  isViable: boolean;

  /**
   * Advertencias para mostrar en UI / guardar en breakdown de auditoría.
   * Nunca ocultar estas advertencias — son datos para el operador.
   */
  warnings: string[];

  /** Tasa FX usada (supplierCurrency → USD) */
  fxRateUsed: number;

  /** Fuente de la tasa FX */
  fxSource: 'live' | 'seed_fallback' | 'override' | 'same_currency';

  error?: string;
}

// ─── Constantes / Configuración ──────────────────────────────────────────────

/** Fees reales por marketplace y región.
 *  Fuente: páginas oficiales de fees verificadas 2025.
 *  Actualizar cuando los marketplaces cambien sus estructuras de fees.
 */
const MARKETPLACE_FEES: Record<SupportedMarketplace, Record<string, number>> = {
  ebay: {
    default: 0.1285,  // eBay US: 12.85% Final Value Fee (categoría general)
    US: 0.1285,
    UK: 0.1285,
    DE: 0.1285,
    AU: 0.1285,
    CA: 0.1285,
  },
  amazon: {
    default: 0.15,    // Amazon: 15% referral fee categoría general
    US: 0.15,
    UK: 0.15,
    DE: 0.15,
    CA: 0.15,
  },
  mercadolibre: {
    default: 0.139,   // MercadoLibre plan clásico (mayoría de países)
    MX: 0.139,
    CL: 0.139,
    AR: 0.139,
    CO: 0.139,
    PE: 0.139,
    UY: 0.139,
    BR: 0.16,         // Brasil tiene fee mayor (16%)
  },
};

/** Fee de PayPal Business estándar */
const PAYMENT_FEE_PCT = 0.0349;   // 3.49%
const PAYMENT_FEE_FIXED_USD = 0.49; // $0.49 fijo por transacción

/** Margen mínimo para considerar una oportunidad viable */
function getMinMarginPct(): number {
  return Number(process.env.MIN_OPPORTUNITY_MARGIN || '0.10');
}

function getReturnRiskPct(): number {
  return Number(process.env.RETURN_RISK_PCT || '0.02');
}

function getChargebackRiskPct(): number {
  return Number(process.env.CHARGEBACK_RISK_PCT || '0.01');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMarketplaceFee(marketplace: SupportedMarketplace, region: string): number {
  const fees = MARKETPLACE_FEES[marketplace];
  if (!fees) return 0.15;
  const regionUp = (region || '').toUpperCase();
  return fees[regionUp] ?? fees['default'] ?? 0.15;
}

/**
 * Conversión de moneda segura.
 * Si falla: usa seed rates (no null, no error silencioso).
 * Siempre registra la fuente en el resultado.
 */
function safeFxConvert(
  amount: number,
  from: string,
  to: string,
  overrideRate?: number
): { valueUsd: number; rate: number; source: 'live' | 'seed_fallback' | 'override' | 'same_currency'; warning?: string } {
  const fromUp = (from || 'USD').toUpperCase();
  const toUp = (to || 'USD').toUpperCase();

  if (fromUp === toUp) {
    return { valueUsd: amount, rate: 1, source: 'same_currency' };
  }

  if (overrideRate && overrideRate > 0) {
    return { valueUsd: amount * overrideRate, rate: overrideRate, source: 'override' };
  }

  try {
    const converted = fxService.convert(amount, fromUp, toUp);
    const ratesInfo = fxService.getRates();
    const rate = ratesInfo.rates[toUp] && ratesInfo.rates[fromUp]
      ? ratesInfo.rates[toUp] / ratesInfo.rates[fromUp]
      : 1;
    return { valueUsd: converted, rate, source: 'live' };
  } catch (e: any) {
    // Fallback a tasas seed (no silencioso — registramos el warning)
    try {
      const rates = fxService.getRates().rates;
      const rateFrom = rates[fromUp];
      const rateTo = rates[toUp];
      if (rateFrom && rateTo) {
        const rate = rateTo / rateFrom;
        const converted = amount * rate;
        return {
          valueUsd: converted,
          rate,
          source: 'seed_fallback',
          warning: `FX live conversion failed for ${fromUp}→${toUp} (${e?.message}). Using seed rate ${rate.toFixed(4)}. Verify FX accuracy.`,
        };
      }
    } catch {/* */}

    // Sin tasas disponibles: bloquear cálculo (no continuar con valor incorrecto)
    return {
      valueUsd: 0,
      rate: 0,
      source: 'seed_fallback',
      warning: `FX conversion failed for ${fromUp}→${toUp} — no seed rates available. Cannot compute reliable cost. Review FX service.`,
    };
  }
}

// ─── Motor Principal ──────────────────────────────────────────────────────────

/**
 * Calcula el costo total, margen y profit de forma canónica.
 *
 * Todos los importes internos se trabajan en USD para consistencia.
 * El breakdown final es en USD y es auditado/persistible.
 */
export function computeCanonicalCost(input: CanonicalCostInput): CanonicalCostResult {
  const warnings: string[] = [];

  // ─── 1. Convertir supplier cost a USD ─────────────────────────────────────
  const {
    valueUsd: supplierCostUsd,
    rate: fxRateUsed,
    source: fxSource,
    warning: fxWarning,
  } = safeFxConvert(input.supplierPriceRaw, input.supplierCurrency, 'USD', input.fxRateOverride);

  if (fxWarning) warnings.push(fxWarning);
  if (fxSource === 'seed_fallback') {
    warnings.push(`FX seed rate used for ${input.supplierCurrency}→USD. Actual cost may differ.`);
  }
  if (supplierCostUsd <= 0) {
    return {
      success: false,
      salePriceUsd: 0,
      breakdown: {
        supplierCostUsd: 0, shippingToCustomerUsd: 0, marketplaceFeeUsd: 0,
        paymentFeeUsd: 0, importDutiesUsd: 0, returnRiskUsd: 0,
        chargebackRiskUsd: 0, promotedListingFeeUsd: 0, otherCostsUsd: 0,
        totalCostUsd: 0,
      },
      netProfitUsd: 0, marginPct: 0, roi: 0, isViable: false,
      warnings, fxRateUsed: 0, fxSource,
      error: `Cannot convert supplier price to USD (${input.supplierCurrency}→USD). FX unavailable.`,
    };
  }

  // ─── 2. Convertir sale price a USD ────────────────────────────────────────
  let salePriceUsd = 0;
  if (input.salePriceRaw && input.salePriceRaw > 0) {
    const { valueUsd: sp, warning: spWarn } = safeFxConvert(
      input.salePriceRaw, input.saleCurrency, 'USD', input.fxRateOverride
    );
    if (spWarn) warnings.push(spWarn);
    salePriceUsd = sp;
  }

  // ─── 3. Shipping al cliente ───────────────────────────────────────────────
  let shippingToCustomerUsd = 0;
  if (input.shippingToCustomerRaw != null && input.shippingToCustomerRaw >= 0) {
    const { valueUsd: sh } = safeFxConvert(
      input.shippingToCustomerRaw, input.saleCurrency, 'USD', input.fxRateOverride
    );
    shippingToCustomerUsd = sh;
  } else {
    shippingToCustomerUsd = getDefaultShippingCost(); // default 5.99 USD
    warnings.push(`Shipping cost not provided. Using default USD ${shippingToCustomerUsd.toFixed(2)}.`);
  }

  // ─── 4. Marketplace fee ────────────────────────────────────────────────────
  // Se calcula sobre el salePrice; si no hay salePrice aún, se aplica después.
  const marketplaceFeeRate = getMarketplaceFee(input.marketplace, input.region);
  const marketplaceFeeUsd = salePriceUsd > 0 ? salePriceUsd * marketplaceFeeRate : 0;

  // ─── 5. Payment fee (PayPal Business: 3.49% + $0.49 fijo) ─────────────────
  const paymentFeeUsd = salePriceUsd > 0
    ? (salePriceUsd * PAYMENT_FEE_PCT) + PAYMENT_FEE_FIXED_USD
    : PAYMENT_FEE_FIXED_USD; // al menos el fijo

  // ─── 6. Import duties desde tax-calculator ────────────────────────────────
  let importDutiesUsd = 0;
  if (!input.skipImportDuties) {
    const countryCode = regionToCountryCode(input.region);
    const taxResult = taxCalculatorService.calculateTaxDetailed(
      supplierCostUsd,
      shippingToCustomerUsd,
      countryCode
    );
    importDutiesUsd = taxResult.totalTax;
    if (importDutiesUsd === 0 && ['CL', 'MX', 'AR', 'BR', 'CO', 'PE'].includes(countryCode)) {
      warnings.push(`Import duties computed as $0 for ${countryCode}. Verify tax-calculator config.`);
    }
  }

  // ─── 7. Risk buffers ──────────────────────────────────────────────────────
  const returnRiskPct = input.returnRiskPct ?? getReturnRiskPct();
  const chargebackRiskPct = input.chargebackRiskPct ?? getChargebackRiskPct();
  const returnRiskUsd = salePriceUsd > 0 ? salePriceUsd * returnRiskPct : 0;
  const chargebackRiskUsd = salePriceUsd > 0 ? salePriceUsd * chargebackRiskPct : 0;

  // ─── 8. Otros costos ──────────────────────────────────────────────────────
  const promotedListingFeeUsd = salePriceUsd > 0 && input.promotedListingFeePct
    ? salePriceUsd * input.promotedListingFeePct
    : 0;
  const otherCostsUsd = input.otherCostsUsd ?? 0;

  // ─── 9. Total cost ────────────────────────────────────────────────────────
  const totalCostUsd =
    supplierCostUsd +
    shippingToCustomerUsd +
    marketplaceFeeUsd +
    paymentFeeUsd +
    importDutiesUsd +
    returnRiskUsd +
    chargebackRiskUsd +
    promotedListingFeeUsd +
    otherCostsUsd;

  // ─── 10. Profit y margen ──────────────────────────────────────────────────
  const netProfitUsd = salePriceUsd > 0 ? salePriceUsd - totalCostUsd : -totalCostUsd;
  const marginPct = salePriceUsd > 0 ? (netProfitUsd / salePriceUsd) * 100 : -100;
  const roi = totalCostUsd > 0 ? (netProfitUsd / totalCostUsd) * 100 : 0;
  const isViable = marginPct >= (getMinMarginPct() * 100);

  const breakdown: CanonicalCostBreakdown = {
    supplierCostUsd: round2(supplierCostUsd),
    shippingToCustomerUsd: round2(shippingToCustomerUsd),
    marketplaceFeeUsd: round2(marketplaceFeeUsd),
    paymentFeeUsd: round2(paymentFeeUsd),
    importDutiesUsd: round2(importDutiesUsd),
    returnRiskUsd: round2(returnRiskUsd),
    chargebackRiskUsd: round2(chargebackRiskUsd),
    promotedListingFeeUsd: round2(promotedListingFeeUsd),
    otherCostsUsd: round2(otherCostsUsd),
    totalCostUsd: round2(totalCostUsd),
  };

  logger.debug('[CANONICAL-COST] Computed', {
    marketplace: input.marketplace,
    region: input.region,
    supplierCostUsd: round2(supplierCostUsd),
    salePriceUsd: round2(salePriceUsd),
    totalCostUsd: round2(totalCostUsd),
    netProfitUsd: round2(netProfitUsd),
    marginPct: round2(marginPct),
    fxSource,
    warnings: warnings.length,
  });

  return {
    success: true,
    salePriceUsd: round2(salePriceUsd),
    breakdown,
    netProfitUsd: round2(netProfitUsd),
    marginPct: round2(marginPct),
    roi: round2(roi),
    isViable,
    warnings,
    fxRateUsed: round4(fxRateUsed),
    fxSource,
  };
}

/**
 * Calcula el precio mínimo de venta para alcanzar un margen objetivo.
 * Útil en el pricing engine para verificar si el precio sugerido es suficiente.
 *
 * Fórmula: salePrice = totalFixedCosts / (1 - variableRates)
 * donde variableRates = marketplaceFeeRate + paymentFeePct + returnRisk + chargebackRisk
 */
export function computeMinimumViablePrice(
  input: Omit<CanonicalCostInput, 'salePriceRaw'> & { targetMarginPct: number }
): { minSalePriceUsd: number; breakdown: CanonicalCostBreakdown; warnings: string[] } {
  const warnings: string[] = [];

  const { valueUsd: supplierCostUsd, warning: fxWarn } = safeFxConvert(
    input.supplierPriceRaw, input.supplierCurrency, 'USD', input.fxRateOverride
  );
  if (fxWarn) warnings.push(fxWarn);

  const shippingUsd = input.shippingToCustomerRaw != null
    ? input.shippingToCustomerRaw
    : getDefaultShippingCost();

  const countryCode = regionToCountryCode(input.region);
  const taxResult = taxCalculatorService.calculateTaxDetailed(
    supplierCostUsd, shippingUsd, countryCode
  );
  const importDutiesUsd = input.skipImportDuties ? 0 : taxResult.totalTax;

  const marketplaceFeeRate = getMarketplaceFee(input.marketplace, input.region);
  const returnRiskPct = input.returnRiskPct ?? getReturnRiskPct();
  const chargebackRiskPct = input.chargebackRiskPct ?? getChargebackRiskPct();
  const promotedPct = input.promotedListingFeePct ?? 0;
  const targetMargin = input.targetMarginPct / 100;

  // Variable rate over sale price
  const variableRate = marketplaceFeeRate + PAYMENT_FEE_PCT + returnRiskPct + chargebackRiskPct + promotedPct + targetMargin;

  // Fixed costs independent of sale price
  const fixedCosts = supplierCostUsd + shippingUsd + importDutiesUsd + PAYMENT_FEE_FIXED_USD + (input.otherCostsUsd ?? 0);

  // minSalePrice * (1 - variableRate) = fixedCosts  =>  minSalePrice = fixedCosts / (1 - variableRate)
  const denominator = 1 - variableRate;
  if (denominator <= 0) {
    warnings.push('Target margin + fees exceed 100% — cannot compute minimum price.');
    return { minSalePriceUsd: 0, breakdown: {} as CanonicalCostBreakdown, warnings };
  }

  const minSalePriceUsd = fixedCosts / denominator;
  const result = computeCanonicalCost({ ...input, salePriceRaw: minSalePriceUsd });
  return {
    minSalePriceUsd: round2(minSalePriceUsd),
    breakdown: result.breakdown,
    warnings: [...warnings, ...result.warnings],
  };
}

// ─── Tabla de fees exportada (para uso en tests y otros servicios) ────────────
export { MARKETPLACE_FEES, PAYMENT_FEE_PCT, PAYMENT_FEE_FIXED_USD, getMarketplaceFee };

// ─── Helpers internos ─────────────────────────────────────────────────────────
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

/**
 * Mapeo región → código ISO-2 de país para tax calculator.
 * Cubre las regiones soportadas actualmente en el sistema.
 */
function regionToCountryCode(region: string): string {
  const map: Record<string, string> = {
    CL: 'CL', MX: 'MX', AR: 'AR', BR: 'BR', CO: 'CO', PE: 'PE', UY: 'UY',
    US: 'US', UK: 'UK', DE: 'DE', FR: 'FR', ES: 'ES', IT: 'IT',
    AU: 'AU', CA: 'CA', JP: 'JP', KR: 'KR', SG: 'SG',
  };
  const up = (region || '').toUpperCase();
  return map[up] || up;
}

const canonicalCostEngine = { computeCanonicalCost, computeMinimumViablePrice, getMarketplaceFee };
export default canonicalCostEngine;
