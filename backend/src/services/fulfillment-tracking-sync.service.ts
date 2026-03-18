/**
 * Fulfillment Tracking Sync Service
 *
 * Job: find PURCHASED orders with aliexpressOrderId and Sale without tracking,
 * fetch tracking from AliExpress Dropshipping API, update Sale and PurchaseLog,
 * then submit tracking to the marketplace (eBay, Mercado Libre, Amazon).
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { aliexpressDropshippingAPIService } from './aliexpress-dropshipping-api.service';
import { submitTrackingToEbay } from './ebay-fulfillment.service';
import { submitTrackingToMercadoLibre } from './mercadolibre-fulfillment.service';
import { submitTrackingToAmazon } from './amazon-fulfillment.service';

const DEFAULT_BATCH_SIZE = 50;

export interface SyncTrackingOptions {
  batchSize?: number;
  environment?: 'sandbox' | 'production';
}

export interface SyncTrackingResult {
  processed: number;
  updated: number;
  submitted: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * Sync tracking for eligible orders: fetch from AliExpress, update Sale/PurchaseLog, submit to marketplace.
 */
export async function syncTrackingForEligibleOrders(
  options: SyncTrackingOptions = {}
): Promise<SyncTrackingResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const environment = options.environment ?? 'production';

  const result: SyncTrackingResult = {
    processed: 0,
    updated: 0,
    submitted: 0,
    errors: [],
  };

  const orders = await prisma.order.findMany({
    where: {
      status: 'PURCHASED',
      aliexpressOrderId: { not: null },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  for (const order of orders) {
    const orderId = order.id;
    const aliexpressOrderId = (order.aliexpressOrderId || '').trim();
    if (!aliexpressOrderId || aliexpressOrderId === 'manual') {
      continue;
    }

    const sale = await prisma.sale.findUnique({
      where: { orderId },
    });
    if (!sale || sale.trackingNumber) {
      continue;
    }

    result.processed++;
    const userId = order.userId;
    if (userId == null) {
      result.errors.push({ orderId, error: 'Order has no userId' });
      continue;
    }

    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const creds = await CredentialsManager.getCredentials(
        userId,
        'aliexpress-dropshipping',
        environment
      );
      if (!creds?.credentials?.accessToken && !(creds as any)?.accessToken) {
        result.errors.push({ orderId, error: 'AliExpress Dropshipping credentials not found' });
        continue;
      }

      const credentials = (creds as any).credentials || creds;
      aliexpressDropshippingAPIService.setCredentials(credentials);

      const trackingInfo = await aliexpressDropshippingAPIService.getTrackingInfo(aliexpressOrderId);
      if (!trackingInfo?.trackingNumber) {
        continue;
      }

      const trackingNumber = trackingInfo.trackingNumber.trim();
      if (!trackingNumber) {
        continue;
      }

      await prisma.sale.update({
        where: { id: sale.id },
        data: { trackingNumber, status: 'SHIPPED' },
      });
      result.updated++;

      const purchaseLog = await prisma.purchaseLog.findFirst({
        where: { orderId, userId },
        orderBy: { id: 'desc' },
      });
      if (purchaseLog) {
        await prisma.purchaseLog.update({
          where: { id: purchaseLog.id },
          data: { trackingNumber },
        });
      }

      const paypalOrderId = (order.paypalOrderId || '').trim();
      if (paypalOrderId.startsWith('ebay:')) {
        const ebayOrderId = paypalOrderId.slice(5).trim();
        const submitResult = await submitTrackingToEbay({
          userId,
          ebayOrderId,
          trackingNumber,
        });
        if (submitResult.success) {
          result.submitted++;
        } else {
          result.errors.push({ orderId, error: `eBay: ${submitResult.error || 'unknown'}` });
        }
      } else if (paypalOrderId.startsWith('mercadolibre:')) {
        const mlOrderId = paypalOrderId.slice(13).trim();
        const submitResult = await submitTrackingToMercadoLibre({
          userId,
          mlOrderId,
          trackingNumber,
        });
        if (submitResult.success) {
          result.submitted++;
        } else {
          result.errors.push({ orderId, error: `ML: ${submitResult.error || 'unknown'}` });
        }
      } else if (paypalOrderId.startsWith('amazon:')) {
        const amazonOrderId = paypalOrderId.slice(7).trim();
        const submitResult = await submitTrackingToAmazon({
          userId,
          amazonOrderId,
          trackingNumber,
        });
        if (submitResult.success) {
          result.submitted++;
        } else {
          result.errors.push({ orderId, error: `Amazon: ${submitResult.error || 'unknown'}` });
        }
      } else {
        logger.debug('[FULFILLMENT-TRACKING-SYNC] Unknown marketplace prefix', {
          orderId,
          paypalOrderId: paypalOrderId.slice(0, 20),
        });
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      result.errors.push({ orderId, error: msg });
      logger.warn('[FULFILLMENT-TRACKING-SYNC] Order failed', { orderId, error: msg });
    }
  }

  if (result.processed > 0 || result.updated > 0) {
    logger.info('[FULFILLMENT-TRACKING-SYNC] Run complete', {
      processed: result.processed,
      updated: result.updated,
      submitted: result.submitted,
      errors: result.errors.length,
    });
  }

  return result;
}
