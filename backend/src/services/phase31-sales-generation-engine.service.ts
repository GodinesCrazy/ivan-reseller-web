/**
 * Phase 31 — Sales Generation and Market Dominance Engine
 * Orchestrates: positioning, price competitiveness, visibility boost, conversion optimization,
 * winner detection, marketplace priority, smart scaling, traffic loop, daily cap, profit-first.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

/** Default 15 (Phase 32 controlled volume). Override: env PHASE31_MAX_NEW_LISTINGS_PER_DAY or systemConfig phase31_max_new_listings_per_day. */
const DEFAULT_MAX_NEW_LISTINGS_PER_DAY = 15;
const VISIBILITY_BOOST_BATCH = 15;
const DAYS_ZERO_IMPRESSIONS = 14;
const CONVERSION_THRESHOLD = Number(process.env.PHASE31_WINNER_CONVERSION_THRESHOLD || '0.01');

export interface SalesGenerationCycleResult {
  success: boolean;
  winnersDetected: number;
  visibilityBoostEnqueued: number;
  conversionActionsCreated: number;
  repricingApplied: number;
  scalingActionsEnqueued: number;
  newListingsToday: number;
  cappedByDailyLimit: boolean;
  marketplacePriority: string[];
  errors: string[];
  durationMs: number;
}

async function getMaxNewListingsPerDay(): Promise<number> {
  try {
    const rec = await prisma.systemConfig.findUnique({ where: { key: 'phase31_max_new_listings_per_day' } });
    if (rec?.value != null) {
      const n = Number(rec.value);
      if (!Number.isNaN(n) && n >= 1 && n <= 100) return Math.round(n);
    }
  } catch {
    /* ignore */
  }
  return Number(process.env.PHASE31_MAX_NEW_LISTINGS_PER_DAY) || DEFAULT_MAX_NEW_LISTINGS_PER_DAY;
}

async function getMarketplacePriority(): Promise<string[]> {
  try {
    const rec = await prisma.systemConfig.findUnique({ where: { key: 'phase31_marketplace_priority' } });
    if (rec?.value) {
      const arr = JSON.parse(rec.value as string);
      if (Array.isArray(arr) && arr.length > 0) return arr as string[];
    }
  } catch {
    /* ignore */
  }
  return ['mercadolibre', 'ebay', 'amazon'];
}

export async function setMarketplacePriority(order: string[]): Promise<void> {
  const valid = order.filter((m) => ['mercadolibre', 'ebay', 'amazon'].includes(m.toLowerCase()));
  await prisma.systemConfig.upsert({
    where: { key: 'phase31_marketplace_priority' },
    create: { key: 'phase31_marketplace_priority', value: JSON.stringify(valid.length ? valid : ['mercadolibre', 'ebay', 'amazon']) },
    update: { value: JSON.stringify(valid.length ? valid : ['mercadolibre', 'ebay', 'amazon']) },
  });
}

async function countNewListingsPublishedToday(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.marketplaceListing.count({
    where: { publishedAt: { gte: today } },
  });
}

/**
 * TASK 3 — Visibility boost: listings with no impressions in last N days → republish/SEO.
 */
async function runVisibilityBoost(): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_ZERO_IMPRESSIONS);
  const listingsWithMetrics = await prisma.listingMetric.groupBy({
    by: ['listingId'],
    where: { date: { gte: since } },
    _sum: { impressions: true },
  });
  const listingIdsWithImpressions = new Set(
    listingsWithMetrics.filter((m) => (m._sum.impressions ?? 0) > 0).map((m) => m.listingId)
  );
  const allPublished = await prisma.marketplaceListing.findMany({
    where: { publishedAt: { not: null }, status: 'active' },
    select: { id: true, productId: true, userId: true, marketplace: true },
    take: 500,
  });
  const zeroImpression = allPublished.filter((l) => !listingIdsWithImpressions.has(l.id)).slice(0, VISIBILITY_BOOST_BATCH);
  let enqueued = 0;
  try {
    const { publishingQueue } = await import('./job.service');
    if (publishingQueue) {
      for (const l of zeroImpression) {
        await publishingQueue.add(
          'publish-product',
          { userId: l.userId, productId: l.productId, marketplaces: [l.marketplace] },
          { removeOnComplete: 5 }
        );
        enqueued++;
      }
    }
  } catch (e: any) {
    logger.warn('[Phase31] Visibility boost enqueue failed', { error: e?.message });
  }
  return enqueued;
}

/**
 * Run one full sales generation cycle.
 */
