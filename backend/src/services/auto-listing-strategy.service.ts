/**
 * Phase 5: Auto Listing Strategy Engine
 * Converts market opportunities + winner signals into listing decisions (product, marketplace, priority).
 *
 * Task 7 — Safety limits (env):
 * - AUTO_LISTING_MIN_SCORE       Min priority score 0–100 to consider (default 50)
 * - AUTO_LISTING_MAX_PER_DAY     Max decisions/jobs per day (default 20)
 * - AUTO_LISTING_MAX_PER_MARKETPLACE  Max per marketplace per day (default 10)
 * - AUTO_LISTING_MIN_MARGIN_PCT  Min estimated margin % to consider (default 15)
 * - AUTO_LISTING_STRATEGY_CRON  Cron for daily run (default 0 6 * * *)
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { jobService } from './job.service';

const AUTO_LISTING_MIN_SCORE = Number(process.env.AUTO_LISTING_MIN_SCORE || '50');
// Phase 23: Sales Acceleration Mode can raise limit via AUTONOMOUS_MAX_LISTINGS_PER_DAY (e.g. 40)
const AUTO_LISTING_MAX_PER_DAY = Number(
  process.env.AUTONOMOUS_MAX_LISTINGS_PER_DAY || process.env.AUTO_LISTING_MAX_PER_DAY || '20'
);
const AUTO_LISTING_MAX_PER_MARKETPLACE = Number(process.env.AUTO_LISTING_MAX_PER_MARKETPLACE || '10');
const AUTO_LISTING_MIN_MARGIN_PCT = Number(process.env.AUTO_LISTING_MIN_MARGIN_PCT || '15');

const WEIGHTS = {
  opportunityScore: 0.35,
  trendScore: 0.20,
  marginScore: 0.25,
  competitionInverse: 0.15,
  supplierStock: 0.05,
};

const MARKETPLACES = ['mercadolibre', 'ebay', 'amazon'] as const;

export interface ListingDecision {
  productId: number;
  userId: number;
  marketplace: string;
  priorityScore: number;
  decisionReason: string;
}

export interface AutoListingStrategyRunResult {
  decisionsCreated: number;
  jobsEnqueued: number;
  skippedByLimit: number;
  skippedByScore: number;
  errors: string[];
}

function toNum(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Math.min(100, Math.max(0, Number(d)));
}

/**
 * Count decisions created today (for daily limit).
 */
async function countDecisionsToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.autoListingDecision.count({ where: { createdAt: { gte: start } } });
}

/**
 * Count decisions today per marketplace (for per-marketplace limit).
 */
async function countDecisionsTodayByMarketplace(marketplace: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.autoListingDecision.count({
    where: { marketplace, createdAt: { gte: start } },
  });
}

/**
 * Select best marketplace for a product: prefer one with existing demand or least competition.
 * Fallback: first available (mercadolibre, ebay, amazon).
 */
async function selectMarketplace(
  productId: number,
  userId: number
): Promise<string> {
  const listings = await prisma.marketplaceListing.findMany({
    where: { productId, userId },
    select: { marketplace: true },
  });
  const existing = new Set(listings.map((l) => l.marketplace));

  const metrics = await prisma.listingMetric.findMany({
    where: {
      marketplaceListing: { productId, userId },
    },
    select: {
      marketplace: true,
      impressions: true,
      sales: true,
    },
  });

  const byMp = new Map<string, { impressions: number; sales: number }>();
  for (const m of metrics) {
    const cur = byMp.get(m.marketplace) ?? { impressions: 0, sales: 0 };
    cur.impressions += m.impressions ?? 0;
    cur.sales += m.sales ?? 0;
    byMp.set(m.marketplace, cur);
  }

  for (const mp of MARKETPLACES) {
    if (existing.has(mp)) continue;
    const data = byMp.get(mp);
    if (data && (data.impressions > 0 || data.sales > 0)) return mp;
  }
  return MARKETPLACES[0];
}

/**
 * Run strategy: load opportunities, score, apply limits, persist decisions, optionally enqueue jobs.
 */
