/**
 * CJ → eBay USA — ingesta manual de órdenes eBay (FASE 3E).
 * Sin marketplace-order-sync, sin recordSaleFromWebhook, sin Order legacy.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { cjEbayEbayFacadeService } from './cj-ebay-ebay-facade.service';
import { cjEbayTraceService } from './cj-ebay-trace.service';
import { CJ_EBAY_TRACE_STEP, CJ_EBAY_LISTING_STATUS, CJ_EBAY_ORDER_STATUS } from '../cj-ebay.constants';

export async function appendOrderEvent(
  orderId: string,
  step: string,
  message?: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await prisma.cjEbayOrderEvent.create({
    data: {
      orderId,
      step,
      message,
      meta: meta != null ? (meta as Prisma.InputJsonValue) : undefined,
    },
  });
}

export const cjEbayOrderIngestService = {
  async importByEbayOrderId(input: {
    userId: number;
    ebayOrderId: string;
    correlationId?: string;
    route?: string;
  }): Promise<{ orderId: string; status: string; mapped: boolean }> {
    const ebayOrderId = String(input.ebayOrderId || '').trim();
    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: CJ_EBAY_TRACE_STEP.ORDER_IMPORT_START,
      message: 'order.import.start',
      meta: { ebayOrderId },
    });

    try {
      const ebay = await cjEbayEbayFacadeService.getFulfillmentOrderById(input.userId, ebayOrderId);
      if (!ebay.orderId) {
        throw new Error('eBay order payload missing orderId');
      }

      const lineItems = ebay.lineItems || [];
      const primary =
        lineItems.find((li) => String(li.sku || '').trim().length > 0) || lineItems[0];
      const sku = primary?.sku != null ? String(primary.sku).trim() : '';

      let listingId: number | null = null;
      let productId: number | null = null;
      let variantId: number | null = null;
      let status: string = CJ_EBAY_ORDER_STATUS.DETECTED;
      let mapped = false;
      let lineQuantity = primary?.quantity ?? 1;

      if (sku && primary) {
        const listing = await prisma.cjEbayListing.findFirst({
          where: {
            userId: input.userId,
            ebaySku: sku,
            status: { in: [CJ_EBAY_LISTING_STATUS.ACTIVE, CJ_EBAY_LISTING_STATUS.PAUSED] },
          },
          include: { variant: true, product: true },
        });
        if (listing?.variantId && listing.productId) {
          listingId = listing.id;
          productId = listing.productId;
          variantId = listing.variantId;
          status = CJ_EBAY_ORDER_STATUS.VALIDATED;
          mapped = true;
        } else {
          status = CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL;
        }
      } else {
        status = CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL;
      }

      const rawEbaySummary = {
        orderId: ebay.orderId,
        fulfillmentStatus: ebay.fulfillmentStatus,
        lineItems: lineItems.map((li) => ({
          lineItemId: li.lineItemId,
          sku: li.sku,
          quantity: li.quantity,
          title: li.title,
          itemId: li.itemId,
        })),
        total: ebay.total,
        orderDate: ebay.orderDate,
      };

      const buyerPayload = {
        buyerName: ebay.buyerName,
        buyerUsername: ebay.buyerUsername,
        buyerEmail: ebay.buyerEmail,
        shippingAddress: ebay.shippingAddress,
        fulfillmentStatus: ebay.fulfillmentStatus,
      };

      const row = await prisma.cjEbayOrder.upsert({
        where: {
          userId_ebayOrderId: { userId: input.userId, ebayOrderId: ebay.orderId },
        },
        create: {
          userId: input.userId,
          ebayOrderId: ebay.orderId,
          status,
          lineItemRef: primary?.lineItemId ?? null,
          productId,
          variantId,
          listingId,
          ebaySku: sku || null,
          lineQuantity: Math.max(1, Math.floor(lineQuantity) || 1),
          rawEbaySummary: rawEbaySummary as unknown as Prisma.InputJsonValue,
          buyerPayload: buyerPayload as unknown as Prisma.InputJsonValue,
          totalUsd:
            ebay.total != null && Number.isFinite(ebay.total) ? new Prisma.Decimal(ebay.total) : null,
          lastError: null,
        },
        update: {
          status,
          lineItemRef: primary?.lineItemId ?? null,
          productId,
          variantId,
          listingId,
          ebaySku: sku || null,
          lineQuantity: Math.max(1, Math.floor(lineQuantity) || 1),
          rawEbaySummary: rawEbaySummary as unknown as Prisma.InputJsonValue,
          buyerPayload: buyerPayload as unknown as Prisma.InputJsonValue,
          totalUsd:
            ebay.total != null && Number.isFinite(ebay.total) ? new Prisma.Decimal(ebay.total) : null,
          lastError: null,
        },
      });

      await appendOrderEvent(row.id, 'IMPORT', mapped ? 'Order imported and mapped to CJ listing' : 'Order imported; mapping incomplete', {
        mapped,
        ebaySku: sku || null,
        listingId,
      });

      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.ORDER_IMPORT_SUCCESS,
        message: 'order.import.success',
        meta: { orderId: row.id, ebayOrderId: ebay.orderId, mapped },
      });

      return { orderId: row.id, status: row.status, mapped };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await cjEbayTraceService.record({
        userId: input.userId,
        correlationId: input.correlationId,
        route: input.route,
        step: CJ_EBAY_TRACE_STEP.ORDER_IMPORT_ERROR,
        message: 'order.import.error',
        meta: { ebayOrderId, error: msg.slice(0, 500) },
      });
      throw e;
    }
  },

  async listOrders(userId: number) {
    return prisma.cjEbayOrder.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        ebayOrderId: true,
        status: true,
        cjOrderId: true,
        ebaySku: true,
        lineQuantity: true,
        totalUsd: true,
        currency: true,
        listingId: true,
        productId: true,
        variantId: true,
        lastError: true,
        cjConfirmedAt: true,
        cjPaidAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async getOrderDetail(userId: number, orderId: string) {
    return prisma.cjEbayOrder.findFirst({
      where: { id: orderId, userId },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        tracking: true,
        listing: { select: { id: true, ebaySku: true, status: true, ebayListingId: true } },
      },
    });
  },
};
