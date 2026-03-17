/**
 * Phase 22: Autonomous Revenue Monitor
 * Continuously monitors system profitability and triggers optimization when revenue is low or stagnant.
 * Uses: competitor intelligence, fee intelligence, conversion optimization, dynamic pricing.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

const SYSTEM_CONFIG_KEY_LAST_REPORT = 'autonomous_revenue_monitor_last_report';
const REVENUE_WINDOW_DAYS = 7;
const LOW_REVENUE_THRESHOLD = 0; // Consider "low" when no sales in window (configurable via env)
const STAGNANT_DAYS = 3; // No sales for this many days → trigger optimizations

export interface RevenueSnapshot {
  totalOrders: number;
  totalRevenue: number;
  totalGrossProfit: number;
  totalNetProfit: number;
  currency: string;
  since: string;
  until: string;
}

export interface ListingActivitySnapshot {
  activeListings: number;
  recentlyPublishedCount: number;
  listingsWithImpressions: number;
  listingsWithClicks: number;
  listingsWithConversions: number;
  avgConversionRate: number | null;
}

export interface OptimizationAction {
  type: 'dynamic_pricing' | 'conversion_optimization' | 'marketplace_optimization' | 'none';
  reason: string;
  triggered: boolean;
}

export interface AutonomousRevenueMonitorReport {
  timestamp: string;
  revenue: RevenueSnapshot;
  listingActivity: ListingActivitySnapshot;
  optimizationActions: OptimizationAction[];
  recommendations: string[];
  errors: string[];
}

/**
 * Aggregate revenue from Sales for the last N days (production only for real revenue).
 */
async function getRevenueSnapshot(days: number): Promise<RevenueSnapshot> {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  // Phase 27: Real data only — exclude test/mock/demo order IDs
  const realOrderFilter = {
    AND: [
      { orderId: { not: { startsWith: 'test' } } },
      { orderId: { not: { startsWith: 'TEST' } } },
      { orderId: { not: { startsWith: 'mock' } } },
      { orderId: { not: { startsWith: 'demo' } } },
      { orderId: { not: { startsWith: 'DEMO' } } },
    ],
  };

  const sales = await prisma.sale.findMany({
    where: {
      createdAt: { gte: since, lte: until },
      environment: 'production',
      status: { notIn: ['CANCELLED', 'RETURNED'] },
      ...realOrderFilter,
    },
    select: {
      salePrice: true,
      grossProfit: true,
      netProfit: true,
      currency: true,
    },
  });

  let totalRevenue = 0;
  let totalGrossProfit = 0;
  let totalNetProfit = 0;
  const currency = sales[0]?.currency ?? 'USD';

  for (const s of sales) {
    totalRevenue += toNumber(s.salePrice);
    totalGrossProfit += toNumber(s.grossProfit);
    totalNetProfit += toNumber(s.netProfit);
  }

  return {
    totalOrders: sales.length,
    totalRevenue,
    totalGrossProfit,
    totalNetProfit,
    currency,
    since: since.toISOString(),
    until: until.toISOString(),
  };
}

/**
 * Snapshot of listing activity: active, recently published, with impressions/clicks/conversions.
 */
