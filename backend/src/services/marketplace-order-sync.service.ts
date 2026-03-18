/**
 * Phase 40 — Marketplace Order Sync
 * Fetches real orders from eBay (and later ML/Amazon), creates/updates Order in DB with deduplication.
 * Runs as a worker every 5–10 minutes.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import MarketplaceService from './marketplace.service';
import { EbayService, EbayCredentials } from './ebay.service';

const marketplaceService = new MarketplaceService();

const EBAY_PAYPAL_PREFIX = 'ebay:';

function normalizeShippingAddress(addr: Record<string, string> | undefined, buyerName?: string): string {
  if (!addr || typeof addr !== 'object') {
    return JSON.stringify({
      fullName: buyerName || 'Buyer',
      addressLine1: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'US',
    });
  }
  return JSON.stringify({
    fullName: addr.fullName || buyerName || 'Buyer',
    addressLine1: addr.addressLine1 || '',
    addressLine2: addr.addressLine2 || '',
    city: addr.city || '',
    state: addr.state || '',
    zipCode: addr.zipCode || '',
    country: addr.country || 'US',
    phoneNumber: addr.phoneNumber || '',
  });
}

export interface SyncResult {
  marketplace: string;
  userId: number;
  fetched: number;
  created: number;
  skipped: number;
  /** Orders ingested without full product mapping (still in BD for visibility) */
  createdUnmapped: number;
  errors: string[];
}

/** Normalized eBay order shape (one item from getOrders / getOrderById). */
export type EbayOrderPayload = {
  orderId: string;
  buyerName?: string;
  buyerEmail?: string;
  shippingAddress?: Record<string, string>;
  lineItems?: Array<{ sku?: string; itemId?: string; title?: string; quantity?: number; price?: number }>;
  total?: number;
  fulfillmentStatus?: string;
};

export interface UpsertOrderFromEbayResult {
  order: { id: string; status: string; productUrl: string | null };
  created: boolean;
  hasProductUrl: boolean;
}

/**
 * Create or return existing Order from one eBay order payload. Idempotent by paypalOrderId.
 * Used by sync loop and by POST /api/orders/fetch-ebay-order.
 */
export async function upsertOrderFromEbayPayload(
  userId: number,
  ebayOrder: EbayOrderPayload,
  _environment: 'sandbox' | 'production'
): Promise<UpsertOrderFromEbayResult> {
  const orderId = String(ebayOrder.orderId || '').trim();
  if (!orderId) {
    throw new Error('ebayOrder.orderId is required');
  }
  const paypalOrderId = `${EBAY_PAYPAL_PREFIX}${orderId}`;
  const existing = await prisma.order.findFirst({
    where: { paypalOrderId },
    select: { id: true, status: true, productUrl: true },
  });
  if (existing) {
    return {
      order: existing,
      created: false,
      hasProductUrl: !!(existing.productUrl || '').trim(),
    };
  }

  const firstLine = ebayOrder.lineItems?.[0];
  const sku = firstLine?.sku;
  const itemId = (firstLine as any)?.itemId;
  let listing: { productId: number; userId: number } | null = null;
  if (itemId) {
    listing = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'ebay', listingId: String(itemId) },
      select: { productId: true, userId: true },
    });
  }
  if (!listing && sku) {
    listing = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'ebay', listingId: String(sku) },
      select: { productId: true, userId: true },
    });
  }
  if (!listing && sku) {
    listing = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'ebay', sku: String(sku) },
      select: { productId: true, userId: true },
    });
  }
  const lineTitle = (firstLine?.title || '').trim() || `eBay order ${orderId}`;
  const itemIdStr = itemId != null ? String(itemId) : '';
  const skuStr = sku != null ? String(sku) : '';

  let product: { id: number; title: string; aliexpressUrl: string | null } | null = null;
  let productUrl = '';

  if (listing && listing.userId === userId) {
    product = await prisma.product.findUnique({
      where: { id: listing.productId },
      select: { id: true, title: true, aliexpressUrl: true },
    });
    if (product) {
      productUrl = (product.aliexpressUrl || '').trim();
      if (!productUrl) {
        const ref = await prisma.product.findUnique({
          where: { id: listing.productId },
          select: { aliexpressUrl: true },
        });
        productUrl = (ref?.aliexpressUrl || '').trim();
      }
    }
  }

  const amount = ebayOrder.total ?? (firstLine?.price ?? 0) * (firstLine?.quantity ?? 1);
  if (!isFinite(amount) || amount <= 0) {
    throw new Error(`Order ${orderId}: invalid amount`);
  }

  const shippingStr = normalizeShippingAddress(ebayOrder.shippingAddress, ebayOrder.buyerName);

  const unmappedParts = [
    !listing || listing.userId !== userId ? 'no_listing' : null,
    !product ? 'no_product' : null,
    !productUrl ? 'no_aliexpress_url' : null,
  ].filter(Boolean);
  const ebayFulfilled = String(ebayOrder.fulfillmentStatus || '').toUpperCase() === 'FULFILLED';
  const errorMessage =
    unmappedParts.length > 0
      ? `EBAY_SYNC_AWAITING_PRODUCT_MAP ${itemIdStr ? `itemId=${itemIdStr}` : ''} ${skuStr ? `sku=${skuStr}` : ''}`.trim()
      : null;

  const orderStatus = ebayFulfilled ? 'PURCHASED' : 'PAID';
  const aliexpressOrderId = ebayFulfilled ? 'ebay-fulfilled' : undefined;

  const newOrder = await prisma.order.create({
    data: {
      userId,
      productId: product?.id ?? null,
      title: product?.title ?? lineTitle,
      price: amount,
      currency: 'USD',
      customerName: ebayOrder.buyerName || 'Buyer',
      customerEmail: ebayOrder.buyerEmail || 'buyer@unknown.com',
      shippingAddress: shippingStr,
      status: orderStatus,
      paypalOrderId,
      productUrl: productUrl || '',
      errorMessage: ebayFulfilled && errorMessage ? `${errorMessage} (eBay ya fulfilled)` : errorMessage,
      ...(aliexpressOrderId ? { aliexpressOrderId } : {}),
    },
  });

  logger.info('[MARKETPLACE-SYNC] Order created from eBay payload', {
    orderId: newOrder.id,
    ebayOrderId: orderId,
    userId,
    unmapped: unmappedParts.length > 0,
  });

  if (product && productUrl) {
    try {
      const { saleService } = await import('./sale.service');
      await saleService.createSaleFromOrder(newOrder.id);
    } catch (e: any) {
      logger.warn('[MARKETPLACE-SYNC] createSaleFromOrder after upsert (non-fatal)', {
        orderId: newOrder.id,
        error: e?.message,
      });
    }
  }

  return {
    order: { id: newOrder.id, status: newOrder.status, productUrl: newOrder.productUrl },
    created: true,
    hasProductUrl: !!productUrl,
  };
}

