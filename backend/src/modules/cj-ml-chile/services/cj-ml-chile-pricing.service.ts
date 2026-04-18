/**
 * CJ → ML Chile — motor de pricing (MVP).
 *
 * Modelo de costos:
 *   landedCostUsd = (supplierCostUsd + shippingUsd) * (1 + CL_IVA_RATE)
 *   mlFeeUsd      = listPriceUsd * (mlcFeePct / 100)
 *   mpPaymentUsd  = listPriceUsd * (mpPaymentFeePct / 100)
 *   incidentUsd   = landedCostUsd * (incidentBufferPct / 100)
 *   netProfitUsd  = listPriceUsd - landedCostUsd - mlFeeUsd - mpPaymentUsd - incidentUsd
 *   listPriceCLP  = round(listPriceUsd * fxRate)  [entero, sin decimales]
 *
 * IVA: 19% sobre producto + envío (régimen general importaciones bajo valor < UF 41).
 * FX: tasa usada + timestamp persistidos en cada evaluación.
 * No se hardcodea tasa. Si no hay tasa → evaluación bloqueada.
 */

import { CL_IVA_RATE, MLC_DEFAULT_FEE_PCT, MP_DEFAULT_PAYMENT_FEE_PCT, DEFAULT_INCIDENT_BUFFER_PCT } from '../cj-ml-chile.constants';
import fxService from '../../../services/fx.service';

function round2(n: number) { return Math.round(n * 100) / 100; }
function roundCLP(n: number) { return Math.round(n); }

export interface CjMlChileFeesInput {
  mlcFeePct: number | null;
  mpPaymentFeePct: number | null;
  incidentBufferPct: number | null;
}

export interface CjMlChileFeesResolved {
  mlcFeePct: number;
  mpPaymentFeePct: number;
  incidentBufferPct: number;
  defaultsApplied: Record<string, number>;
}

export function resolveMlChileFees(input: CjMlChileFeesInput): CjMlChileFeesResolved {
  const defaults: Record<string, number> = {};
  let mlc = input.mlcFeePct;
  if (mlc == null || !Number.isFinite(mlc)) { mlc = MLC_DEFAULT_FEE_PCT; defaults.mlcFeePct = MLC_DEFAULT_FEE_PCT; }
  let mp = input.mpPaymentFeePct;
  if (mp == null || !Number.isFinite(mp)) { mp = MP_DEFAULT_PAYMENT_FEE_PCT; defaults.mpPaymentFeePct = MP_DEFAULT_PAYMENT_FEE_PCT; }
  let inc = input.incidentBufferPct;
  if (inc == null || !Number.isFinite(inc)) { inc = DEFAULT_INCIDENT_BUFFER_PCT; defaults.incidentBufferPct = DEFAULT_INCIDENT_BUFFER_PCT; }
  return { mlcFeePct: mlc, mpPaymentFeePct: mp, incidentBufferPct: inc, defaultsApplied: defaults };
}

export interface CjMlChilePricingBreakdown {
  /** Costo CJ proveedor (USD, por unidad × qty). */
  supplierCostUsd: number;
  /** Costo envío CJ → Chile (USD). */
  shippingUsd: number;
  /** IVA 19% sobre (costo + envío). */
  ivaUsd: number;
  /** Costo aterrizado total = (costo + envío) × 1.19. */
  landedCostUsd: number;
  /** Fee ML Chile (% sobre precio venta). */
  mlFeeUsd: number;
  /** Fee Mercado Pago (% sobre precio venta). */
  mpPaymentFeeUsd: number;
  /** Buffer incidentes (% sobre costo aterrizado). */
  incidentBufferUsd: number;
  /** Suma de todos los costos. */
  totalCostUsd: number;
  /** Precio de lista en USD. */
  listPriceUsd: number;
  /** Precio de lista en CLP (entero). */
  listPriceCLP: number;
  /** Ganancia neta en USD. */
  netProfitUsd: number;
  /** Margen neto % sobre precio venta. null si P=0. */
  netMarginPct: number | null;
  /** Precio sugerido en USD (precio mínimo viable). */
  suggestedPriceUsd: number;
  /** Precio sugerido en CLP. */
  suggestedPriceCLP: number;
  /** Tasa FX CLP/USD usada. */
  fxRateCLPperUSD: number;
  /** Timestamp de la tasa FX. */
  fxRateAt: Date;
  /** Fuente de los fees (account | defaults | mixed). */
  feeSource: 'account' | 'defaults' | 'mixed';
  /** Fees defaults aplicados (si alguno). */
  feeDefaultsApplied: Record<string, number>;
  /** Cuántos fees vienen de cuenta configurada vs defaults. */
  feesResolved: CjMlChileFeesResolved;
  ivaRate: number;
}

