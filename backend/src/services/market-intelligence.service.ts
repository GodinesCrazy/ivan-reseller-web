/**
 * Phase 4: Market Intelligence Engine
 * Discovers high-potential products from market signals (listing metrics, AliExpress, trends, competition).
 * Scores: trendScore, demandScore, competitionScore, marginScore, supplierScore → opportunityScore 0–100.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Decimal } from '@prisma/client/runtime/library';

const WEIGHTS = {
  trend: 0.20,
  demand: 0.30,
  competition: 0.20,
  margin: 0.20,
  supplier: 0.10,
};

const DEFAULT_SCORE = 50; // when no data

function toDecimal(n: number): Decimal {
  return new Decimal(Math.min(100, Math.max(0, n)));
}

export interface MarketIntelligenceRunResult {
  processed: number;
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Aggregate listing metrics for a product (last 30 days): impressions, clicks, sales.
 */
async function getProductListingMetrics(productId: number): Promise<{ impressions: number; clicks: number; sales: number }> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const listingIds = await prisma.marketplaceListing.findMany({
    where: { productId },
    select: { id: true },
  }).then((rows) => rows.map((r) => r.id));

  if (listingIds.length === 0) return { impressions: 0, clicks: 0, sales: 0 };

  const agg = await prisma.listingMetric.aggregate({
    where: {
      listingId: { in: listingIds },
      date: { gte: since },
    },
    _sum: { impressions: true, clicks: true, sales: true },
  });

  return {
    impressions: agg._sum.impressions ?? 0,
    clicks: agg._sum.clicks ?? 0,
    sales: agg._sum.sales ?? 0,
  };
}

/**
 * Phase 7: Fetch external trend score from demand_signals (keyword match on title).
 */
async function getExternalTrendScore(title: string): Promise<number | null> {
  if (!title || title.length < 2) return null;
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;
  const signals = await prisma.demandSignal.findMany({
    where: {
      detectedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      OR: words.slice(0, 5).map((w) => ({ keyword: { contains: w, mode: 'insensitive' as const } })),
    },
    orderBy: { trendScore: 'desc' },
    take: 10,
    select: { trendScore: true, confidence: true },
  });
  if (signals.length === 0) return null;
  const weighted = signals.reduce((acc, s) => acc + Number(s.trendScore) * Number(s.confidence), 0);
  const sumConf = signals.reduce((acc, s) => acc + Number(s.confidence), 0);
  return sumConf > 0 ? Math.min(100, Math.max(0, weighted / sumConf)) : null;
}

/**
 * Compute component scores (0–100) for a product. Phase 7: trendScore blends external demand_signals when available.
 */
function computeScores(
  product: { aliexpressPrice: Decimal; suggestedPrice: Decimal; totalCost?: Decimal | null },
  metrics: { impressions: number; clicks: number; sales: number },
  externalTrendScore: number | null
): { trendScore: number; demandScore: number; competitionScore: number; marginScore: number; supplierScore: number } {
  const cost = product.totalCost ?? product.aliexpressPrice;
  const price = Number(product.suggestedPrice) || 1;
  const costNum = Number(cost) || 0;
  const marginPct = price > 0 ? ((price - costNum) / price) * 100 : 0;
  const marginScore = Math.min(100, Math.max(0, marginPct * 2)); // 50% margin -> 100

  const demand = metrics.impressions * 0.1 + metrics.clicks * 2 + metrics.sales * 10;
  const demandScore = Math.min(100, Math.log1p(demand) * 15); // log scale 0–100

  const trendScore =
    externalTrendScore != null ? 0.6 * externalTrendScore + 0.4 * DEFAULT_SCORE : DEFAULT_SCORE;

  return {
    trendScore: Math.min(100, Math.max(0, trendScore)),
    demandScore,
    competitionScore: DEFAULT_SCORE,
    marginScore,
    supplierScore: DEFAULT_SCORE,
  };
}

/**
 * Composite opportunity score 0–100.
 */
function compositeScore(scores: ReturnType<typeof computeScores>): number {
  const s = scores;
  return (
    s.trendScore * WEIGHTS.trend +
    s.demandScore * WEIGHTS.demand +
    s.competitionScore * WEIGHTS.competition +
    s.marginScore * WEIGHTS.margin +
    s.supplierScore * WEIGHTS.supplier
  );
}

/**
 * Run market intelligence: collect signals, score products, upsert market_opportunities.
 * Optionally scope to a single userId (job payload).
 */
export async function runMarketIntelligence(userId?: number): Promise<MarketIntelligenceRunResult> {
  const result: MarketIntelligenceRunResult = { processed: 0, created: 0, updated: 0, errors: [] };

  try {
    const where = userId ? { userId } : {};
    const products = await prisma.product.findMany({
      where: { ...where, status: { not: 'REJECTED' } },
      select: {
        id: true,
        userId: true,
        aliexpressPrice: true,
        suggestedPrice: true,
        totalCost: true,
        title: true,
      },
    });

    for (const product of products) {
      try {
        const metrics = await getProductListingMetrics(product.id);
        const source = metrics.impressions > 0 || metrics.clicks > 0 || metrics.sales > 0 ? 'listing_metrics' : 'aliexpress';

        const externalTrendScore = await getExternalTrendScore(product.title || '');
        const scores = computeScores(product, metrics, externalTrendScore);
        const score = compositeScore(scores);

        const existing = await prisma.marketOpportunity.findFirst({
          where: { userId: product.userId, productId: product.id, source },
        });

        const data = {
          score: toDecimal(score),
          trendScore: toDecimal(scores.trendScore),
          demandScore: toDecimal(scores.demandScore),
          competitionScore: toDecimal(scores.competitionScore),
          marginScore: toDecimal(scores.marginScore),
          supplierScore: toDecimal(scores.supplierScore),
          detectedAt: new Date(),
        };

        if (existing) {
          await prisma.marketOpportunity.update({
            where: { id: existing.id },
            data,
          });
          result.updated++;
        } else {
          await prisma.marketOpportunity.create({
            data: {
              userId: product.userId,
              productId: product.id,
              source,
              ...data,
            },
          });
          result.created++;
        }
        result.processed++;
      } catch (e: any) {
        result.errors.push(`product ${product.id}: ${e?.message || String(e)}`);
        logger.warn('[MARKET-INTEL] Product score failed', { productId: product.id, error: e?.message });
      }
    }

    logger.info('[MARKET-INTEL] Run complete', result);
    return result;
  } catch (e: any) {
    logger.error('[MARKET-INTEL] Run failed', { error: e?.message });
    result.errors.push(e?.message || String(e));
    return result;
  }
}
