/**
 * Phase 9: Autonomous Scaling Engine
 * Scales successful products: analyze winning_products, strategy_decisions, listing_metrics,
 * market_opportunities → scaleScore 0–100 → scaling_actions (expand_marketplace, republish, etc.).
 *
 * Task 7 — Safety (env):
 * - SCALING_MAX_ACTIONS_PER_DAY   Max scaling actions executed per day (default 15)
 * - SCALING_MAX_LISTINGS_PER_PRODUCT  Max total listings per product (default 5)
 * - SCALING_MIN_MARGIN_PCT        Min margin to allow scaling (default 10)
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { toNumber } from '../utils/decimal.utils';

const SCALING_MAX_ACTIONS_PER_DAY = Number(process.env.SCALING_MAX_ACTIONS_PER_DAY || '15');
const SCALING_MAX_LISTINGS_PER_PRODUCT = Number(process.env.SCALING_MAX_LISTINGS_PER_PRODUCT || '5');
const SCALING_MIN_MARGIN_PCT = Number(process.env.SCALING_MIN_MARGIN_PCT || '10');

const ACTION_TYPES = ['republish', 'expand_marketplace', 'increase_quantity', 'trigger_optimization'] as const;
type ActionType = (typeof ACTION_TYPES)[number];
const MARKETPLACES = ['mercadolibre', 'ebay', 'amazon'] as const;

export interface ScalingEngineRunResult {
  actionsCreated: number;
  jobsEnqueued: number;
  skippedBySafety: number;
  errors: string[];
}

async function getProductScaleSignals(productId: number, userId: number) {
  const [winners, listingCount, metricsAgg, opportunities, product] = await Promise.all([
    prisma.winningProduct.count({
      where: { productId, userId, detectedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.marketplaceListing.count({ where: { productId, userId } }),
    prisma.listingMetric.aggregate({
      where: {
        marketplaceListing: { productId, userId },
        date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { impressions: true, clicks: true, sales: true },
    }),
    prisma.marketOpportunity.findMany({
      where: { productId, userId },
      orderBy: { score: 'desc' },
      take: 3,
      select: { score: true, trendScore: true },
    }),
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, userId: true, title: true, suggestedPrice: true, totalCost: true, aliexpressPrice: true, status: true },
    }),
  ]);

  const impressions = metricsAgg._sum.impressions ?? 0;
  const clicks = metricsAgg._sum.clicks ?? 0;
  const sales = metricsAgg._sum.sales ?? 0;
  const conversionRate = impressions > 0 ? clicks / impressions : 0;
  const avgOppScore = opportunities.length
    ? opportunities.reduce((a, o) => a + toNumber(o.score), 0) / opportunities.length
    : 0;
  const avgTrend = opportunities.length
    ? opportunities.reduce((a, o) => a + (o.trendScore ? toNumber(o.trendScore) : 50), 0) / opportunities.length
    : 50;
  const marginPct = product && product.suggestedPrice && product.totalCost
    ? ((Number(product.suggestedPrice) - Number(product.totalCost)) / Number(product.suggestedPrice)) * 100
    : 0;

  return {
    product,
    userId,
    productId,
    isWinner: winners > 0,
    listingCount,
    salesVelocity: sales,
    conversionRate,
    trendMomentum: avgTrend,
    opportunityScore: avgOppScore,
    marginPct,
    existingMarketplaces: await prisma.marketplaceListing.findMany({
      where: { productId, userId },
      select: { marketplace: true },
    }).then((r) => r.map((x) => x.marketplace)),
  };
}

function computeScaleScore(signals: Awaited<ReturnType<typeof getProductScaleSignals>>): number {
  const s = signals;
  if (!s.product || s.product.status === 'REJECTED') return 0;
  const velocity = Math.min(100, Math.log1p(s.salesVelocity + 1) * 25);
  const conversion = Math.min(100, s.conversionRate * 400);
  const trend = Math.min(100, s.trendMomentum);
  const opp = Math.min(100, s.opportunityScore);
  const winnerBonus = s.isWinner ? 20 : 0;
  const score =
    velocity * 0.25 +
    conversion * 0.2 +
    trend * 0.2 +
    opp * 0.15 +
    winnerBonus +
    (s.listingCount > 0 ? 5 : 0);
  return Math.min(100, Math.max(0, score));
}

export async function runAutonomousScalingEngine(): Promise<ScalingEngineRunResult> {
  const result: ScalingEngineRunResult = { actionsCreated: 0, jobsEnqueued: 0, skippedBySafety: 0, errors: [] };

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const executedToday = await prisma.scalingAction.count({
      where: { executed: true, createdAt: { gte: todayStart } },
    });
    const atLimit = executedToday >= SCALING_MAX_ACTIONS_PER_DAY;

    const winnerProducts = await prisma.winningProduct.findMany({
      where: { detectedAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
      select: { productId: true, userId: true },
      distinct: ['productId'],
    });

    const processed = new Set<string>();
    for (const { productId, userId } of winnerProducts) {
      const key = `${userId}:${productId}`;
      if (processed.has(key)) continue;
      processed.add(key);

      if (atLimit) {
        result.skippedBySafety++;
        continue;
      }

      try {
        const signals = await getProductScaleSignals(productId, userId);
        if (!signals.product) continue;
        if (signals.marginPct < SCALING_MIN_MARGIN_PCT) {
          result.skippedBySafety++;
          continue;
        }
        if (signals.listingCount >= SCALING_MAX_LISTINGS_PER_PRODUCT) {
          result.skippedBySafety++;
          continue;
        }

        const scaleScore = computeScaleScore(signals);
        if (scaleScore < 50) continue;

        const missingMp = MARKETPLACES.filter((m) => !signals.existingMarketplaces.includes(m));
        if (missingMp.length === 0) continue;

        const targetMarketplace = missingMp[0];
        const existingAction = await prisma.scalingAction.findFirst({
          where: {
            productId,
            marketplace: targetMarketplace,
            createdAt: { gte: todayStart },
          },
        });
        if (existingAction) continue;

        const action = await prisma.scalingAction.create({
          data: {
            userId,
            productId,
            marketplace: targetMarketplace,
            actionType: 'expand_marketplace',
            score: new Decimal(scaleScore),
            executed: false,
          },
        });
        result.actionsCreated++;

        const { jobService } = await import('./job.service');
        const job = await jobService.addPublishingJob({
          userId,
          productId,
          marketplaces: [targetMarketplace],
        });
        if (job) {
          await prisma.scalingAction.update({
            where: { id: action.id },
            data: { executed: true },
          });
          result.jobsEnqueued++;
        }
      } catch (e: any) {
        result.errors.push(`product ${productId}: ${e?.message || String(e)}`);
        logger.warn('[AUTONOMOUS-SCALING] Product failed', { productId, error: e?.message });
      }
    }

    logger.info('[AUTONOMOUS-SCALING] Run complete', result);
    return result;
  } catch (e: any) {
    logger.error('[AUTONOMOUS-SCALING] Run failed', { error: e?.message });
    result.errors.push(e?.message || String(e));
    return result;
  }
}
