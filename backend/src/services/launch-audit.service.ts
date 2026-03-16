/**
 * Phase 13: Launch Audit Service
 * Listing compliance audit, legacy repair actions, profitability simulation,
 * system readiness check, launch report.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { runSystemHealthCheck, isSystemReadyForAutonomous, type SystemHealthResult } from './system-health.service';
import {
  calculateFeeIntelligence,
  isProfitabilityAllowed,
  getMinAllowedMargin,
  type MarketplaceFeeMarketplace,
} from './marketplace-fee-intelligence.service';

const AUDIT_ACTION_TYPES = [
  'title_restructuring',
  'attribute_completion',
  'description_improvement',
  'image_regeneration',
  'price_correction',
  'category_correction',
] as const;

export interface ListingComplianceAuditResult {
  totalAudited: number;
  compliant: number;
  nonCompliant: number;
  repairActionsCreated: number;
  byMarketplace: Record<string, { audited: number; compliant: number; actions: number }>;
}

export interface ProfitabilitySimulationResult {
  totalListings: number;
  profitable: number;
  unprofitable: number;
  flagged: number;
  breakEvenPrices: Array<{ listingId: number; productId: number; marketplace: string; breakEvenPrice: number }>;
}

export interface LaunchReadinessReport {
  systemReadyForAutonomousOperation: boolean;
  listingComplianceStatus: 'ok' | 'degraded' | 'fail';
  profitabilityStatus: 'ok' | 'degraded' | 'fail';
  systemHealth: SystemHealthResult;
  apiConnectivity: boolean;
  automationReadiness: boolean;
  alerts: string[];
  timestamp: string;
}

export interface LaunchReport {
  totalListingsAudited: number;
  totalListingsRepaired: number;
  profitabilitySummary: ProfitabilitySimulationResult;
  feeIntelligenceAnalysis: { minAllowedMargin: number; unprofitableFlagsCount: number };
  systemReadiness: LaunchReadinessReport;
  autonomousActivationStatus: 'enabled' | 'disabled' | 'not_ready';
  timestamp: string;
}

/**
 * Audit listings for MercadoLibre Chile and eBay US. Create repair actions for non-compliant.
 */
export async function runListingComplianceAudit(userId?: number): Promise<ListingComplianceAuditResult> {
  const where: any = { marketplace: { in: ['mercadolibre', 'ebay'] } };
  if (userId) where.userId = userId;

  const listings = await prisma.marketplaceListing.findMany({
    where,
    include: { product: true },
  });

  let compliant = 0;
  let repairActionsCreated = 0;
  const byMarketplace: Record<string, { audited: number; compliant: number; actions: number }> = {
    mercadolibre: { audited: 0, compliant: 0, actions: 0 },
    ebay: { audited: 0, compliant: 0, actions: 0 },
  };

  for (const listing of listings) {
    const mp = listing.marketplace as string;
    if (!byMarketplace[mp]) byMarketplace[mp] = { audited: 0, compliant: 0, actions: 0 };
    byMarketplace[mp].audited += 1;

    const product = listing.product;
    const issues: { actionType: (typeof AUDIT_ACTION_TYPES)[number]; reason: string }[] = [];

    if (!product.title || product.title.length < 10) {
      issues.push({ actionType: 'title_restructuring', reason: 'title_too_short_or_missing' });
    }
    if (!product.description || product.description.length < 50) {
      issues.push({ actionType: 'description_improvement', reason: 'description_too_short_or_missing' });
    }
    try {
      const images = typeof product.images === 'string' ? JSON.parse(product.images || '[]') : product.images;
      const imgCount = Array.isArray(images) ? images.length : 0;
      if (imgCount < 1) {
        issues.push({ actionType: 'image_regeneration', reason: 'no_images' });
      }
    } catch {
      issues.push({ actionType: 'image_regeneration', reason: 'invalid_images_json' });
    }
    if (!product.category || product.category.trim() === '') {
      issues.push({ actionType: 'category_correction', reason: 'category_missing' });
    }

    const supplierCost = product.totalCost
      ? Number(product.totalCost)
      : Number(product.aliexpressPrice || 0) + Number(product.shippingCost || 0);
    const listPrice = Number(product.suggestedPrice || product.finalPrice || product.aliexpressPrice || 0);
    if (listPrice > 0 && supplierCost > 0) {
      const marginPct = ((listPrice - supplierCost) / listPrice) * 100;
      if (marginPct < getMinAllowedMargin()) {
        issues.push({ actionType: 'price_correction', reason: `margin_below_min_${marginPct.toFixed(1)}pct` });
      }
    }

    if (issues.length === 0) {
      compliant++;
      byMarketplace[mp].compliant += 1;
      continue;
    }

    const created = await prisma.listingAuditAction.createMany({
      data: issues.map(({ actionType, reason }) => ({
        listingId: listing.id,
        marketplace: listing.marketplace,
        actionType,
        reason,
        executed: false,
      })),
      skipDuplicates: true,
    });
    repairActionsCreated += created.count;
    byMarketplace[mp].actions += created.count;
  }

  return {
    totalAudited: listings.length,
    compliant,
    nonCompliant: listings.length - compliant,
    repairActionsCreated,
    byMarketplace,
  };
}

