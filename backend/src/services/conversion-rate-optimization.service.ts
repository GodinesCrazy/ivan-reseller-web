/**
 * Phase 11: Conversion Rate Optimization Engine
 * Analyzes listing_metrics, winning_products, listing_optimization_actions (and trend/demand signals).
 * Signals: high impressions low CTR, high CTR low conversion, competitor price advantage, low image engagement.
 * Actions: image_optimization | price_adjustment | title_restructuring | description_improvement | attribute_completion.
 *
 * Safety (env):
 * - CRO_MAX_ACTIONS_PER_LISTING_PER_DAY  (default 2)
 * - CRO_MIN_MARGIN_PCT                    (default 10)
 * - CRO_MAX_PRICE_CHANGE_PCT              (default 10)
 * - CRO_LOW_CTR_THRESHOLD                 (default 0.02)
 * - CRO_LOW_CONVERSION_THRESHOLD          (default 0.01)
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';
import { Decimal } from '@prisma/client/runtime/library';

const MAX_ACTIONS_PER_LISTING_PER_DAY = Number(process.env.CRO_MAX_ACTIONS_PER_LISTING_PER_DAY || '2');
const MIN_MARGIN_PCT = Number(process.env.CRO_MIN_MARGIN_PCT || '10');
const MAX_PRICE_CHANGE_PCT = Number(process.env.CRO_MAX_PRICE_CHANGE_PCT || '10');
const LOW_CTR_THRESHOLD = Number(process.env.CRO_LOW_CTR_THRESHOLD || '0.02');
const LOW_CONVERSION_THRESHOLD = Number(process.env.CRO_LOW_CONVERSION_THRESHOLD || '0.01');

const CRO_ACTION_TYPES = [
  'image_optimization',
  'price_adjustment',
  'title_restructuring',
  'description_improvement',
  'attribute_completion',
] as const;
type CROActionType = (typeof CRO_ACTION_TYPES)[number];

const CRO_REASONS = [
  'high_impressions_low_ctr',
  'high_ctr_low_conversion',
  'competitor_price_advantage',
  'low_image_engagement',
] as const;

export interface ConversionOptimizationRunResult {
  scanned: number;
  actionsCreated: number;
  actionsExecuted: number;
  skippedByLimit: number;
  errors: string[];
}

async function countCROActionsTodayForListing(listingId: number): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.conversionOptimizationAction.count({
    where: { listingId, createdAt: { gte: start } },
  });
}

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
 * Compute CRO priority score 0–100 from signals (higher = more impactful).
 */
function computeCROScore(
  reason: string,
  impressions: number,
  ctr: number,
  conversion: number,
  competitorAdvantage: boolean
): number {
  let score = 50;
  if (reason === 'high_impressions_low_ctr' && impressions >= 500) score += 20;
  if (reason === 'high_ctr_low_conversion' && conversion < LOW_CONVERSION_THRESHOLD && impressions >= 200) score += 25;
  if (reason === 'competitor_price_advantage' && competitorAdvantage) score += 15;
  if (reason === 'low_image_engagement') score += 10;
  return Math.min(100, Math.max(0, score));
}

/**
 * Run CRO: scan published listings, detect conversion signals, create ConversionOptimizationAction records, optionally execute safe improvements.
 */