export interface CjMlChilePricingInput {
  supplierCostUsd: number;
  shippingUsd: number;
  feesInput: CjMlChileFeesInput;
  minMarginPct: number | null;
  minProfitUsd: number | null;
  /** Override de precio de lista en USD (null = calcular mínimo). */
  listPriceUsdOverride?: number;
}

export interface CjMlChilePricingResult {
  ok: boolean;
  error?: string;
  breakdown?: CjMlChilePricingBreakdown;
}

function computeBreakdown(params: {
  supplierCostUsd: number;
  shippingUsd: number;
  listPriceUsd: number;
  fees: CjMlChileFeesResolved;
  fxRate: number;
  fxRateAt: Date;
}): Omit<CjMlChilePricingBreakdown, 'suggestedPriceUsd' | 'suggestedPriceCLP'> {
  const { supplierCostUsd: S, shippingUsd: H, listPriceUsd: P, fees, fxRate, fxRateAt } = params;
  const ivaUsd = round2((S + H) * CL_IVA_RATE);
  const landedCostUsd = round2(S + H + ivaUsd);
  const mlFeeUsd = round2(P * fees.mlcFeePct / 100);
  const mpPaymentFeeUsd = round2(P * fees.mpPaymentFeePct / 100);
  const incidentBufferUsd = round2(landedCostUsd * fees.incidentBufferPct / 100);
  const totalCostUsd = round2(landedCostUsd + mlFeeUsd + mpPaymentFeeUsd + incidentBufferUsd);
  const netProfitUsd = round2(P - totalCostUsd);
  const netMarginPct = P > 0 ? round2((netProfitUsd / P) * 100) : null;
  const listPriceCLP = roundCLP(P * fxRate);

  const missingCount = [fees.defaultsApplied.mlcFeePct, fees.defaultsApplied.mpPaymentFeePct, fees.defaultsApplied.incidentBufferPct].filter(Boolean).length;
  const feeSource: 'account' | 'defaults' | 'mixed' =
    missingCount === 0 ? 'account' : missingCount === 3 ? 'defaults' : 'mixed';

  return {
    supplierCostUsd: round2(S),
    shippingUsd: round2(H),
    ivaUsd,
    landedCostUsd,
    mlFeeUsd,
    mpPaymentFeeUsd,
    incidentBufferUsd,
    totalCostUsd,
    listPriceUsd: round2(P),
    listPriceCLP,
    netProfitUsd,
    netMarginPct,
    fxRateCLPperUSD: fxRate,
    fxRateAt,
    feeSource,
    feeDefaultsApplied: { ...fees.defaultsApplied },
    feesResolved: fees,
    ivaRate: CL_IVA_RATE,
  };
}

function computeMinPrice(params: {
  supplierCostUsd: number;
  shippingUsd: number;
  fees: CjMlChileFeesResolved;
  minMarginPct: number | null;
  minProfitUsd: number | null;
}): { price: number; feasible: boolean; reason?: string } {
  const { supplierCostUsd: S, shippingUsd: H, fees } = params;
  const landedCost = (S + H) * (1 + CL_IVA_RATE);
  const incidentUsd = landedCost * fees.incidentBufferPct / 100;
  const C = landedCost + incidentUsd;
  const rMl = fees.mlcFeePct / 100;
  const rMp = fees.mpPaymentFeePct / 100;
  const candidates: number[] = [];

  if (params.minMarginPct != null && Number.isFinite(params.minMarginPct)) {
    const m = params.minMarginPct / 100;
    const denom = 1 - rMl - rMp - m;
    if (denom <= 0.001) return { price: NaN, feasible: false, reason: 'MARGIN_DENOMINATOR_NON_POSITIVE' };
    candidates.push(C / denom);
  }
  if (params.minProfitUsd != null && Number.isFinite(params.minProfitUsd)) {
    const denom = 1 - rMl - rMp;
    if (denom <= 0.001) return { price: NaN, feasible: false, reason: 'PROFIT_DENOMINATOR_NON_POSITIVE' };
    candidates.push((C + params.minProfitUsd) / denom);
  }
  if (candidates.length === 0) {
    const denom = 1 - rMl - rMp;
    if (denom <= 0.001) return { price: NaN, feasible: false, reason: 'DENOMINATOR_NON_POSITIVE' };
    return { price: round2(C / denom), feasible: true };
  }
  const raw = Math.max(...candidates);
  if (!Number.isFinite(raw) || raw <= 0) return { price: NaN, feasible: false, reason: 'INVALID_MIN_PRICE' };
  return { price: round2(raw), feasible: true };
}

