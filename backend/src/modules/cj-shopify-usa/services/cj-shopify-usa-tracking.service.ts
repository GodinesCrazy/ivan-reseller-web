import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import { appendOrderEvent } from './cj-shopify-usa-order-ingest.service';
import {
  CJ_SHOPIFY_USA_ORDER_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';

async function recordTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      step,
      message,
      meta,
    },
  });
}

function trimOrEmpty(value: unknown): string {
  return String(value ?? '').trim();
}

function resolveTrackingUrl(trackingUrl: string | null | undefined, trackingNumber: string) {
  const provided = trimOrEmpty(trackingUrl);
  if (provided) return provided;
  return `https://www.google.com/search?q=${encodeURIComponent(trackingNumber)}`;
}

export const cjShopifyUsaTrackingService = {
  async syncTracking(input: {
    userId: number;
    orderId: string;
    carrierCode?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    notifyCustomer?: boolean;
  }) {
    const order = await prisma.cjShopifyUsaOrder.findFirst({
      where: {
        id: input.orderId,
        userId: input.userId,
      },
      include: {
        tracking: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found.', 404, ErrorCode.NOT_FOUND);
    }

    if (
      order.status === CJ_SHOPIFY_USA_ORDER_STATUS.TRACKING_ON_SHOPIFY &&
      order.tracking?.submittedToShopifyAt &&
      trimOrEmpty(order.tracking.trackingNumber)
    ) {
      return {
        ok: true,
        trackingNumber: order.tracking.trackingNumber,
        submittedToShopify: true,
        message: 'Tracking already submitted to Shopify.',
      };
    }

    await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.TRACKING_SYNC_START, 'tracking.sync.start', {
      orderId: order.id,
      shopifyOrderId: order.shopifyOrderId,
    } as Prisma.InputJsonValue);

    let carrierCode = trimOrEmpty(input.carrierCode);
    let trackingNumber = trimOrEmpty(input.trackingNumber);
    let trackingUrl = trimOrEmpty(input.trackingUrl);

    if (!trackingNumber) {
      if (trimOrEmpty(order.tracking?.trackingNumber)) {
        carrierCode = carrierCode || trimOrEmpty(order.tracking?.carrierCode);
        trackingNumber = trimOrEmpty(order.tracking?.trackingNumber);
        trackingUrl = trackingUrl || trimOrEmpty((order.tracking?.rawPayload as any)?.trackingUrl);
      } else if (trimOrEmpty(order.cjOrderId)) {
        const adapter = createCjSupplierAdapter(input.userId);
        const cjTracking = await adapter.getTracking(order.cjOrderId!);
        carrierCode = carrierCode || trimOrEmpty(cjTracking?.carrierCode);
        trackingNumber = trimOrEmpty(cjTracking?.trackingNumber);
        trackingUrl = trackingUrl || trimOrEmpty(cjTracking?.trackingUrl);
      }
    }

    if (!trackingNumber) {
      throw new AppError(
        'No tracking number is available yet. Sync CJ first or provide trackingNumber explicitly.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const summary = (order.rawShopifySummary || {}) as {
      fulfillmentOrders?: Array<{
        id: string;
        status: string;
        requestStatus: string;
        lineItems?: Array<{
          id: string | null;
          remainingQuantity: number;
          totalQuantity: number;
          lineItemId: string | null;
          sku: string | null;
        }>;
      }>;
    };

    const fulfillmentOrders = Array.isArray(summary.fulfillmentOrders) ? summary.fulfillmentOrders : [];
    const candidates = fulfillmentOrders.filter((fulfillmentOrder) =>
      (fulfillmentOrder.lineItems || []).some((lineItem) => Number(lineItem.remainingQuantity || 0) > 0),
    );

    if (candidates.length === 0) {
      throw new AppError(
        'No open Shopify fulfillment order was found for this order.',
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    let targetFulfillmentOrder = candidates[0]!;
    if (candidates.length > 1) {
      const byLineItem = candidates.find((candidate) =>
        (candidate.lineItems || []).some((lineItem) => lineItem.lineItemId === order.lineItemRef),
      );
      if (!byLineItem) {
        throw new AppError(
          'Multiple Shopify fulfillment orders are still open. Manual fulfillment review is required.',
          409,
          ErrorCode.RESOURCE_CONFLICT,
        );
      }
      targetFulfillmentOrder = byLineItem;
    }

    const targetLineItem =
      (targetFulfillmentOrder.lineItems || []).find((lineItem) => lineItem.lineItemId === order.lineItemRef) ||
      (targetFulfillmentOrder.lineItems || []).find((lineItem) => trimOrEmpty(lineItem.sku) === trimOrEmpty(order.shopifySku)) ||
      null;

    const fulfillment = await cjShopifyUsaAdminService.createFulfillment({
      userId: input.userId,
      fulfillmentOrderId: targetFulfillmentOrder.id,
      fulfillmentOrderLineItemId: targetLineItem?.id || null,
      quantity: order.lineQuantity,
      carrierCode: carrierCode || null,
      trackingNumber,
      trackingUrl: resolveTrackingUrl(trackingUrl, trackingNumber),
      notifyCustomer: input.notifyCustomer === true,
    });

    await prisma.cjShopifyUsaTracking.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        carrierCode: carrierCode || null,
        trackingNumber,
        status: 'SUBMITTED',
        rawPayload: {
          fulfillmentId: fulfillment.id,
          fulfillmentStatus: fulfillment.status,
          trackingUrl: resolveTrackingUrl(trackingUrl, trackingNumber),
        } as Prisma.InputJsonValue,
        submittedToShopifyAt: new Date(),
      },
      update: {
        carrierCode: carrierCode || null,
        trackingNumber,
        status: 'SUBMITTED',
        rawPayload: {
          fulfillmentId: fulfillment.id,
          fulfillmentStatus: fulfillment.status,
          trackingUrl: resolveTrackingUrl(trackingUrl, trackingNumber),
        } as Prisma.InputJsonValue,
        submittedToShopifyAt: new Date(),
      },
    });

    await prisma.cjShopifyUsaOrder.update({
      where: { id: order.id },
      data: {
        status: CJ_SHOPIFY_USA_ORDER_STATUS.TRACKING_ON_SHOPIFY,
        lastError: null,
      },
    });

    await appendOrderEvent(
      order.id,
      CJ_SHOPIFY_USA_ORDER_STATUS.TRACKING_ON_SHOPIFY,
      'Tracking pushed to Shopify fulfillment.',
      {
        fulfillmentId: fulfillment.id,
        trackingNumber,
        carrierCode: carrierCode || null,
      } as Prisma.InputJsonValue,
    );

    await recordTrace(input.userId, CJ_SHOPIFY_USA_TRACE_STEP.TRACKING_SYNC_SUCCESS, 'tracking.sync.success', {
      orderId: order.id,
      fulfillmentId: fulfillment.id,
      trackingNumber,
    } as Prisma.InputJsonValue);

    return {
      ok: true,
      trackingNumber,
      submittedToShopify: true,
      fulfillmentId: fulfillment.id,
    };
  },
};
