/**
 * Phase 47B — Manual fulfillment fallback when AliExpress automation fails
 * (SKU_NOT_EXIST / PRODUCT_NOT_EXIST threshold, daily auto-retry, promote to manual queue).
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

export const SKU_FAILURE_SUBSTRINGS = ['SKU_NOT_EXIST', 'PRODUCT_NOT_EXIST'] as const;

const MANUAL_THRESHOLD = 3;
const AUTO_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function errorLooksLikeSkuFailure(message: string | null | undefined): boolean {
  if (!message) return false;
  const u = message.toUpperCase();
  return SKU_FAILURE_SUBSTRINGS.some((s) => u.includes(s));
}

/**
 * Count logged purchase attempts for this order whose error indicates missing SKU/product.
 */
export async function countSkuRelatedFailures(orderId: string): Promise<number> {
  return prisma.purchaseAttemptLog.count({
    where: {
      orderId,
      success: false,
      OR: SKU_FAILURE_SUBSTRINGS.map((sub) => ({
        error: { contains: sub, mode: 'insensitive' as const },
      })),
    },
  });
}

export async function shouldEscalateToManualQueue(orderId: string): Promise<boolean> {
  const n = await countSkuRelatedFailures(orderId);
  return n >= MANUAL_THRESHOLD;
}

export interface ActivateManualOptions {
  failureReason: string;
  userId?: number | null;
  /** If true, set intermediate FULFILLMENT_BLOCKED before MANUAL_ACTION_REQUIRED (same DB write = MANUAL only for UX) */
  logFulfillmentBlocked?: boolean;
}

/**
 * Move order to manual queue with audit fields and user notification.
 */
export async function activateManualFulfillmentQueue(
  orderId: string,
  opts: ActivateManualOptions
): Promise<void> {
  const now = new Date();
  const reason = opts.failureReason.slice(0, 4000);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'MANUAL_ACTION_REQUIRED',
      manualFulfillmentRequired: true,
      failureReason: reason,
      lastAttemptAt: now,
      lastAutoRetryAt: now,
      errorMessage: reason.slice(0, 2000),
    },
  });

  logger.warn('[PHASE47B] manual_fallback_activated', {
    orderId,
    failureReasonPreview: reason.slice(0, 200),
    fulfillmentBlockedLogged: opts.logFulfillmentBlocked ?? true,
  });

  if (opts.userId) {
    try {
      const { notificationService } = await import('./notification.service');
      await notificationService.sendToUser(opts.userId, {
        type: 'SYSTEM_ALERT',
        title: 'Action required: Order pending fulfillment',
        message: `Order ${orderId} needs manual purchase on AliExpress. Open Compras pendientes / Órdenes to complete.`,
        data: { orderId, phase: '47B', failureReason: reason.slice(0, 500) },
        priority: 'HIGH',
        category: 'SYSTEM',
      });
    } catch (e: any) {
      logger.warn('[PHASE47B] notification failed', { orderId, error: e?.message });
    }
  }
}

/**
 * After a failed automation run: optionally escalate from FAILED → MANUAL_ACTION_REQUIRED.
 */
export async function maybeEscalateFailedOrderToManual(
  orderId: string,
  lastError: string,
  userId?: number | null
): Promise<void> {
  const escalate = await shouldEscalateToManualQueue(orderId);
  if (!escalate) {
    logger.info('[PHASE47B] below_manual_threshold', { orderId, threshold: MANUAL_THRESHOLD });
    return;
  }
  logger.warn('[PHASE47B] fulfillment_blocked_then_manual', {
    orderId,
    threshold: MANUAL_THRESHOLD,
    message: 'Automation paused for this cycle; manual queue enabled',
  });
  await activateManualFulfillmentQueue(orderId, {
    failureReason: lastError,
    userId: userId ?? undefined,
    logFulfillmentBlocked: true,
  });
}

export interface DailyAutoRetryResult {
  processed: number;
  succeeded: number;
  failed: number;
  skippedCooldown: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * Daily job: retry automatic purchase for MANUAL_ACTION_REQUIRED orders (24h cooldown per order).
 */
export async function retryAutomaticPurchaseForManualOrders(
  orderFulfillmentService: { fulfillOrder: (id: string) => Promise<{ success: boolean; status: string; error?: string }> }
): Promise<DailyAutoRetryResult> {
  const cutoff = new Date(Date.now() - AUTO_RETRY_COOLDOWN_MS);
  const orders = await prisma.order.findMany({
    where: {
      status: 'MANUAL_ACTION_REQUIRED',
      manualFulfillmentRequired: true,
      OR: [{ lastAutoRetryAt: null }, { lastAutoRetryAt: { lt: cutoff } }],
    },
    orderBy: { updatedAt: 'asc' },
    take: 25,
    select: { id: true, userId: true, productUrl: true },
  });

  const result: DailyAutoRetryResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skippedCooldown: 0,
    errors: [],
  };

  for (const o of orders) {
    if (!(o.productUrl || '').trim()) {
      result.errors.push({ orderId: o.id, error: 'No productUrl' });
      result.failed++;
      continue;
    }
    const last = await prisma.order.findUnique({
      where: { id: o.id },
      select: { lastAutoRetryAt: true },
    });
    if (last?.lastAutoRetryAt && last.lastAutoRetryAt.getTime() > cutoff.getTime()) {
      result.skippedCooldown++;
      continue;
    }

    try {
      await prisma.order.update({
        where: { id: o.id },
        data: {
          status: 'PAID',
          errorMessage: null,
          lastAutoRetryAt: new Date(),
        },
      });
      result.processed++;
      logger.info('[PHASE47B] daily_auto_retry_start', { orderId: o.id });

      const fr = await orderFulfillmentService.fulfillOrder(o.id);

      if (fr.success && fr.status === 'PURCHASED') {
        result.succeeded++;
        await prisma.order.update({
          where: { id: o.id },
          data: {
            manualFulfillmentRequired: false,
            failureReason: null,
          },
        });
        logger.info('[PHASE47B] daily_auto_retry_succeeded', { orderId: o.id });
      } else {
        result.failed++;
        result.errors.push({
          orderId: o.id,
          error: fr.error || fr.status || 'unknown',
        });
        logger.warn('[PHASE47B] daily_auto_retry_failed', {
          orderId: o.id,
          status: fr.status,
          error: fr.error,
        });
      }
    } catch (err: any) {
      result.processed++;
      result.failed++;
      const msg = err?.message || String(err);
      result.errors.push({ orderId: o.id, error: msg });
      logger.error('[PHASE47B] daily_auto_retry_exception', { orderId: o.id, error: msg });
    }
  }

  if (result.processed > 0 || orders.length > 0) {
    logger.info('[PHASE47B] daily_auto_retry_batch_done', {
      candidates: orders.length,
      ...result,
    });
  }

  return result;
}

/**
 * Force an order into manual queue (e.g. known stuck eBay sale). Idempotent if already PURCHASED.
 */
export async function promoteOrderToManualQueue(
  orderId: string,
  reason: string,
  userId?: number | null
): Promise<{ ok: boolean; skipped?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) return { ok: false, skipped: 'not_found' };
  if (order.status === 'PURCHASED') return { ok: true, skipped: 'already_purchased' };
  await activateManualFulfillmentQueue(orderId, { failureReason: reason, userId });
  return { ok: true };
}
