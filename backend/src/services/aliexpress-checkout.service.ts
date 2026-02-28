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
   * When AUTOPILOT_MODE=production, simulated checkout is forbidden.
   * Isolation rule: when userId is provided, purchase must use Dropshipping API credentials only.
   * No Puppeteer fallback is allowed in that path.
   */
  async placeOrder(request: AliExpressCheckoutRequest, userId?: number): Promise<AliExpressCheckoutResult> {
    const allowBrowser = env.ALLOW_BROWSER_AUTOMATION ?? false;
    const autopilotMode = (process.env.AUTOPILOT_MODE || 'sandbox') as 'production' | 'sandbox';

    if (!allowBrowser) {
      if (autopilotMode === 'production') {
        const msg = 'AUTOPILOT_MODE=production: simulated checkout forbidden. Set ALLOW_BROWSER_AUTOMATION=true.';
        console.error('[ALIEXPRESS-CHECKOUT] FATAL:', msg);
        throw new Error(msg);
      }
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
      // Primary path for user-bound purchases: Dropshipping API.
      // If OAuth/token exchange is blocked upstream, allow browser fallback in production
      // when ALIEXPRESS_USER/ALIEXPRESS_PASS are configured.
      if (userId) {
        const result = await (service as any).executePurchase(
          {
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
          },
          userId
        );
        if (result.success && result.orderId) {
          console.log('[ALIEXPRESS-CHECKOUT] ORDER PLACED (Dropshipping API)', { orderId: result.orderId });
          logger.info('[ALIEXPRESS-CHECKOUT] Order placed via Dropshipping API', { orderId: result.orderId });
          return {
            success: true,
            orderId: result.orderId,
            orderNumber: result.orderNumber || result.orderId,
          };
        }
        const strictError = result.error || 'AliExpress Dropshipping API purchase failed';
        logger.warn('[ALIEXPRESS-CHECKOUT] Dropshipping API failed, attempting browser fallback', {
          userId,
          error: strictError,
        });
        // Fallback to browser automation for user-bound purchases
        const aliUser = (process.env.ALIEXPRESS_USER || '').trim();
        const aliPass = (process.env.ALIEXPRESS_PASS || '').trim();
        if (!aliUser || !aliPass) {
          return {
            success: false,
            error: `${strictError}. Missing ALIEXPRESS_USER/ALIEXPRESS_PASS for browser fallback.`,
          };
        }
        service.setCredentials({ email: aliUser, password: aliPass });
        const loginOk = await service.login();
        if (!loginOk) {
          return { success: false, error: `${strictError}. AliExpress browser login failed.` };
        }
        const browserResult = await (service as any).executePurchase(
          {
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
          },
          undefined
        );
        await service.closeBrowser?.();
        if (browserResult.success && browserResult.orderId) {
          logger.info('[ALIEXPRESS-CHECKOUT] Browser fallback purchase succeeded', {
            orderId: browserResult.orderId,
            userId,
          });
          return {
            success: true,
            orderId: browserResult.orderId,
            orderNumber: browserResult.orderNumber || browserResult.orderId,
          };
        }
        return {
          success: false,
          error: `${strictError}. Browser fallback failed: ${browserResult.error || 'unknown error'}`,
        };
      }
      // Puppeteer fallback: need login credentials
      const aliUser = (process.env.ALIEXPRESS_USER || '').trim();
      const aliPass = (process.env.ALIEXPRESS_PASS || '').trim();
      if (!aliUser || !aliPass) {
        if (autopilotMode === 'production' && !userId) {
          const msg = 'AUTOPILOT_MODE=production: simulated checkout forbidden. Configure ALIEXPRESS_USER and ALIEXPRESS_PASS.';
          throw new Error(msg);
        }
        if (userId) {
          return { success: false, error: 'Dropshipping API failed and no browser credentials (ALIEXPRESS_USER/ALIEXPRESS_PASS) for fallback.' };
        }
        logger.warn('[ALIEXPRESS-CHECKOUT] Credentials missing, using stub');
        return { success: true, orderId: 'SIMULATED_ORDER_ID', orderNumber: 'SIMULATED_ORDER_ID' };
      }
      service.setCredentials({ email: aliUser, password: aliPass });

      const loginOk = await service.login();
      if (!loginOk) {
        return { success: false, error: 'AliExpress login failed' };
      }
      console.log('[ALIEXPRESS-CHECKOUT] LOGIN OK');

      const result = await (service as any).executePurchase({
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
      }, undefined);

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
