/**
 * Daily safety limits: MAX_DAILY_ORDERS, MAX_DAILY_SPEND_USD
 * Blocks order creation when limits exceeded.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

const MAX_DAILY_ORDERS = Number(process.env.MAX_DAILY_ORDERS || '100');
const MAX_DAILY_SPEND_USD = Number(process.env.MAX_DAILY_SPEND_USD || '10000');

export interface DailyLimitCheckResult {
  ok: boolean;
  error?: string;
  ordersToday?: number;
  spendTodayUsd?: number;
}

/**
 * Check if creating a new order would exceed daily limits.
 * @param userId - Optional user ID. When Order has userId, we filter by it. For now uses global limits.
 * @param amountUsd - Amount of the new order in USD
 */
export async function checkDailyLimits(userId?: number, amountUsd?: number): Promise<DailyLimitCheckResult> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: { createdAt: { gte: Date } } = {
      createdAt: { gte: today },
    };

    const ordersToday = await prisma.order.count({
      where: where as any,
    });

    const spendResult = await prisma.order.aggregate({
      where: where as any,
      _sum: { price: true },
    });
    const spendTodayUsd = Number(spendResult._sum.price || 0);
    const newTotalUsd = spendTodayUsd + (amountUsd || 0);

    if (ordersToday >= MAX_DAILY_ORDERS) {
      logger.warn('[DAILY-LIMITS] MAX_DAILY_ORDERS exceeded', {
        ordersToday,
        max: MAX_DAILY_ORDERS,
        userId,
      });
      return {
        ok: false,
        error: `MAX_DAILY_ORDERS exceeded: ${ordersToday}/${MAX_DAILY_ORDERS}`,
        ordersToday,
        spendTodayUsd,
      };
    }

    if (newTotalUsd > MAX_DAILY_SPEND_USD) {
      logger.warn('[DAILY-LIMITS] MAX_DAILY_SPEND_USD would be exceeded', {
        spendTodayUsd,
        newTotalUsd,
        max: MAX_DAILY_SPEND_USD,
        userId,
      });
      return {
        ok: false,
        error: `MAX_DAILY_SPEND_USD would be exceeded: $${newTotalUsd.toFixed(2)} > $${MAX_DAILY_SPEND_USD}`,
        ordersToday,
        spendTodayUsd,
      };
    }

    return { ok: true, ordersToday, spendTodayUsd };
  } catch (err: any) {
    logger.error('[DAILY-LIMITS] Check failed', { error: err?.message });
    return { ok: false, error: err?.message || 'Daily limits check failed' };
  }
}

export const dailyLimitsService = {
  check: checkDailyLimits,
  maxOrders: MAX_DAILY_ORDERS,
  maxSpendUsd: MAX_DAILY_SPEND_USD,
};
