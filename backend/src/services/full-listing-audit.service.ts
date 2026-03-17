/**
 * Phase 26 — Task 1: Full Listing Audit (Existing Data)
 * Scans ALL existing listings from DB + MercadoLibre / eBay / Amazon APIs.
 * Collects status, errors, impressions, clicks, sales, policy issues, missing attributes, category correctness.
 */
import { trace } from '../utils/boot-trace';
trace('loading full-listing-audit.service');

import { prisma } from '../config/database';
import logger from '../config/logger';
import { listingStateReconciliationService } from './listing-state-reconciliation.service';
import type { ListingAuditRecord } from './full-listing-recovery.types';
import { toNumber } from '../utils/decimal.utils';

const DEFAULT_METRICS_DAYS = 30;
const RECENT_ERRORS_DAYS = 90;

export interface FullAuditOptions {
  userId?: number;
  /** Limit listings to audit (for batch runs) */
  limit?: number;
  /** Call marketplace APIs to verify status (slower, rate-limited) */
  verifyWithApi?: boolean;
  /** Max listings to verify per run to avoid rate limits */
  verifyBatchSize?: number;
  metricsDays?: number;
}

export class FullListingAuditService {
  /**
   * Scan all relevant listings and build audit records.
   * Uses DB data (listings, metrics, errors, audit actions) and optionally verifies with ML/eBay/Amazon API.
   */
  async runFullAudit(options: FullAuditOptions = {}): Promise<ListingAuditRecord[]> {
    const {
      userId,
      limit = 5000,
      verifyWithApi = false,
      verifyBatchSize = 50,
      metricsDays = DEFAULT_METRICS_DAYS,
    } = options;

    const where: { userId?: number } = {};
    if (userId != null) where.userId = userId;

    const listings = await prisma.marketplaceListing.findMany({
      where,
      include: {
        product: true,
        listingPublishErrors: {
          where: { createdAt: { gte: new Date(Date.now() - RECENT_ERRORS_DAYS * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        listingAuditActions: {
          where: { executed: false },
          take: 50,
        },
      },
      take: limit,
    });

    const metricsSince = new Date();
    metricsSince.setDate(metricsSince.getDate() - metricsDays);

    const listingIds = listings.map((l) => l.id);
    const metricsByListing = await this.aggregateMetrics(listingIds, metricsSince);

    const records: ListingAuditRecord[] = [];
    let verified = 0;

    for (const listing of listings) {
      const metrics = metricsByListing.get(listing.id) ?? { impressions: 0, clicks: 0, sales: 0 };
      const pendingAuditActions = listing.listingAuditActions?.length ?? 0;
      const recentErrors = (listing.listingPublishErrors ?? []).map((e) => ({
        errorType: e.errorType,
        errorMessage: e.errorMessage ?? undefined,
        createdAt: e.createdAt.toISOString(),
      }));

      const { policyIssues, missingAttributes, categoryCorrectness, hasRequiredMedia } = this.deriveCompliance(
        listing.product,
        listing.marketplace
      );

      const record: ListingAuditRecord = {
        listingDbId: listing.id,
        productId: listing.productId,
        userId: listing.userId,
        marketplace: listing.marketplace,
        listingId: listing.listingId,
        status: listing.status ?? 'active',
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        sales: metrics.sales,
        metricsDays,
        recentErrors,
        pendingAuditActions,
        policyIssues,
        missingAttributes,
        categoryCorrectness,
        hasRequiredMedia,
        lastReconciledAt: listing.lastReconciledAt ?? null,
      };

      if (verifyWithApi && verified < verifyBatchSize) {
        try {
          const outcome = await listingStateReconciliationService.verifyListing({
            id: listing.id,
            listingId: listing.listingId,
            marketplace: listing.marketplace,
            userId: listing.userId,
          });
          record.reconciliationResult = outcome.result;
          verified++;
        } catch (err: any) {
          logger.warn('[FullListingAudit] verify failed', {
            listingId: listing.listingId,
            marketplace: listing.marketplace,
            error: err?.message,
          });
          record.reconciliationResult = 'ERROR';
        }
      }

      records.push(record);
    }

    logger.info('[FullListingAudit] Completed', {
      total: records.length,
      verifiedWithApi: verifyWithApi ? verified : 0,
      metricsDays,
    });
    return records;
  }

  private async aggregateMetrics(
    listingIds: number[],
    since: Date
  ): Promise<Map<number, { impressions: number; clicks: number; sales: number }>> {
    if (listingIds.length === 0) return new Map();

    const metrics = await prisma.listingMetric.findMany({
      where: { listingId: { in: listingIds }, date: { gte: since } },
    });

    const map = new Map<number, { impressions: number; clicks: number; sales: number }>();
    for (const id of listingIds) {
      map.set(id, { impressions: 0, clicks: 0, sales: 0 });
    }
    for (const m of metrics) {
      const cur = map.get(m.listingId)!;
      cur.impressions += m.impressions ?? 0;
      cur.clicks += m.clicks ?? 0;
      cur.sales += m.sales ?? 0;
    }
    return map;
  }

  private deriveCompliance(
    product: { title?: string | null; description?: string | null; images?: unknown; category?: string | null } | null,
    marketplace: string
  ): {
    policyIssues: string[];
    missingAttributes: string[];
    categoryCorrectness: 'ok' | 'mismatch' | 'missing';
    hasRequiredMedia: boolean;
  } {
    const policyIssues: string[] = [];
    const missingAttributes: string[] = [];
    let categoryCorrectness: 'ok' | 'mismatch' | 'missing' = 'ok';
    let hasRequiredMedia = false;

    if (!product) {
      return {
        policyIssues: ['product_missing'],
        missingAttributes: [],
        categoryCorrectness: 'missing',
        hasRequiredMedia: false,
      };
    }

    if (!product.title || product.title.length < 10) {
      policyIssues.push('title_too_short_or_missing');
    }
    if (!product.description || product.description.length < 50) {
      policyIssues.push('description_too_short_or_missing');
    }

    const images = typeof product.images === 'string' ? JSON.parse(product.images || '[]') : product.images;
    const imgCount = Array.isArray(images) ? images.length : 0;
    const minImages = marketplace.toLowerCase() === 'amazon' ? 2 : 1;
    hasRequiredMedia = imgCount >= minImages;
    if (!hasRequiredMedia) {
      policyIssues.push('insufficient_images');
      missingAttributes.push('images');
    }

    if (!product.category || String(product.category).trim().length === 0) {
      categoryCorrectness = 'missing';
      missingAttributes.push('category');
    }

    return {
      policyIssues,
      missingAttributes,
      categoryCorrectness,
      hasRequiredMedia,
    };
  }
}

export const fullListingAuditService = new FullListingAuditService();
