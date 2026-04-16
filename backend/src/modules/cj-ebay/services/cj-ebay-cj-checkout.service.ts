/**
 * CJ → eBay USA — confirmación y pago balance post-`createOrderV2` (FASE 3E.3).
 * Endpoints oficiales: PATCH `shopping/order/confirmOrder`, POST `shopping/pay/payBalance`.
 * Sin Order legacy, sin workers.
 */

import { AppError } from '../../../middleware/error.middleware';
import { prisma } from '../../../config/database';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';
import { CjSupplierError } from '../adapters/cj-supplier.errors';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { appendOrderEvent } from './cj-ebay-order-ingest.service';
import {
  CJ_EBAY_TRACE_STEP,
  CJ_EBAY_ORDER_STATUS,
  CJ_EBAY_PAYMENT_BLOCK_REASON,
} from '../cj-ebay.constants';

/**
 * FASE 3F — Detecta si el error de `payBalance` corresponde a saldo insuficiente CJ.
 * CJ retorna mensajes como "Insufficient balance", "balance is not enough", "余额不足", etc.
 * No confundir con PayPal: esta vertical no usa PayPal.
 */
function isCjBalanceInsufficientError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('insufficient balance') ||
    lower.includes('balance is not enough') ||
    lower.includes('insufficient funds') ||
    lower.includes('balance insufficient') ||
    lower.includes('余额不足') ||
    lower.includes('not enough balance') ||
    lower.includes('balance not enough') ||
    // CJ API sometimes returns error code 1600001 or similar for balance issues
    lower.includes('1600001') ||
    lower.includes('balance_insufficient') ||
    lower.includes('no balance')
  );
}

const CONFIRM_FROM = new Set([
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED,
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMING,
]);

const PAY_FROM = new Set([
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED,
  CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING,
  CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PROCESSING,
  // FASE 3F: permite reintentar después de recargar balance CJ
  CJ_EBAY_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
]);

