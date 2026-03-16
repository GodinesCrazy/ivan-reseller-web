/**
 * Phase 3: Winner Product Detection Engine
 * Analyzes listing_metrics (impressions, clicks, sales, conversion) and sales data
 * to detect winning products. Stores results in winning_products table.
 * Criteria: minimum impressions, minimum conversion rate, minimum sales velocity.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

const MIN_IMPRESSIONS = Number(process.env.WINNER_MIN_IMPRESSIONS || '100');
const MIN_CONVERSION_RATE = Number(process.env.WINNER_MIN_CONVERSION_RATE || '0.01');
const MIN_SALES_IN_WINDOW = Number(process.env.WINNER_MIN_SALES_METRICS || '2');
const DAYS_WINDOW_METRICS = Number(process.env.WINNER_DAYS_WINDOW_METRICS || '14');

export interface MetricsWinnerRow {
  listingId: number;
  productId: number;
  userId: number;
  marketplace: string;
  impressions: number;
  clicks: number;
  sales: number;
  conversionRate: number | null;
  salesVelocity: number; // sales per day
}

export interface WinnerDetectionMetricsResult {
  evaluated: number;
  winnersStored: number;
  errors: string[];
}

/**
 * Aggregate listing_metrics for the last N days per listing, then evaluate winner criteria.
 * Stores qualifying listings in winning_products and sets Product.winnerDetectedAt when applicable.
 */
export async function runMetricsBasedWinnerDetection(): Promise<WinnerDetectionMetricsResult> {
  const result: WinnerDetectionMetricsResult = { evaluated: 0, winnersStored: 0, errors: [] };
  const since = new Date();
  since.setDate(since.getDate() - DAYS_WINDOW_METRICS);
  since.setUTCHours(0, 0, 0, 0);

  try {
    const listings = await prisma.marketplaceListing.findMany({
      where: { publishedAt: { not: null } },
      select: {
        id: true,
        productId: true,
        userId: true,
        marketplace: true,
        listingMetrics: {
          where: { date: { gte: since } },
          select: {
            impressions: true,
            clicks: true,
            sales: true,
            conversionRate: true,
          },
        },
      },
    });

    const winners: Array<{
      listingId: number;
      productId: number;
      userId: number;
      marketplace: string;
      score: number;
      reason: string;
      metadata: { impressions: number; clicks: number; sales: number; conversionRate: number | null; salesVelocity: number };
    }> = [];

    for (const listing of listings) {
      result.evaluated++;
      const metrics = listing.listingMetrics || [];
      const impressions = metrics.reduce((s, m) => s + (m.impressions || 0), 0);
      const clicks = metrics.reduce((s, m) => s + (m.clicks || 0), 0);
      const sales = metrics.reduce((s, m) => s + (m.sales || 0), 0);
      const lastConv = metrics.length > 0 && metrics[0].conversionRate != null
        ? toNumber(metrics[0].conversionRate)
        : impressions > 0 && sales > 0
          ? sales / impressions
          : null;
      const conversionRate = lastConv ?? (impressions > 0 && sales > 0 ? sales / impressions : null);
      const salesVelocity = DAYS_WINDOW_METRICS > 0 ? sales / DAYS_WINDOW_METRICS : 0;

      if (impressions < MIN_IMPRESSIONS) continue;
      if (conversionRate != null && conversionRate < MIN_CONVERSION_RATE) continue;
      if (sales < MIN_SALES_IN_WINDOW) continue;

      const score = computeWinnerScore(impressions, conversionRate ?? 0, salesVelocity);
      const reason = 'high_conversion_sales_velocity';
      winners.push({
        listingId: listing.id,
        productId: listing.productId,
        userId: listing.userId,
        marketplace: listing.marketplace,
        score,
        reason,
        metadata: { impressions, clicks, sales, conversionRate, salesVelocity },
      });
    }

    for (const w of winners) {
      try {
        const existing = await prisma.winningProduct.findFirst({
          where: {
            productId: w.productId,
            marketplaceListingId: w.listingId,
            marketplace: w.marketplace,
          },
        });
        if (existing) {
          await prisma.winningProduct.update({
            where: { id: existing.id },
            data: {
              score: w.score,
              reason: w.reason,
              detectedAt: new Date(),
              metadata: w.metadata as any,
            },
          });
        } else {
          await prisma.winningProduct.create({
            data: {
              productId: w.productId,
              marketplaceListingId: w.listingId,
              marketplace: w.marketplace,
              userId: w.userId,
              score: w.score,
              reason: w.reason,
              metadata: w.metadata as any,
            },
          });
        }
        result.winnersStored++;
        try {
          await prisma.product.update({
            where: { id: w.productId },
            data: { winnerDetectedAt: new Date() },
          });
        } catch {
          /* ignore */
        }
        triggerWinnerFollowUp(w.productId, w.listingId, w.marketplace, w.userId).catch(() => {});
      } catch (e: any) {
        result.errors.push(`listing ${w.listingId}: ${e?.message || String(e)}`);
      }
    }

    logger.info('[WINNER-DETECTION] Metrics-based run complete', {
      evaluated: result.evaluated,
      winnersStored: result.winnersStored,
      criteria: { MIN_IMPRESSIONS, MIN_CONVERSION_RATE, MIN_SALES_IN_WINDOW, DAYS_WINDOW_METRICS },
    });
    return result;
  } catch (error: any) {
    logger.error('[WINNER-DETECTION] Metrics-based run failed', { error: error?.message });
    result.errors.push(error?.message || String(error));
    return result;
  }
}

function computeWinnerScore(impressions: number, conversionRate: number, salesVelocity: number): number {
  const convScore = Math.min(40, conversionRate * 400); // 10% conv -> 40
  const velocityScore = Math.min(30, salesVelocity * 10); // 3 sales/day -> 30
  const impScore = Math.min(30, impressions / 5000); // 150k imp -> 30
  return Math.round((convScore + velocityScore + impScore) * 100) / 100;
}

/**
 * Phase 3: Follow-up actions when a winner is detected.
 * - Increases monitoring priority (Product.winnerDetectedAt already set).
 * - Optionally enqueues winner-follow-up job for listing optimization / scaling (when WINNER_TRIGGER_FOLLOW_UP=true).
 */
async function triggerWinnerFollowUp(
  productId: number,
  listingId: number,
  marketplace: string,
  userId: number
): Promise<void> {
  logger.info('[WINNER-DETECTION] Follow-up: high-priority monitoring', {
    productId,
    listingId,
    marketplace,
    userId,
  });
  if (process.env.WINNER_TRIGGER_FOLLOW_UP !== 'true') return;
  try {
    const { getScheduledTasksService } = await import('./scheduled-tasks.service');
    const svc = getScheduledTasksService();
    if (svc?.addWinnerFollowUpJob) {
      await svc.addWinnerFollowUpJob({ productId, listingId, marketplace, userId });
    }
  } catch (e: any) {
    logger.warn('[WINNER-DETECTION] Follow-up enqueue failed', { productId, error: e?.message });
  }
}
