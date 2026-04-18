/**
 * CJ → ML Chile — Fulfillment service (Parity with CJ → eBay USA).
 * Handles placing orders on CJ, confirming, and tracking sync.
 */

import { AppError } from '../../../middleware/error.middleware';
import { prisma } from '../../../config/database';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierError } from '../../cj-ebay/adapters/cj-supplier.errors';
import { cjMlChileTraceService } from './cj-ml-chile-trace.service';
import { cjMlChileConfigService } from './cj-ml-chile-config.service';
import { cjMlChileCjCheckoutService } from './cj-ml-chile-cj-checkout.service';
import {
  CJ_ML_CHILE_TRACE_STEP,
  CJ_ML_CHILE_ORDER_STATUS,
  CJ_ML_CHILE_POST_CREATE_CHECKOUT_MODE,
} from '../cj-ml-chile.constants';
import { Prisma } from '@prisma/client';

/**
 * Helper to append an event to the order timeline.
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

function shipToFromMlPayload(mlPayload: any): Record<string, string> {
  const p = mlPayload as Record<string, any> | null | undefined;
  const shipping = p?.shipping as Record<string, any> | undefined;
  const receiver = shipping?.receiver_address as Record<string, any> | undefined;
  
  if (!receiver) return {};

  // Map ML Chile address to CJ format
  // Note: CJ requires specific fields. We map what we have from MLC.
  return {
    fullName: receiver.receiver_name || '',
    addressLine1: `${receiver.address_line || ''} ${receiver.street_name || ''} ${receiver.street_number || ''}`.trim(),
    addressLine2: receiver.comment || '',
    city: receiver.city?.name || '',
    state: receiver.state?.name || '',
    zipCode: receiver.zip_code || '',
    country: 'CL', // Always Chile for this module
    phoneNumber: receiver.receiver_phone || '999999999', // Fallback if missing
  };
}

export const cjMlChileFulfillmentService = {
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
    const order = await prisma.cjMlChileOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: {
        listing: true,
      },
    });

    if (!order) throw new AppError('Order not found', 404);

    const hasMapping = order.listingId != null && order.listing != null;
    const retryAfterFailure = 
      !order.cjOrderId && 
      hasMapping && 
      (order.status === CJ_ML_CHILE_ORDER_STATUS.NEEDS_MANUAL || order.status === CJ_ML_CHILE_ORDER_STATUS.FAILED);

    const canPlace = order.status === CJ_ML_CHILE_ORDER_STATUS.VALIDATED || retryAfterFailure;
    if (!canPlace) {
      throw new AppError(`placeCjOrder requires VALIDATED or retryable FAILED status. Current: ${order.status}`, 400);
    }

    if (!order.listing) throw new AppError('Order is not linked to a listing.', 400);
    
    // In ML Chile, listing has the variant info in the draftPayload usually or we expect it to be approved.
    const draft = order.listing.draftPayload as any;
    const snapshot = draft?.pricingSnapshot;
    const cjVid = snapshot?.cjVid || snapshot?.variantId;
    const cjSku = snapshot?.cjSku || snapshot?.sku;

    if (!cjVid) throw new AppError('Listing variant missing cjVid/variantId.', 400);
    
    const logisticName = snapshot?.logisticName || 'Chile Post'; // Reference if missing

    const shipTo = shipToFromMlPayload(order.rawMlSummary);
    if (!shipTo.fullName || !shipTo.addressLine1 || !shipTo.city) {
      throw new AppError('Incomplete shipping address in ML order data.', 400);
    }

    await prisma.cjMlChileOrder.update({
      where: { id: order.id },
      data: { status: CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_PLACING, lastError: null },
    });
    await appendOrderEvent(order.id, CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_PLACING, 'Starting CJ order placement');

    await cjMlChileTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_ML_CHILE_TRACE_STEP.ORDER_PLACE_START,
      message: 'order.place.start',
      meta: { orderId: order.id, mlOrderId: order.mlOrderId },
    });

    const adapter = createCjSupplierAdapter(input.userId);

    try {
      const result = await adapter.createOrder({
        idempotencyKey: `cj-ml-cl-${order.id}`.slice(0, 50),
        logisticName,
        lines: [
          {
            cjVid: String(cjVid),
            cjSku: String(cjSku || ''),
            quantity: 1, // Defaulting to 1 for now or from order
          },
        ],
        shipTo,
        payType: 3,
        shopLogisticsType: 2,
      });

      await prisma.cjMlChileOrder.update({
        where: { id: order.id },
        data: {
          cjOrderId: result.cjOrderId,
          status: CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CREATED,
          lastError: null,
        },
      });

      await appendOrderEvent(order.id, CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CREATED, 'CJ order created successfully', {
        cjOrderId: result.cjOrderId,
        cjStatus: result.status,
      });

      const checkoutMode = await cjMlChileConfigService.getPostCreateCheckoutMode(input.userId);
      let finalStatus: string = CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CREATED;
      let checkoutNote: string | undefined;

      if (checkoutMode === CJ_ML_CHILE_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY) {
        try {
          await cjMlChileCjCheckoutService.confirmCjOrder({
            userId: input.userId,
            orderId: order.id,
            correlationId: input.correlationId,
          });
          await cjMlChileCjCheckoutService.payCjOrder({
            userId: input.userId,
            orderId: order.id,
            correlationId: input.correlationId,
          });
          finalStatus = CJ_ML_CHILE_ORDER_STATUS.CJ_FULFILLING;
          checkoutNote = 'Auto-confirm & pay completed.';
        } catch (e: any) {
          checkoutNote = `Auto-checkout failed: ${e.message}`;
        }
      }

      return { cjOrderId: result.cjOrderId, status: finalStatus, checkoutNote };
    } catch (e: any) {
      const msg = e.message || String(e);
      await prisma.cjMlChileOrder.update({
        where: { id: order.id },
        data: { status: CJ_ML_CHILE_ORDER_STATUS.FAILED, lastError: msg },
      });
      await appendOrderEvent(order.id, CJ_ML_CHILE_ORDER_STATUS.FAILED, `CJ placement failed: ${msg}`);
      throw e;
    }
  },

  async syncTracking(input: {
    userId: number;
    orderId: string;
    correlationId?: string;
  }): Promise<{ ok: boolean; trackingNumber?: string }> {
    // Logic to fetch tracking from CJ and push to ML
    // This usually involves calling the adapter.getTrackingInfo and then ML API.
    const order = await prisma.cjMlChileOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: { tracking: true },
    });
    if (!order || !order.cjOrderId) throw new AppError('Order or CJ order ID missing', 400);

    const adapter = createCjSupplierAdapter(input.userId);
    const cjTracking = await adapter.getTracking(order.cjOrderId);

    if (cjTracking?.trackingNumber) {
      // Create/Update tracking record
      await prisma.cjMlChileTracking.upsert({
        where: { orderId: order.id },
        update: {
          trackingNumber: cjTracking.trackingNumber,
          carrierCode: cjTracking.carrierCode,
          status: 'AVAILABLE',
        },
        create: {
          orderId: order.id,
          trackingNumber: cjTracking.trackingNumber,
          carrierCode: cjTracking.carrierCode,
          status: 'AVAILABLE',
        },
      });

      // Update order status
      if (order.status !== CJ_ML_CHILE_ORDER_STATUS.COMPLETED) {
        await prisma.cjMlChileOrder.update({
          where: { id: order.id },
          data: { status: CJ_ML_CHILE_ORDER_STATUS.CJ_SHIPPED },
        });
      }

      await appendOrderEvent(order.id, CJ_ML_CHILE_ORDER_STATUS.CJ_SHIPPED, `Tracking synced from CJ: ${cjTracking.trackingNumber}`);
      
      return { ok: true, trackingNumber: cjTracking.trackingNumber };
    }

    return { ok: false };
  }
};
