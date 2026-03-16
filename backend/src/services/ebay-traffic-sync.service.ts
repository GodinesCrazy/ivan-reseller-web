/**
 * eBay Traffic Sync Service
 * Syncs view/impression counts from eBay Analytics API to MarketplaceListing.viewCount.
 * Used for listing lifetime optimization (unpublish low conversion).
 */
import { prisma } from '../config/database';
import logger from '../config/logger';
import axios from 'axios';
import { CredentialsManager } from './credentials-manager.service';
import { workflowConfigService } from './workflow-config.service';

const EBAY_ANALYTICS_BASE = 'https://api.ebay.com/sell/analytics/v1';
const EBAY_SANDBOX_ANALYTICS = 'https://api.sandbox.ebay.com/sell/analytics/v1';

interface TrafficRecord {
  value?: string; // listing ID
  metadataValues?: Array<{ value?: string; key?: string }>;
}

interface TrafficReportResponse {
  records?: TrafficRecord[];
  dimensionMetadata?: Array<{ key?: string; dataType?: string }>;
  header?: { columns?: Array<{ key?: string }> };
  warnings?: string[];
}

export interface SyncResult {
  userId: number;
  listingsUpdated: number;
  listingsTotal: number;
  error?: string;
}

/**
 * Get valid eBay access token for a user (refreshes if needed)
 */
async function getEbayAccessToken(userId: number): Promise<string | null> {
  const entry = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'production');
  if (!entry?.credentials?.refreshToken) {
    const sandbox = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'sandbox');
    if (!sandbox?.credentials?.refreshToken) return null;
    return (sandbox.credentials as any).token || null;
  }
  const creds = entry.credentials as { token?: string; refreshToken?: string };
  return creds.token || null;
}

/** Result per listing: impressions and optional clicks (views) */
export interface TrafficReportRow {
  impressions: number;
  clicks: number;
}

/**
 * Fetch traffic report from eBay Analytics API.
 * Fetches LISTING_IMPRESSION_TOTAL and LISTING_VIEWS_TOTAL (views = clicks to View Item page).
 */
async function fetchTrafficReport(
  accessToken: string,
  listingIds: string[],
  sandbox: boolean
): Promise<Map<string, TrafficReportRow>> {
  const base = sandbox ? EBAY_SANDBOX_ANALYTICS : EBAY_ANALYTICS_BASE;
  const metrics = 'LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL';
  const filter = listingIds.length > 0 ? `listingIds:{${listingIds.slice(0, 200).join(',')}}` : undefined;

  const params = new URLSearchParams();
  params.set('dimension', 'LISTING');
  params.set('metric', metrics);
  if (filter) params.set('filter', filter);

  const url = `${base}/traffic_report?${params.toString()}`;
  const res = await axios.get<TrafficReportResponse>(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const map = new Map<string, TrafficReportRow>();
  const records = res.data?.records || [];
  for (const rec of records) {
    const listingId = rec.value || rec.metadataValues?.[0]?.value;
    if (!listingId) continue;
    const meta = rec.metadataValues || [];
    const byKey = (k: string) => meta.find((m) => (m.key || '').toUpperCase() === k)?.value;
    const impressions = parseInt(byKey('LISTING_IMPRESSION_TOTAL') ?? meta.find((m) => !m.key)?.value ?? '0', 10);
    const clicks = parseInt(byKey('LISTING_VIEWS_TOTAL') ?? '0', 10);
    map.set(listingId, {
      impressions: !isNaN(impressions) ? impressions : 0,
      clicks: !isNaN(clicks) ? clicks : 0,
    });
  }
  return map;
}

/**
 * Sync view counts for a single user's eBay listings
 */
export async function syncViewCountsForUser(userId: number): Promise<SyncResult> {
  const listings = await prisma.marketplaceListing.findMany({
    where: { userId, marketplace: 'ebay', publishedAt: { not: null } },
    select: { id: true, listingId: true },
  });

  if (listings.length === 0) {
    return { userId, listingsUpdated: 0, listingsTotal: 0 };
  }

  const token = await getEbayAccessToken(userId);
  if (!token) {
    logger.warn('[EBAY-TRAFFIC-SYNC] No eBay token for user', { userId });
    return { userId, listingsUpdated: 0, listingsTotal: listings.length, error: 'No eBay credentials' };
  }

  let env: 'sandbox' | 'production' = 'production';
  try {
    env = await workflowConfigService.getUserEnvironment(userId);
  } catch {
    env = 'production';
  }

  const listingIds = listings.map((l) => l.listingId);
  let traffic: Map<string, TrafficReportRow>;
  try {
    traffic = await fetchTrafficReport(token, listingIds, env === 'sandbox');
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Unknown';
    logger.warn('[EBAY-TRAFFIC-SYNC] API error', { userId, error: msg });
    return { userId, listingsUpdated: 0, listingsTotal: listings.length, error: msg };
  }

  let updated = 0;
  const today = new Date();
  for (const listing of listings) {
    const row = traffic.get(listing.listingId);
    if (row !== undefined) {
      const viewCount = row.impressions;
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { viewCount },
      });
      try {
        const { upsertListingMetricImpressions } = await import('./listing-metrics-writer.service');
        await upsertListingMetricImpressions(listing.id, 'ebay', today, row.impressions, row.clicks);
      } catch (e) {
        logger.warn('[EBAY-TRAFFIC-SYNC] Failed to write listing_metrics', { listingId: listing.id, error: (e as Error)?.message });
      }
      updated++;
    }
  }

  logger.info('[EBAY-TRAFFIC-SYNC] Synced', { userId, updated, total: listings.length });
  return { userId, listingsUpdated: updated, listingsTotal: listings.length };
}

/**
 * Sync view counts for all users with eBay listings
 */
export async function syncAllUsersViewCounts(): Promise<SyncResult[]> {
  const userIds = await prisma.marketplaceListing
    .findMany({
      where: { marketplace: 'ebay', publishedAt: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    })
    .then((rows) => rows.map((r) => r.userId));

  const results: SyncResult[] = [];
  for (const uid of userIds) {
    try {
      const r = await syncViewCountsForUser(uid);
      results.push(r);
    } catch (e: any) {
      results.push({ userId: uid, listingsUpdated: 0, listingsTotal: 0, error: e?.message });
    }
  }
  return results;
}
