/**
 * Amazon Fulfillment — submit external tracking (confirm shipment).
 * Used when order is fulfilled by supplier (e.g. AliExpress) so buyer sees tracking on Amazon.
 */

import logger from '../config/logger';
import { AmazonService } from './amazon.service';
import type { AmazonCredentials } from './amazon.service';

export interface SubmitTrackingToAmazonParams {
  userId: number;
  amazonOrderId: string;
  trackingNumber: string;
  carrierCode?: string;
  carrierName?: string;
}

export interface SubmitTrackingToAmazonResult {
  success: boolean;
  error?: string;
}

/**
 * Submit tracking number to Amazon Orders API (confirmShipment) for an order.
 */
export async function submitTrackingToAmazon(
  params: SubmitTrackingToAmazonParams
): Promise<SubmitTrackingToAmazonResult> {
  const { userId, amazonOrderId, trackingNumber, carrierCode, carrierName } = params;
  const orderId = String(amazonOrderId || '').trim();
  if (!orderId) {
    return { success: false, error: 'amazonOrderId is required' };
  }
  const tracking = String(trackingNumber || '').trim();
  if (!tracking) {
    return { success: false, error: 'trackingNumber is required' };
  }

  try {
    const MarketplaceService = (await import('./marketplace.service')).default;
    const marketplaceService = new MarketplaceService();
    const { resolveEnvironment } = await import('../utils/environment-resolver');
    const env = await resolveEnvironment({ userId, default: 'production' });
    const credsResult = await marketplaceService.getCredentials(userId, 'amazon', env);
    if (!credsResult?.isActive || !credsResult?.credentials) {
      return { success: false, error: 'Amazon credentials not found or inactive' };
    }

    const creds = credsResult.credentials as any;
    const amazonService = new AmazonService();
    await amazonService.setCredentials({
      ...creds,
      marketplace: creds.marketplace || creds.marketplaceId,
    } as AmazonCredentials);

    await amazonService.confirmShipment({
      orderId,
      trackingNumber: tracking,
      carrierCode: carrierCode || 'Other',
      carrierName: carrierName || 'Other',
      shippingMethod: 'Standard',
    });
    logger.info('[AMAZON-FULFILLMENT] Tracking submitted', { userId, amazonOrderId: orderId });
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.warn('[AMAZON-FULFILLMENT] submitTrackingToAmazon failed', {
      userId,
      amazonOrderId: orderId,
      error: msg,
    });
    return { success: false, error: msg };
  }
}
