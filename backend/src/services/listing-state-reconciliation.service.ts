/**
 * Phase 15: Listing State Reconciliation Engine
 * Verifies that every listing marked as published actually exists and is active in the marketplace.
 * Updates local state (MarketplaceListing.status) and records errors (ListingPublishError).
 */
import { trace } from '../utils/boot-trace';
trace('loading listing-state-reconciliation.service');

import { prisma } from '../config/database';
import logger from '../config/logger';
import { MercadoLibreService } from './mercadolibre.service';
import type { MercadoLibreCredentials } from './mercadolibre.service';
import { EbayService } from './ebay.service';
import type { EbayCredentials } from './ebay.service';
import { MarketplaceService } from './marketplace.service';

export type ReconciliationResult = 'ACTIVE' | 'PAUSED' | 'NOT_FOUND' | 'ERROR';
export type PublishErrorType = 'marketplace_rejection' | 'validation_error' | 'api_error' | 'rate_limit';

export interface VerifyOutcome {
  result: ReconciliationResult;
  errorType?: PublishErrorType;
  errorMessage?: string;
}

/** Classify API/marketplace errors for re-publish and reporting */
export function classifyError(err: any): PublishErrorType {
  const msg = String(err?.message || err?.response?.data?.message || err).toLowerCase();
  const status = err?.response?.status;
  if (status === 429 || /rate limit|too many requests/i.test(msg)) return 'rate_limit';
  if (status === 400 || status === 422 || /validation|invalid|rejected/i.test(msg)) return 'validation_error';
  if (status === 403 || status === 404 || /not found|forbidden|rejection/i.test(msg)) return 'marketplace_rejection';
  return 'api_error';
}

/** Transient errors that may be retried with re-publish */
export function isTransientError(errorType: PublishErrorType): boolean {
  return errorType === 'rate_limit' || errorType === 'api_error';
}

export class ListingStateReconciliationService {
  /**
   * Verify a single listing against the marketplace API.
   * Returns ACTIVE, PAUSED, NOT_FOUND, or ERROR (with errorType when applicable).
   */
  async verifyListing(listing: {
    id: number;
    listingId: string;
    marketplace: string;
    userId: number;
  }): Promise<VerifyOutcome> {
    const mp = listing.marketplace.toLowerCase();
    if (mp === 'mercadolibre' || mp === 'ml') {
      return this.verifyMercadoLibre(listing);
    }
    if (mp === 'ebay') {
      return this.verifyEbay(listing);
    }
    return { result: 'ERROR', errorType: 'api_error', errorMessage: `Unsupported marketplace: ${listing.marketplace}` };
  }

  private async verifyMercadoLibre(listing: { listingId: string; userId: number }): Promise<VerifyOutcome> {
    try {
      const ms = new MarketplaceService();
      const credentials = await ms.getCredentials(listing.userId, 'mercadolibre', 'production');
      if (!credentials?.credentials) {
        return { result: 'ERROR', errorType: 'api_error', errorMessage: 'No MercadoLibre credentials' };
      }
      const creds = credentials.credentials as MercadoLibreCredentials;
      const mlService = new MercadoLibreService({
        ...creds,
        siteId: creds.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
      });
      const itemStatus = await mlService.getItemStatus(listing.listingId);
      if (!itemStatus) {
        return { result: 'NOT_FOUND', errorType: 'marketplace_rejection', errorMessage: 'Item not found or API error' };
      }
      const status = (itemStatus.status || '').toLowerCase();
      if (status === 'active') return { result: 'ACTIVE' };
      if (status === 'paused' || status === 'closed') return { result: 'PAUSED' };
      return { result: 'NOT_FOUND', errorType: 'marketplace_rejection', errorMessage: `ML status: ${status}` };
    } catch (err: any) {
      const errorType = classifyError(err);
      const errorMessage = err?.response?.data?.message || err?.message || String(err);
      logger.warn('[Reconciliation] ML verify failed', { listingId: listing.listingId, errorType, errorMessage });
      return { result: 'ERROR', errorType, errorMessage };
    }
  }

  private async verifyEbay(listing: { listingId: string; userId: number }): Promise<VerifyOutcome> {
    try {
      const ms = new MarketplaceService();
      const credentials = await ms.getCredentials(listing.userId, 'ebay', 'production');
      if (!credentials?.credentials) {
        return { result: 'ERROR', errorType: 'api_error', errorMessage: 'No eBay credentials' };
      }
      const ebayService = new EbayService({
        ...(credentials.credentials as EbayCredentials),
        sandbox: credentials.environment === 'sandbox',
      });
      const availability = await ebayService.checkProductAvailability(listing.listingId);
      // checkProductAvailability returns available: false on any error; we cannot distinguish 404 from 5xx here
      if (availability && availability.available) return { result: 'ACTIVE' };
      // Consider not-found vs error: without HTTP status we treat as NOT_FOUND for reconciliation
      return { result: 'NOT_FOUND', errorType: 'marketplace_rejection', errorMessage: 'eBay item not available or not found' };
    } catch (err: any) {
      const errorType = classifyError(err);
      const errorMessage = err?.response?.data?.message || err?.message || String(err);
      logger.warn('[Reconciliation] eBay verify failed', { listingId: listing.listingId, errorType, errorMessage });
      return { result: 'ERROR', errorType, errorMessage };
    }
  }