export async function runAutoListingStrategy(enqueueJobs: boolean = true): Promise<AutoListingStrategyRunResult> {
  const result: AutoListingStrategyRunResult = {
    decisionsCreated: 0,
    jobsEnqueued: 0,
    skippedByLimit: 0,
    skippedByScore: 0,
    errors: [],
  };

  try {
    const todayCount = await countDecisionsToday();
    if (todayCount >= AUTO_LISTING_MAX_PER_DAY) {
      logger.info('[AUTO-LISTING] Skipping: daily limit reached', {
        todayCount,
        max: AUTO_LISTING_MAX_PER_DAY,
      });
      return result;
    }

    const opportunities = await prisma.marketOpportunity.findMany({
      where: { productId: { not: null } },
      include: {
        product: {
          select: {
            id: true,
            userId: true,
            title: true,
            status: true,
            aliexpressPrice: true,
            suggestedPrice: true,
            totalCost: true,
            supplierStock: true,
            isPublished: true,
          },
        },
      },
      orderBy: { score: 'desc' },
      take: 200,
    });

    const winnerProductIds = new Set(
      (
        await prisma.winningProduct.findMany({
          where: { detectedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          select: { productId: true },
        })
      ).map((w) => w.productId)
    );

    const candidates: Array<{
      productId: number;
      userId: number;
      priorityScore: number;
      decisionReason: string;
    }> = [];

    for (const opp of opportunities) {
      const product = opp.product as any;
      if (!product || product.status === 'REJECTED' || product.isPublished) continue;

      const opportunityScore = toNum(opp.score);
      const trendScore = toNum(opp.trendScore);
      const marginScore = toNum(opp.marginScore);
      const competitionScore = toNum(opp.competitionScore);
      const supplierStock = product?.supplierStock ?? 0;
      const supplierStockScore = Math.min(100, supplierStock ? Math.log1p(supplierStock) * 15 : 50);

      const price = Number(product?.suggestedPrice) || 0;
      const cost = Number(product?.totalCost ?? product?.aliexpressPrice) || 0;
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
      if (marginPct < AUTO_LISTING_MIN_MARGIN_PCT) continue;

      const listingPriorityScore =
        opportunityScore * WEIGHTS.opportunityScore +
        trendScore * WEIGHTS.trendScore +
        marginScore * WEIGHTS.marginScore +
        (100 - competitionScore) * WEIGHTS.competitionInverse +
        supplierStockScore * WEIGHTS.supplierStock;

      if (listingPriorityScore < AUTO_LISTING_MIN_SCORE) {
        result.skippedByScore++;
        continue;
      }

      const reason = winnerProductIds.has(product.id)
        ? 'winner_high_opportunity'
        : 'high_opportunity_margin';

      candidates.push({
        productId: product.id,
        userId: product.userId,
        priorityScore: Math.min(100, Math.max(0, listingPriorityScore)),
        decisionReason: reason,
      });
    }

    const remainingDaily = Math.max(0, AUTO_LISTING_MAX_PER_DAY - todayCount);
    const toProcess = candidates.slice(0, remainingDaily);

    const perMarketplaceToday = new Map<string, number>();
    const getCount = async (mp: string) => {
      if (!perMarketplaceToday.has(mp)) {
        perMarketplaceToday.set(mp, await countDecisionsTodayByMarketplace(mp));
      }
      return perMarketplaceToday.get(mp)!;
    };
    const incMarketplace = async (mp: string) => {
      const count = await getCount(mp);
      perMarketplaceToday.set(mp, count + 1);
    };

    for (const c of toProcess) {
      const marketplace = await selectMarketplace(c.productId, c.userId);
      const count = await getCount(marketplace);
      if (count >= AUTO_LISTING_MAX_PER_MARKETPLACE) {
        result.skippedByLimit++;
        continue;
      }

      try {
        const decision = await prisma.autoListingDecision.create({
          data: {
            userId: c.userId,
            productId: c.productId,
            marketplace,
            priorityScore: new Decimal(c.priorityScore),
            decisionReason: c.decisionReason,
            executed: false,
          },
        });
        result.decisionsCreated++;
        await incMarketplace(marketplace);

        if (enqueueJobs) {
          const job = await jobService.addPublishingJob({
            userId: c.userId,
            productId: c.productId,
            marketplaces: [marketplace],
          });
          if (job) {
            result.jobsEnqueued++;
            await prisma.autoListingDecision.update({
              where: { id: decision.id },
              data: { executed: true },
            });
          }
        }
      } catch (e: any) {
        result.errors.push(`product ${c.productId}: ${e?.message || String(e)}`);
        logger.warn('[AUTO-LISTING] Decision create failed', { productId: c.productId, error: e?.message });
      }
    }

    logger.info('[AUTO-LISTING] Run complete', result);
    return result;
  } catch (e: any) {
    logger.error('[AUTO-LISTING] Run failed', { error: e?.message });
    result.errors.push(e?.message || String(e));
    return result;
  }
}
