import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { cjShopifyUsaAdminService, normalizeShopifyShopDomain } from './cj-shopify-usa-admin.service';
import { env } from '../../../config/env';
import {
  CJ_SHOPIFY_USA_ALERT_TYPE,
  CJ_SHOPIFY_USA_ORDER_STATUS,
} from '../cj-shopify-usa.constants';

// Non-retryable statuses — processing from these is a no-op (idempotency guard)
const NON_RETRYABLE_STATUSES = new Set([
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACING,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CREATED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CONFIRMING,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CONFIRMED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_PENDING,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_PROCESSING,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_FULFILLING,
  CJ_SHOPIFY_USA_ORDER_STATUS.CJ_SHIPPED,
  CJ_SHOPIFY_USA_ORDER_STATUS.TRACKING_ON_SHOPIFY,
  CJ_SHOPIFY_USA_ORDER_STATUS.COMPLETED,
]);

async function getCjToken(): Promise<string | null> {
  const apiKey = env.CJ_API_KEY;
  if (!apiKey) return null;
  const res = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  const json = await res.json() as { data?: { accessToken?: string } };
  return json.data?.accessToken ?? null;
}

type ShopifyOrderNode = Awaited<
  ReturnType<typeof cjShopifyUsaAdminService.listRecentOrders>
>[number];

export async function appendOrderEvent(
  orderId: string,
  step: string,
  message: string,
  meta?: Prisma.InputJsonValue,
) {
  await prisma.cjShopifyUsaOrderEvent.create({
    data: {
      orderId,
      step,
      message,
      meta,
    },
  });
}

async function createAlert(userId: number, type: string, payload: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaAlert.create({
    data: {
      userId,
      type,
      severity: 'warning',
      status: 'OPEN',
      payload,
    },
  });
}

function normalizeGid(value: string | null | undefined) {
  return String(value || '').trim();
}

function normalizeShopifyWebhookOrderId(body: any): string | null {
  const adminGid = normalizeGid(body?.admin_graphql_api_id);
  if (adminGid) return adminGid;

  const numeric = String(body?.id || '').trim();
  return numeric ? `gid://shopify/Order/${numeric}` : null;
}

async function mapManagedLineItem(userId: number, order: ShopifyOrderNode) {
  const lineItems = order.lineItems?.nodes ?? [];
  const managedMatches: Array<{
    lineItem: NonNullable<typeof lineItems[number]>;
    listing: {
      id: number;
      productId: number;
      variantId: number | null;
      shopifySku: string | null;
    };
  }> = [];

  for (const lineItem of lineItems) {
    const sku = String(lineItem.sku || lineItem.variant?.sku || '').trim();
    const variantId = normalizeGid(lineItem.variant?.id);
    const productId = normalizeGid(lineItem.product?.id);
    const listingLookups = [
      sku ? { shopifySku: sku } : undefined,
      variantId ? { shopifyVariantId: variantId } : undefined,
      productId ? { shopifyProductId: productId } : undefined,
    ].filter(Boolean) as Prisma.CjShopifyUsaListingWhereInput[];

    if (listingLookups.length === 0) {
      continue;
    }

    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: {
        userId,
        OR: listingLookups,
      },
      select: {
        id: true,
        productId: true,
        variantId: true,
        shopifySku: true,
      },
    });

    if (listing) {
      managedMatches.push({ lineItem, listing });
    }
  }

  if (managedMatches.length === 1) {
    return {
      kind: 'single' as const,
      match: managedMatches[0],
      count: 1,
    };
  }

  if (managedMatches.length > 1) {
    return {
      kind: 'multiple' as const,
      count: managedMatches.length,
      managedMatches,
    };
  }

  return {
    kind: 'none' as const,
    count: 0,
  };
}