export async function computeMlChilePricing(input: CjMlChilePricingInput): Promise<CjMlChilePricingResult> {
  const fees = resolveMlChileFees(input.feesInput);

  // Obtener tasa FX CLP/USD
  let fxRate: number;
  let fxRateAt: Date;
  try {
    fxRate = fxService.convert(1, 'USD', 'CLP');
    fxRateAt = new Date();
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      return { ok: false, error: 'FX_RATE_UNAVAILABLE: tasa CLP/USD no disponible. Verifique EXCHANGERATE_API_KEY o FX_SEED_RATES.' };
    }
  } catch (e) {
    return { ok: false, error: `FX_CONVERT_ERROR: ${e instanceof Error ? e.message : String(e)}` };
  }

  const minPriceResult = computeMinPrice({
    supplierCostUsd: input.supplierCostUsd,
    shippingUsd: input.shippingUsd,
    fees,
    minMarginPct: input.minMarginPct,
    minProfitUsd: input.minProfitUsd,
  });

  const suggestedPriceUsd = minPriceResult.feasible
    ? Math.max(minPriceResult.price, 0.01)
    : round2((input.supplierCostUsd + input.shippingUsd) * (1 + CL_IVA_RATE) * 1.3);

  const listPriceUsd = input.listPriceUsdOverride ?? suggestedPriceUsd;

  const partial = computeBreakdown({
    supplierCostUsd: input.supplierCostUsd,
    shippingUsd: input.shippingUsd,
    listPriceUsd,
    fees,
    fxRate,
    fxRateAt,
  });

  const breakdown: CjMlChilePricingBreakdown = {
    ...partial,
    suggestedPriceUsd,
    suggestedPriceCLP: roundCLP(suggestedPriceUsd * fxRate),
  };

  return { ok: true, breakdown };
}

export function pricingBreakdownForResponse(b: CjMlChilePricingBreakdown): Record<string, unknown> {
  const n = (x: number) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    supplierCostUsd: n(b.supplierCostUsd),
    shippingUsd: n(b.shippingUsd),
    ivaUsd: n(b.ivaUsd),
    landedCostUsd: n(b.landedCostUsd),
    ivaRate: b.ivaRate,
    mlFeeUsd: n(b.mlFeeUsd),
    mpPaymentFeeUsd: n(b.mpPaymentFeeUsd),
    incidentBufferUsd: n(b.incidentBufferUsd),
    totalCostUsd: n(b.totalCostUsd),
    listPriceUsd: n(b.listPriceUsd),
    listPriceCLP: n(b.listPriceCLP),
    netProfitUsd: n(b.netProfitUsd),
    netMarginPct: b.netMarginPct != null && Number.isFinite(b.netMarginPct) ? b.netMarginPct : null,
    suggestedPriceUsd: n(b.suggestedPriceUsd),
    suggestedPriceCLP: n(b.suggestedPriceCLP),
    fxRateCLPperUSD: n(b.fxRateCLPperUSD),
    fxRateAt: b.fxRateAt?.toISOString() ?? null,
    feeSource: b.feeSource,
    feeDefaultsApplied: b.feeDefaultsApplied,
    fees: {
      mlcFeePct: b.feesResolved.mlcFeePct,
      mpPaymentFeePct: b.feesResolved.mpPaymentFeePct,
      incidentBufferPct: b.feesResolved.incidentBufferPct,
    },
  };
}
