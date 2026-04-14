/**
 * CJ → eBay USA — colocar pedido en CJ (FASE 3E / 3E.1).
 * Sin orderFulfillmentService legacy.
 *
 * Idempotencia: un solo `orderNumber` estable por fila (`cj-ebay-{id}`); no se reintenta place si ya hay `cjOrderId`.
 */

import { AppError } from '../../../middleware/error.middleware';
import { prisma } from '../../../config/database';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';
import { CjSupplierError } from '../adapters/cj-supplier.errors';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { appendOrderEvent } from './cj-ebay-order-ingest.service';
import { cjEbayCjCheckoutService } from './cj-ebay-cj-checkout.service';
import { cjEbayConfigService } from './cj-ebay-config.service';
import {
  CJ_EBAY_TRACE_STEP,
  CJ_EBAY_ORDER_STATUS,
  CJ_EBAY_POST_CREATE_CHECKOUT_MODE,
} from '../cj-ebay.constants';

function shipToFromBuyerPayload(buyerPayload: unknown): Record<string, string> {
  const p = buyerPayload as Record<string, unknown> | null | undefined;
  const addr = p?.shippingAddress as Record<string, unknown> | undefined;
  if (!addr) return {};
  const out: Record<string, string> = {};
  for (const k of [
    'fullName',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'zipCode',
    'country',
    'phoneNumber',
  ]) {
    const v = addr[k];
    if (v != null) out[k] = String(v).slice(0, 500);
  }
  return out;
}