async function upsertOrderFromShopifyNode(userId: number, order: ShopifyOrderNode) {
  const mapping = await mapManagedLineItem(userId, order);
  const lineItems = order.lineItems?.nodes ?? [];

  const summary = {
    id: order.id,
    name: order.name,
    createdAt: order.createdAt,
    displayFinancialStatus: order.displayFinancialStatus,
    displayFulfillmentStatus: order.displayFulfillmentStatus,
    lineItems: lineItems.map((lineItem) => ({
      id: lineItem.id,
      sku: lineItem.sku || lineItem.variant?.sku || null,
      quantity: lineItem.quantity,
      productId: lineItem.product?.id || null,
      variantId: lineItem.variant?.id || null,
      title: lineItem.product?.title || lineItem.variant?.title || null,
    })),
    fulfillmentOrders: (order.fulfillmentOrders?.nodes ?? []).map((fulfillmentOrder) => ({
      id: fulfillmentOrder.id,
      status: fulfillmentOrder.status,
      requestStatus: fulfillmentOrder.requestStatus,
      assignedLocation: fulfillmentOrder.assignedLocation?.location || null,
      lineItems: (fulfillmentOrder.lineItems?.nodes ?? []).map((lineItem) => ({
        id: lineItem.id,
        remainingQuantity: lineItem.remainingQuantity,
        totalQuantity: lineItem.totalQuantity,
        lineItemId: lineItem.lineItem?.id || null,
        sku: lineItem.lineItem?.sku || null,
      })),
    })),
  } satisfies Prisma.InputJsonValue;

  const shippingAddress = order.shippingAddress || null;
  const buyerPayload = shippingAddress
    ? ({
        name: shippingAddress.name || null,
        address1: shippingAddress.address1 || null,
        address2: shippingAddress.address2 || null,
        city: shippingAddress.city || null,
        provinceCode: shippingAddress.provinceCode || null,
        zip: shippingAddress.zip || null,
        countryCodeV2: shippingAddress.countryCodeV2 || null,
        phone: shippingAddress.phone || null,
      } satisfies Prisma.InputJsonValue)
    : Prisma.JsonNull;

  const totalMoney = order.currentTotalPriceSet?.shopMoney;
  const totalUsd = Number(totalMoney?.amount || 0);

  if (mapping.kind === 'multiple') {
    const orderRow = await prisma.cjShopifyUsaOrder.upsert({
      where: {
        userId_shopifyOrderId: {
          userId,
          shopifyOrderId: order.id,
        },
      },
      create: {
        userId,
        shopifyOrderId: order.id,
        status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        lineQuantity: 0,
        rawShopifySummary: summary,
        buyerPayload,
        totalUsd: Number.isFinite(totalUsd) ? totalUsd : null,
        currency: totalMoney?.currencyCode || 'USD',
        lastError: 'Multiple managed line items found. Manual split review required.',
      },
      update: {
        status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        rawShopifySummary: summary,
        buyerPayload,
        totalUsd: Number.isFinite(totalUsd) ? totalUsd : null,
        currency: totalMoney?.currencyCode || 'USD',
        lastError: 'Multiple managed line items found. Manual split review required.',
      },
    });

    await appendOrderEvent(
      orderRow.id,
      CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
      'Multiple managed line items matched local Shopify listings.',
      { managedLineItemCount: mapping.count } as Prisma.InputJsonValue,
    );
    await createAlert(userId, CJ_SHOPIFY_USA_ALERT_TYPE.ORDER_NEEDS_MANUAL, {
      shopifyOrderId: order.id,
      reason: 'multiple_managed_line_items',
      managedLineItemCount: mapping.count,
    } as Prisma.InputJsonValue);
    return orderRow;
  }

  if (mapping.kind === 'none') {
    const orderRow = await prisma.cjShopifyUsaOrder.upsert({
      where: {
        userId_shopifyOrderId: {
          userId,
          shopifyOrderId: order.id,
        },
      },
      create: {
        userId,
        shopifyOrderId: order.id,
        status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        lineQuantity: 0,
        rawShopifySummary: summary,
        buyerPayload,
        totalUsd: Number.isFinite(totalUsd) ? totalUsd : null,
        currency: totalMoney?.currencyCode || 'USD',
        lastError: 'No managed CJ Shopify listing matched the Shopify order items.',
      },
      update: {
        status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        rawShopifySummary: summary,
        buyerPayload,
        totalUsd: Number.isFinite(totalUsd) ? totalUsd : null,
        currency: totalMoney?.currencyCode || 'USD',
        lastError: 'No managed CJ Shopify listing matched the Shopify order items.',
      },
    });

    await appendOrderEvent(
      orderRow.id,
      CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
      'Order requires manual review because no managed line item mapping was found.',
      {} as Prisma.InputJsonValue,
    );
    await createAlert(userId, CJ_SHOPIFY_USA_ALERT_TYPE.ORDER_NEEDS_MANUAL, {
      shopifyOrderId: order.id,
      reason: 'unmapped_line_items',
    } as Prisma.InputJsonValue);
    return orderRow;
  }

  const match = mapping.match;
  const orderRow = await prisma.cjShopifyUsaOrder.upsert({
    where: {
      userId_shopifyOrderId: {
        userId,
        shopifyOrderId: order.id,
      },
    },
    create: {
      userId,
      shopifyOrderId: order.id,
      status: CJ_SHOPIFY_USA_ORDER_STATUS.DETECTED,
      lineItemRef: match.lineItem.id,
      productId: match.listing.productId,
      variantId: match.listing.variantId,
      listingId: match.listing.id,
      shopifySku: String(match.lineItem.sku || match.lineItem.variant?.sku || '').trim() || null,
      lineQuantity: Math.max(1, Math.floor(Number(match.lineItem.quantity || 1))),
      rawShopifySummary: summary,
      buyerPayload,
      totalUsd: Number.isFinite(totalUsd) ? totalUsd : null,
      currency: totalMoney?.currencyCode || 'USD',
      lastError: null,
    },
    update: {
      status: CJ_SHOPIFY_USA_ORDER_STATUS.DETECTED,
      lineItemRef: match.lineItem.id,
      productId: match.listing.productId,
      variantId: match.listing.variantId,
      listingId: match.listing.id,
      shopifySku: String(match.lineItem.sku || match.lineItem.variant?.sku || '').trim() || null,
      lineQuantity: Math.max(1, Math.floor(Number(match.lineItem.quantity || 1))),
      rawShopifySummary: summary,
      buyerPayload,
      totalUsd: Number.isFinite(totalUsd) ? totalUsd : null,
      currency: totalMoney?.currencyCode || 'USD',
      lastError: null,
    },
  });

  await appendOrderEvent(
    orderRow.id,
    CJ_SHOPIFY_USA_ORDER_STATUS.DETECTED,
    'Shopify order ingested and mapped to a managed CJ listing.',
    {
      listingId: match.listing.id,
      lineItemId: match.lineItem.id,
      sku: match.lineItem.sku || match.lineItem.variant?.sku || null,
    } as Prisma.InputJsonValue,
  );

  return orderRow;
}

