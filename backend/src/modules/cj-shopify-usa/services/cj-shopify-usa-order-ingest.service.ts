import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { cjShopifyUsaAdminService, normalizeShopifyShopDomain } from './cj-shopify-usa-admin.service';
import { env } from '../../../config/env';
import {
  CJ_SHOPIFY_USA_ALERT_TYPE,
  CJ_SHOPIFY_USA_ORDER_STATUS,
} from '../cj-shopify-usa.constants';
import { cjShopifyUsaQualificationService } from './cj-shopify-usa-qualification.service';
import {
  type CjShopifyUsaWebhookOrderPayload,
  cjShopifyUsaWebhookOrderPayloadSchema,
} from '../schemas/cj-shopify-usa.schemas';
import { cjApiRateLimiterService } from '../../../services/cj-api-rate-limiter.service';

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

const PROCESSABLE_STATUSES = new Set([
  CJ_SHOPIFY_USA_ORDER_STATUS.VALIDATED,
  CJ_SHOPIFY_USA_ORDER_STATUS.FAILED,
  CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
]);

const PAID_FINANCIAL_STATUSES = new Set(['PAID']);

async function getCjToken(): Promise<string | null> {
  const apiKey = env.CJ_API_KEY;
  if (!apiKey) return null;
  await cjApiRateLimiterService.waitTurn('CJ-Shopify token');
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

function parseShopifyWebhookOrderPayload(body: unknown): CjShopifyUsaWebhookOrderPayload | null {
  const parsed = cjShopifyUsaWebhookOrderPayloadSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function normalizeShopifyWebhookOrderId(body: CjShopifyUsaWebhookOrderPayload): string | null {
  const adminGid = normalizeGid(body.admin_graphql_api_id);
  if (adminGid) return adminGid;

  const numeric = String(body.id || '').trim();
  return numeric ? `gid://shopify/Order/${numeric}` : null;
}

function resolveShopifyWebhookOrderId(body: unknown): string | null {
  const payload = parseShopifyWebhookOrderPayload(body);
  return payload ? normalizeShopifyWebhookOrderId(payload) : null;
}

function shopifyFinancialStatusFromSummary(summary: unknown): string {
  const obj = (summary || {}) as { displayFinancialStatus?: unknown };
  return String(obj.displayFinancialStatus || '').trim().toUpperCase();
}

function shopifyFinancialStatusFromOrder(order: ShopifyOrderNode): string {
  return String(order.displayFinancialStatus || '').trim().toUpperCase();
}

function isShopifyPaidStatus(value: unknown): boolean {
  return PAID_FINANCIAL_STATUSES.has(String(value || '').trim().toUpperCase());
}

function isBalanceBlockMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('balance') ||
    lower.includes('insufficient') ||
    lower.includes('payment') ||
    lower.includes('pay') ||
    lower.includes('saldo')
  );
}

