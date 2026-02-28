/**
 * Order Fulfillment Service - Payment confirmed ? Create Order ? Execute AliExpress purchase
 * Pipeline: PAID ? PURCHASING ? PURCHASED | FAILED
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { purchaseRetryService } from './purchase-retry.service';
import { checkDailyLimits } from './daily-limits.service';
import { hasSufficientFreeCapital } from './working-capital.service';

export type OrderStatus = 'CREATED' | 'PAID' | 'PURCHASING' | 'PURCHASED' | 'FAILED' | 'SIMULATED';

export interface FulfillOrderResult {
  success: boolean;
  orderId: string;
  aliexpressOrderId?: string;
  status: OrderStatus;
  error?: string;
}

export class OrderFulfillmentService {
  /**
   * Fulfill an order: set PURCHASING, call AliExpress checkout, update status.
   */
  async fulfillOrder(orderId: string): Promise<FulfillOrderResult> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      logger.error('[ORDER-FULFILLMENT] Order not found', { orderId });
      return { success: false, orderId, status: 'FAILED', error: 'Order not found' };
    }
    if (order.status !== 'PAID') {
      logger.warn('[ORDER-FULFILLMENT] Order not in PAID status', { orderId, status: order.status });
      return {
        success: false,
        orderId,
        status: order.status as OrderStatus,
        error: `Order must be PAID, got ${order.status}`,
      };
    }

    const limitCheck = await checkDailyLimits(undefined, Number(order.price));
    if (!limitCheck.ok) {
      logger.warn('[ORDER-FULFILLMENT] Daily limits exceeded', { orderId, error: limitCheck.error });
      return {
        success: false,
        orderId,
        status: 'FAILED',
        error: limitCheck.error || 'MAX_DAILY_ORDERS or MAX_DAILY_SPEND_USD exceeded',
      };
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PURCHASING' },
    });
    const ts = new Date().toISOString();
    logger.info('[FULFILLMENT] START', { orderId, timestamp: ts });

    const shippingObj = this.parseShippingAddress(order.shippingAddress);
    if (!shippingObj) {
      await this.markFailed(orderId, 'Invalid shipping address');
      return { success: false, orderId, status: 'FAILED', error: 'Invalid shipping address' };
    }

    const productUrl = order.productUrl || '';
    if (!productUrl) {
      await this.markFailed(orderId, 'Product URL missing');
      return { success: false, orderId, status: 'FAILED', error: 'Product URL missing' };
    }

    const fullName = order.customerName || shippingObj.fullName || 'Customer';
    const shippingAddr = {
      fullName,
      addressLine1: shippingObj.addressLine1 || '',
      addressLine2: shippingObj.addressLine2 || '',
      city: shippingObj.city || '',
      state: shippingObj.state || '',
      zipCode: shippingObj.zipCode || '',
      country: shippingObj.country || 'US',
      phoneNumber: shippingObj.phoneNumber || '',
    };

    // Verificación por capital libre: freeCapital >= orderCost (saldo real − capital comprometido)
    const purchaseCost = Number(order.price) || 0;
    if (purchaseCost > 0) {
      const capitalCheck = await hasSufficientFreeCapital(purchaseCost);
      if (!capitalCheck.sufficient) {
        const errMsg = `FAILED_INSUFFICIENT_FUNDS: ${capitalCheck.error || 'Insufficient free working capital'}`;
        await this.markFailed(orderId, errMsg);
        logger.warn('[ORDER-FULFILLMENT] Purchase blocked: insufficient free working capital', {
          orderId,
          required: capitalCheck.required,
          freeWorkingCapital: capitalCheck.freeWorkingCapital,
          realBalance: capitalCheck.snapshot.realAvailableBalance,
          committedCapital: capitalCheck.snapshot.committedCapital,
        });
        return {
          success: false,
          orderId,
          status: 'FAILED',
          error: errMsg,
        };
      }
      logger.info('[ORDER-FULFILLMENT] Free working capital verified', {
        orderId,
        required: capitalCheck.required,
        freeWorkingCapital: capitalCheck.freeWorkingCapital,
        realBalance: capitalCheck.snapshot.realAvailableBalance,
        committedCapital: capitalCheck.snapshot.committedCapital,
      });
    }

    try {
      const result = await purchaseRetryService.attemptPurchase(
        productUrl,
        1,
        Number(order.price) * 1.5,
        shippingAddr,
        undefined,
        orderId,
        order.userId ?? undefined
      );

      if (result.success && result.orderId && result.orderId !== 'SIMULATED_ORDER_ID') {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'PURCHASED',
            aliexpressOrderId: result.orderId,
            errorMessage: null,
          },
        });
        logger.info('[FULFILLMENT] PURCHASED', {
          orderId,
          aliexpressOrderId: result.orderId,
          timestamp: new Date().toISOString(),
        });
        // Crear Sale automática (comisión + payout) si el Order tiene userId
        logger.info('[AUTO_SALE_TRIGGER]', { orderId });
        try {
          const { saleService } = await import('./sale.service');
          await saleService.createSaleFromOrder(orderId);
        } catch (autoErr: any) {
          logger.warn('[FULFILLMENT] createSaleFromOrder failed (non-fatal)', { orderId, error: autoErr?.message });
        }
        return {
          success: true,
          orderId,
          aliexpressOrderId: result.orderId,
          status: 'PURCHASED',
        };
      }

      await this.markFailed(orderId, result.error || 'Purchase retry exhausted');
      return {
        success: false,
        orderId,
        status: 'FAILED',
        error: result.error,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      logger.error('[ORDER-FULFILLMENT] Exception', { orderId, error: msg });
      await this.markFailed(orderId, msg);
      return { success: false, orderId, status: 'FAILED', error: msg };
    }
  }

  private async markFailed(orderId: string, errorMessage: string): Promise<void> {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED', errorMessage },
    });
    logger.error('[FULFILLMENT] FAILED', {
      orderId,
      errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  private parseShippingAddress(str: string): Record<string, string> | null {
    try {
      const parsed = JSON.parse(str) as Record<string, any>;
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          fullName: String(parsed.fullName || parsed.name || ''),
          addressLine1: String(parsed.addressLine1 || parsed.line1 || parsed.address || ''),
          addressLine2: parsed.addressLine2 || parsed.line2 || '',
          city: String(parsed.city || ''),
          state: String(parsed.state || ''),
          zipCode: String(parsed.zipCode || parsed.zip || ''),
          country: String(parsed.country || 'US'),
          phoneNumber: String(parsed.phoneNumber || parsed.phone || ''),
        };
      }
    } catch {
      // Simple format: "123 Main St, Miami, FL, US"
      const parts = str.split(',').map((s) => s.trim());
      if (parts.length >= 4) {
        return {
          fullName: '',
          addressLine1: parts[0],
          addressLine2: '',
          city: parts[1],
          state: parts[2],
          country: parts[3],
          zipCode: '',
          phoneNumber: '',
        };
      }
    }
    return null;
  }
}

export const orderFulfillmentService = new OrderFulfillmentService();
