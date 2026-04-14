/**
 * CJ → eBay USA — motor de pricing (FASE 3C).
 * Solo matemática y defaults documentados; sin AliExpress, sin ebay-us-delivery-estimate,
 * sin MarketplaceService.publishToEbay.
 *
 * Modelo de fees (porcentajes sobre precio de venta P):
 * - ebayFeeUsd = P * (ebayFeePct/100)
 * - paymentFeeUsd = P * (paymentFeePct/100) + paymentFixedFeeUsd
 * - incidentBufferUsd = (supplierCostUsd + shippingUsd) * (incidentBufferPct/100)
 *
 * Utilidad neta:
 *   netProfitUsd = P - supplierCostUsd - shippingUsd - ebayFeeUsd - paymentFeeUsd - incidentBufferUsd
 *   netMarginPct = (netProfitUsd / P) * 100   (si P > 0)
 *
 * Precio mínimo para cumplir minMarginPct y minProfitUsd (ambos configurados):
 *   C = supplierCostUsd + shippingUsd + paymentFixedFeeUsd + incidentBufferUsd
 *   P >= C / (1 - r_e - r_p - m/100)   con m = minMarginPct
 *   P >= (C + minProfitUsd) / (1 - r_e - r_p)
 * Tomar el máximo de los cotizados que sean finitos y > 0.
 *
 * Defaults cuando la cuenta no tiene % en BD (solo para preview / cálculo intermedio):
 * - Ver PRICING_DEFAULT_* abajo — son **supuestos operativos** hasta que el usuario guarde config.
 */

import { Prisma } from '@prisma/client';

/** ~13.25% FVF orientativo categoría general; ajustar en `defaultEbayFeePct` en BD. */
export const PRICING_DEFAULT_EBAY_FEE_PCT = 13.25;

/** ~2.9% + fijo típico pasarela (no es dato AliExpress; solo placeholder). */
export const PRICING_DEFAULT_PAYMENT_FEE_PCT = 2.9;
export const PRICING_DEFAULT_PAYMENT_FIXED_FEE_USD = 0.3;

/** Colchón incidentes % sobre (costo producto + envío) si no hay `incidentBufferPct` en BD. */
export const PRICING_DEFAULT_INCIDENT_BUFFER_PCT = 2;

export interface CjPricingFeeSettingsInput {
  incidentBufferPct: number | null;
  defaultEbayFeePct: number | null;
  defaultPaymentFeePct: number | null;
  defaultPaymentFixedFeeUsd: number | null;
}

export interface CjPricingFeeSettingsResolved extends CjPricingFeeSettingsInput {
  /** Campos efectivos tras aplicar defaults documentados. */
  ebayFeePctEffective: number;
  paymentFeePctEffective: number;
  paymentFixedFeeUsdEffective: number;
  incidentBufferPctEffective: number;
  defaultsApplied: Record<string, number>;
}

export function resolveFeeSettings(row: CjPricingFeeSettingsInput): CjPricingFeeSettingsResolved {
  const defaultsApplied: Record<string, number> = {};
  let ebay = row.defaultEbayFeePct;
  if (ebay == null || !Number.isFinite(ebay)) {
    ebay = PRICING_DEFAULT_EBAY_FEE_PCT;
    defaultsApplied.defaultEbayFeePct = PRICING_DEFAULT_EBAY_FEE_PCT;
  }
  let payPct = row.defaultPaymentFeePct;
  if (payPct == null || !Number.isFinite(payPct)) {
    payPct = PRICING_DEFAULT_PAYMENT_FEE_PCT;
    defaultsApplied.defaultPaymentFeePct = PRICING_DEFAULT_PAYMENT_FEE_PCT;
  }
  let payFix = row.defaultPaymentFixedFeeUsd;
  if (payFix == null || !Number.isFinite(payFix)) {
    payFix = PRICING_DEFAULT_PAYMENT_FIXED_FEE_USD;
    defaultsApplied.defaultPaymentFixedFeeUsd = PRICING_DEFAULT_PAYMENT_FIXED_FEE_USD;
  }
  let inc = row.incidentBufferPct;
  if (inc == null || !Number.isFinite(inc)) {
    inc = PRICING_DEFAULT_INCIDENT_BUFFER_PCT;
    defaultsApplied.incidentBufferPct = PRICING_DEFAULT_INCIDENT_BUFFER_PCT;
  }
  return {
    ...row,
    ebayFeePctEffective: ebay,
    paymentFeePctEffective: payPct,
    paymentFixedFeeUsdEffective: payFix,
    incidentBufferPctEffective: inc,
    defaultsApplied,
  };
}

