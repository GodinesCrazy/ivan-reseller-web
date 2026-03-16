/**
 * Phase 6: Dynamic Marketplace Optimization Engine
 * Analyzes listing_metrics, winning_products; computes signals (low CTR, low conversion, competitor lower, declining velocity).
 * Actions: price_adjustment, title_seo_update, image_rotation, marketplace_expansion.
 *
 * Task 7 — Safety (env):
 * - OPTIMIZATION_MAX_PRICE_CHANGE_PCT   Max price change % per action (default 15)
 * - OPTIMIZATION_MIN_MARGIN_PCT         Min margin to allow price change (default 10)
 * - OPTIMIZATION_MAX_ACTIONS_PER_LISTING_PER_DAY  (default 3)
 * - OPTIMIZATION_LOW_CTR_THRESHOLD      CTR below this triggers title/image (default 0.02)
 * - OPTIMIZATION_LOW_CONVERSION_THRESHOLD  Conversion below this triggers price (default 0.01)
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

const MAX_PRICE_CHANGE_PCT = Number(process.env.OPTIMIZATION_MAX_PRICE_CHANGE_PCT || '15');
const MIN_MARGIN_PCT = Number(process.env.OPTIMIZATION_MIN_MARGIN_PCT || '10');
const MAX_ACTIONS_PER_LISTING_PER_DAY = Number(process.env.OPTIMIZATION_MAX_ACTIONS_PER_LISTING_PER_DAY || '3');
const LOW_CTR_THRESHOLD = Number(process.env.OPTIMIZATION_LOW_CTR_THRESHOLD || '0.02');
const LOW_CONVERSION_THRESHOLD = Number(process.env.OPTIMIZATION_LOW_CONVERSION_THRESHOLD || '0.01');

const ACTION_TYPES = ['price_adjustment', 'title_seo_update', 'image_rotation', 'marketplace_expansion'] as const;
type ActionType = (typeof ACTION_TYPES)[number];

export interface OptimizationRunResult {
  scanned: number;
  actionsCreated: number;
  actionsExecuted: number;
  skippedByLimit: number;
  errors: string[];
}

async function countActionsTodayForListing(listingId: number): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.listingOptimizationAction.count({
    where: { listingId, createdAt: { gte: start } },
  });
}

/**
 * Aggregate metrics for a listing (last 14 days).
 */
async function getListingMetricsAggregate(listingId: number): Promise<{
  impressions: number;
  clicks: number;
  sales: number;
  conversionRate: number | null;
  avgPrice: number | null;
  avgCompetitorPrice: number | null;
}> {
  const since = new Date();
  since.setDate(since.getDate() - 14);

  const metrics = await prisma.listingMetric.findMany({
    where: { listingId, date: { gte: since } },
  });

  let impressions = 0;
  let clicks = 0;
  let sales = 0;
  let sumConv = 0;
  let convCount = 0;
  let sumPrice = 0;
  let priceCount = 0;
  let sumComp = 0;
  let compCount = 0;

  for (const m of metrics) {
    impressions += m.impressions ?? 0;
    clicks += m.clicks ?? 0;
    sales += m.sales ?? 0;
    if (m.conversionRate != null) {
      sumConv += toNumber(m.conversionRate);
      convCount++;
    }
    if (m.price != null) {
      sumPrice += toNumber(m.price);
      priceCount++;
    }
    if (m.competitorPrice != null) {
      sumComp += toNumber(m.competitorPrice);
      compCount++;
    }
  }

  return {
    impressions,
    clicks,
    sales,
    conversionRate: convCount > 0 ? sumConv / convCount : null,
    avgPrice: priceCount > 0 ? sumPrice / priceCount : null,
    avgCompetitorPrice: compCount > 0 ? sumComp / compCount : null,
  };
}

/**
 * Run optimization: scan active listings, compute signals, create actions, optionally execute.
 */
