/**
 * Amazon Order Sync — Fetch orders from Amazon SP-API, create Order in DB, trigger fulfillment.
 * Same pattern as eBay/ML sync. Runs as cron every ~10 min.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import MarketplaceService from './marketplace.service';
import { toNumber } from '../utils/decimal.utils';

const marketplaceService = new MarketplaceService();
const AMAZON_PAYPAL_PREFIX = 'amazon:';

export interface AmazonSyncResult {
  marketplace: string;
  userId: number;
  fetched: number;
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Sync Amazon orders for one user: fetch from SP-API, create Order if not exists (dedup by paypalOrderId).
 */
export async function syncAmazonOrdersForUser(
  userId: number,
  environment: 'sandbox' | 'production'
): Promise<AmazonSyncResult> {
  const result: AmazonSyncResult = {
    marketplace: 'amazon',
    userId,
    fetched: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const credsResult = await marketplaceService.getCredentials(userId, 'amazon', environment);
    if (!credsResult?.isActive || !credsResult?.credentials) {
      result.errors.push('Amazon credentials not found or inactive');
      return result;
    }

    const { AmazonService } = await import('./amazon.service');
    const amazonService = new AmazonService();
    await amazonService.setCredentials(credsResult.credentials as any);

    const createdAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { orders } = await amazonService.getOrders({
      createdAfter,
      maxResultsPerPage: 50,
    });
    result.fetched = orders?.length ?? 0;

    if (!orders?.length) return result;

    for (const order of orders) {
      const amazonOrderId = order?.AmazonOrderId || order?.amazonOrderId || '';
      if (!amazonOrderId) continue;

      const paypalOrderId = `${AMAZON_PAYPAL_PREFIX}${amazonOrderId}`;
      const existing = await prisma.order.findFirst({
        where: { paypalOrderId },
        select: { id: true },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const orderStatus = (order.OrderStatus || order.orderStatus || '').toLowerCase();
      if (orderStatus !== 'unshipped' && orderStatus !== 'pending' && orderStatus !== 'partiallyshipped') {
        result.skipped++;
        continue;
      }

      const items = await amazonService.getOrderItems(amazonOrderId);
      if (!items?.length) {
        result.skipped++;
        continue;
      }

      const ship = order.ShippingAddress || order.shippingAddress || {};
      const normalizedAddr = {
        fullName: ship.Name || ship.name || 'Amazon Buyer',
        addressLine1: ship.AddressLine1 || ship.addressLine1 || '',
        addressLine2: ship.AddressLine2 || ship.addressLine2 || '',
        city: ship.City || ship.city || '',
        state: ship.StateOrProvinceCode || ship.stateOrProvinceCode || ship.state || '',
        zipCode: ship.PostalCode || ship.postalCode || '',
        country: ship.CountryCode || ship.countryCode || 'US',
        phoneNumber: ship.Phone || ship.phone || '',
      };

      for (const item of items) {
        const sku = item.SellerSKU || item.sellerSKU || '';
        if (!sku) continue;

        const listing = await prisma.marketplaceListing.findFirst({
          where: {
            marketplace: 'amazon',
            userId,
            OR: [
              { listingId: sku },
              { sku },
            ],
          },
          select: { productId: true, userId: true },
        });
        if (!listing || listing.userId !== userId) continue;

        const product = await prisma.product.findUnique({
          where: { id: listing.productId },
          select: { id: true, title: true, aliexpressUrl: true, aliexpressPrice: true },
        });
        if (!product) continue;

        const itemPrice = toNumber(item.ItemPrice?.Amount || item.itemPrice?.amount || 0);
        const amount = itemPrice > 0 ? itemPrice : toNumber(product.aliexpressPrice ?? 0) || 10;

        const newOrder = await prisma.order.create({
          data: {
            userId,
            productId: product.id,
            paypalOrderId: items.length === 1 ? paypalOrderId : `${AMAZON_PAYPAL_PREFIX}${amazonOrderId}-${sku}`,
            title: product.title || item.Title || item.title || `Amazon Order ${amazonOrderId}`,
            price: amount,
            currency: 'USD',
            status: 'PAID',
            customerName: normalizedAddr.fullName,
            customerEmail: `${normalizedAddr.fullName.replace(/\s+/g, '.')}@amazon.buyer`,
            shippingAddress: JSON.stringify(normalizedAddr),
            productUrl: (product.aliexpressUrl || '').trim(),
          },
        });

        result.created++;
        logger.info('[AMAZON-SYNC] Order created from Amazon', {
          amazonOrderId,
          internalOrderId: newOrder.id,
          productId: product.id,
        });

        if ((newOrder.productUrl || '').trim()) {
          try {
            const { orderFulfillmentService } = await import('./order-fulfillment.service');
            await orderFulfillmentService.fulfillOrder(newOrder.id);
          } catch (fulfillErr: any) {
            logger.warn('[AMAZON-SYNC] fulfillOrder failed (will retry via process-paid-orders)', {
              orderId: newOrder.id,
              error: fulfillErr?.message,
            });
          }
        }
      }
    }

    return result;
  } catch (err: any) {
    const msg = err?.message || String(err);
    result.errors.push(msg);
    logger.warn('[AMAZON-SYNC] syncAmazonOrdersForUser failed', { userId, error: msg });
    return result;
  }
}

/**
 * Run Amazon sync for all users with active Amazon credentials (production).
 */
export async function runAmazonOrderSync(
  environment: 'sandbox' | 'production' = 'production'
): Promise<AmazonSyncResult[]> {
  const creds = await prisma.apiCredential.findMany({
    where: { apiName: 'amazon', isActive: true },
    select: { userId: true },
    distinct: ['userId'],
  });
  const results: AmazonSyncResult[] = [];
  for (const { userId } of creds) {
    const r = await syncAmazonOrdersForUser(userId, environment);
    results.push(r);
  }
  return results;
}
