/**
 * Listing Metrics Writer — Phase 5
 * Writes/upserts listing_metrics from marketplace APIs, pricing engine, and sales.
 * Called by ebay-traffic-sync, dynamic-pricing, competitor-analyzer, and daily aggregate job.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

/** Date-only for calendar day (UTC midnight) */
function toDateOnly(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * Upsert impressions (and optionally clicks) for a listing on a given date.
 * Idempotent: merges into existing row or creates new one.
 */
export async function upsertListingMetricImpressions(
  listingId: number,
  marketplace: string,
  date: Date,
  impressions: number,
  clicks?: number
): Promise<void> {
  const dateOnly = toDateOnly(date);
  await prisma.listingMetric.upsert({
    where: {
      listingId_date: { listingId, date: dateOnly },
    },
    create: {
      listingId,
      marketplace,
      date: dateOnly,
      impressions: Math.max(0, impressions),
      clicks: clicks != null ? Math.max(0, clicks) : 0,
    },
    update: {
      impressions: Math.max(0, impressions),
      ...(clicks != null && { clicks: Math.max(0, clicks) }),
    },
  });
}

/**
 * Upsert sales and optional conversion rate for a listing on a given date.
 */
export async function upsertListingMetricSales(
  listingId: number,
  marketplace: string,
  date: Date,
  sales: number,
  conversionRate?: number | null
): Promise<void> {
  const dateOnly = toDateOnly(date);
  await prisma.listingMetric.upsert({
    where: {
      listingId_date: { listingId, date: dateOnly },
    },
    create: {
      listingId,
      marketplace,
      date: dateOnly,
      sales: Math.max(0, sales),
      conversionRate: conversionRate != null ? conversionRate : null,
    },
    update: {
      sales: Math.max(0, sales),
      ...(conversionRate != null && { conversionRate }),
    },
  });
}

/**
 * Upsert price and competitor price for a listing on a given date.
 */
export async function upsertListingMetricPrices(
  listingId: number,
  marketplace: string,
  date: Date,
  price: number | null,
  competitorPrice?: number | null
): Promise<void> {
  const dateOnly = toDateOnly(date);
  await prisma.listingMetric.upsert({
    where: {
      listingId_date: { listingId, date: dateOnly },
    },
    create: {
      listingId,
      marketplace,
      date: dateOnly,
      price: price != null ? price : null,
      competitorPrice: competitorPrice != null ? competitorPrice : null,
    },
    update: {
      ...(price != null && { price }),
      ...(competitorPrice != null && { competitorPrice }),
    },
  });
}

/**
 * Aggregate sales from Sale table into listing_metrics for a given date.
 * For each MarketplaceListing, count sales on that date and set conversionRate = sales/impressions if impressions > 0.
 */
export async function aggregateSalesIntoListingMetricsForDate(date: Date): Promise<{ updated: number }> {
  const dateOnly = toDateOnly(date);
  const start = new Date(dateOnly);
  const end = new Date(dateOnly);
  end.setUTCDate(end.getUTCDate() + 1);

  const listings = await prisma.marketplaceListing.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true, productId: true, userId: true, marketplace: true, viewCount: true },
  });

  let updated = 0;
  for (const listing of listings) {
    const salesCount = await prisma.sale.count({
      where: {
        productId: listing.productId,
        userId: listing.userId,
        marketplace: listing.marketplace,
        createdAt: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
    });

    const impressions = listing.viewCount ?? 0;
    const conversionRate =
      impressions > 0 && salesCount > 0 ? Math.min(1, salesCount / impressions) : null;

    await prisma.listingMetric.upsert({
      where: {
        listingId_date: { listingId: listing.id, date: dateOnly },
      },
      create: {
        listingId: listing.id,
        marketplace: listing.marketplace,
        date: dateOnly,
        sales: salesCount,
        conversionRate,
      },
      update: {
        sales: salesCount,
        conversionRate,
      },
    });
    updated++;
  }

  logger.info('[LISTING-METRICS] Aggregated sales for date', {
    date: dateOnly.toISOString().slice(0, 10),
    updated,
  });
  return { updated };
}
