/**
 * Mercado Libre Fulfillment — submit external tracking (mark as shipped).
 * Used when order is fulfilled by supplier (e.g. AliExpress) so buyer sees tracking on ML.
 */

import logger from '../config/logger';
import { MercadoLibreService } from './mercadolibre.service';
import type { MercadoLibreCredentials } from './mercadolibre.service';

export interface SubmitTrackingToMercadoLibreParams {
  userId: number;
  mlOrderId: string;
  trackingNumber: string;
}

export interface SubmitTrackingToMercadoLibreResult {
  success: boolean;
  error?: string;
}

/**
 * Submit tracking number to Mercado Libre for an order.
 * Fetches order to get shipment_id (shipping.id), then POST seller_notifications.
 */
export async function submitTrackingToMercadoLibre(
  params: SubmitTrackingToMercadoLibreParams
): Promise<SubmitTrackingToMercadoLibreResult> {
  const { userId, mlOrderId, trackingNumber } = params;
  const orderId = String(mlOrderId || '').trim();
  if (!orderId) {
    return { success: false, error: 'mlOrderId is required' };
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
    const credsResult = await marketplaceService.getCredentials(userId, 'mercadolibre', env);
    if (!credsResult?.isActive || !credsResult?.credentials) {
      return { success: false, error: 'Mercado Libre credentials not found or inactive' };
    }

    const mlService = new MercadoLibreService({
      ...(credsResult.credentials as MercadoLibreCredentials),
      siteId: (credsResult.credentials as MercadoLibreCredentials).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    });

    const order = await mlService.getOrder(orderId);
    const shipmentId = (order as any).shipping?.id;
    if (shipmentId == null) {
      logger.warn('[ML-FULFILLMENT] Order has no shipping.id', { mlOrderId: orderId });
      return { success: false, error: 'Order has no shipment id (shipping.id)' };
    }

    await mlService.notifyShipmentShipped(shipmentId, tracking);
    logger.info('[ML-FULFILLMENT] Tracking submitted', { userId, mlOrderId: orderId });
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.warn('[ML-FULFILLMENT] submitTrackingToMercadoLibre failed', {
      userId,
      mlOrderId: orderId,
      error: msg,
    });
    return { success: false, error: msg };
  }
}
