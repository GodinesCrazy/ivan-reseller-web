/**
 * Phase 26 — Task 3: Listing Recovery Engine
 * For each classification: NEEDS_OPTIMIZATION -> improve; BROKEN/REJECTED -> fix and republish;
 * INACTIVE -> reactivate; LOW_PERFORMANCE -> optimize or remove; NOT_EXISTING -> remove from DB.
 */
import { trace } from '../utils/boot-trace';
trace('loading listing-recovery-engine.service');

import { prisma } from '../config/database';
import logger from '../config/logger';
import { listingStateReconciliationService } from './listing-state-reconciliation.service';
import { runListingComplianceAudit } from './launch-audit.service';
import type { ListingAuditRecord, RecoveryAction } from './full-listing-recovery.types';

export interface RecoveryRunResult {
  processed: number;
  actions: RecoveryAction[];
  optimized: number;
  republishEnqueued: number;
  removedFromDb: number;
  errors: number;
}

export class ListingRecoveryEngine {
  /**
   * Run recovery for a set of classified audit records.
   * Returns actions taken and counts.
   */
  async runRecovery(records: ListingAuditRecord[]): Promise<RecoveryRunResult> {
    const actions: RecoveryAction[] = [];
    let optimized = 0;
    let republishEnqueued = 0;
    let removedFromDb = 0;
    let errors = 0;

    const userIds = [...new Set(records.map((r) => r.userId))];
    for (const uid of userIds) {
      try {
        await runListingComplianceAudit(uid);
      } catch (e) {
        logger.warn('[ListingRecovery] Compliance audit failed for user', { userId: uid, error: (e as Error)?.message });
      }
    }

    for (const record of records) {
      const classification = record.classification ?? 'NEEDS_OPTIMIZATION';
      try {
        switch (classification) {
          case 'NOT_EXISTING':
            await this.removeFromDb(record);
            actions.push({
              listingDbId: record.listingDbId,
              listingId: record.listingId,
              marketplace: record.marketplace,
              userId: record.userId,
              productId: record.productId,
              classification: 'NOT_EXISTING',
              action: 'remove_from_db',
              reason: 'listing_not_found_on_marketplace',
            });
            removedFromDb++;
            break;

          case 'REJECTED':
            await this.retryRejected(record);
            actions.push({
              listingDbId: record.listingDbId,
              listingId: record.listingId,
              marketplace: record.marketplace,
              userId: record.userId,
              productId: record.productId,
              classification: 'REJECTED',
              action: 'retry_rejected',
              reason: 'enqueue_republish_after_rejection',
            });
            republishEnqueued++;
            break;

          case 'BROKEN':
          case 'INACTIVE':
            await this.fixAndRepublish(record);
            actions.push({
              listingDbId: record.listingDbId,
              listingId: record.listingId,
              marketplace: record.marketplace,
              userId: record.userId,
              productId: record.productId,
              classification: record.classification!,
              action: record.classification === 'INACTIVE' ? 'reactivate' : 'fix_republish',
              reason: 'reconcile_and_republish',
            });
            republishEnqueued++;
            break;

          case 'NEEDS_OPTIMIZATION':
          case 'LOW_PERFORMANCE':
            await this.optimizeListing(record);
            actions.push({
              listingDbId: record.listingDbId,
              listingId: record.listingId,
              marketplace: record.marketplace,
              userId: record.userId,
              productId: record.productId,
              classification: record.classification!,
              action: 'optimize',
              reason: classification === 'LOW_PERFORMANCE' ? 'low_performance_optimize_or_review' : 'needs_optimization',
            });
            optimized++;
            break;

          case 'GOOD':
            // No action
            break;
          default:
            break;
        }
      } catch (err: any) {
        errors++;
        logger.warn('[ListingRecovery] Action failed', {
          listingDbId: record.listingDbId,
          listingId: record.listingId,
          classification,
          error: err?.message,
        });
      }
    }

    return {
      processed: records.length,
      actions,
      optimized,
      republishEnqueued,
      removedFromDb,
      errors,
    };
  }

  /** NOT_EXISTING: remove listing from DB to free capacity. */
  private async removeFromDb(record: ListingAuditRecord): Promise<void> {
    await prisma.marketplaceListing.delete({
      where: { id: record.listingDbId },
    });
    logger.info('[ListingRecovery] Removed listing from DB (NOT_EXISTING)', {
      listingId: record.listingId,
      marketplace: record.marketplace,
    });
  }

  /** REJECTED: enqueue republish (one retry). */
  private async retryRejected(record: ListingAuditRecord): Promise<void> {
    const { publishingQueue } = await import('./job.service');
    if (publishingQueue) {
      await publishingQueue.add(
        'publish-product',
        {
          userId: record.userId,
          productId: record.productId,
          marketplaces: [record.marketplace],
        },
        { attempts: 2, backoff: { type: 'exponential', delay: 60000 } }
      );
    }
  }

  /** BROKEN / INACTIVE: reconcile (updates status, may enqueue republish for transient errors) then enqueue republish. */
  private async fixAndRepublish(record: ListingAuditRecord): Promise<void> {
    const { updated, republishEnqueued } = await listingStateReconciliationService.reconcileOne({
      id: record.listingDbId,
      listingId: record.listingId,
      marketplace: record.marketplace,
      userId: record.userId,
      productId: record.productId,
    });
    if (!republishEnqueued) {
      const { publishingQueue } = await import('./job.service');
      if (publishingQueue) {
        await publishingQueue.add('publish-product', {
          userId: record.userId,
          productId: record.productId,
          marketplaces: [record.marketplace],
        });
      }
    }
  }

  /** NEEDS_OPTIMIZATION / LOW_PERFORMANCE: compliance audit already run for user batch; no per-listing call. */
  private async optimizeListing(_record: ListingAuditRecord): Promise<void> {
    // Repair actions created by runListingComplianceAudit(userId) at start of runRecovery.
  }
}

export const listingRecoveryEngine = new ListingRecoveryEngine();
