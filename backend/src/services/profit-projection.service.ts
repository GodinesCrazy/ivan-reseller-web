/**
 * Monthly Profit Projection Service
 * Estimates projected monthly profit based on historical data or default assumptions.
 *
 * With history: uses sales rate, avg net profit per sale, and active listings.
 * Without history: uses defaults (conversion 1%, ticket $30, margin 35%).
 */

import { prisma } from '../config/database';
import { toNumber } from '../utils/decimal.utils';
import { getHistoricalMetrics } from './capital-allocation.engine';

/** Defaults for users with no historical sales (PLAN_USUARIO_3000_USD_MES) */
const DEFAULT_CONVERSION_RATE = 0.01; // 1% of listings convert per month
const DEFAULT_AVG_TICKET_USD = 30;
const DEFAULT_MARGIN = 0.35; // 35%

const DAYS_BACK = 90;

export type ProjectionMethodology = 'historical' | 'default';

export interface MonthlyProfitProjection {
  projectedMonthlyProfit: number;
  projectedMonthlySales: number;
  avgProfitPerSale: number;
  methodology: ProjectionMethodology;
  confidence: number; // 0-1, higher when using historical data
  activeListings: number;
  historicalSales?: number;
  historicalActiveListings?: number;
}

/**
 * Get projected monthly profit for the user.
 * Uses historical data when available (sales in last 90 days), otherwise defaults.
 */
export async function getMonthlyProfitProjection(userId: number): Promise<MonthlyProfitProjection> {
  const [historical, activeListings, avgNetProfitResult] = await Promise.all([
    getHistoricalMetrics(userId, DAYS_BACK),
    prisma.marketplaceListing.count({ where: { userId } }),
    getAvgNetProfitPerSale(userId, DAYS_BACK),
  ]);

  const { historicalSales, historicalActiveListings, avgDays } = historical;

  if (historicalSales >= 1 && historicalActiveListings >= 1 && avgNetProfitResult.avgNetProfit != null) {
    // Historical methodology
    const salesRatePerListingPerMonth =
      (historicalSales / historicalActiveListings) * (30 / avgDays);
    const projectedMonthlySales = Math.max(
      0,
      activeListings * salesRatePerListingPerMonth
    );
    const avgProfitPerSale = avgNetProfitResult.avgNetProfit;
    const projectedMonthlyProfit = projectedMonthlySales * avgProfitPerSale;
    const confidence = Math.min(1, (historicalSales / 10) * 0.5 + 0.5); // More sales = higher confidence

    return {
      projectedMonthlyProfit: Math.round(projectedMonthlyProfit * 100) / 100,
      projectedMonthlySales: Math.round(projectedMonthlySales * 100) / 100,
      avgProfitPerSale: Math.round(avgProfitPerSale * 100) / 100,
      methodology: 'historical',
      confidence,
      activeListings,
      historicalSales,
      historicalActiveListings,
    };
  }

  // Default methodology for new users
  const avgProfitPerSale = DEFAULT_AVG_TICKET_USD * DEFAULT_MARGIN;
  const projectedMonthlySales = activeListings * DEFAULT_CONVERSION_RATE;
  const projectedMonthlyProfit = projectedMonthlySales * avgProfitPerSale;

  return {
    projectedMonthlyProfit: Math.round(projectedMonthlyProfit * 100) / 100,
    projectedMonthlySales: Math.round(projectedMonthlySales * 100) / 100,
    avgProfitPerSale,
    methodology: 'default',
    confidence: 0.2, // Low confidence for estimates without history
    activeListings,
  };
}

async function getAvgNetProfitPerSale(
  userId: number,
  daysBack: number
): Promise<{ avgNetProfit: number | null; count: number }> {
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  const result = await prisma.sale.aggregate({
    where: {
      userId,
      createdAt: { gte: start },
      status: { not: 'CANCELLED' },
    },
    _avg: { netProfit: true },
    _count: { id: true },
  });

  const avg = result._avg?.netProfit;
  return {
    avgNetProfit: avg != null ? toNumber(avg) : null,
    count: result._count.id,
  };
}