/**
 * Sync eBay orders for one user: fetch from API, create Order if not exists (dedup by paypalOrderId).
 */
export async function syncEbayOrdersForUser(userId: number, environment: 'sandbox' | 'production'): Promise<SyncResult> {
  const result: SyncResult = {
    marketplace: 'ebay',
    userId,
    fetched: 0,
    created: 0,
    skipped: 0,
    createdUnmapped: 0,
    errors: [],
  };
  try {
    const credsResult = await marketplaceService.getCredentials(userId, 'ebay', environment);
    if (!credsResult?.isActive || !credsResult?.credentials) {
      result.errors.push('eBay credentials not found or inactive');
      return result;
    }
    const ebayService = new EbayService({
      ...(credsResult.credentials as EbayCredentials),
      sandbox: environment === 'sandbox',
    });

    // Paginate getOrders so we don't miss orders outside the first page (e.g. limit 50).
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50;
    const ordersById = new Map<string, EbayOrderPayload>();
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const pageResult = await ebayService.getOrders({ limit: PAGE_SIZE, offset });
      for (const o of pageResult.orders) {
        const id = String(o.orderId || '').trim();
        if (id) ordersById.set(id, o);
      }
      result.fetched = ordersById.size;
      const hasMore = pageResult.next != null && pageResult.orders.length >= PAGE_SIZE;
      if (!hasMore || pageResult.orders.length === 0) break;
      offset += PAGE_SIZE;
    }
    const orders = Array.from(ordersById.values());

    for (const ebayOrder of orders) {
      const orderId = String(ebayOrder.orderId || '').trim();
      if (!orderId) continue;

      try {
        const upserted = await upsertOrderFromEbayPayload(userId, ebayOrder, environment);
        if (!upserted.created) {
          result.skipped++;
          continue;
        }
        const hasProductUrl = (upserted.order.productUrl || '').trim().length > 0;
        if (hasProductUrl) result.created++;
        else result.createdUnmapped++;
      } catch (e: any) {
        result.errors.push(e?.message || String(e));
        result.skipped++;
      }
    }

    return result;
  } catch (err: any) {
    const msg = err?.message || String(err);
    result.errors.push(msg);
    logger.warn('[MARKETPLACE-SYNC] syncEbayOrdersForUser failed', { userId, error: msg });
    return result;
  }
}

let lastSyncAt: Date | null = null;

/**
 * Run sync for all users with active eBay credentials (production).
 */
export async function runMarketplaceOrderSync(environment: 'sandbox' | 'production' = 'production'): Promise<SyncResult[]> {
  const creds = await prisma.apiCredential.findMany({
    where: { apiName: 'ebay', isActive: true },
    select: { userId: true },
    distinct: ['userId'],
  });
  const results: SyncResult[] = [];
  for (const { userId } of creds) {
    const r = await syncEbayOrdersForUser(userId, environment);
    results.push(r);
  }
  lastSyncAt = new Date();
  return results;
}

/** Phase 40: Last sync time for "Last synced X min ago" in frontend. */
export function getLastMarketplaceSyncAt(): Date | null {
  return lastSyncAt;
}