/**
 * Simulate profitability for all active listings using fee intelligence.
 */
export async function runProfitabilitySimulation(userId?: number): Promise<ProfitabilitySimulationResult> {
  const where: any = { marketplace: { in: ['mercadolibre', 'ebay'] } };
  if (userId) where.userId = userId;

  const listings = await prisma.marketplaceListing.findMany({
    where,
    include: { product: true },
  });

  let profitable = 0;
  let unprofitable = 0;
  const breakEvenPrices: ProfitabilitySimulationResult['breakEvenPrices'] = [];

  for (const listing of listings) {
    const product = listing.product;
    const supplierCost = product.totalCost
      ? Number(product.totalCost)
      : Number(product.aliexpressPrice || 0) + Number(product.shippingCost || 0);
    const listPrice = Number(product.suggestedPrice || product.finalPrice || product.aliexpressPrice || 0);
    if (listPrice <= 0) continue;

    const result = calculateFeeIntelligence({
      marketplace: listing.marketplace as MarketplaceFeeMarketplace,
      listingPrice: listPrice,
      supplierCost,
      shippingCostToCustomer: Number(product.shippingCost || 0),
      currency: listing.marketplace === 'mercadolibre' ? 'CLP' : 'USD',
    });

    if (isProfitabilityAllowed(result)) {
      profitable++;
    } else {
      unprofitable++;
    }
    const breakEven = result.totalOperationalCost;
    breakEvenPrices.push({
      listingId: listing.id,
      productId: product.id,
      marketplace: listing.marketplace,
      breakEvenPrice: breakEven,
    });
  }

  const flagged = await prisma.unprofitableListingFlag.count({
    where: userId ? { product: { userId } } : {},
  });

  return {
    totalListings: listings.length,
    profitable,
    unprofitable,
    flagged,
    breakEvenPrices,
  };
}

/**
 * Generate system readiness report including listing compliance and profitability.
 */
export async function getLaunchReadinessReport(userId?: number): Promise<LaunchReadinessReport> {
  const health = await runSystemHealthCheck();
  const compliance = await runListingComplianceAudit(userId);
  const profitability = await runProfitabilitySimulation(userId);

  const alerts = [...health.alerts];
  if (compliance.nonCompliant > 0) {
    alerts.push(`${compliance.nonCompliant} listings need repair actions`);
  }
  if (profitability.unprofitable > 0) {
    alerts.push(`${profitability.unprofitable} listings below minimum margin`);
  }

  const listingComplianceStatus =
    compliance.totalAudited === 0 ? 'ok' : compliance.nonCompliant === 0 ? 'ok' : compliance.nonCompliant < compliance.compliant ? 'degraded' : 'fail';
  const profitabilityStatus =
    profitability.totalListings === 0 ? 'ok' : profitability.unprofitable === 0 ? 'ok' : profitability.unprofitable < profitability.profitable ? 'degraded' : 'fail';

  const systemReadyForAutonomousOperation =
    isSystemReadyForAutonomous(health) &&
    listingComplianceStatus !== 'fail' &&
    profitabilityStatus !== 'fail' &&
    alerts.length === 0;

  return {
    systemReadyForAutonomousOperation,
    listingComplianceStatus,
    profitabilityStatus,
    systemHealth: health,
    apiConnectivity: health.marketplaceApi === 'ok' && health.supplierApi !== 'fail',
    automationReadiness: health.bullmq !== 'fail' && health.redis !== 'fail',
    alerts,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate full launch report.
 */
export async function getLaunchReport(userId?: number): Promise<LaunchReport> {
  const readiness = await getLaunchReadinessReport(userId);
  const compliance = await runListingComplianceAudit(userId);
  const profitability = await runProfitabilitySimulation(userId);

  const executedRepairs = await prisma.listingAuditAction.count({
    where: { executed: true, ...(userId ? { marketplaceListing: { userId } } : {}) },
  });
  const unprofitableFlagsCount = await prisma.unprofitableListingFlag.count({
    where: userId ? { product: { userId } } : {},
  });

  const autonomousActivationStatus = process.env.AUTONOMOUS_OPERATION_MODE === 'true'
    ? 'enabled'
    : readiness.systemReadyForAutonomousOperation
      ? 'not_ready'
      : 'disabled';

  return {
    totalListingsAudited: compliance.totalAudited,
    totalListingsRepaired: executedRepairs,
    profitabilitySummary: profitability,
    feeIntelligenceAnalysis: { minAllowedMargin: getMinAllowedMargin(), unprofitableFlagsCount },
    systemReadiness: readiness,
    autonomousActivationStatus,
    timestamp: new Date().toISOString(),
  };
}
