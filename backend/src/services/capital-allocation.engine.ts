/**
 * Capital Allocation Engine - Phase 3
 * Controls publishing based on capital exposure limits.
 *
 * maxExposureAllowed = totalCapital * OLR
 * currentExposure = supplierExposure
 * remainingExposure = maxExposureAllowed - currentExposure
 *
 * If remainingExposure <= 0 ? block new publications
 * If > 0 ? allow publishing up to remainingExposure
 *
 * For each new product: allowedUnits = floor(remainingExposure / estimatedSupplierCost)
 */

import { prisma } from '../config/database';
import { toNumber } from '../utils/decimal.utils';
import { computeLeverage, getRiskLevel, type LeverageInputs, type RiskLevel } from './finance-leverage.model';
import logger from '../config/logger';

/** Active product statuses for supplier exposure */
const ACTIVE_STATUSES = ['APPROVED', 'PUBLISHED'];

/**
 * Get supplier exposure: SUM(supplierCost) of active listings.
 * Uses Product.aliexpressPrice for products with status APPROVED or PUBLISHED
 * that have MarketplaceListing (actually listed).
 */
export async function getSupplierExposure(userId: number): Promise<number> {
  const products = await prisma.product.findMany({
    where: {
      userId,
      status: { in: ACTIVE_STATUSES },
      marketplaceListings: { some: {} },
    },
    select: { aliexpressPrice: true },
  });

  let sum = 0;
  for (const p of products) {
    const cost = toNumber(p.aliexpressPrice);
    if (Number.isFinite(cost) && cost > 0) sum += cost;
  }
  return sum;
}

/**
 * Get count of active listings (products with MarketplaceListing)
 */
export async function getAvgActiveListings(userId: number): Promise<number> {
  const count = await prisma.marketplaceListing.count({
    where: { userId },
  });
  return count;
}

/**
 * Historical sales and active listings for OLR calculation
 */
export async function getHistoricalMetrics(userId: number, daysBack: number = 90): Promise<{
  historicalSales: number;
  historicalActiveListings: number;
  avgDays: number;
}> {
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  const [salesCount, listingsCount] = await Promise.all([
    prisma.sale.count({
      where: { userId, createdAt: { gte: start } },
    }),
    prisma.marketplaceListing.count({
      where: { userId },
    }),
  ]);

  return {
    historicalSales: salesCount,
    historicalActiveListings: Math.max(1, listingsCount),
    avgDays: daysBack,
  };
}

export interface CapitalAllocationResult {
  canPublish: boolean;
  remainingExposure: number;
  maxExposureAllowed: number;
  currentExposure: number;
  olr: number;
  iclr: number;
  riskLevel: RiskLevel;
  allowedUnits: number;
  estimatedSupplierCost: number | null;
}

/**
 * Main function: calculateMaxNewListingsAllowed()
 * Returns how many units of a product can be published given capital constraints.
 */
export async function calculateMaxNewListingsAllowed(
  userId: number,
  totalCapital: number,
  estimatedSupplierCost?: number
): Promise<CapitalAllocationResult> {
  const [supplierExposure, avgActiveListings, historical] = await Promise.all([
    getSupplierExposure(userId),
    getAvgActiveListings(userId),
    getHistoricalMetrics(userId),
  ]);

  const leverageInputs: LeverageInputs = {
    supplierExposure,
    totalCapital,
    historicalSales: historical.historicalSales,
    historicalActiveListings: historical.historicalActiveListings,
    avgActiveListings: Math.max(1, avgActiveListings),
    avgDays: historical.avgDays,
  };

  const { iclr, olr } = computeLeverage(leverageInputs);
  const riskLevel = getRiskLevel(iclr, olr);

  const maxExposureAllowed = totalCapital * olr;
  const remainingExposure = Math.max(0, maxExposureAllowed - supplierExposure);
  const canPublish = remainingExposure > 0;

  let allowedUnits = 0;
  if (estimatedSupplierCost != null && estimatedSupplierCost > 0 && canPublish) {
    allowedUnits = Math.floor(remainingExposure / estimatedSupplierCost);
  }

  return {
    canPublish,
    remainingExposure,
    maxExposureAllowed,
    currentExposure: supplierExposure,
    olr,
    iclr,
    riskLevel,
    allowedUnits,
    estimatedSupplierCost: estimatedSupplierCost ?? null,
  };
}

/**
 * Check if publishing is allowed before Autopilot publishes.
 * If over limit ? log warning and return false.
 */
export async function canPublishProduct(
  userId: number,
  totalCapital: number,
  supplierCost: number
): Promise<{ allowed: boolean; reason?: string }> {
  const result = await calculateMaxNewListingsAllowed(userId, totalCapital, supplierCost);

  if (!result.canPublish) {
    logger.warn('[CAPITAL-ALLOCATION] Publishing blocked - exposure limit exceeded', {
      userId,
      currentExposure: result.currentExposure,
      maxExposureAllowed: result.maxExposureAllowed,
      riskLevel: result.riskLevel,
    });
    return { allowed: false, reason: `Exposure limit exceeded (risk: ${result.riskLevel})` };
  }

  if (supplierCost > result.remainingExposure) {
    logger.warn('[CAPITAL-ALLOCATION] Publishing blocked - insufficient remaining exposure', {
      userId,
      supplierCost,
      remainingExposure: result.remainingExposure,
    });
    return { allowed: false, reason: 'Insufficient remaining exposure for this product cost' };
  }

  return { allowed: true };
}