export async function runDynamicMarketplaceOptimization(executeActions: boolean = true): Promise<OptimizationRunResult> {
  const result: OptimizationRunResult = {
    scanned: 0,
    actionsCreated: 0,
    actionsExecuted: 0,
    skippedByLimit: 0,
    errors: [],
  };

  try {
    const listings = await prisma.marketplaceListing.findMany({
      where: { publishedAt: { not: null } },
      include: {
        product: {
          select: {
            id: true,
            userId: true,
            title: true,
            suggestedPrice: true,
            aliexpressPrice: true,
            totalCost: true,
          },
        },
      },
      take: 500,
    });

    const winnerListingIds = new Set(
      (
        await prisma.winningProduct.findMany({
          where: { marketplaceListingId: { not: null }, detectedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          select: { marketplaceListingId: true },
        })
      )
        .map((w) => w.marketplaceListingId)
        .filter((id): id is number => id != null)
    );

    for (const listing of listings) {
      const product = listing.product as any;
      if (!product) continue;

      result.scanned++;

      const todayCount = await countActionsTodayForListing(listing.id);
      if (todayCount >= MAX_ACTIONS_PER_LISTING_PER_DAY) {
        result.skippedByLimit++;
        continue;
      }

      const agg = await getListingMetricsAggregate(listing.id);
      const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
      const conversion = agg.conversionRate ?? 0;
      const currentPrice = Number(product?.suggestedPrice) || agg.avgPrice || 0;
      const cost = Number(product?.totalCost ?? product?.aliexpressPrice) || 0;
      const marginPct = currentPrice > 0 ? ((currentPrice - cost) / currentPrice) * 100 : 0;
      const competitorLower = (agg.avgCompetitorPrice != null && currentPrice > 0 && agg.avgCompetitorPrice < currentPrice * 0.95);

      const actionsToCreate: { actionType: ActionType; reason: string }[] = [];

      if (agg.impressions >= 100 && ctr < LOW_CTR_THRESHOLD) {
        actionsToCreate.push({ actionType: 'title_seo_update', reason: 'low_ctr' });
      }
      if (agg.impressions >= 50 && agg.clicks >= 5 && conversion < LOW_CONVERSION_THRESHOLD && marginPct >= MIN_MARGIN_PCT) {
        actionsToCreate.push({ actionType: 'price_adjustment', reason: 'low_conversion' });
      }
      if (competitorLower && marginPct >= MIN_MARGIN_PCT) {
        actionsToCreate.push({ actionType: 'price_adjustment', reason: 'competitor_lower' });
      }
      if (winnerListingIds.has(listing.id)) {
        actionsToCreate.push({ actionType: 'marketplace_expansion', reason: 'winner_expand' });
      }

      const remaining = Math.max(0, MAX_ACTIONS_PER_LISTING_PER_DAY - todayCount);
      const toApply = actionsToCreate.slice(0, remaining);

      for (const { actionType, reason } of toApply) {
        try {
          const action = await prisma.listingOptimizationAction.create({
            data: { listingId: listing.id, actionType, reason, executed: false },
          });
          result.actionsCreated++;

          if (executeActions) {
            let ok = false;
            const userId = listing.userId;
            const productId = product.id;
            const marketplace = listing.marketplace as 'ebay' | 'amazon' | 'mercadolibre';

            if (actionType === 'price_adjustment') {
              const { dynamicPricingService } = await import('./dynamic-pricing.service');
              const supplierPrice = Number(product.aliexpressPrice) || cost;
              const repriceResult = await dynamicPricingService.repriceByProduct(productId, supplierPrice, marketplace, userId);
              if (repriceResult.success && repriceResult.newSuggestedPriceUsd != null) {
                const changePct = currentPrice > 0 ? (Math.abs(repriceResult.newSuggestedPriceUsd - currentPrice) / currentPrice) * 100 : 0;
                if (changePct <= MAX_PRICE_CHANGE_PCT) {
                  await prisma.product.update({
                    where: { id: productId },
                    data: {
                      suggestedPrice: repriceResult.newSuggestedPriceUsd,
                      finalPrice: repriceResult.newSuggestedPriceUsd,
                    },
                  });
                  ok = true;
                }
              }
            } else if (actionType === 'title_seo_update' && process.env.LISTING_OPTIMIZATION_REFRESH_TITLE === 'true') {
              const { listingSEOService } = await import('./listing-seo.service');
              const newTitle = await listingSEOService.generateTitle(
                { title: product.title, category: null },
                marketplace,
                'en',
                userId,
                []
              );
              if (newTitle && newTitle !== product.title) {
                await prisma.product.update({ where: { id: productId }, data: { title: newTitle } });
                ok = true;
              }
            } else if (actionType === 'image_rotation' && process.env.LISTING_OPTIMIZATION_CHANGE_IMAGE === 'true') {
              ok = false;
            } else if (actionType === 'marketplace_expansion') {
              const existing = await prisma.marketplaceListing.findMany({
                where: { productId },
                select: { marketplace: true },
              });
              const existingMp = new Set(existing.map((l) => l.marketplace));
              const allMp: Array<'ebay' | 'amazon' | 'mercadolibre'> = ['ebay', 'amazon', 'mercadolibre'];
              const nextMp = allMp.find((m) => !existingMp.has(m));
              if (nextMp) {
                const { jobService } = await import('./job.service');
                const job = await jobService.addPublishingJob({
                  userId,
                  productId,
                  marketplaces: [nextMp],
                });
                ok = !!job;
              }
            }

            if (ok) {
              await prisma.listingOptimizationAction.update({
                where: { id: action.id },
                data: { executed: true },
              });
              result.actionsExecuted++;
            }
          }
        } catch (e: any) {
          result.errors.push(`listing ${listing.id} ${actionType}: ${e?.message || String(e)}`);
          logger.warn('[DYNAMIC-OPTIMIZATION] Action failed', { listingId: listing.id, actionType, error: e?.message });
        }
      }
    }

    logger.info('[DYNAMIC-OPTIMIZATION] Run complete', result);
    return result;
  } catch (e: any) {
    logger.error('[DYNAMIC-OPTIMIZATION] Run failed', { error: e?.message });
    result.errors.push(e?.message || String(e));
    return result;
  }
}
