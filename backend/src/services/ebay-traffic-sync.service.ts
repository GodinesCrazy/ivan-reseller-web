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

/**
 * Fetch traffic report from eBay Analytics API
 */
async function fetchTrafficReport(
  accessToken: string,
  listingIds: string[],
  sandbox: boolean
): Promise<Map<string, number>> {
  const base = sandbox ? EBAY_SANDBOX_ANALYTICS : EBAY_ANALYTICS_BASE;
  const metric = 'LISTING_IMPRESSION_TOTAL';
  const filter = listingIds.length > 0 ? `listingIds:{${listingIds.slice(0, 200).join(',')}}` : undefined;

  const params = new URLSearchParams();
  params.set('dimension', 'LISTING');
  params.set('metric', metric);
  if (filter) params.set('filter', filter);

  const url = `${base}/traffic_report?${params.toString()}`;
  const res = await axios.get<TrafficReportResponse>(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const map = new Map<string, number>();
  const records = res.data?.records || [];
  for (const rec of records) {
    const listingId = rec.value || rec.metadataValues?.[0]?.value;
    if (!listingId) continue;
    const val = rec.metadataValues?.find((m) => m.key === metric || !m.key)?.value;
    const count = parseInt(val || '0', 10);
    if (!isNaN(count)) map.set(listingId, count);
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
  let counts: Map<string, number>;
  try {
    counts = await fetchTrafficReport(token, listingIds, env === 'sandbox');
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Unknown';
    logger.warn('[EBAY-TRAFFIC-SYNC] API error', { userId, error: msg });
    return { userId, listingsUpdated: 0, listingsTotal: listings.length, error: msg };
  }

  let updated = 0;
  for (const listing of listings) {
    const viewCount = counts.get(listing.listingId);
    if (viewCount !== undefined) {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { viewCount },
      });
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
