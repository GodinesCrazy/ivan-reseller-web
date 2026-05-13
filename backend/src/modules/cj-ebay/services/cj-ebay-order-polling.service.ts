import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { CJ_EBAY_ALERT_TYPE, CJ_EBAY_LISTING_STATUS, CJ_EBAY_ORDER_STATUS } from '../cj-ebay.constants';
import { cjEbayAlertsService } from './cj-ebay-alerts.service';
import { cjEbayEbayFacadeService } from './cj-ebay-ebay-facade.service';
import { appendOrderEvent } from './cj-ebay-order-ingest.service';
import { cjEbayTraceService } from './cj-ebay-trace.service';

type EbayOrderPayload = Awaited<ReturnType<typeof cjEbayEbayFacadeService.listRecentFulfillmentOrders>>['orders'][number];

function primaryLine(order: EbayOrderPayload) {
  return order.lineItems.find((li) => String(li.sku || '').trim()) || order.lineItems[0] || null;
}

async function upsertOrderFromEbay(userId: number, ebay: EbayOrderPayload): Promise<{ orderId: string; created: boolean; mapped: boolean; status: string }> {
  const primary = primaryLine(ebay);
  const sku = primary?.sku != null ? String(primary.sku).trim() : '';
  let listingId: number | null = null;
  let productId: number | null = null;
  let variantId: number | null = null;
  let mapped = false;
  let status: string = CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL;

  if (sku) {
    const listing = await prisma.cjEbayListing.findFirst({
      where: {
        userId,
        ebaySku: sku,
        status: { in: [CJ_EBAY_LISTING_STATUS.ACTIVE, CJ_EBAY_LISTING_STATUS.PAUSED] },
      },
      select: { id: true, productId: true, variantId: true },
    });
    if (listing?.variantId && listing.productId) {
      listingId = listing.id;
      productId = listing.productId;
      variantId = listing.variantId;
      mapped = true;
      status = CJ_EBAY_ORDER_STATUS.VALIDATED;
    }
  }

  const rawEbaySummary = {
    orderId: ebay.orderId,
    fulfillmentStatus: ebay.fulfillmentStatus,
    lineItems: ebay.lineItems.map((li) => ({
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

  const existing = await prisma.cjEbayOrder.findUnique({
    where: { userId_ebayOrderId: { userId, ebayOrderId: ebay.orderId } },
    select: { id: true, status: true },
  });
  const row = await prisma.cjEbayOrder.upsert({
    where: { userId_ebayOrderId: { userId, ebayOrderId: ebay.orderId } },
    create: {
      userId,
      ebayOrderId: ebay.orderId,
      status,
      lineItemRef: primary?.lineItemId ?? null,
      productId,
      variantId,
      listingId,
      ebaySku: sku || null,
      lineQuantity: Math.max(1, Math.floor(primary?.quantity ?? 1) || 1),
      rawEbaySummary: rawEbaySummary as Prisma.InputJsonValue,
      buyerPayload: buyerPayload as Prisma.InputJsonValue,
      totalUsd: ebay.total != null && Number.isFinite(ebay.total) ? new Prisma.Decimal(ebay.total) : null,
      lastError: null,
    },
    update: {
      lineItemRef: primary?.lineItemId ?? null,
      productId,
      variantId,
      listingId,
      ebaySku: sku || null,
      lineQuantity: Math.max(1, Math.floor(primary?.quantity ?? 1) || 1),
      rawEbaySummary: rawEbaySummary as Prisma.InputJsonValue,
      buyerPayload: buyerPayload as Prisma.InputJsonValue,
      totalUsd: ebay.total != null && Number.isFinite(ebay.total) ? new Prisma.Decimal(ebay.total) : null,
      lastError: existing?.status === CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL && mapped ? null : undefined,
      status: existing?.status === CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL && mapped ? status : undefined,
    },
  });

  if (!existing) {
    await appendOrderEvent(row.id, 'AUTO_IMPORT', mapped ? 'Auto-imported and mapped by eBay SKU' : 'Auto-imported; mapping incomplete', {
      mapped,
      ebaySku: sku || null,
      listingId,
    });
  }
  if (!mapped) {
    await cjEbayAlertsService.create({
      userId,
      type: CJ_EBAY_ALERT_TYPE.ORDER_NEEDS_MANUAL,
      severity: 'warning',
      payload: { orderId: row.id, ebayOrderId: ebay.orderId, ebaySku: sku || null, message: 'eBay order could not be mapped to a CJ-eBay listing.' },
    });
  }

  return { orderId: row.id, created: !existing, mapped, status: row.status };
}

export const cjEbayOrderPollingService = {
  async pollRecentOrders(input: {
    userId: number;
    lookbackHours: number;
    limit: number;
    correlationId?: string;
    route?: string;
    dryRun?: boolean;
  }): Promise<{ checked: number; imported: number; mapped: number; needsManual: number; orders: Array<{ orderId: string; created: boolean; mapped: boolean; status: string }> }> {
    const from = new Date(Date.now() - Math.max(1, input.lookbackHours) * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: 'automation.order_poll.start',
      message: 'automation.order_poll.start',
      meta: { from, limit: input.limit, dryRun: input.dryRun === true },
    });
    const result = await cjEbayEbayFacadeService.listRecentFulfillmentOrders(input.userId, {
      limit: Math.max(1, Math.min(100, input.limit)),
      offset: 0,
      creationDateFrom: from,
    });
    const rows = [];
    for (const ebay of result.orders) {
      if (!String(ebay.orderId || '').trim()) continue;
      if (input.dryRun) {
        const primary = primaryLine(ebay);
        rows.push({
          orderId: ebay.orderId,
          created: false,
          mapped: Boolean(primary?.sku),
          status: primary?.sku ? CJ_EBAY_ORDER_STATUS.VALIDATED : CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL,
        });
        continue;
      }
      rows.push(await upsertOrderFromEbay(input.userId, ebay));
    }
    const summary = {
      checked: result.orders.length,
      imported: rows.filter((r) => r.created).length,
      mapped: rows.filter((r) => r.mapped).length,
      needsManual: rows.filter((r) => !r.mapped).length,
      orders: rows,
    };
    await cjEbayTraceService.record({
      userId: input.userId,
      correlationId: input.correlationId,
      route: input.route,
      step: 'automation.order_poll.success',
      message: 'automation.order_poll.success',
      meta: summary,
    });
    return summary;
  },
};