  /** Record error in listing_publish_errors and update listing status to failed_publish */
  async recordErrorAndUpdateStatus(
    listingId: number,
    marketplace: string,
    errorType: PublishErrorType,
    errorMessage: string | null
  ): Promise<void> {
    await prisma.listingPublishError.create({
      data: {
        listingId,
        marketplace,
        errorType,
        errorMessage: errorMessage || undefined,
      },
    });
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { status: 'failed_publish', lastReconciledAt: new Date() },
    });
  }

  /**
   * Reconcile one listing: verify on marketplace, update DB, optionally record error and enqueue re-publish.
   * Returns true if a re-publish was enqueued (transient error).
   */
  async reconcileOne(
    listing: { id: number; listingId: string; marketplace: string; userId: number; productId: number }
  ): Promise<{ updated: boolean; republishEnqueued: boolean }> {
    const outcome = await this.verifyListing(listing);
    const now = new Date();

    if (outcome.result === 'ACTIVE') {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: 'active', lastReconciledAt: now },
      });
      return { updated: true, republishEnqueued: false };
    }

    if (outcome.result === 'PAUSED') {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: 'paused', lastReconciledAt: now },
      });
      return { updated: true, republishEnqueued: false };
    }

    if (outcome.result === 'NOT_FOUND' || outcome.result === 'ERROR') {
      const errorType = outcome.errorType || 'marketplace_rejection';
      await this.recordErrorAndUpdateStatus(
        listing.id,
        listing.marketplace,
        errorType,
        outcome.errorMessage || null
      );
      let republishEnqueued = false;
      if (outcome.result === 'ERROR' && isTransientError(errorType)) {
        try {
          const { publishingQueue } = await import('./job.service');
          if (publishingQueue) {
            await publishingQueue.add(
              'publish-product',
              {
                userId: listing.userId,
                productId: listing.productId,
                marketplaces: [listing.marketplace],
              },
              { attempts: 2, backoff: { type: 'exponential', delay: 60000 } }
            );
            republishEnqueued = true;
            logger.info('[Reconciliation] Enqueued re-publish for transient error', {
              listingId: listing.listingId,
              marketplace: listing.marketplace,
              errorType,
            });
          }
        } catch (e) {
          logger.warn('[Reconciliation] Failed to enqueue re-publish', { error: (e as Error)?.message });
        }
      }
      return { updated: true, republishEnqueued };
    }

    return { updated: false, republishEnqueued: false };
  }

  /**
   * Run reconciliation across all listings that are currently considered active (or all if no status filter).
   * Optionally limit to one user.
   */
  async reconcileAll(options?: { userId?: number; batchSize?: number }): Promise<{
    scanned: number;
    updated: number;
    republishEnqueued: number;
    errors: number;
  }> {
    const batchSize = options?.batchSize ?? 100;
    const where: { status?: string; userId?: number } = { status: 'active' };
    if (options?.userId) where.userId = options.userId;

    const listings = await prisma.marketplaceListing.findMany({
      where,
      select: { id: true, listingId: true, marketplace: true, userId: true, productId: true },
      take: batchSize,
    });

    let updated = 0;
    let republishEnqueued = 0;
    let errors = 0;

    for (const listing of listings) {
      try {
        const { updated: u, republishEnqueued: r } = await this.reconcileOne(listing);
        if (u) updated++;
        if (r) republishEnqueued++;
      } catch (e) {
        errors++;
        logger.warn('[Reconciliation] reconcileOne failed', {
          listingId: listing.listingId,
          error: (e as Error)?.message,
        });
      }
    }

    return {
      scanned: listings.length,
      updated,
      republishEnqueued,
      errors,
    };
  }

  /**
   * Initial full audit: run reconciliation for all listings (any status) to fix stale state.
   */
  async runFullAudit(options?: { userId?: number }): Promise<{ scanned: number; corrected: number; errors: number }> {
    const where: { userId?: number } = {};
    if (options?.userId) where.userId = options.userId;

    const listings = await prisma.marketplaceListing.findMany({
      where,
      select: { id: true, listingId: true, marketplace: true, userId: true, productId: true, status: true },
    });

    let corrected = 0;
    let errCount = 0;
    for (const listing of listings) {
      try {
        const { updated } = await this.reconcileOne(listing);
        if (updated) corrected++;
      } catch (e) {
        errCount++;
        logger.warn('[Reconciliation] Full audit item failed', { listingId: listing.listingId, error: (e as Error)?.message });
      }
    }
    return { scanned: listings.length, corrected, errors: errCount };
  }
}

export const listingStateReconciliationService = new ListingStateReconciliationService();
