import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { cjShopifyUsaAdminService, normalizeShopifyShopDomain } from './cj-shopify-usa-admin.service';
import {
  CJ_SHOPIFY_USA_ALERT_TYPE,
  CJ_SHOPIFY_USA_ORDER_STATUS,
} from '../cj-shopify-usa.constants';

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