export const cjShopifyUsaOrderIngestService = {
  async syncOrders(input: {
    userId: number;
    shopifyOrderId?: string | null;
    sinceHours?: number;
    first?: number;
  }) {
    const sinceIso = input.shopifyOrderId
      ? undefined
      : new Date(Date.now() - Math.max(1, input.sinceHours || 24) * 60 * 60 * 1000).toISOString();
    const orders = await cjShopifyUsaAdminService.listRecentOrders({
      userId: input.userId,
      orderId: input.shopifyOrderId || undefined,
      sinceIso,
      first: input.shopifyOrderId ? 1 : input.first || 10,
    });

    const synced = [];
    for (const order of orders) {
      synced.push(await upsertOrderFromShopifyNode(input.userId, order));
    }

    return {
      count: synced.length,
      orders: synced,
    };
  },

  async handleOrdersCreateWebhook(input: {
    userId: number;
    body: any;
  }) {
    const shopifyOrderId = normalizeShopifyWebhookOrderId(input.body);
    if (!shopifyOrderId) {
      throw new AppError(
        'Shopify webhook payload did not include an order id.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    return this.syncOrders({
      userId: input.userId,
      shopifyOrderId,
    });
  },

  // ── Manual order processing (idempotent) ────────────────────────────────
  async processOrder(input: { userId: number; orderId: string }) {
    const order = await prisma.cjShopifyUsaOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: {
        variant: { select: { cjSku: true, cjVid: true } },
        listing: {
          select: {
            shippingQuote: {
              select: { originCountryCode: true },
            },
          },
        },
      },
    });

    if (!order) throw new AppError('Order not found', 404, ErrorCode.NOT_FOUND);

    // Idempotency: reject if already past DETECTED/VALIDATED/FAILED/NEEDS_MANUAL
    if (NON_RETRYABLE_STATUSES.has(order.status as never)) {
      return {
        ok: true,
        skipped: true,
        reason: `Order already in status ${order.status} — no action taken`,
        status: order.status,
      };
    }

    const buyer = order.buyerPayload as Record<string, string | null> | null;
    if (!buyer?.address1) {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: { status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL, lastError: 'Missing shipping address on order' },
      });
      throw new AppError('Order has no shipping address', 422, ErrorCode.VALIDATION_ERROR);
    }

    const shippingCountry = String(buyer.countryCodeV2 || '').trim().toUpperCase();
    const rawFromCountry = String(order.listing?.shippingQuote?.originCountryCode || '')
      .trim()
      .toUpperCase();
    const fromCountryCode = /^[A-Z]{2}$/.test(rawFromCountry) ? rawFromCountry : 'CN';
    if (!shippingCountry) {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: {
          status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
          lastError: 'Missing shipping country on Shopify order. The customer shipping address must include a country before placing the CJ order.',
        },
      });
      await appendOrderEvent(
        input.orderId,
        CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        'Order blocked before CJ placement: missing shipping country in Shopify shipping address.',
      );
      throw new AppError('Order has no shipping country', 422, ErrorCode.VALIDATION_ERROR);
    }

    const cjSku = order.shopifySku || order.variant?.cjSku;
    if (!cjSku) {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: { status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL, lastError: 'Cannot resolve CJ SKU for this order' },
      });
      throw new AppError('Cannot resolve CJ SKU', 422, ErrorCode.VALIDATION_ERROR);
    }

    // Mark as placing (prevents concurrent duplicate calls)
    await prisma.cjShopifyUsaOrder.update({
      where: { id: input.orderId },
      data: { status: CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACING, lastError: null },
    });
    await appendOrderEvent(input.orderId, CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACING, 'Initiating order placement with CJ Dropshipping');

    try {
      const cjToken = await getCjToken();
      if (!cjToken) throw new Error('CJ API key not configured or token exchange failed');

      const cjPayload = {
        orderNumber: `PAWVAULT-${order.shopifyOrderId.replace('gid://shopify/Order/', '').slice(-8)}`,
        shippingZip: buyer.zip || '',
        shippingCountry,
        fromCountryCode,
        shippingProvince: buyer.provinceCode || '',
        shippingCity: buyer.city || '',
        shippingAddress: buyer.address1 || '',
        shippingAddress2: buyer.address2 || '',
        shippingCustomerName: buyer.name || 'Customer',
        shippingPhone: buyer.phone || '',
        products: [{ vid: order.variant?.cjVid || cjSku, quantity: order.lineQuantity ?? 1 }],
        // TODO: payment via CJ balance — operator must ensure balance is funded
        payType: 1, // 1 = CJ balance
      };

      const res = await fetch('https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2', {
        method: 'POST',
        headers: { 'CJ-Access-Token': cjToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(cjPayload),
      });
      const json = await res.json() as { code?: number; message?: string; data?: { orderId?: string } };

      if (json.code === 200 && json.data?.orderId) {
        const cjOrderId = json.data.orderId;
        await prisma.cjShopifyUsaOrder.update({
          where: { id: input.orderId },
          data: { status: CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACED, cjOrderId, lastError: null },
        });
        await appendOrderEvent(input.orderId, CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACED, `CJ order created: ${cjOrderId}`, { cjOrderId } as Prisma.InputJsonValue);
        return { ok: true, skipped: false, cjOrderId, status: CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACED };
      }

      // CJ returned error
      const errMsg = json.message || `CJ API error code ${json.code}`;
      const isPaymentBlock = errMsg.toLowerCase().includes('balance') || errMsg.toLowerCase().includes('payment');
      const newStatus = isPaymentBlock
        ? CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED
        : CJ_SHOPIFY_USA_ORDER_STATUS.FAILED;
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: { status: newStatus, lastError: errMsg.slice(0, 500) },
      });
      await appendOrderEvent(input.orderId, newStatus, `CJ placement failed: ${errMsg}`);
      throw new AppError(errMsg, 502, ErrorCode.EXTERNAL_API_ERROR);
    } catch (e) {
      if (e instanceof AppError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: { status: CJ_SHOPIFY_USA_ORDER_STATUS.FAILED, lastError: msg.slice(0, 500) },
      }).catch(() => {});
      await appendOrderEvent(input.orderId, CJ_SHOPIFY_USA_ORDER_STATUS.FAILED, msg);
      throw new AppError(msg, 502, ErrorCode.EXTERNAL_API_ERROR);
    }
  },

  // ── Auto-sync tracking for all shipped orders ────────────────────────────
  async autoSyncAllTracking(userId: number) {
    const shippedOrders = await prisma.cjShopifyUsaOrder.findMany({
      where: {
        userId,
        cjOrderId: { not: null },
        status: {
          in: [
            CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_PLACED,
            CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CREATED,
            CJ_SHOPIFY_USA_ORDER_STATUS.CJ_ORDER_CONFIRMED,
            CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
            CJ_SHOPIFY_USA_ORDER_STATUS.CJ_FULFILLING,
            CJ_SHOPIFY_USA_ORDER_STATUS.CJ_SHIPPED,
          ],
        },
      },
      select: { id: true, cjOrderId: true, status: true },
    });

    const cjToken = await getCjToken();
    if (!cjToken) return { synced: 0, checked: 0 };

    let synced = 0;
    for (const order of shippedOrders) {
      try {
        const res = await fetch(
          `https://developers.cjdropshipping.com/api2.0/v1/shopping/order/getOrderDetail?orderId=${order.cjOrderId}`,
          { headers: { 'CJ-Access-Token': cjToken } },
        );
        const json = await res.json() as { code?: number; data?: { orderStatus?: string; logisticName?: string; trackNumber?: string } };
        if (json.code !== 200 || !json.data) continue;

        const { orderStatus, logisticName, trackNumber } = json.data;

        // Map CJ status to our status
        let newStatus: string | null = null;
        if (orderStatus === 'PAID') newStatus = CJ_SHOPIFY_USA_ORDER_STATUS.CJ_PAYMENT_COMPLETED;
        else if (orderStatus === 'SHIPPING') newStatus = CJ_SHOPIFY_USA_ORDER_STATUS.CJ_FULFILLING;
        else if (orderStatus === 'SHIPPED') newStatus = CJ_SHOPIFY_USA_ORDER_STATUS.CJ_SHIPPED;

        if (newStatus && newStatus !== order.status) {
          await prisma.cjShopifyUsaOrder.update({
            where: { id: order.id },
            data: { status: newStatus },
          });
          await appendOrderEvent(order.id, newStatus, `Auto-sync: CJ status → ${orderStatus}`);
        }

        if (trackNumber) {
          await prisma.cjShopifyUsaTracking.upsert({
            where: { orderId: order.id },
            create: { orderId: order.id, trackingNumber: trackNumber, carrierCode: logisticName || null, status: 'SHIPPED' },
            update: { trackingNumber: trackNumber, carrierCode: logisticName || null },
          });

          // Phase 2: Push tracking back to Shopify to notify the customer
          try {
            const { cjShopifyUsaTrackingService } = await import('./cj-shopify-usa-tracking.service');
            await cjShopifyUsaTrackingService.syncTracking({
              userId,
              orderId: order.id,
              carrierCode: logisticName || null,
              trackingNumber: trackNumber,
              notifyCustomer: true,
            });
            await appendOrderEvent(order.id, 'TRACKING_PUSHED', `Successfully pushed tracking ${trackNumber} to Shopify.`);
          } catch (pushErr) {
            await appendOrderEvent(order.id, 'TRACKING_PUSH_FAILED', `Failed to push tracking to Shopify: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`);
          }

          synced++;
        } else {
          await prisma.cjShopifyUsaTracking.upsert({
            where: { orderId: order.id },
            create: {
              orderId: order.id,
              trackingNumber: null,
              carrierCode: logisticName || null,
              status: 'NOT_AVAILABLE',
              rawPayload: { orderStatus, logisticName } as Prisma.InputJsonValue,
            },
            update: {
              carrierCode: logisticName || null,
              status: 'NOT_AVAILABLE',
              rawPayload: { orderStatus, logisticName } as Prisma.InputJsonValue,
            },
          });
        }

        await new Promise(r => setTimeout(r, 300));
      } catch { /* skip individual order errors in bulk sync */ }
    }

    return { synced, checked: shippedOrders.length };
  },

  async resolveUserIdFromWebhookShop(shopDomainHeader: string | string[] | undefined) {
    const shopDomain = normalizeShopifyShopDomain(String(shopDomainHeader || '').trim());
    const settings = await prisma.cjShopifyUsaAccountSettings.findFirst({
      where: {
        shopifyStoreUrl: {
          contains: shopDomain,
        },
      },
      select: { userId: true },
    });

    if (settings?.userId) {
      return settings.userId;
    }

    const fallbackRows = await prisma.cjShopifyUsaAccountSettings.findMany({
      select: { userId: true },
      take: 2,
      orderBy: { userId: 'asc' },
    });

    if (fallbackRows.length === 1) {
      return fallbackRows[0]!.userId;
    }

    throw new AppError(
      'Shopify webhook received for an unmapped shop domain. Save shopifyStoreUrl for the target operator first.',
      409,
      ErrorCode.RESOURCE_CONFLICT,
      { shopDomain },
    );
  },
};
