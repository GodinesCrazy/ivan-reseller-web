/**
 * Phase 40 — Marketplace Order Sync
 * Fetches real orders from eBay (and later ML/Amazon), creates/updates Order in DB with deduplication.
 * Runs as a worker every 5–10 minutes.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { marketplaceService } from './marketplace.service';
import { EbayService, EbayCredentials } from './ebay.service';

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
    const { orders } = await ebayService.getOrders({ limit: 50 });
    result.fetched = orders.length;

    for (const ebayOrder of orders) {
      const orderId = String(ebayOrder.orderId || '').trim();
      if (!orderId) continue;

      const paypalOrderId = `${EBAY_PAYPAL_PREFIX}${orderId}`;
      const existing = await prisma.order.findFirst({
        where: { paypalOrderId },
        select: { id: true },
      });
      if (existing) {
        result.skipped++;
        continue;
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
        result.errors.push(`Order ${orderId}: invalid amount`);
        result.skipped++;
        continue;
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

      /** Ya enviada en eBay: no disparar compra en AliExpress */
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

      if (unmappedParts.length > 0) {
        result.createdUnmapped++;
        logger.info('[MARKETPLACE-SYNC] Order created from eBay (map product in app)', {
          orderId: newOrder.id,
          ebayOrderId: orderId,
          userId,
          unmappedParts,
        });
      } else {
        result.created++;
        logger.info('[MARKETPLACE-SYNC] Order created from eBay', { orderId, userId, paypalOrderId });
      }

      // Ventas: crear Sale en cuanto hay producto y coste válido (incl. órdenes ya fulfilled en eBay)
      if (product && productUrl) {
        try {
          const { saleService } = await import('./sale.service');
          await saleService.createSaleFromOrder(newOrder.id);
        } catch (e: any) {
          logger.warn('[MARKETPLACE-SYNC] createSaleFromOrder after sync (non-fatal)', {
            orderId: newOrder.id,
            error: e?.message,
          });
        }
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