export interface CjPricingBreakdownInput {
  supplierCostUsd: number;
  shippingUsd: number;
  listPriceUsd: number;
  fees: CjPricingFeeSettingsResolved;
}

export interface CjPricingBreakdown {
  supplierCostUsd: number;
  shippingUsd: number;
  ebayFeeUsd: number;
  paymentFeeUsd: number;
  incidentBufferUsd: number;
  totalCostUsd: number;
  listPriceUsd: number;
  netProfitUsd: number;
  netMarginPct: number | null;
  suggestedPriceUsd: number;
  minimumAllowedPriceUsd: number;
  /** Supuestos de fee si la cuenta no tenía valores en BD. */
  feeDefaultsApplied: Record<string, number>;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeBreakdownAtListPrice(input: CjPricingBreakdownInput): Omit<
  CjPricingBreakdown,
  'suggestedPriceUsd' | 'minimumAllowedPriceUsd'
> & { feeDefaultsApplied: Record<string, number> } {
  const { supplierCostUsd: S, shippingUsd: H, listPriceUsd: P, fees } = input;
  const rE = fees.ebayFeePctEffective / 100;
  const rP = fees.paymentFeePctEffective / 100;
  const Ffix = fees.paymentFixedFeeUsdEffective;
  const incRate = fees.incidentBufferPctEffective / 100;

  const incidentBufferUsd = roundMoney((S + H) * incRate);
  const ebayFeeUsd = roundMoney(P * rE);
  const paymentFeeUsd = roundMoney(P * rP + Ffix);
  const totalCostUsd = roundMoney(S + H + ebayFeeUsd + paymentFeeUsd + incidentBufferUsd);
  const netProfitUsd = roundMoney(P - totalCostUsd);
  const netMarginPct = P > 0 ? roundMoney((netProfitUsd / P) * 100) : null;

  return {
    supplierCostUsd: roundMoney(S),
    shippingUsd: roundMoney(H),
    ebayFeeUsd,
    paymentFeeUsd,
    incidentBufferUsd,
    totalCostUsd,
    listPriceUsd: roundMoney(P),
    netProfitUsd,
    netMarginPct,
    feeDefaultsApplied: { ...fees.defaultsApplied },
  };
}

/**
 * Precio mínimo que satisface minMarginPct (sobre P) y minProfitUsd simultáneamente.
 */
export function computeMinimumListPrice(params: {
  supplierCostUsd: number;
  shippingUsd: number;
  fees: CjPricingFeeSettingsResolved;
  minMarginPct: number | null;
  minProfitUsd: number | null;
}): { minimumAllowedPriceUsd: number; feasible: boolean; reason?: string } {
  const S = params.supplierCostUsd;
  const H = params.shippingUsd;
  const { fees } = params;
  const rE = fees.ebayFeePctEffective / 100;
  const rP = fees.paymentFeePctEffective / 100;
  const Ffix = fees.paymentFixedFeeUsdEffective;
  const incRate = fees.incidentBufferPctEffective / 100;
  const incidentBufferUsd = (S + H) * incRate;
  const C = S + H + Ffix + incidentBufferUsd;

  const candidates: number[] = [];

  const m = params.minMarginPct;
  if (m != null && Number.isFinite(m)) {
    const minM = m / 100;
    const denom = 1 - rE - rP - minM;
    if (denom <= 0.001) {
      return { minimumAllowedPriceUsd: NaN, feasible: false, reason: 'DENOMINATOR_NON_POSITIVE_MARGIN' };
    }
    candidates.push(C / denom);
  }

  const pMin = params.minProfitUsd;
  if (pMin != null && Number.isFinite(pMin)) {
    const denom = 1 - rE - rP;
    if (denom <= 0.001) {
      return { minimumAllowedPriceUsd: NaN, feasible: false, reason: 'DENOMINATOR_NON_POSITIVE_PROFIT' };
    }
    candidates.push((C + pMin) / denom);
  }

  if (candidates.length === 0) {
    const denom = 1 - rE - rP;
    if (denom <= 0.001) {
      return { minimumAllowedPriceUsd: NaN, feasible: false, reason: 'DENOMINATOR_NON_POSITIVE' };
    }
    return { minimumAllowedPriceUsd: roundMoney(C / denom), feasible: true };
  }

  const raw = Math.max(...candidates);
  if (!Number.isFinite(raw) || raw <= 0) {
    return { minimumAllowedPriceUsd: NaN, feasible: false, reason: 'INVALID_MIN_PRICE' };
  }
  return { minimumAllowedPriceUsd: roundMoney(raw), feasible: true };
}

export function computeFullPricingPreview(params: {
  supplierCostUsd: number;
  shippingUsd: number;
  feeRow: CjPricingFeeSettingsInput;
  minMarginPct: number | null;
  minProfitUsd: number | null;
}): CjPricingBreakdown {
  const fees = resolveFeeSettings(params.feeRow);
  const minRes = computeMinimumListPrice({
    supplierCostUsd: params.supplierCostUsd,
    shippingUsd: params.shippingUsd,
    fees,
    minMarginPct: params.minMarginPct,
    minProfitUsd: params.minProfitUsd,
  });

  const minimumAllowedPriceUsd = minRes.feasible ? minRes.minimumAllowedPriceUsd : roundMoney(
    params.supplierCostUsd + params.shippingUsd + fees.paymentFixedFeeUsdEffective
  );
  const suggestedPriceUsd = roundMoney(Math.max(minimumAllowedPriceUsd, 0.01));

  const atSuggested = computeBreakdownAtListPrice({
    supplierCostUsd: params.supplierCostUsd,
    shippingUsd: params.shippingUsd,
    listPriceUsd: suggestedPriceUsd,
    fees,
  });

  return {
    ...atSuggested,
    suggestedPriceUsd,
    minimumAllowedPriceUsd,
  };
}

export function prismaSettingsToFeeInput(row: {
  incidentBufferPct: Prisma.Decimal | null;
  defaultEbayFeePct: Prisma.Decimal | null;
  defaultPaymentFeePct: Prisma.Decimal | null;
  defaultPaymentFixedFeeUsd: Prisma.Decimal | null;
}): CjPricingFeeSettingsInput {
  return {
    incidentBufferPct: row.incidentBufferPct != null ? Number(row.incidentBufferPct) : null,
    defaultEbayFeePct: row.defaultEbayFeePct != null ? Number(row.defaultEbayFeePct) : null,
    defaultPaymentFeePct: row.defaultPaymentFeePct != null ? Number(row.defaultPaymentFeePct) : null,
    defaultPaymentFixedFeeUsd:
      row.defaultPaymentFixedFeeUsd != null ? Number(row.defaultPaymentFixedFeeUsd) : null,
  };
}

/** Evita `NaN` en JSON (Express los serializa mal). */
export function pricingBreakdownForResponse(b: CjPricingBreakdown): Record<string, unknown> {
  const n = (x: number) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    supplierCostUsd: n(b.supplierCostUsd),
    shippingUsd: n(b.shippingUsd),
    ebayFeeUsd: n(b.ebayFeeUsd),
    paymentFeeUsd: n(b.paymentFeeUsd),
    incidentBufferUsd: n(b.incidentBufferUsd),
    totalCostUsd: n(b.totalCostUsd),
    listPriceUsd: n(b.listPriceUsd),
    netProfitUsd: n(b.netProfitUsd),
    netMarginPct:
      b.netMarginPct != null && Number.isFinite(b.netMarginPct) ? b.netMarginPct : null,
    suggestedPriceUsd: n(b.suggestedPriceUsd),
    minimumAllowedPriceUsd: n(b.minimumAllowedPriceUsd),
    feeDefaultsApplied: b.feeDefaultsApplied,
  };
}
