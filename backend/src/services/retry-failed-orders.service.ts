/**
 * Retry Failed Orders Service
 * Retries orders that failed due to insufficient funds (FAILED_INSUFFICIENT_FUNDS)
 * when capital becomes available again.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { hasSufficientFreeCapital } from './working-capital.service';
import { orderFulfillmentService } from './order-fulfillment.service';
import { toNumber } from '../utils/decimal.utils';

const FAILED_INSUFFICIENT_FUNDS = 'FAILED_INSUFFICIENT_FUNDS';
const NEEDS_MANUAL_INTERVENTION = 'NEEDS_MANUAL_INTERVENTION';

export interface RetryFailedOrdersOptions {
  maxAgeHours?: number;
  maxRetriesPerOrder?: number;
  /** If true, retry any FAILED order; if false, only those with FAILED_INSUFFICIENT_FUNDS (default false) */
  anyFailure?: boolean;
}

export interface RetryFailedOrdersResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * Find and retry orders that failed due to insufficient funds.
 * For each eligible order: check free capital, set PAID, increment fulfillRetryCount, call fulfillOrder.
 */
export async function retryFailedOrdersDueToFunds(
  options: RetryFailedOrdersOptions = {}
): Promise<RetryFailedOrdersResult> {
  const maxAgeHours = options.maxAgeHours ?? 72;
  const maxRetriesPerOrder = options.maxRetriesPerOrder ?? 5;
  const anyFailure = options.anyFailure ?? false;
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const where: any = {
    status: 'FAILED',
    fulfillRetryCount: { lt: maxRetriesPerOrder },
    createdAt: { gte: since },
  };
  if (!anyFailure) {
    where.errorMessage = { contains: FAILED_INSUFFICIENT_FUNDS };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const result: RetryFailedOrdersResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const order of orders) {
    const orderId = order.id;
    const cost = toNumber(order.price) || 0;
    if (cost <= 0) {
      result.errors.push({ orderId, error: 'Invalid order price' });
      result.failed++;
      continue;
    }

    const capitalCheck = await hasSufficientFreeCapital(cost);
    if (!capitalCheck.sufficient) {
      logger.debug('[RETRY-FAILED-ORDERS] Skipping order - still insufficient funds', {
        orderId,
        required: capitalCheck.required,
        freeWorkingCapital: capitalCheck.freeWorkingCapital,
      });
      continue;
    }

    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          errorMessage: null,
          fulfillRetryCount: order.fulfillRetryCount + 1,
        },
      });

      const fulfillResult = await orderFulfillmentService.fulfillOrder(orderId);
      result.processed++;

      if (fulfillResult.status === 'PURCHASED') {
        result.succeeded++;
        logger.info('[RETRY-FAILED-ORDERS] Order fulfilled after retry', { orderId, attempt: order.fulfillRetryCount + 1 });
      } else {
        result.failed++;
        result.errors.push({
          orderId,
          error: fulfillResult.error || fulfillResult.status || 'Fulfill failed',
        });
        const newRetryCount = order.fulfillRetryCount + 1;
        logger.warn('[RETRY-FAILED-ORDERS] Retry fulfill did not reach PURCHASED', {
          orderId,
          status: fulfillResult.status,
          error: fulfillResult.error,
          attempt: newRetryCount,
          maxRetries: maxRetriesPerOrder,
        });
        if (newRetryCount >= maxRetriesPerOrder) {
          const current = await prisma.order.findUnique({ where: { id: orderId }, select: { errorMessage: true } });
          const newMsg = [current?.errorMessage || '', NEEDS_MANUAL_INTERVENTION].filter(Boolean).join(' ').trim();
          await prisma.order.update({
            where: { id: orderId },
            data: { errorMessage: newMsg },
          });
          logger.warn('[RETRY-FAILED-ORDERS] Max retries reached, marked NEEDS_MANUAL_INTERVENTION', { orderId });
        }
      }
    } catch (err: any) {
      result.processed++;
      result.failed++;
      const msg = err?.message || String(err);
      result.errors.push({ orderId, error: msg });
      logger.error('[RETRY-FAILED-ORDERS] Exception retrying order', { orderId, error: msg });
    }
  }

  if (result.processed > 0) {
    logger.info('[RETRY-FAILED-ORDERS] Batch complete', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      candidates: orders.length,
    });
  }

  return result;
}
