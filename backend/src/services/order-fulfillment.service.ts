/**
 * Order Fulfillment Service - Payment confirmed ? Create Order ? Execute AliExpress purchase
 * Pipeline: PAID ? PURCHASING ? PURCHASED | FAILED
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { aliexpressCheckoutService } from './aliexpress-checkout.service';

export type OrderStatus = 'CREATED' | 'PAID' | 'PURCHASING' | 'PURCHASED' | 'FAILED';

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

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PURCHASING' },
    });
    logger.info('[ORDER-FULFILLMENT] Status ? PURCHASING', { orderId });

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
    try {
      const result = await aliexpressCheckoutService.placeOrder({
        productUrl,
        quantity: 1,
        maxPrice: Number(order.price) * 1.5, // Allow some margin
        shippingAddress: {
          fullName,
          addressLine1: shippingObj.addressLine1 || '',
          addressLine2: shippingObj.addressLine2 || '',
          city: shippingObj.city || '',
          state: shippingObj.state || '',
          zipCode: shippingObj.zipCode || '',
          country: shippingObj.country || 'US',
          phoneNumber: shippingObj.phoneNumber || '',
        },
      });

      if (result.success && result.orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'PURCHASED',
            aliexpressOrderId: result.orderId,
            errorMessage: null,
          },
        });
        logger.info('[ORDER-FULFILLMENT] PURCHASED', { orderId, aliexpressOrderId: result.orderId });
        return {
          success: true,
          orderId,
          aliexpressOrderId: result.orderId,
          status: 'PURCHASED',
        };
      }

      await this.markFailed(orderId, result.error || 'AliExpress purchase failed');
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
    logger.error('[ORDER-FULFILLMENT] FAILED', { orderId, errorMessage });
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
