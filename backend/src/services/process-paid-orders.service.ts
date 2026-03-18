/**
 * Process Paid Orders Service
 *
 * Cron job: picks all orders with status PAID and calls fulfillOrder for each.
 * Ensures 100% automation of pending purchases even when webhooks fail or are delayed.
 * orderFulfillmentService.fulfillOrder already checks daily limits and hasSufficientFreeCapital.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { orderFulfillmentService } from './order-fulfillment.service';

const DEFAULT_BATCH_SIZE = 30;

export interface ProcessPaidOrdersOptions {
  batchSize?: number;
}

export interface ProcessPaidOrdersResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * Find and fulfill all orders with status PAID (oldest first).
 * Respects batch size; fulfillOrder handles daily limits and capital checks.
 */
export async function processPaidOrders(
  options: ProcessPaidOrdersOptions = {}
): Promise<ProcessPaidOrdersResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const orders = await prisma.order.findMany({
    where: { status: 'PAID' },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  const result: ProcessPaidOrdersResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const order of orders) {
    const orderId = order.id;
    // eBay-ingested orders sin URL de AliExpress: no intentar fulfill hasta que el usuario mapee el producto
    if (!(order.productUrl || '').trim()) {
      logger.debug('[PROCESS-PAID-ORDERS] Skip fulfill — no productUrl (map product or import)', { orderId });
      continue;
    }
    try {
      const fulfillResult = await orderFulfillmentService.fulfillOrder(orderId);
      result.processed++;

      if (fulfillResult.status === 'PURCHASED') {
        result.succeeded++;
        logger.info('[PROCESS-PAID-ORDERS] Order fulfilled', {
          orderId,
          aliexpressOrderId: fulfillResult.aliexpressOrderId,
        });
      } else {
        result.failed++;
        result.errors.push({
          orderId,
          error: fulfillResult.error || fulfillResult.status || 'Fulfill failed',
        });
        logger.warn('[PROCESS-PAID-ORDERS] Fulfill did not reach PURCHASED', {
          orderId,
          status: fulfillResult.status,
          error: fulfillResult.error,
        });
      }
    } catch (err: any) {
      result.processed++;
      result.failed++;
      const msg = err?.message || String(err);
      result.errors.push({ orderId, error: msg });
      logger.error('[PROCESS-PAID-ORDERS] Exception fulfilling order', { orderId, error: msg });
    }
  }

  if (result.processed > 0) {
    logger.info('[PROCESS-PAID-ORDERS] Batch complete', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      candidates: orders.length,
    });
  }

  return result;
}