export const cjEbayFulfillmentService = {
  async placeCjOrder(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{
    cjOrderId?: string;
    status: string;
    needsManual?: boolean;
    checkoutNote?: string;
  }> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: {
        variant: true,
        listing: { include: { shippingQuote: true } },
      },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const hasMapping = order.listingId != null && order.variantId != null && order.listing != null;
    const retryAfterFailure =
      !order.cjOrderId &&
      hasMapping &&
      (order.status === CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL || order.status === CJ_EBAY_ORDER_STATUS.FAILED);

    const canPlace = order.status === CJ_EBAY_ORDER_STATUS.VALIDATED || retryAfterFailure;
    if (!canPlace) {
      throw new AppError(
        `placeCjOrder requires VALIDATED, or NEEDS_MANUAL/FAILED with listing/variant mapping and no cjOrderId (documented retry). Current: ${order.status}.`,
        400
      );
    }
    if (!order.listingId || !order.variantId || !order.listing) {
      throw new AppError('Order is not mapped to a CJ listing/variant.', 400);
    }
    if (order.listing.userId !== input.userId) {
      throw new AppError('Listing does not belong to this user.', 403);
    }
    if (order.cjOrderId) {
      throw new AppError('cjOrderId already set for this order (no duplicate place).', 409);
    }

    const variant = order.variant;
    if (!variant?.cjSku) {
      throw new AppError('Variant missing cjSku for CJ createOrder.', 400);
    }
    const cjVid = String(variant.cjVid || '').trim();
    if (!cjVid) {
      throw new AppError(
        'Variant missing cjVid (CJ variant id). Sync the product from CJ or refresh variants before placing.',
        400
      );
    }

    const quote = order.listing.shippingQuote;
    const logisticName = String(quote?.serviceName || quote?.carrier || '').trim();
    if (!logisticName) {
      throw new AppError(
        'Listing has no shipping quote (logisticName). Link a CJ freight quote to this listing (pricing/shipping flow) before place.',
        400
      );
    }

    const bp = order.buyerPayload as Record<string, unknown> | undefined;
    const shipTo = shipToFromBuyerPayload(order.buyerPayload);
    if (!shipTo.fullName?.trim() && typeof bp?.buyerName === 'string' && bp.buyerName.trim()) {
      shipTo.fullName = bp.buyerName.trim().slice(0, 500);
    }

    if (!shipTo.addressLine1 || !shipTo.city || !shipTo.country) {
      throw new AppError('Incomplete ship-to address on imported order (need address, city, country).', 400);
    }
    if (!shipTo.fullName?.trim()) {
      throw new AppError('Missing recipient fullName on order (eBay shipping address).', 400);
    }
    const cc = String(shipTo.country || '').trim().toUpperCase();
    if (cc === 'US' && !String(shipTo.state || '').trim()) {
      throw new AppError('US orders require state/province on the eBay shipping address for CJ.', 400);
    }

    await prisma.cjEbayOrder.update({
      where: { id: order.id },
      data: { status: CJ_EBAY_ORDER_STATUS.CJ_ORDER_PLACING, lastError: null },
    });
    await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.CJ_ORDER_PLACING, 'Starting CJ createOrder', {});

    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.ORDER_PLACE_START,
      message: 'order.place.start',
      meta: { orderId: order.id, ebayOrderId: order.ebayOrderId },
    });

    const adapter = createCjSupplierAdapter(input.userId);

    try {
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_CREATE_START,
        message: 'cj.order.create.start',
        meta: { orderId: order.id, logisticName },
      });

      const storeLineItemId = String(order.lineItemRef || '').trim() || undefined;
      const result = await adapter.createOrder({
        idempotencyKey: `cj-ebay-${order.id}`.slice(0, 50),
        logisticName,
        lines: [
          {
            cjVid,
            cjSku: variant.cjSku,
            quantity: Math.max(1, order.lineQuantity),
            storeLineItemId,
          },
        ],
        shipTo,
        payType: 3,
        shopLogisticsType: 2,
      });

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_CREATE_SUCCESS,
        message: 'cj.order.create.success',
        meta: { orderId: order.id, cjOrderId: result.cjOrderId, cjStatus: result.status },
      });

      await prisma.cjEbayOrder.update({
        where: { id: order.id },
        data: {
          cjOrderId: result.cjOrderId,
          status: CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED,
          lastError: null,
        },
      });
      await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED, 'CJ createOrder succeeded (payType=3)', {
        cjOrderId: result.cjOrderId,
        cjStatus: result.status,
        rawSummary: result.rawSummary,
      });

      const checkoutMode = await cjEbayConfigService.getPostCreateCheckoutMode(input.userId);
      let finalStatus: string = CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED;
      let checkoutNote: string | undefined;

      if (checkoutMode === CJ_EBAY_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY) {
        try {
          await cjEbayCjCheckoutService.confirmCjOrder({
            userId: input.userId,
            orderId: order.id,
            correlationId: input.correlationId,
            route: input.route,
          });
          await cjEbayCjCheckoutService.payCjOrder({
            userId: input.userId,
            orderId: order.id,
            correlationId: input.correlationId,
            route: input.route,
          });
          finalStatus = CJ_EBAY_ORDER_STATUS.CJ_FULFILLING;
        } catch (autoErr) {
          const m = autoErr instanceof Error ? autoErr.message : String(autoErr);
          checkoutNote = `AUTO_CONFIRM_PAY partial/failed: ${m.slice(0, 500)}`;
          const refreshed = await prisma.cjEbayOrder.findFirst({ where: { id: order.id } });
          finalStatus = refreshed?.status ?? CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED;
          await cjEbayTraceService.record({
            userId: input.userId,
            correlationId: input.correlationId,
            route: input.route,
            step: CJ_EBAY_TRACE_STEP.ORDER_PLACE_ERROR,
            message: 'order.place.error',
            meta: { orderId: order.id, checkoutAuto: true, error: m.slice(0, 400) },
          });
          return {
            cjOrderId: result.cjOrderId,
            status: finalStatus,
            needsManual: true,
            checkoutNote,
          };
        }
      }

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.ORDER_PLACE_SUCCESS,
        message: 'order.place.success',
        meta: { orderId: order.id, cjOrderId: result.cjOrderId },
      });

      return { cjOrderId: result.cjOrderId, status: finalStatus, checkoutNote };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.CJ_ORDER_CREATE_ERROR,
        message: 'cj.order.create.error',
        meta: {
          orderId: order.id,
          code: e instanceof CjSupplierError ? e.code : 'UNKNOWN',
          error: msg.slice(0, 400),
        },
      });

      if (e instanceof CjSupplierError && e.code === 'CJ_NOT_IMPLEMENTED') {
        await prisma.cjEbayOrder.update({
          where: { id: order.id },
          data: {
            status: CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL,
            lastError: msg.slice(0, 4000),
          },
        });
        await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL, msg, {
          code: e.code,
          partial: true,
        });
        await cjEbayTraceService.record({
          userId: input.userId,
          correlationId: input.correlationId,
          route: input.route,
          step: CJ_EBAY_TRACE_STEP.ORDER_PLACE_ERROR,
          message: 'order.place.error',
          meta: { orderId: order.id, code: 'CJ_NOT_IMPLEMENTED' },
        });
        return { status: CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL, needsManual: true };
      }

      await prisma.cjEbayOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_EBAY_ORDER_STATUS.FAILED,
          lastError: msg.slice(0, 4000),
        },
      });
      await appendOrderEvent(order.id, CJ_EBAY_ORDER_STATUS.FAILED, msg, {
        code: e instanceof CjSupplierError ? e.code : 'UNKNOWN',
      });
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.ORDER_PLACE_ERROR,
        message: 'order.place.error',
        meta: { orderId: order.id, error: msg.slice(0, 400) },
      });
      throw e;
    }
  },
};