export async function runConversionRateOptimization(
  executeActions: boolean = true
): Promise<ConversionOptimizationRunResult> {
  const result: ConversionOptimizationRunResult = {
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
            description: true,
            suggestedPrice: true,
            aliexpressPrice: true,
            totalCost: true,
            category: true,
          },
        },
      },
      take: 500,
    });

    for (const listing of listings) {
      const product = listing.product as any;
      if (!product) continue;

      result.scanned++;

      const todayCount = await countCROActionsTodayForListing(listing.id);
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
      const competitorAdvantage =
        agg.avgCompetitorPrice != null && currentPrice > 0 && agg.avgCompetitorPrice < currentPrice * 0.95;

      const candidates: { actionType: CROActionType; reason: string; score: number }[] = [];

      if (agg.impressions >= 200 && ctr < LOW_CTR_THRESHOLD) {
        const score = computeCROScore('high_impressions_low_ctr', agg.impressions, ctr, conversion, competitorAdvantage);
        candidates.push({ actionType: 'title_restructuring', reason: 'high_impressions_low_ctr', score });
        candidates.push({ actionType: 'image_optimization', reason: 'high_impressions_low_ctr', score: score * 0.9 });
      }
      if (
        agg.impressions >= 100 &&
        agg.clicks >= 5 &&
        conversion < LOW_CONVERSION_THRESHOLD &&
        marginPct >= MIN_MARGIN_PCT
      ) {
        const score = computeCROScore('high_ctr_low_conversion', agg.impressions, ctr, conversion, competitorAdvantage);
        candidates.push({ actionType: 'price_adjustment', reason: 'high_ctr_low_conversion', score });
        candidates.push({ actionType: 'description_improvement', reason: 'high_ctr_low_conversion', score: score * 0.85 });
      }
      if (competitorAdvantage && marginPct >= MIN_MARGIN_PCT) {
        const score = computeCROScore('competitor_price_advantage', agg.impressions, ctr, conversion, true);
        candidates.push({ actionType: 'price_adjustment', reason: 'competitor_price_advantage', score });
      }
      if (agg.clicks >= 20 && conversion < 0.005 && agg.impressions >= 300) {
        candidates.push({
          actionType: 'image_optimization',
          reason: 'low_image_engagement',
          score: computeCROScore('low_image_engagement', agg.impressions, ctr, conversion, competitorAdvantage),
        });
      }

      const remaining = Math.max(0, MAX_ACTIONS_PER_LISTING_PER_DAY - todayCount);
      const dedup = new Map<string, { actionType: CROActionType; reason: string; score: number }>();
      for (const c of candidates) {
        const key = `${c.actionType}:${c.reason}`;
        if (!dedup.has(key) || (dedup.get(key)!.score < c.score)) dedup.set(key, c);
      }
      const toCreate = Array.from(dedup.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, remaining);

      for (const { actionType, reason, score } of toCreate) {
        try {
          const action = await prisma.conversionOptimizationAction.create({
            data: {
              listingId: listing.id,
              actionType,
              reason,
              score: new Decimal(score),
              executed: false,
            },
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
              const repriceResult = await dynamicPricingService.repriceByProduct(
                productId,
                supplierPrice,
                marketplace,
                userId
              );
              if (repriceResult.success && repriceResult.newSuggestedPriceUsd != null) {
                const changePct =
                  currentPrice > 0
                    ? (Math.abs(repriceResult.newSuggestedPriceUsd - currentPrice) / currentPrice) * 100
                    : 0;
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
            } else if (actionType === 'title_restructuring' && process.env.CRO_EXECUTE_TITLE_RESTRUCTURING === 'true') {
              const { listingSEOService } = await import('./listing-seo.service');
              const newTitle = await listingSEOService.generateTitle(
                { title: product.title, category: product.category ?? null },
                marketplace,
                'en',
                userId,
                []
              );
              if (newTitle && newTitle !== product.title) {
                await prisma.product.update({ where: { id: productId }, data: { title: newTitle } });
                ok = true;
              }
            } else if (
              actionType === 'description_improvement' &&
              process.env.CRO_EXECUTE_DESCRIPTION_IMPROVEMENT === 'true'
            ) {
              const { listingSEOService } = await import('./listing-seo.service');
              const newDesc = await listingSEOService.generateDescription(
                { title: product.title, description: product.description ?? '', category: product.category ?? null },
                marketplace,
                'en',
                userId
              );
              if (newDesc && newDesc !== (product.description || '')) {
                await prisma.product.update({ where: { id: productId }, data: { description: newDesc } });
                ok = true;
              }
            } else if (actionType === 'image_optimization' && process.env.CRO_EXECUTE_IMAGE_OPTIMIZATION === 'true') {
              // Extend image pipeline: record action; actual image processing can be wired here (background normalization, crop, contrast).
              ok = false;
            } else if (actionType === 'attribute_completion') {
              ok = false;
            }

            if (ok) {
              await prisma.conversionOptimizationAction.update({
                where: { id: action.id },
                data: { executed: true },
              });
              result.actionsExecuted++;
            }
          }
        } catch (e: any) {
          result.errors.push(`listing ${listing.id} ${actionType}: ${e?.message || String(e)}`);
          logger.warn('[CRO] Action failed', { listingId: listing.id, actionType, error: e?.message });
        }
      }
    }

    logger.info('[CRO] Run complete', result);
    return result;
  } catch (e: any) {
    logger.error('[CRO] Run failed', { error: e?.message });
    result.errors.push(e?.message || String(e));
    return result;
  }
}
