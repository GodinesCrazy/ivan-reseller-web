/**
 * CJ → eBay USA — consulta estado de pedido en CJ vía API oficial (FASE 3E.1).
 * `GET shopping/order/getOrderDetail` — sin orderFulfillmentService legacy.
 */

import { AppError } from '../../../middleware/error.middleware';
import { prisma } from '../../../config/database';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';
import { CjSupplierError } from '../adapters/cj-supplier.errors';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { appendOrderEvent } from './cj-ebay-order-ingest.service';
import { CJ_EBAY_TRACE_STEP, CJ_EBAY_ORDER_STATUS } from '../cj-ebay.constants';

function mapCjStatusToLocal(cj: string, cjPaidAt: Date | null): string | null {
  const s = String(cj || '').trim().toUpperCase();
  if (s === 'SHIPPED' || s === 'DELIVERED') return CJ_EBAY_ORDER_STATUS.CJ_SHIPPED;
  if (s === 'CANCELLED') return CJ_EBAY_ORDER_STATUS.FAILED;
  if (s === 'UNSHIPPED' && cjPaidAt) return CJ_EBAY_ORDER_STATUS.CJ_FULFILLING;
  return null;
}

export const cjEbayOrderStatusService = {
  async fetchFromCj(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{
    cjOrderStatus: string;
    trackNumber: string | null;
    logisticName: string | null;
    localStatusUpdated?: string;
  }> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    if (!order.cjOrderId) {
      throw new AppError('No CJ order id; place CJ order first.', 400);
    }

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.CJ_ORDER_STATUS_START,
      message: 'cj.order.status.start',
      meta: { orderId: order.id, cjOrderId: order.cjOrderId },
    });

    const adapter = createCjSupplierAdapter(input.userId);

    try {
      const st = await adapter.getOrderStatus(order.cjOrderId);
      const mapped = mapCjStatusToLocal(st.status, order.cjPaidAt);
      let localStatusUpdated: string | undefined;

      if (mapped && mapped !== order.status && order.status !== CJ_EBAY_ORDER_STATUS.TRACKING_ON_EBAY) {
        await prisma.cjEbayOrder.update({
          where: { id: order.id },
          data: { status: mapped, lastError: null },
        });
        localStatusUpdated = mapped;
        await appendOrderEvent(order.id, mapped, `CJ order status: ${st.status}`, {
          cjOrderId: order.cjOrderId,
          trackNumber: st.trackNumber,
        });
      } else {
        await appendOrderEvent(order.id, 'CJ_STATUS_POLL', `CJ order status: ${st.status}`, {
          cjOrderId: order.cjOrderId,
          trackNumber: st.trackNumber,
          logisticName: st.logisticName,
        });
      }

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_STATUS_SUCCESS,
        message: 'cj.order.status.success',
        meta: {
          orderId: order.id,
          cjOrderStatus: st.status,
          localStatusUpdated,
        },
      });

      return {
        cjOrderStatus: st.status,
        trackNumber: st.trackNumber,
        logisticName: st.logisticName,
        localStatusUpdated,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_STATUS_ERROR,
        message: 'cj.order.status.error',
        meta: { orderId: order.id, error: msg.slice(0, 400) },
      });
      if (e instanceof CjSupplierError) {
        throw new AppError(msg, 502);
      }
      throw e;
    }
  },
};
