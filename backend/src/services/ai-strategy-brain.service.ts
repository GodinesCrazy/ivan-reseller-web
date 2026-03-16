/**
 * Phase 8: AI Strategy Brain
 * Central intelligence layer: evaluates market_opportunities, winning_products, listing_metrics,
 * auto_listing_decisions, demand_signals and produces strategic decisions (scale, expand, adjust_price, pause).
 *
 * Task 7 — Safety (env):
 * - STRATEGY_MAX_NEW_LISTINGS_PER_DAY   Max new listings to trigger per day (default 10)
 * - STRATEGY_MIN_MARGIN_PCT             Min margin to allow scale/expand (default 12)
 * - STRATEGY_MAX_MARKETPLACE_EXPANSIONS Max marketplace expansions per product per day (default 2)
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { toNumber } from '../utils/decimal.utils';

const STRATEGY_MAX_NEW_LISTINGS_PER_DAY = Number(process.env.STRATEGY_MAX_NEW_LISTINGS_PER_DAY || '10');
const STRATEGY_MIN_MARGIN_PCT = Number(process.env.STRATEGY_MIN_MARGIN_PCT || '12');
const STRATEGY_MAX_MARKETPLACE_EXPANSIONS = Number(process.env.STRATEGY_MAX_MARKETPLACE_EXPANSIONS || '2');

const DECISION_TYPES = ['scale_listing', 'expand_marketplace', 'adjust_price', 'pause_listing'] as const;
type DecisionType = (typeof DECISION_TYPES)[number];

export interface StrategyBrainRunResult {
  decisionsCreated: number;
  actionsTriggered: number;
  skippedBySafety: number;
  errors: string[];
}

async function getProductStrategySignals(productId: number, userId: number) {
  const [opportunities, winnerCount, listings, metricsAgg, decisionsToday, product] = await Promise.all([
    prisma.marketOpportunity.findMany({
      where: { productId, userId },
      orderBy: { detectedAt: 'desc' },
      take: 5,
      select: { score: true, trendScore: true, demandScore: true, marginScore: true },
    }),
    prisma.winningProduct.count({
      where: { productId, userId, detectedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.marketplaceListing.findMany({
      where: { productId, userId },
      select: { marketplace: true },
    }),
    prisma.listingMetric.aggregate({
      where: {
        marketplaceListing: { productId, userId },
        date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { impressions: true, clicks: true, sales: true },
    }),
    prisma.strategyDecision.count({
      where: { productId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, decisionType: 'expand_marketplace' },
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
  const salesVelocity = sales; // simple velocity
  const avgOpportunityScore = opportunities.length
    ? opportunities.reduce((a, o) => a + toNumber(o.score), 0) / opportunities.length
    : 50;
  const avgTrendScore = opportunities.length
    ? opportunities.reduce((a, o) => a + (o.trendScore ? toNumber(o.trendScore) : 50), 0) / opportunities.length
    : 50;
  const marginPct = product && product.suggestedPrice && product.totalCost
    ? ((Number(product.suggestedPrice) - Number(product.totalCost)) / Number(product.suggestedPrice)) * 100
    : 0;

  return {
    product,
    userId,
    productId,
    avgOpportunityScore,
    avgTrendScore,
    trendMomentum: avgTrendScore,
    salesVelocity,
    conversionRate,
    marginPct,
    marginStability: marginPct >= STRATEGY_MIN_MARGIN_PCT ? 80 : 40,
    isWinner: winnerCount > 0,
    listingCount: listings.length,
    marketplaces: listings.map((l) => l.marketplace),
    expansionsToday: decisionsToday,
  };
}

function computeStrategyScore(signals: Awaited<ReturnType<typeof getProductStrategySignals>>): number {
  const s = signals;
  const trend = Math.min(100, s.trendMomentum);
  const velocity = Math.min(100, Math.log1p(s.salesVelocity + 1) * 20);
  const conversion = Math.min(100, s.conversionRate * 500);
  const margin = s.marginPct >= STRATEGY_MIN_MARGIN_PCT ? 70 : 30;
  const score =
    trend * 0.25 +
    velocity * 0.25 +
    conversion * 0.2 +
    margin * 0.15 +
    (s.isWinner ? 15 : 0) +
    (s.listingCount > 0 ? 5 : 0);
  return Math.min(100, Math.max(0, score));
}

function selectDecisionType(
  signals: Awaited<ReturnType<typeof getProductStrategySignals>>,
  strategyScore: number
): { decisionType: DecisionType; reason: string } | null {
  if (signals.product?.status === 'REJECTED') return null;
  if (strategyScore >= 70 && signals.isWinner && signals.listingCount < 3) {
    const missing = ['mercadolibre', 'ebay', 'amazon'].filter((m) => !signals.marketplaces.includes(m));
    if (missing.length > 0 && signals.expansionsToday < STRATEGY_MAX_MARKETPLACE_EXPANSIONS) {
      return { decisionType: 'expand_marketplace', reason: 'winner_high_score_expand' };
    }
    return { decisionType: 'scale_listing', reason: 'winner_scale' };
  }
  if (strategyScore >= 55 && strategyScore < 70 && signals.conversionRate < 0.03) {
    return { decisionType: 'adjust_price', reason: 'low_conversion_adjust_price' };
  }
  if (strategyScore < 35 && signals.salesVelocity === 0 && signals.listingCount > 0) {
    return { decisionType: 'pause_listing', reason: 'underperforming_pause' };
  }
  if (strategyScore >= 60 && signals.listingCount === 0) {
    return { decisionType: 'scale_listing', reason: 'high_score_no_listings' };
  }
  return null;
}

export async function runAIStrategyBrain(): Promise<StrategyBrainRunResult> {
  const result: StrategyBrainRunResult = { decisionsCreated: 0, actionsTriggered: 0, skippedBySafety: 0, errors: [] };

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const expansionsToday = await prisma.strategyDecision.count({
      where: { decisionType: 'expand_marketplace', executed: true, createdAt: { gte: todayStart } },
    });
    const atExpansionLimit = expansionsToday >= STRATEGY_MAX_NEW_LISTINGS_PER_DAY;

    const productIds = await prisma.product.findMany({
      where: { status: { not: 'REJECTED' } },
      select: { id: true, userId: true },
      take: 300,
    });

    for (const { id: productId, userId } of productIds) {
      try {
        const signals = await getProductStrategySignals(productId, userId);
        if (!signals.product) continue;
        if (signals.marginPct < STRATEGY_MIN_MARGIN_PCT && signals.listingCount === 0) {
          result.skippedBySafety++;
          continue;
        }

        const strategyScore = computeStrategyScore(signals);
        const decision = selectDecisionType(signals, strategyScore);
        if (!decision) continue;

        if (decision.decisionType === 'expand_marketplace' && atExpansionLimit) {
          result.skippedBySafety++;
          continue;
        }

        const existing = await prisma.strategyDecision.findFirst({
          where: {
            productId,
            decisionType: decision.decisionType,
            createdAt: { gte: todayStart },
          },
        });
        if (existing) continue;

        const record = await prisma.strategyDecision.create({
          data: {
            userId,
            productId,
            decisionType: decision.decisionType,
            score: new Decimal(strategyScore),
            reason: decision.reason,
            executed: false,
          },
        });
        result.decisionsCreated++;

        if (decision.decisionType === 'expand_marketplace') {
          const allMp = ['mercadolibre', 'ebay', 'amazon'] as const;
          const nextMp = allMp.find((m) => !signals.marketplaces.includes(m));
          if (nextMp) {
            const { jobService } = await import('./job.service');
            const job = await jobService.addPublishingJob({ userId, productId, marketplaces: [nextMp] });
            if (job) {
              await prisma.strategyDecision.update({
                where: { id: record.id },
                data: { executed: true },
              });
              result.actionsTriggered++;
            }
          }
        }
      } catch (e: any) {
        result.errors.push(`product ${productId}: ${e?.message || String(e)}`);
        logger.warn('[AI-STRATEGY-BRAIN] Product failed', { productId, error: e?.message });
      }
    }

    logger.info('[AI-STRATEGY-BRAIN] Run complete', result);
    return result;
  } catch (e: any) {
    logger.error('[AI-STRATEGY-BRAIN] Run failed', { error: e?.message });
    result.errors.push(e?.message || String(e));
    return result;
  }
}