function isAdvancedOrderStatus(status: string): boolean {
  return NON_RETRYABLE_STATUSES.has(status as never);
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
  const financialStatus = shopifyFinancialStatusFromOrder(order);
  const mappedStatus = isShopifyPaidStatus(financialStatus)
    ? CJ_SHOPIFY_USA_ORDER_STATUS.VALIDATED
    : CJ_SHOPIFY_USA_ORDER_STATUS.WAITING_PAYMENT;
  const existingOrder = await prisma.cjShopifyUsaOrder.findUnique({
    where: {
      userId_shopifyOrderId: {
        userId,
        shopifyOrderId: order.id,
      },
    },
    select: { status: true, cjOrderId: true, lastError: true },
  });
  const nextStatus = existingOrder && (isAdvancedOrderStatus(existingOrder.status) || existingOrder.status === CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED)
    ? existingOrder.status
    : mappedStatus;
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
      status: mappedStatus,
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
      lastError: nextStatus === CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED ? existingOrder?.lastError ?? null : null,
    },
    update: {
      status: nextStatus,
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
    orderRow.status,
    isShopifyPaidStatus(financialStatus)
      ? 'Shopify order ingested, paid, and validated for supplier guard review.'
      : 'Shopify order ingested and mapped, waiting for Shopify payment confirmation.',
    {
      listingId: match.listing.id,
      lineItemId: match.lineItem.id,
      sku: match.lineItem.sku || match.lineItem.variant?.sku || null,
      shopifyFinancialStatus: financialStatus || null,
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
    body: unknown;
  }) {
    const shopifyOrderId = resolveShopifyWebhookOrderId(input.body);
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

  async handleOrdersPaidWebhook(input: {
    userId: number;
    body: unknown;
  }) {
    const shopifyOrderId = resolveShopifyWebhookOrderId(input.body);
    if (!shopifyOrderId) {
      throw new AppError(
        'Shopify paid webhook payload did not include an order id.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const result = await this.syncOrders({
      userId: input.userId,
      shopifyOrderId,
    });

    const processed: Array<{ orderId: string; status: string; cjOrderId?: string | null; skipped?: boolean; reason?: string }> = [];
    for (const order of result.orders) {
      if (order.status !== CJ_SHOPIFY_USA_ORDER_STATUS.VALIDATED) {
        processed.push({ orderId: order.id, status: order.status, skipped: true, reason: order.lastError || 'not_validated' });
        continue;
      }
      try {
        const out = await this.processOrder({ userId: input.userId, orderId: order.id });
        processed.push({
          orderId: order.id,
          status: String(out.status || order.status),
          cjOrderId: 'cjOrderId' in out ? out.cjOrderId ?? null : null,
          skipped: Boolean(out.skipped),
          reason: 'reason' in out ? String(out.reason || '') : undefined,
        });
      } catch (error) {
        const updated = await prisma.cjShopifyUsaOrder.findUnique({
          where: { id: order.id },
          select: { status: true, lastError: true, cjOrderId: true },
        });
        processed.push({
          orderId: order.id,
          status: updated?.status || CJ_SHOPIFY_USA_ORDER_STATUS.FAILED,
          cjOrderId: updated?.cjOrderId ?? null,
          skipped: true,
          reason: updated?.lastError || (error instanceof Error ? error.message : String(error)),
        });
      }
    }

    return { ...result, processed };
  },

  async handleOrdersCancelledWebhook(input: {
    userId: number;
    body: unknown;
  }) {
    const shopifyOrderId = resolveShopifyWebhookOrderId(input.body);
    if (!shopifyOrderId) return { count: 0 };
    const order = await prisma.cjShopifyUsaOrder.findUnique({
      where: { userId_shopifyOrderId: { userId: input.userId, shopifyOrderId } },
      select: { id: true, status: true, cjOrderId: true },
    });
    if (!order) return { count: 0 };
    if (!order.cjOrderId && !isAdvancedOrderStatus(order.status)) {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: order.id },
        data: {
          status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
          lastError: 'Shopify order was cancelled before supplier placement.',
        },
      });
      await appendOrderEvent(order.id, CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL, 'Shopify cancellation received before CJ placement.');
      return { count: 1, blocked: true };
    }
    await appendOrderEvent(order.id, 'SHOPIFY_CANCELLED_AFTER_CJ_REVIEW', 'Shopify cancellation/refund received after CJ processing started; manual supplier review required.');
    await createAlert(input.userId, CJ_SHOPIFY_USA_ALERT_TYPE.ORDER_NEEDS_MANUAL, {
      shopifyOrderId,
      reason: 'shopify_cancelled_after_cj_processing',
      cjOrderId: order.cjOrderId,
    } as Prisma.InputJsonValue);
    return { count: 1, blocked: false };
  },

  // ── Manual order processing (idempotent) ────────────────────────────────
  async processOrder(input: { userId: number; orderId: string }) {
    const order = await prisma.cjShopifyUsaOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: {
        variant: { select: { cjSku: true, cjVid: true, unitCostUsd: true } },
        listing: {
          select: {
            id: true,
            status: true,
            listedPriceUsd: true,
            shippingQuote: {
              select: { amountUsd: true, confidence: true, originCountryCode: true },
            },
          },
        },
      },
    });

    if (!order) throw new AppError('Order not found', 404, ErrorCode.NOT_FOUND);

    // Idempotency: reject if already past supplier placement.
    if (NON_RETRYABLE_STATUSES.has(order.status as never)) {
      return {
        ok: true,
        skipped: true,
        reason: `Order already in status ${order.status} — no action taken`,
        status: order.status,
      };
    }

    if (!PROCESSABLE_STATUSES.has(order.status as never)) {
      await appendOrderEvent(
        input.orderId,
        'ORDER_PROCESS_BLOCKED',
        `Order is not ready for supplier placement. Current status: ${order.status}.`,
        { status: order.status } as Prisma.InputJsonValue,
      );
      throw new AppError(
        `Order is not ready for CJ placement. Current status: ${order.status}. Wait for Shopify payment confirmation first.`,
        409,
        ErrorCode.RESOURCE_CONFLICT,
      );
    }

    const financialStatus = shopifyFinancialStatusFromSummary(order.rawShopifySummary);
    if (!isShopifyPaidStatus(financialStatus)) {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: {
          status: CJ_SHOPIFY_USA_ORDER_STATUS.WAITING_PAYMENT,
          lastError: `Shopify payment is not confirmed yet (${financialStatus || 'UNKNOWN'}). Supplier purchase is blocked until payment is PAID.`,
        },
      });
      await appendOrderEvent(
        input.orderId,
        CJ_SHOPIFY_USA_ORDER_STATUS.WAITING_PAYMENT,
        'Order blocked before CJ placement: Shopify payment is not confirmed.',
        { shopifyFinancialStatus: financialStatus || null } as Prisma.InputJsonValue,
      );
      throw new AppError('Shopify payment is not confirmed yet. CJ order was not placed.', 409, ErrorCode.RESOURCE_CONFLICT);
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

    if (shippingCountry !== 'US') {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: {
          status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
          lastError: `CJ Shopify USA only accepts US shipping addresses. Received country: ${shippingCountry}.`,
        },
      });
      await appendOrderEvent(
        input.orderId,
        CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        'Order blocked before CJ placement: non-US shipping country.',
        { shippingCountry } as Prisma.InputJsonValue,
      );
      throw new AppError('CJ Shopify USA order has a non-US shipping address.', 422, ErrorCode.VALIDATION_ERROR);
    }

    const cjVid = String(order.variant?.cjVid || '').trim();
    const cjSku = String(order.variant?.cjSku || '').trim();
    if (!cjVid || !cjSku) {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: { status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL, lastError: 'Cannot resolve CJ variant ID/SKU for this order' },
      });
      throw new AppError('Cannot resolve CJ variant ID/SKU', 422, ErrorCode.VALIDATION_ERROR);
    }

    const supplierCostUsd = Number(order.variant?.unitCostUsd ?? 0);
    const shippingQuote = order.listing?.shippingQuote;
    const shippingUsd = Number(shippingQuote?.amountUsd ?? NaN);
    const listedPriceUsd = Number(order.listing?.listedPriceUsd ?? 0);
    const quoteOrigin = String(shippingQuote?.originCountryCode || '').trim().toUpperCase();
    const quoteConfidence = String(shippingQuote?.confidence || '').trim().toLowerCase();
    const quoteIsKnown = quoteConfidence === 'known' || quoteConfidence === 'high' || quoteConfidence === 'confirmed';

    if (
      !order.listing ||
      order.listing.status !== 'ACTIVE' ||
      !Number.isFinite(supplierCostUsd) ||
      supplierCostUsd <= 0 ||
      !Number.isFinite(shippingUsd) ||
      shippingUsd < 0 ||
      !Number.isFinite(listedPriceUsd) ||
      listedPriceUsd <= 0 ||
      quoteOrigin !== 'US' ||
      !quoteIsKnown
    ) {
      const reason = [
        !order.listing ? 'missing_listing' : null,
        order.listing && order.listing.status !== 'ACTIVE' ? `listing_not_active:${order.listing.status}` : null,
        supplierCostUsd <= 0 || !Number.isFinite(supplierCostUsd) ? 'missing_supplier_cost' : null,
        !Number.isFinite(shippingUsd) || shippingUsd < 0 ? 'missing_shipping_quote' : null,
        listedPriceUsd <= 0 || !Number.isFinite(listedPriceUsd) ? 'missing_shopify_price' : null,
        quoteOrigin !== 'US' ? `origin_not_us:${quoteOrigin || 'UNKNOWN'}` : null,
        !quoteIsKnown ? `shipping_confidence_not_known:${quoteConfidence || 'unknown'}` : null,
      ].filter(Boolean).join(', ');
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: {
          status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
          lastError: `Supplier placement blocked: margin/shipping is not demonstrated (${reason}).`,
        },
      });
      await appendOrderEvent(
        input.orderId,
        CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        'Order blocked before CJ placement: missing demonstrated USA cost/shipping/margin evidence.',
        { reason, supplierCostUsd, shippingUsd, listedPriceUsd, quoteOrigin, quoteConfidence } as Prisma.InputJsonValue,
      );
      throw new AppError('Order lacks demonstrated USA cost/shipping/margin evidence.', 422, ErrorCode.VALIDATION_ERROR);
    }

    const economics = await cjShopifyUsaQualificationService.evaluate(input.userId, supplierCostUsd, shippingUsd);
    const settings = await prisma.cjShopifyUsaAccountSettings.findUnique({ where: { userId: input.userId } });
    const paymentFeePct = Number(settings?.defaultPaymentFeePct ?? 5.4);
    const paymentFixedFeeUsd = Number(settings?.defaultPaymentFixedFeeUsd ?? 0.3);
    const actualPaymentFeeUsd = Math.round(((listedPriceUsd * (paymentFeePct / 100)) + paymentFixedFeeUsd) * 100) / 100;
    const incidentBufferUsd = economics.breakdown.incidentBufferUsd;
    const totalCostUsd = supplierCostUsd + shippingUsd + incidentBufferUsd + actualPaymentFeeUsd;
    const actualProfitUsd = Math.round((listedPriceUsd - totalCostUsd) * 100) / 100;
    const actualMarginPct = listedPriceUsd > 0 ? Math.round((actualProfitUsd / listedPriceUsd) * 10_000) / 100 : 0;
    const minMarginPct = Number(settings?.minMarginPct ?? 12);
    const minProfitUsd = Number(settings?.minProfitUsd ?? 1.5);
    if (actualProfitUsd < minProfitUsd || actualMarginPct < minMarginPct) {
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: {
          status: CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
          lastError: `Supplier placement blocked: real listing margin ${actualMarginPct.toFixed(2)}% / profit $${actualProfitUsd.toFixed(2)} is below configured minimum.`,
        },
      });
      await appendOrderEvent(
        input.orderId,
        CJ_SHOPIFY_USA_ORDER_STATUS.NEEDS_MANUAL,
        'Order blocked before CJ placement: actual listed price does not protect configured margin.',
        { listedPriceUsd, supplierCostUsd, shippingUsd, actualProfitUsd, actualMarginPct, minMarginPct, minProfitUsd } as Prisma.InputJsonValue,
      );
      throw new AppError('Order margin is below configured minimum. CJ order was not placed.', 422, ErrorCode.VALIDATION_ERROR);
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
        products: [{ vid: cjVid, quantity: order.lineQuantity ?? 1 }],
        // TODO: payment via CJ balance — operator must ensure balance is funded
        payType: 1, // 1 = CJ balance
      };

      await cjApiRateLimiterService.waitTurn('CJ-Shopify createOrderV2');
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
      const isPaymentBlock = isBalanceBlockMessage(errMsg);
      const newStatus = isPaymentBlock
        ? CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED
        : CJ_SHOPIFY_USA_ORDER_STATUS.FAILED;
      await prisma.cjShopifyUsaOrder.update({
        where: { id: input.orderId },
        data: {
          status: newStatus,
          lastError: isPaymentBlock
            ? `Waiting for CJ supplier balance/funds before retrying automatically: ${errMsg.slice(0, 430)}`
            : errMsg.slice(0, 500),
          paymentBlockReason: isPaymentBlock ? 'CJ_BALANCE_INSUFFICIENT' : order.paymentBlockReason,
        },
      });
      await appendOrderEvent(input.orderId, newStatus, `CJ placement failed: ${errMsg}`);
      await createAlert(input.userId, isPaymentBlock ? CJ_SHOPIFY_USA_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED : CJ_SHOPIFY_USA_ALERT_TYPE.ORDER_FAILED, {
        orderId: input.orderId,
        shopifyOrderId: order.shopifyOrderId,
        reason: isPaymentBlock ? 'cj_balance_or_payment_blocked' : 'cj_order_placement_failed',
        message: errMsg.slice(0, 500),
      } as Prisma.InputJsonValue);
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
        await cjApiRateLimiterService.waitTurn('CJ-Shopify getOrderDetail');
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
