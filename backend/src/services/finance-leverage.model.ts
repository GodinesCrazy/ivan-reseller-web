/**
 * Finance Leverage Model - Optimal Leverage Ratio (OLR)
 * Phase 3: Mathematical model for inventory capital leverage.
 *
 * ICLR = Inventory Capital Leverage Ratio = supplierExposure / totalCapital
 * OLR  = Optimal Leverage Ratio = (1 / P_simultaneous_sale) * safetyFactor
 *
 * P_simultaneous_sale = estimatedProbabilityOfSalePerDay * avgActiveListings
 * estimatedProbabilityOfSalePerDay = historicalSales / historicalActiveListings / avgDays
 *
 * OLR is clamped between 1.5 and 4.0.
 * safetyFactor = 0.7 (configurable)
 */

export const DEFAULT_SAFETY_FACTOR = 0.7;
export const OLR_MIN = 1.5;
export const OLR_MAX = 4.0;

export interface LeverageInputs {
  supplierExposure: number;
  totalCapital: number;
  historicalSales: number;
  historicalActiveListings: number;
  avgActiveListings: number;
  avgDays: number;
  safetyFactor?: number;
}

export interface LeverageOutputs {
  iclr: number; // Inventory Capital Leverage Ratio
  olr: number; // Optimal Leverage Ratio
  pSimultaneousSale: number;
  estimatedProbabilityOfSalePerDay: number;
}

/**
 * Compute Optimal Leverage Ratio (OLR) and ICLR
 */
export function computeLeverage(inputs: LeverageInputs): LeverageOutputs {
  const safetyFactor = inputs.safetyFactor ?? DEFAULT_SAFETY_FACTOR;
  const { supplierExposure, totalCapital, historicalSales, historicalActiveListings, avgActiveListings, avgDays } =
    inputs;

  const iclr = totalCapital > 0 ? supplierExposure / totalCapital : 0;

  let estimatedProbabilityOfSalePerDay = 0;
  if (historicalActiveListings > 0 && avgDays > 0) {
    estimatedProbabilityOfSalePerDay = historicalSales / historicalActiveListings / avgDays;
  }

  const pSimultaneousSale = Math.min(
    1,
    Math.max(0, estimatedProbabilityOfSalePerDay * avgActiveListings)
  );

  let olr = OLR_MIN;
  if (pSimultaneousSale > 0) {
    olr = (1 / pSimultaneousSale) * safetyFactor;
  }
  olr = Math.max(OLR_MIN, Math.min(OLR_MAX, olr));

  return {
    iclr,
    olr,
    pSimultaneousSale,
    estimatedProbabilityOfSalePerDay,
  };
}

/**
 * Determine RiskLevel from ICLR vs OLR
 * LOW:   ICLR < OLR * 0.75
 * MEDIUM: 0.75 <= ICLR/OLR < 1.0
 * HIGH:  ICLR >= OLR
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export function getRiskLevel(iclr: number, olr: number): RiskLevel {
  if (olr <= 0) return 'LOW';
  const ratio = iclr / olr;
  if (ratio < 0.75) return 'LOW';
  if (ratio < 1.0) return 'MEDIUM';
  return 'HIGH';
}