export const cjEbayCjCheckoutService = {
  async confirmCjOrder(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{ skipped?: boolean; orderId: string; cjOrderId: string }> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    if (!order.cjOrderId) {
      throw new AppError(
        `No CJ order id; place CJ order first. Next: POST /api/cj-ebay/orders/${input.orderId}/place`,
        400
      );
    }
    if (order.cjConfirmedAt) {
      return { skipped: true, orderId: order.id, cjOrderId: order.cjOrderId };
    }
    if (!(CONFIRM_FROM as Set<string>).has(order.status)) {
      const hint =
        order.status === CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING
          ? ` Next: POST /api/cj-ebay/orders/${input.orderId}/pay (already confirmed).`
          : '';
      throw new AppError(
        `confirmCjOrder requires status CJ_ORDER_CREATED or CJ_ORDER_CONFIRMING (current: ${order.status}).${hint}`,
        400
      );
    }

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.CJ_ORDER_CONFIRM_START,
      message: 'cj.order.confirm.start',
      meta: { orderId: order.id, cjOrderId: order.cjOrderId },
    });

    await prisma.cjEbayOrder.update({
      where: { id: order.id },
      data: { status: CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMING, lastError: null },
    });

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      const res = await adapter.confirmOrder(order.cjOrderId);
      const now = new Date();
      await prisma.cjEbayOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING,
          cjConfirmedAt: now,
          lastError: null,
        },
      });
      await appendOrderEvent(
        order.id,
        CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING,
        'CJ confirmOrder succeeded — awaiting payBalance (doc: UNPAID typical)',
        { cjOrderId: res.orderId }
      );
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_CONFIRM_SUCCESS,
        message: 'cj.order.confirm.success',
        meta: { orderId: order.id, cjOrderId: res.orderId },
      });
      return { orderId: order.id, cjOrderId: order.cjOrderId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.cjEbayOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED,
          lastError: msg.slice(0, 4000),
        },
      });
      await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL, `confirmOrder failed: ${msg}`, {
        step: 'CJ_CONFIRM_ERROR',
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_CONFIRM_ERROR,
        message: 'cj.order.confirm.error',
        meta: { orderId: order.id, error: msg.slice(0, 400) },
      });
      if (e instanceof CjSupplierError) {
        throw new AppError(msg, 502);
      }
      throw e;
    }
  },

  async payCjOrder(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{ skipped?: boolean; orderId: string; cjOrderId: string }> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    if (!order.cjOrderId) {
      throw new AppError(
        `No CJ order id. Next: POST /api/cj-ebay/orders/${input.orderId}/place`,
        400
      );
    }
    if (!order.cjConfirmedAt) {
      throw new AppError(
        `Run confirm before pay (no cjConfirmedAt). Next: POST /api/cj-ebay/orders/${input.orderId}/confirm`,
        400
      );
    }
    if (order.cjPaidAt) {
      return { skipped: true, orderId: order.id, cjOrderId: order.cjOrderId };
    }
    if (!(PAY_FROM as Set<string>).has(order.status)) {
      throw new AppError(
        `payCjOrder requires CJ_ORDER_CONFIRMED, CJ_PAYMENT_PENDING or CJ_PAYMENT_PROCESSING (current: ${order.status}). If stuck after a failed pay, check GET /api/cj-ebay/orders/${input.orderId}/operational-flow.`,
        400
      );
    }

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.CJ_ORDER_PAY_START,
      message: 'cj.order.pay.start',
      meta: { orderId: order.id, cjOrderId: order.cjOrderId },
    });

    await prisma.cjEbayOrder.update({
      where: { id: order.id },
      data: { status: CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PROCESSING, lastError: null },
    });

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      await adapter.payBalance(order.cjOrderId);
      const now = new Date();
      await prisma.cjEbayOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
          cjPaidAt: now,
          lastError: null,
        },
      });
      await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_COMPLETED, 'CJ payBalance succeeded', {});
      await prisma.cjEbayOrder.update({
        where: { id: order.id },
        data: { status: CJ_EBAY_ORDER_STATUS.CJ_FULFILLING },
      });
      await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.CJ_FULFILLING, 'CJ fulfillment / awaiting shipment', {});
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_PAY_SUCCESS,
        message: 'cj.order.pay.success',
        meta: { orderId: order.id, cjOrderId: order.cjOrderId },
      });
      return { orderId: order.id, cjOrderId: order.cjOrderId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isBalanceError =
        (e instanceof CjSupplierError && e.code === 'CJ_INSUFFICIENT_BALANCE') ||
        isCjBalanceInsufficientError(msg);

      if (isBalanceError) {
        // FASE 3F — Saldo CJ insuficiente: bloquear la orden con estado explícito.
        // El operador debe recargar balance CJ y luego reintentar /pay.
        await prisma.cjEbayOrder.update({
          where: { id: order.id },
          data: {
            status: CJ_EBAY_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
            paymentBlockReason: CJ_EBAY_PAYMENT_BLOCK_REASON.CJ_BALANCE_INSUFFICIENT,
            lastError: msg.slice(0, 4000),
          },
        });
        await appendOrderEvent(
          order.id,
          CJ_EBAY_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
          'Pago bloqueado: balance CJ insuficiente. Recarga tu balance CJ y reintenta /pay.',
          { step: 'CJ_PAY_BALANCE_BLOCKED', blockReason: CJ_EBAY_PAYMENT_BLOCK_REASON.CJ_BALANCE_INSUFFICIENT }
        );
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.CJ_ORDER_PAY_BALANCE_BLOCKED,
          message: 'cj.order.pay.balance_blocked',
          meta: {
            orderId: order.id,
            blockReason: CJ_EBAY_PAYMENT_BLOCK_REASON.CJ_BALANCE_INSUFFICIENT,
            error: msg.slice(0, 400),
          },
        });
        throw new AppError(
          'Balance CJ insuficiente. Recarga tu balance en el portal CJ Dropshipping y reintenta el pago desde la consola de la orden.',
          402
        );
      }

      // Error genérico de pago
      await prisma.cjEbayOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING,
          lastError: msg.slice(0, 4000),
        },
      });
      await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL, `payBalance failed: ${msg}`, {
        step: 'CJ_PAY_ERROR',
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_PAY_ERROR,
        message: 'cj.order.pay.error',
        meta: { orderId: order.id, error: msg.slice(0, 400) },
      });
      if (e instanceof CjSupplierError) {
        throw new AppError(msg, 502);
      }
      throw e;
    }
  },
};
