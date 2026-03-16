/**
 * Phase 18: MercadoLibre metrics ingestion.
 * Fetches impressions (visits) from ML API and upserts into listing_metrics.
 * Sales and conversion are filled by the existing listing-metrics aggregate job.
 */
import { prisma } from '../config/database';
import logger from '../config/logger';
import { MarketplaceService } from './marketplace.service';
import { MercadoLibreService } from './mercadolibre.service';
import type { MercadoLibreCredentials } from './mercadolibre.service';
import { upsertListingMetricImpressions } from './listing-metrics-writer.service';
import { aggregateSalesIntoListingMetricsForDate } from './listing-metrics-writer.service';

const ms = new MarketplaceService();

function toDateOnly(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export interface MercadoLibreMetricsIngestionResult {
  usersProcessed: number;
  listingsUpdated: number;
  errors: string[];
}

/**
 * Run full ingestion: for each user with ML listings, fetch item visits from ML and upsert listing_metrics.
 * Then aggregate sales for today so conversion rate can be computed.
 */
export async function runMercadoLibreMetricsIngestion(): Promise<MercadoLibreMetricsIngestionResult> {
  const result: MercadoLibreMetricsIngestionResult = { usersProcessed: 0, listingsUpdated: 0, errors: [] };
  const today = toDateOnly(new Date());

  const listings = await prisma.marketplaceListing.findMany({
    where: {
      marketplace: 'mercadolibre',
      publishedAt: { not: null },
      status: 'active',
    },
    select: { id: true, listingId: true, userId: true },
  });

  if (listings.length === 0) {
    logger.info('[ML-METRICS] No active MercadoLibre listings to ingest');
    return result;
  }

  const byUser = new Map<number, typeof listings>();
  for (const l of listings) {
    if (!byUser.has(l.userId)) byUser.set(l.userId, []);
    byUser.get(l.userId)!.push(l);
  }

  for (const [userId, userListings] of byUser) {
    try {
      const credentials = await ms.getCredentials(userId, 'mercadolibre', 'production');
      if (!credentials?.credentials?.accessToken) {
        result.errors.push(`User ${userId}: no ML credentials`);
        continue;
      }
      const creds = credentials.credentials as MercadoLibreCredentials;
      const mlService = new MercadoLibreService({
        ...creds,
        siteId: creds.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
      });

      const itemIds = userListings.map((l) => l.listingId).filter(Boolean);
      const visits = await mlService.getItemVisits(itemIds);

      for (const listing of userListings) {
        const impressions = visits[listing.listingId] ?? 0;
        await upsertListingMetricImpressions(listing.id, 'mercadolibre', today, impressions);
        result.listingsUpdated++;
      }
      result.usersProcessed++;
    } catch (err: any) {
      const msg = err?.message || String(err);
      result.errors.push(`User ${userId}: ${msg}`);
      logger.warn('[ML-METRICS] User ingestion failed', { userId, error: msg });
    }
  }

  try {
    await aggregateSalesIntoListingMetricsForDate(new Date());
  } catch (err: any) {
    result.errors.push(`Aggregate sales: ${err?.message || String(err)}`);
  }

  logger.info('[ML-METRICS] Ingestion complete', {
    usersProcessed: result.usersProcessed,
    listingsUpdated: result.listingsUpdated,
    errorCount: result.errors.length,
  });
  return result;
}
