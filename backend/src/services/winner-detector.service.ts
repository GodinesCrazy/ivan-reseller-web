/**
 * Spec: Winner detection — sales_last_3_days >= 5 (configurable) -> mark winner, optional republish/duplicate.
 * Persists Product.winnerDetectedAt. Keeps existing shouldRepeatWinner (WinningScore) in product-performance.engine.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';

const WINNER_SALES_THRESHOLD = Number(process.env.WINNER_SALES_THRESHOLD || '5');
const WINNER_DAYS_WINDOW = Number(process.env.WINNER_DAYS_WINDOW || '3');

export interface WinnerDetectionResult {
  detected: number;
  updated: number;
  errors: string[];
}

/**
 * Run winner detection: for each user, find products with sales in last N days >= threshold, set winnerDetectedAt.
 */
export async function runWinnerDetection(): Promise<WinnerDetectionResult> {
  const result: WinnerDetectionResult = { detected: 0, updated: 0, errors: [] };
  const since = new Date(Date.now() - WINNER_DAYS_WINDOW * 24 * 60 * 60 * 1000);

  try {
    const salesByProduct = await prisma.sale.groupBy({
      by: ['productId', 'userId'],
      where: {
        createdAt: { gte: since },
        status: { not: 'CANCELLED' },
      },
      _count: { id: true },
    });

    for (const row of salesByProduct) {
      if (row._count.id < WINNER_SALES_THRESHOLD) continue;
      result.detected++;
      try {
        await prisma.product.updateMany({
          where: {
            id: row.productId,
            userId: row.userId,
          },
          data: {
            winnerDetectedAt: new Date(),
          },
        });
        result.updated++;
        logger.info('[WINNER-DETECTOR] Marked winner', {
          productId: row.productId,
          userId: row.userId,
          salesInWindow: row._count.id,
          threshold: WINNER_SALES_THRESHOLD,
          daysWindow: WINNER_DAYS_WINDOW,
        });
      } catch (e: any) {
        result.errors.push(`product ${row.productId}: ${e?.message || String(e)}`);
      }
    }

    // Optional: WINNER_DETECTOR_REPUBLISH could trigger republish/duplicate when publish API supports by productId
    if (process.env.WINNER_DETECTOR_REPUBLISH === 'true' && result.updated > 0) {
      logger.info('[WINNER-DETECTOR] Republish/duplicate not implemented per product; winners marked in DB', { updated: result.updated });
    }

    logger.info('[WINNER-DETECTOR] Run complete', result);
    return result;
  } catch (error: any) {
    logger.error('[WINNER-DETECTOR] Run failed', { error: error?.message });
    result.errors.push(error?.message || String(error));
    return result;
  }
}
