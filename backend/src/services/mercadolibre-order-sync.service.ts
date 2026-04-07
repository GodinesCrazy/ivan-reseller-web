/**
 * Mercado Libre Order Sync — Fetch real orders from ML API, create Order in DB, trigger fulfillment.
 * Same pattern as marketplace-order-sync (eBay). Runs as cron every ~10 min.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import MarketplaceService from './marketplace.service';
import { toNumber } from '../utils/decimal.utils';
import { getWebhookStatusWithProof, getWebhookStatus } from './webhook-readiness.service';

const marketplaceService = new MarketplaceService();
const ML_PAYPAL_PREFIX = 'mercadolibre:';

export interface MLSyncResult {
  marketplace: string;
  userId: number;
  fetched: number;
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Sync Mercado Libre orders for one user: fetch from API, create Order if not exists (dedup by paypalOrderId).
 */
export async function syncMercadoLibreOrdersForUser(
  userId: number,
  environment: 'sandbox' | 'production'
): Promise<MLSyncResult> {
  const result: MLSyncResult = {
    marketplace: 'mercadolibre',
    userId,
    fetched: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const forcePolling = process.env.ML_FORCE_ORDER_POLLING === 'true';
    if (!forcePolling) {
      const webhook = await getWebhookStatusWithProof().catch(() => getWebhookStatus());
      const mlWebhook = webhook.mercadolibre;
      if (mlWebhook?.configured === true && mlWebhook?.eventFlowReady === true) {
        logger.info('[ML-SYNC] Polling skipped: canonical webhook flow is ready', {
          userId,
          configured: mlWebhook.configured,
          eventFlowReady: mlWebhook.eventFlowReady,
        });
        return result;
      }
    }

    const credsResult = await marketplaceService.getCredentials(userId, 'mercadolibre', environment);
    if (!credsResult?.isActive || !credsResult?.credentials?.accessToken) {
      result.errors.push('Mercado Libre credentials not found or inactive');
      return result;
    }

    const { MercadoLibreService } = await import('./mercadolibre.service');
    const mlService = new MercadoLibreService({
      clientId: credsResult.credentials.clientId || '',
      clientSecret: credsResult.credentials.clientSecret || '',
      accessToken: credsResult.credentials.accessToken,
      refreshToken: credsResult.credentials.refreshToken,
      userId: credsResult.credentials.userId,
      siteId: credsResult.credentials.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    });

    const orders = await mlService.searchRecentOrders(30);
    result.fetched = orders.length;

    for (const order of orders) {
      if ((order.status || '').toLowerCase() !== 'paid') continue;

      const mlOrderId = String((order as any).id || '').trim();
      if (!mlOrderId) continue;

      const paypalOrderId = `${ML_PAYPAL_PREFIX}${mlOrderId}`;
      const existing = await prisma.order.findFirst({
        where: { paypalOrderId },
        select: { id: true },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const rawItems = (order as any).items || (order as any).order_items || [];
      const orderItems = rawItems.map((i: any) => ({
        item: { id: i.itemId ?? i.item?.id },
        quantity: i.quantity ?? 1,
      })).filter((oi: any) => oi.item?.id);
      if (orderItems.length === 0) {
        result.skipped++;
        continue;
      }

      const buyer = (order as any).buyer || {};
      const buyerNick = buyer.nickname || buyer.email || 'ML Buyer';
      const rawAddr = (order as any).shipping?.receiver_address || (order as any).shippingAddress || {};
      const normalizedAddr = {
        fullName: buyerNick,
        addressLine1: rawAddr.address_line || rawAddr.street_name || '',
        addressLine2: rawAddr.street_number || '',
        city: typeof rawAddr.city === 'object' ? rawAddr.city?.name : (rawAddr.city || ''),
        state: typeof rawAddr.state === 'object' ? rawAddr.state?.name : (rawAddr.state || ''),
        zipCode: rawAddr.zip_code || rawAddr.postal_code || '',
        country: typeof rawAddr.country === 'object' ? rawAddr.country?.name : (rawAddr.country || 'CL'),
        phoneNumber: rawAddr.phone?.number || rawAddr.phone || '',
      };

      let createdForOrder = false;
      for (const oi of orderItems) {
        const itemId = oi.item?.id ?? (oi as any).itemId;
        if (!itemId) continue;

        const listing = await prisma.marketplaceListing.findFirst({
          where: { marketplace: 'mercadolibre', listingId: String(itemId) },
          select: { productId: true, userId: true },
        });
        if (!listing || listing.userId !== userId) continue;

        const product = await prisma.product.findUnique({
          where: { id: listing.productId },
          select: { id: true, title: true, aliexpressUrl: true, aliexpressPrice: true, suggestedPrice: true },
        });
        if (!product) continue;

        // order.price stores the SUPPLIER cost (aliexpressPrice) in USD for capital/purchase checks.
        // The real ML sale amount (CLP) is stored in shippingAddress JSON as _mlSaleAmountCLP.
        const supplierCostUsd = toNumber(product.aliexpressPrice ?? 0) > 0
          ? toNumber(product.aliexpressPrice)
          : toNumber((product as any).suggestedPrice ?? 0);
        const purchaseCost = supplierCostUsd > 0 ? supplierCostUsd : toNumber((order as any).total_amount ?? (order as any).totalAmount ?? 0);

        // Capture ML sale amount in CLP for order-time profitability gate
        const mlSaleAmountCLP = toNumber((order as any).total_amount ?? (order as any).totalAmount ?? 0);

        const addrWithSaleMeta = {
          ...normalizedAddr,
          // Prefixed underscore = system metadata embedded in the address JSON
          ...(mlSaleAmountCLP > 0 ? { _mlSaleAmountCLP: mlSaleAmountCLP } : {}),
        };

        const newOrder = await prisma.order.create({
          data: {
            userId,
            productId: product.id,
            paypalOrderId: orderItems.length === 1 ? paypalOrderId : `${ML_PAYPAL_PREFIX}${mlOrderId}-${itemId}`,
            title: product.title || `ML Order ${mlOrderId}`,
            price: purchaseCost,
            currency: 'USD',
            status: 'PAID',
            customerName: buyerNick,
            customerEmail: (buyer as any).email || `${buyerNick}@mercadolibre.cl`,
            shippingAddress: JSON.stringify(addrWithSaleMeta),
            productUrl: (product.aliexpressUrl || '').trim(),
          },
        });

        result.created++;
        createdForOrder = true;

        logger.info('[ML-SYNC] Order created from Mercado Libre', {
          mlOrderId,
          internalOrderId: newOrder.id,
          productId: product.id,
          supplierCostUsd: purchaseCost,
          mlSaleAmountCLP: mlSaleAmountCLP || null,
        });

        if ((newOrder.productUrl || '').trim()) {
          try {
            const { orderFulfillmentService } = await import('./order-fulfillment.service');
            await orderFulfillmentService.fulfillOrder(newOrder.id);
          } catch (fulfillErr: any) {
            logger.warn('[ML-SYNC] fulfillOrder failed (will retry via process-paid-orders)', {
              orderId: newOrder.id,
              error: fulfillErr?.message,
            });
          }
        }
      }

      if (!createdForOrder && orderItems.length > 0) {
        result.skipped++;
      }
    }

    return result;
  } catch (err: any) {
    const msg = err?.message || String(err);
    result.errors.push(msg);
    logger.warn('[ML-SYNC] syncMercadoLibreOrdersForUser failed', { userId, error: msg });
    return result;
  }
}

/**
 * Run ML sync for all users with active Mercado Libre credentials (production).
 */
export async function runMercadoLibreOrderSync(
  environment: 'sandbox' | 'production' = 'production'
): Promise<MLSyncResult[]> {
  const creds = await prisma.apiCredential.findMany({
    where: { apiName: 'mercadolibre', isActive: true },
    select: { userId: true },
    distinct: ['userId'],
  });
  const results: MLSyncResult[] = [];
  for (const { userId } of creds) {
    const r = await syncMercadoLibreOrdersForUser(userId, environment);
    results.push(r);
  }
  return results;
}