export async function runSalesGenerationCycle(): Promise<SalesGenerationCycleResult> {
  const start = Date.now();
  const errors: string[] = [];
  let winnersDetected = 0;
  let visibilityBoostEnqueued = 0;
  let conversionActionsCreated = 0;
  let repricingApplied = 0;
  let scalingActionsEnqueued = 0;

  const marketplacePriority = await getMarketplacePriority();
  const maxNewPerDay = await getMaxNewListingsPerDay();
  const newListingsToday = await countNewListingsPublishedToday();
  const cappedByDailyLimit = newListingsToday >= maxNewPerDay;

  try {
    // TASK 5 — Winner detection (aggressive)
    const { runMetricsBasedWinnerDetection } = await import('./winner-detection.service');
    const winnerResult = await runMetricsBasedWinnerDetection();
    winnersDetected = winnerResult.winnersStored;
    if (winnerResult.errors.length) errors.push(...winnerResult.errors);

    // TASK 3 — Visibility boost (no impressions → republish)
    if (!cappedByDailyLimit) {
      visibilityBoostEnqueued = await runVisibilityBoost();
    }

    // TASK 4 — Conversion optimization (impressions but no sales)
    try {
      const { runConversionRateOptimization } = await import('./conversion-rate-optimization.service');
      const croResult = await runConversionRateOptimization();
      conversionActionsCreated = croResult.actionsCreated + croResult.actionsExecuted;
      if (croResult.errors.length) errors.push(...croResult.errors);
    } catch (e: any) {
      errors.push(`CRO: ${e?.message ?? String(e)}`);
    }

    // TASK 2 — Price competitiveness (dynamic pricing; profit guard enforced)
    try {
      const { dynamicPricingService } = await import('./dynamic-pricing.service');
      const products = await prisma.product.findMany({
        where: { status: { in: ['ACTIVE', 'PUBLISHED', 'READY'] } },
        select: { id: true, userId: true, aliexpressPrice: true, suggestedPrice: true },
        take: 30,
      });
      for (const p of products) {
        const cost = toNumber(p.aliexpressPrice) || 0;
        if (cost <= 0) continue;
        const res = await dynamicPricingService.repriceByProduct(
          p.id,
          cost,
          'mercadolibre',
          p.userId
        );
        if (res.success && res.newSuggestedPriceUsd != null) repricingApplied++;
      }
    } catch (e: any) {
      errors.push(`Repricing: ${e?.message ?? String(e)}`);
    }

    // TASK 5/7 — Smart scaling (only profitable; autonomous-scaling already uses SCALING_MIN_MARGIN_PCT)
    if (!cappedByDailyLimit) {
      try {
        const { runAutonomousScalingEngine } = await import('./autonomous-scaling-engine.service');
        const scaleResult = await runAutonomousScalingEngine();
        scalingActionsEnqueued = scaleResult.jobsEnqueued;
        if (scaleResult.errors.length) errors.push(...scaleResult.errors);
      } catch (e: any) {
        errors.push(`Scaling: ${e?.message ?? String(e)}`);
      }
    }
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
    logger.error('[Phase31] Sales generation cycle failed', { error: e?.message });
  }

  const durationMs = Date.now() - start;
  logger.info('[Phase31] Sales generation cycle complete', {
    winnersDetected,
    visibilityBoostEnqueued,
    conversionActionsCreated,
    repricingApplied,
    scalingActionsEnqueued,
    newListingsToday,
    cappedByDailyLimit,
    durationMs,
  });

  return {
    success: errors.length === 0,
    winnersDetected,
    visibilityBoostEnqueued,
    conversionActionsCreated,
    repricingApplied,
    scalingActionsEnqueued,
    newListingsToday,
    cappedByDailyLimit,
    marketplacePriority,
    errors,
    durationMs,
  };
}

/**
 * TASK 6 — Get/set marketplace priority (underperforming → shift focus).
 */
export async function getMarketplacePriorityConfig(): Promise<{ priority: string[] }> {
  const priority = await getMarketplacePriority();
  return { priority };
}

export async function setMaxNewListingsPerDay(value: number): Promise<void> {
  const n = Math.max(1, Math.min(100, Math.round(value)));
  await prisma.systemConfig.upsert({
    where: { key: 'phase31_max_new_listings_per_day' },
    create: { key: 'phase31_max_new_listings_per_day', value: String(n) },
    update: { value: String(n) },
  });
}

export const Phase31SalesGenerationEngine = {
  runCycle: runSalesGenerationCycle,
  getMarketplacePriority: getMarketplacePriorityConfig,
  setMarketplacePriority,
  setMaxNewListingsPerDay,
  getMaxNewListingsPerDay: async () => getMaxNewListingsPerDay(),
  DEFAULT_MAX_NEW_LISTINGS_PER_DAY,
};
