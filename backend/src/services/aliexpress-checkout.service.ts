/**
 * AliExpress Checkout Service - Place order on AliExpress for dropshipping fulfillment
 * Modes:
 * A) Browser automation (Puppeteer) when ALLOW_BROWSER_AUTOMATION=true
 * B) Stub mode when ALLOW_BROWSER_AUTOMATION=false - returns SIMULATED_ORDER_ID
 */

import logger from '../config/logger';
import env from '../config/env';

export interface AliExpressCheckoutRequest {
  productUrl: string;
  quantity?: number;
  maxPrice: number;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    phoneNumber: string;
  };
}

export interface AliExpressCheckoutResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
}

export class AliExpressCheckoutService {
  /**
   * Place order on AliExpress. Stub mode if browser automation disabled.
   */
  async placeOrder(request: AliExpressCheckoutRequest): Promise<AliExpressCheckoutResult> {
    const allowBrowser = env.ALLOW_BROWSER_AUTOMATION ?? false;

    if (!allowBrowser) {
      console.log('[ALIEXPRESS-CHECKOUT] STUB MODE (ALLOW_BROWSER_AUTOMATION=false)');
      logger.info('[ALIEXPRESS-CHECKOUT] Stub mode - returning simulated order');
      return {
        success: true,
        orderId: 'SIMULATED_ORDER_ID',
        orderNumber: 'SIMULATED_ORDER_ID',
      };
    }

    try {
      const { AliExpressAutoPurchaseService } = await import('./aliexpress-auto-purchase.service');
      const service = new AliExpressAutoPurchaseService();
      const aliUser = (process.env.ALIEXPRESS_USER || '').trim();
      const aliPass = (process.env.ALIEXPRESS_PASS || '').trim();
      if (!aliUser || !aliPass) {
        logger.warn('[ALIEXPRESS-CHECKOUT] Credentials missing, using stub');
        return { success: true, orderId: 'SIMULATED_ORDER_ID', orderNumber: 'SIMULATED_ORDER_ID' };
      }
      service.setCredentials({ email: aliUser, password: aliPass });

      const loginOk = await service.login();
      if (!loginOk) {
        return { success: false, error: 'AliExpress login failed' };
      }
      console.log('[ALIEXPRESS-CHECKOUT] LOGIN OK');

      const result = await service.purchase({
        productUrl: request.productUrl,
        quantity: request.quantity ?? 1,
        maxPrice: request.maxPrice,
        shippingAddress: {
          fullName: request.shippingAddress.fullName,
          addressLine1: request.shippingAddress.addressLine1,
          addressLine2: request.shippingAddress.addressLine2,
          city: request.shippingAddress.city,
          state: request.shippingAddress.state,
          zipCode: request.shippingAddress.zipCode,
          country: request.shippingAddress.country,
          phoneNumber: request.shippingAddress.phoneNumber,
        },
      });

      await service.closeBrowser?.();

      if (result.success && result.orderId) {
        console.log('[ALIEXPRESS-CHECKOUT] ORDER PLACED', { orderId: result.orderId });
        logger.info('[ALIEXPRESS-CHECKOUT] Order placed', { orderId: result.orderId });
        return {
          success: true,
          orderId: result.orderId,
          orderNumber: result.orderNumber || result.orderId,
        };
      }
      return {
        success: false,
        error: result.error || 'Purchase failed',
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      logger.error('[ALIEXPRESS-CHECKOUT] placeOrder failed', { error: msg });
      return { success: false, error: msg };
    }
  }
}

export const aliexpressCheckoutService = new AliExpressCheckoutService();
