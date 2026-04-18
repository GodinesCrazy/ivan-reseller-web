/**
 * CJ → ML Chile — Checkout service (Parity with CJ → eBay USA).
 * Handles confirming and paying for CJ orders (balance pay).
 */

import { AppError } from '../../../middleware/error.middleware';
import { prisma } from '../../../config/database';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierError } from '../../cj-ebay/adapters/cj-supplier.errors';
import { cjMlChileTraceService } from './cj-ml-chile-trace.service';
import { Prisma } from '@prisma/client';
import {
  CJ_ML_CHILE_TRACE_STEP,
  CJ_ML_CHILE_ORDER_STATUS,
  CJ_ML_CHILE_PAYMENT_BLOCK_REASON,
} from '../cj-ml-chile.constants';

/**
 * Helper to append events
 */
async function appendOrderEvent(orderId: string, step: string, message: string, meta: any = {}) {
  await prisma.cjMlChileOrderEvent.create({
    data: {
      orderId,
      step,
      message,
      meta: meta as Prisma.InputJsonValue,
    },
  });
}

function isCjBalanceInsufficientError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('insufficient balance') ||
    lower.includes('balance is not enough') ||
    lower.includes('insufficient funds') ||
    lower.includes('余额不足') ||
    lower.includes('1600001')
  );
}

const CONFIRM_FROM = new Set([
  CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CREATED,
  CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CONFIRMING,
]);

const PAY_FROM = new Set([
  CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CONFIRMED,
  CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_PENDING,
  CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_PROCESSING,
  CJ_ML_CHILE_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
]);

export const cjMlChileCjCheckoutService = {
  async confirmCjOrder(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{ skipped?: boolean; orderId: string; cjOrderId: string }> {
    const order = await prisma.cjMlChileOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
    });
    if (!order) throw new AppError('Order not found', 404);
    if (!order.cjOrderId) throw new AppError('No CJ order ID; place it first', 400);
    
    // Status check
    if (!(CONFIRM_FROM as Set<string>).has(order.status)) {
       throw new AppError(`confirmCjOrder requires status CJ_ORDER_CREATED (current: ${order.status})`, 400);
    }

    await prisma.cjMlChileOrder.update({
      where: { id: order.id },
      data: { status: CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CONFIRMING },
    });

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      const res = await adapter.confirmOrder(order.cjOrderId);
      await prisma.cjMlChileOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_PENDING,
          cjConfirmedAt: new Date(),
        },
      });
      await appendOrderEvent(order.id, CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_PENDING, 'CJ confirmOrder succeeded');
      return { orderId: order.id, cjOrderId: order.cjOrderId };
    } catch (e: any) {
      const msg = e.message || String(e);
      await prisma.cjMlChileOrder.update({
        where: { id: order.id },
        data: { status: CJ_ML_CHILE_ORDER_STATUS.FAILED, lastError: msg },
      });
      throw e;
    }
  },

  async payCjOrder(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{ skipped?: boolean; orderId: string; cjOrderId: string }> {
    const order = await prisma.cjMlChileOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
    });
    if (!order) throw new AppError('Order not found', 404);
    if (!order.cjOrderId) throw new AppError('No CJ order ID', 400);
    
    if (!(PAY_FROM as Set<string>).has(order.status)) {
      throw new AppError(`payCjOrder requires valid payment pending status (current: ${order.status})`, 400);
    }

    await prisma.cjMlChileOrder.update({
      where: { id: order.id },
      data: { status: CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_PROCESSING },
    });

    const adapter = createCjSupplierAdapter(input.userId);
    try {
      await adapter.payBalance(order.cjOrderId);
      await prisma.cjMlChileOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
          cjPaidAt: new Date(),
        },
      });
      await appendOrderEvent(order.id, CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_COMPLETED, 'CJ payBalance succeeded');
      
      // Auto-move to fulfilling
      await prisma.cjMlChileOrder.update({
        where: { id: order.id },
        data: { status: CJ_ML_CHILE_ORDER_STATUS.CJ_FULFILLING },
      });
      
      return { orderId: order.id, cjOrderId: order.cjOrderId };
    } catch (e: any) {
      const msg = e.message || String(e);
      const isBalanceError = isCjBalanceInsufficientError(msg);

      if (isBalanceError) {
        await prisma.cjMlChileOrder.update({
          where: { id: order.id },
          data: {
            status: CJ_ML_CHILE_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
            paymentBlockReason: CJ_ML_CHILE_PAYMENT_BLOCK_REASON.CJ_BALANCE_INSUFFICIENT,
            lastError: msg,
          },
        });
        await appendOrderEvent(order.id, CJ_ML_CHILE_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED, 'Payment blocked: insufficient CJ balance');
        throw new AppError('Balance CJ insuficiente.', 402);
      }

      await prisma.cjMlChileOrder.update({
        where: { id: order.id },
        data: { status: CJ_ML_CHILE_ORDER_STATUS.FAILED, lastError: msg },
      });
      throw e;
    }
  }
};
