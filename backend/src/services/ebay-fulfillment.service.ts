/**
 * eBay Fulfillment — submit external tracking to eBay (mark as shipped without buying eBay label).
 * Used when order is fulfilled by supplier (e.g. AliExpress) so buyer sees tracking on eBay.
 */

import logger from '../config/logger';
import { EbayService, EbayCredentials } from './ebay.service';

export interface SubmitTrackingToEbayParams {
  userId: number;
  ebayOrderId: string;
  trackingNumber: string;
  shippingCarrierCode?: string;
  shippedDate?: string;
}

export interface SubmitTrackingToEbayResult {
  success: boolean;
  error?: string;
}

/**
 * Submit tracking number to eBay Sell Fulfillment API for an order.
 * Fetches order line items then creates shipping_fulfillment with the given tracking.
 */
export async function submitTrackingToEbay(params: SubmitTrackingToEbayParams): Promise<SubmitTrackingToEbayResult> {
  const { userId, ebayOrderId, trackingNumber, shippingCarrierCode, shippedDate } = params;
  const orderId = String(ebayOrderId || '').trim();
  if (!orderId) {
    return { success: false, error: 'ebayOrderId is required' };
  }
  const tracking = String(trackingNumber || '').trim();
  if (!tracking) {
    return { success: false, error: 'trackingNumber is required' };
  }

  try {
    const { marketplaceService } = await import('./marketplace.service');
    const { resolveEnvironment } = await import('../utils/environment-resolver');
    const env = await resolveEnvironment({ userId, default: 'production' });
    const credsResult = await marketplaceService.getCredentials(userId, 'ebay', env);
    if (!credsResult?.isActive || !credsResult?.credentials) {
      return { success: false, error: 'eBay credentials not found or inactive' };
    }

    const ebayService = new EbayService(
      { ...(credsResult.credentials as EbayCredentials), sandbox: env === 'sandbox' }
    );

    const order = await ebayService.getOrderForFulfillment(orderId);
    const carrier = shippingCarrierCode || 'OTHER';
    const shipped = shippedDate || new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');

    await ebayService.createShippingFulfillment(orderId, {
      lineItems: order.lineItems,
      trackingNumber: tracking,
      shippingCarrierCode: carrier,
      shippedDate: shipped,
    });

    logger.info('[EBAY-FULFILLMENT] Tracking submitted', { userId, ebayOrderId: orderId });
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.warn('[EBAY-FULFILLMENT] submitTrackingToEbay failed', { userId, ebayOrderId: orderId, error: msg });
    return { success: false, error: msg };
  }
}