async function getListingActivitySnapshot(): Promise<ListingActivitySnapshot> {
  const now = new Date();
  const recentPublishCutoff = new Date(now);
  recentPublishCutoff.setDate(recentPublishCutoff.getDate() - 7);

  const [activeListings, recentlyPublished, metricsAgg] = await Promise.all([
    prisma.marketplaceListing.count({
      where: { publishedAt: { not: null } },
    }),
    prisma.marketplaceListing.count({
      where: {
        publishedAt: { not: null, gte: recentPublishCutoff },
      },
    }),
    prisma.listingMetric.groupBy({
      by: ['listingId'],
      _sum: {
        impressions: true,
        clicks: true,
        sales: true,
      },
      where: {
        date: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  let listingsWithImpressions = 0;
  let listingsWithClicks = 0;
  let listingsWithConversions = 0;
  let totalClicks = 0;
  let totalSales = 0;

  for (const m of metricsAgg) {
    const imp = m._sum.impressions ?? 0;
    const clk = m._sum.clicks ?? 0;
    const sal = m._sum.sales ?? 0;
    if (imp > 0) listingsWithImpressions++;
    if (clk > 0) {
      listingsWithClicks++;
      totalClicks += clk;
    }
    if (sal > 0) {
      listingsWithConversions++;
      totalSales += sal;
    }
  }

  const avgConversionRate =
    totalClicks > 0 && totalSales >= 0 ? (totalSales / totalClicks) : null;

  return {
    activeListings,
    recentlyPublishedCount: recentlyPublished,
    listingsWithImpressions,
    listingsWithClicks,
    listingsWithConversions,
    avgConversionRate: avgConversionRate !== null ? Math.round(avgConversionRate * 10000) / 10000 : null,
  };
}

/**
 * Run the Autonomous Revenue Monitor: analyze revenue and listing performance,
 * optionally trigger optimization jobs when revenue is low or stagnant.
 */
export async function runAutonomousRevenueMonitor(options?: {
  triggerOptimizations?: boolean;
}): Promise<AutonomousRevenueMonitorReport> {
  const triggerOptimizations = options?.triggerOptimizations ?? true;
  const report: AutonomousRevenueMonitorReport = {
    timestamp: new Date().toISOString(),
    revenue: {
      totalOrders: 0,
      totalRevenue: 0,
      totalGrossProfit: 0,
      totalNetProfit: 0,
      currency: 'USD',
      since: '',
      until: '',
    },
    listingActivity: {
      activeListings: 0,
      recentlyPublishedCount: 0,
      listingsWithImpressions: 0,
      listingsWithClicks: 0,
      listingsWithConversions: 0,
      avgConversionRate: null,
    },
    optimizationActions: [],
    recommendations: [],
    errors: [],
  };

  try {
    report.revenue = await getRevenueSnapshot(REVENUE_WINDOW_DAYS);
    report.listingActivity = await getListingActivitySnapshot();

    const revenueLow = report.revenue.totalOrders <= (Number(process.env.REVENUE_MONITOR_LOW_ORDERS_THRESHOLD) ?? LOW_REVENUE_THRESHOLD);
    const hasListings = report.listingActivity.activeListings > 0;
    const hasTraffic = report.listingActivity.listingsWithClicks > 0;
    const conversionLow =
      report.listingActivity.avgConversionRate != null &&
      report.listingActivity.avgConversionRate < (Number(process.env.REVENUE_MONITOR_LOW_CONVERSION_THRESHOLD) ?? 0.01);

    // Recommendations
    if (!hasListings) {
      report.recommendations.push('No active listings. Enable auto-listing strategy or publish products.');
    }
    if (hasListings && report.listingActivity.recentlyPublishedCount === 0) {
      report.recommendations.push('No recently published listings. Consider increasing publishing frequency.');
    }
    if (revenueLow && hasListings) {
      report.recommendations.push('Revenue low or zero in the last 7 days. Run dynamic pricing and conversion optimization.');
    }
    if (conversionLow && hasTraffic) {
      report.recommendations.push('Conversion rate is low. Conversion rate optimization and title/price adjustments may help.');
    }
    if (report.revenue.totalGrossProfit > 0 && report.revenue.totalOrders > 0) {
      report.recommendations.push('Revenue detected. Continue monitoring; scale winners via autonomous scaling.');
    }

    // Optimization actions (enqueue jobs; do not run inline to avoid long request)
    if (triggerOptimizations) {
      if (revenueLow && hasListings) {
        report.optimizationActions.push({
          type: 'dynamic_pricing',
          reason: 'Revenue low or stagnant; adjust listing prices.',
          triggered: true,
        });
        report.optimizationActions.push({
          type: 'conversion_optimization',
          reason: 'Improve conversion via listing optimization.',
          triggered: true,
        });
        report.optimizationActions.push({
          type: 'marketplace_optimization',
          reason: 'Apply marketplace optimization (price, title, image).',
          triggered: true,
        });
      } else if (conversionLow && hasTraffic) {
        report.optimizationActions.push({
          type: 'conversion_optimization',
          reason: 'Low conversion rate; trigger CRO.',
          triggered: true,
        });
        report.optimizationActions.push({
          type: 'marketplace_optimization',
          reason: 'Apply marketplace optimization.',
          triggered: true,
        });
      } else {
        report.optimizationActions.push({
          type: 'none',
          reason: 'Revenue and conversion within targets; no automatic changes.',
          triggered: false,
        });
      }
    }

    // Persist last report for API/dashboard
    await prisma.systemConfig.upsert({
      where: { key: SYSTEM_CONFIG_KEY_LAST_REPORT },
      create: {
        key: SYSTEM_CONFIG_KEY_LAST_REPORT,
        value: JSON.stringify(report),
      },
      update: { value: JSON.stringify(report) },
    });

    logger.info('[AUTONOMOUS-REVENUE-MONITOR] Run complete', {
      orders: report.revenue.totalOrders,
      revenue: report.revenue.totalRevenue,
      activeListings: report.listingActivity.activeListings,
      actionsTriggered: report.optimizationActions.filter((a) => a.triggered).length,
    });
  } catch (err: any) {
    report.errors.push(err?.message ?? String(err));
    logger.error('[AUTONOMOUS-REVENUE-MONITOR] Error', { error: err?.message });
  }

  return report;
}

/**
 * Get last stored report from system config.
 */
export async function getLastRevenueMonitorReport(): Promise<AutonomousRevenueMonitorReport | null> {
  const rec = await prisma.systemConfig.findUnique({
    where: { key: SYSTEM_CONFIG_KEY_LAST_REPORT },
  });
  if (!rec?.value) return null;
  try {
    return JSON.parse(rec.value as string) as AutonomousRevenueMonitorReport;
  } catch {
    return null;
  }
}
