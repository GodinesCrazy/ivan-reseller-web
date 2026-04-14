/**
 * Phase D.5 — Neutral batch sync for supplier post-sale (status + tracking).
 * Called from BullMQ worker `supplier-postsale-sync` on a fixed cadence.
 */
import { prisma } from '../config/database';
import logger from '../config/logger';
import { AppError } from '../middleware/error.middleware';
import { supplierFulfillmentService } from './supplier-fulfillment.service';

const TERMINAL_SUPPLIER_STATUSES = new Set(
  String(process.env.SUPPLIER_POSTSALE_TERMINAL_STATUSES || 'DELIVERED,CANCELLED,REFUNDED,COMPLETED')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

function envBool(name: string, defaultTrue: boolean): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return defaultTrue;
  return v === 'true' || v === '1' || v === 'yes';
}

export interface SupplierPostsaleSyncBatchResult {
  scanned: number;
  synced: number;
  skippedCooldown: number;
  skippedDisabled: number;
  failed: number;
  /** CJ HTTP 429 / rate limit observed on at least one order in batch */
  rateLimitedHits: number;
}

/**
 * Poll CJ (via supplierFulfillmentService) for orders that still need status/tracking updates.
 * Uses cooldown per order to avoid API storms (429).
 */
export async function runSupplierPostsaleSyncBatch(options?: {
  batchSize?: number;
  minIntervalMs?: number;
}): Promise<SupplierPostsaleSyncBatchResult> {
  if (!envBool('SUPPLIER_POSTSALE_SYNC_ENABLED', true)) {
    logger.info('[SUPPLIER-POSTSALE-SYNC] disabled via SUPPLIER_POSTSALE_SYNC_ENABLED');
    return { scanned: 0, synced: 0, skippedCooldown: 0, skippedDisabled: 1, failed: 0, rateLimitedHits: 0 };
  }

  const batchSize = Math.min(
    200,
    Math.max(
      1,
      options?.batchSize ?? (Number(process.env.SUPPLIER_POSTSALE_SYNC_BATCH || 25) || 25)
    )
  );
  const minIntervalMs = Math.max(
    30_000,
    options?.minIntervalMs ?? (Number(process.env.SUPPLIER_POSTSALE_MIN_INTERVAL_MS || 120_000) || 120_000)
  );

  const now = new Date();
  const cooldownBefore = new Date(now.getTime() - minIntervalMs);

  const rows = await prisma.order.findMany({
    where: {
      userId: { not: null },
      supplierOrderId: { not: null },
      supplier: { in: ['cj', 'cjdropshipping'] },
      OR: [{ supplierSyncAt: null }, { supplierSyncAt: { lte: cooldownBefore } }],
      AND: [
        {
          OR: [
            { supplierStatus: null },
            { supplierStatus: { notIn: [...TERMINAL_SUPPLIER_STATUSES] } },
          ],
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      supplierStatus: true,
      supplierTrackingNumber: true,
      supplierSyncAt: true,
    },
    orderBy: { supplierSyncAt: 'asc' },
    take: batchSize,
  });

  let synced = 0;
  let failed = 0;
  let rateLimitedHits = 0;

  for (const row of rows) {
    const userId = row.userId!;
    if (row.supplierStatus && TERMINAL_SUPPLIER_STATUSES.has(row.supplierStatus.toUpperCase())) {
      continue;
    }
    if (
      row.supplierTrackingNumber &&
      String(row.supplierTrackingNumber).trim() !== '' &&
      ['SHIPPED', 'DELIVERED'].includes(String(row.supplierStatus || '').toUpperCase())
    ) {
      continue;
    }

    try {
      await supplierFulfillmentService.getSupplierOrderStatus({ orderId: row.id, userId });
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 200)));
      await supplierFulfillmentService.getSupplierTracking({ orderId: row.id, userId });
      synced++;
      logger.info('[SUPPLIER-POSTSALE-SYNC] order synced', {
        orderId: row.id,
        supplier: 'cj',
      });
    } catch (e) {
      failed++;
      const is429 = e instanceof AppError && e.statusCode === 429;
      if (is429) {
        rateLimitedHits++;
        logger.warn('[SUPPLIER-POSTSALE-SYNC] order sync degraded (429)', { orderId: row.id });
      } else {
        logger.warn('[SUPPLIER-POSTSALE-SYNC] order sync failed', {
          orderId: row.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  if (rateLimitedHits > 0) {
    logger.warn('[SUPPLIER-POSTSALE-SYNC] batch completed with rate limits', {
      rateLimitedHits,
      failed,
      synced,
    });
  }

  return {
    scanned: rows.length,
    synced,
    skippedCooldown: 0,
    skippedDisabled: 0,
    failed,
    rateLimitedHits,
  };
}
