/**
 * Order Fulfillment Service - Payment confirmed ? Create Order ? Execute AliExpress purchase
 * Pipeline: PAID ? PURCHASING ? PURCHASED | FAILED
 *
 * SHIPPING ORIGIN (Phase 39): Dropshipping only — supplier ships directly to buyer.
 * Do NOT use Chile (or any non-US address) as ship-from when updating eBay. If eBay
 * returns "ship from address must be in the United States", do NOT use eBay label;
 * mark as shipped externally using AliExpress tracking.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { purchaseRetryService } from './purchase-retry.service';
import { checkDailyLimits } from './daily-limits.service';
import { hasSufficientFreeCapital } from './working-capital.service';
import { maybeEscalateFailedOrderToManual } from './manual-fulfillment.service';

export type OrderStatus =
  | 'CREATED'
  | 'PAID'
  | 'PURCHASING'
  | 'PURCHASED'
  | 'FAILED'
  | 'SIMULATED'
  | 'MANUAL_ACTION_REQUIRED'
  | 'FULFILLMENT_BLOCKED';

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
  async fulfillOrder(orderId: string, options?: { preferredSkuId?: string }): Promise<FulfillOrderResult> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      logger.error('[ORDER-FULFILLMENT] Order not found', { orderId });
      return { success: false, orderId, status: 'FAILED', error: 'Order not found' };
    }
    // Phase 39: Avoid duplicate purchase — only PAID orders proceed
    if (order.status === 'PURCHASED' || order.status === 'PURCHASING') {
      logger.warn('[ORDER-FULFILLMENT] Order already processed or in progress', { orderId, status: order.status });
      return {
        success: false,
        orderId,
        status: order.status as OrderStatus,
        error: `Order already ${order.status}; skip duplicate purchase`,
      };
    }
    // Phase 47B: allow automatic retry from manual queue (user or daily job sets PAID first; also accept direct call)
    const canFulfillFromManual =
      order.status === 'MANUAL_ACTION_REQUIRED' || order.status === 'FULFILLMENT_BLOCKED';
    if (order.status !== 'PAID' && !canFulfillFromManual) {
      logger.warn('[ORDER-FULFILLMENT] Order not in PAID / manual-queue status', { orderId, status: order.status });
      return {
        success: false,
        orderId,
        status: order.status as OrderStatus,
        error: `Order must be PAID or MANUAL_ACTION_REQUIRED, got ${order.status}`,
      };
    }
    if (canFulfillFromManual) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          errorMessage: null,
        },
      });
      logger.info('[ORDER-FULFILLMENT] Phase 47B: resumed from manual queue to PAID for purchase attempt', { orderId });
    }
    if (order.userId == null) {
      logger.warn('[ORDER-FULFILLMENT] Order has no userId; Dropshipping API will not be used', { orderId });
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

    const shippingObj = this.parseShippingAddress(order.shippingAddress);
    if (!shippingObj) {
      await this.markFailed(orderId, 'Invalid shipping address', order.userId ?? undefined);
      return { success: false, orderId, status: 'FAILED', error: 'Invalid shipping address' };
    }

    let productUrl = (order.productUrl || '').trim();
    if (!productUrl && order.productId) {
      const product = await prisma.product.findUnique({
        where: { id: order.productId },
        select: { aliexpressUrl: true },
      });
      const url = (product?.aliexpressUrl || '').trim();
      if (url) {
        productUrl = url;
        await prisma.order.update({
          where: { id: orderId },
          data: { productUrl: url },
        });
        logger.info('[ORDER-FULFILLMENT] Resolved productUrl from Product.aliexpressUrl', { orderId, productId: order.productId });
      }
    }
    if (!productUrl && order.productId) {
      const listing = await prisma.marketplaceListing.findFirst({
        where: {
          productId: order.productId,
          marketplace: 'ebay',
          ...(order.userId != null ? { userId: order.userId } : {}),
        },
        select: { supplierUrl: true },
      });
      const url = (listing?.supplierUrl || '').trim();
      if (url) {
        productUrl = url;
        await prisma.order.update({
          where: { id: orderId },
          data: { productUrl: url },
        });
        logger.info('[ORDER-FULFILLMENT] Resolved productUrl from MarketplaceListing.supplierUrl', { orderId, productId: order.productId });
      }
    }
    if (!productUrl) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'PAID', errorMessage: 'Falta la URL de AliExpress. Añádela en el producto vinculado o en Compras pendientes.' },
      });
      return {
        success: false,
        orderId,
        status: 'PAID',
        error: 'Falta la URL de AliExpress. Añádela en el producto vinculado a esta orden o en Compras pendientes y vuelve a forzar la compra.',
      };
    }

    // Validación temprana para Dropshipping API: la URL debe permitir extraer productId (ej: .../item/1234567890.html)
    if (order.userId != null && !/[\/_](\d+)\.html/.test(productUrl)) {
      const errMsg =
        'La URL de AliExpress no es válida para compra automática. Debe ser un enlace de producto (ej: .../item/1234567890.html).';
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'FAILED', errorMessage: errMsg },
      });
      logger.warn('[ORDER-FULFILLMENT] Invalid productUrl for Dropshipping API', { orderId, productUrlPrefix: productUrl.substring(0, 60) });
      return {
        success: false,
        orderId,
        status: 'FAILED',
        error: errMsg,
      };
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PURCHASING' },
    });
    const ts = new Date().toISOString();
    logger.info('[FULFILLMENT] START', { orderId, timestamp: ts, action: 'fulfill_order', status: 'PURCHASING' });

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
        await this.markFailed(orderId, errMsg, order.userId ?? undefined);
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

    /** Timeout so the HTTP request does not hang indefinitely (e.g. AliExpress API/browser stuck). */
    const FULFILLMENT_TIMEOUT_MS = 300_000; // 300s — getProductInfo (retries + failover) + placeOrder with retries; AliExpress API can be slow
    const timeoutMessage =
      'Fulfillment timeout: la compra tardó demasiado. Comprueba el estado en AliExpress o inténtalo de nuevo.';
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), FULFILLMENT_TIMEOUT_MS);
    });

    let preferredSkuId: string | undefined = options?.preferredSkuId?.trim();
    if (!preferredSkuId && order.productId) {
      const product = await prisma.product.findUnique({
        where: { id: order.productId },
        select: { aliexpressSku: true },
      });
      if (product?.aliexpressSku?.trim()) {
        preferredSkuId = product.aliexpressSku.trim();
        logger.info('[ORDER-FULFILLMENT] Using Product.aliexpressSku for placeOrder', { orderId, preferredSkuId });
      }
    }
    if (preferredSkuId && options?.preferredSkuId) {
      logger.info('[ORDER-FULFILLMENT] Using rescued preferredSkuId for placeOrder', { orderId, preferredSkuId });
    }

    logger.info('[ORDER-FULFILLMENT] Calling attemptPurchase', {
      orderId,
      userId: order.userId ?? null,
      productUrlPrefix: productUrl.substring(0, 80),
      hasPreferredSkuId: !!preferredSkuId,
    });

    try {
      const result = await Promise.race([
        purchaseRetryService.attemptPurchase(
          productUrl,
          1,
          Number(order.price) * 1.5,
          shippingAddr,
          undefined,
          orderId,
          order.userId ?? undefined,
          preferredSkuId
        ),
        timeoutPromise,
      ]);

      if (result.success && result.orderId && result.orderId !== 'SIMULATED_ORDER_ID') {
        const updateData: Record<string, any> = {
          status: 'PURCHASED',
          aliexpressOrderId: result.orderId,
          errorMessage: null,
          manualFulfillmentRequired: false,
          failureReason: null,
        };
        if (result.usedProductUrl?.trim()) {
          updateData.productUrl = result.usedProductUrl.trim();
          logger.info('[FULFILLMENT] Updating order.productUrl to alternative product used for purchase', {
            orderId,
            usedProductUrl: result.usedProductUrl.substring(0, 80),
          });
          if (order.productId) {
            try {
              await prisma.product.update({
                where: { id: order.productId },
                data: { aliexpressUrl: result.usedProductUrl.trim() },
              });
              logger.info('[FULFILLMENT] Updated Product.aliexpressUrl to alternative', {
                orderId,
                productId: order.productId,
              });
            } catch (productErr: any) {
              logger.warn('[FULFILLMENT] Failed to update Product.aliexpressUrl (non-fatal)', {
                orderId,
                productId: order.productId,
                error: productErr?.message,
              });
            }
          }
        }
        await prisma.order.update({
          where: { id: orderId },
          data: updateData,
        });
        logger.info('[FULFILLMENT] PURCHASED', {
          orderId,
          aliexpressOrderId: result.orderId,
          usedProductUrl: result.usedProductUrl ?? undefined,
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

      await this.markFailed(orderId, result.error || 'Purchase retry exhausted', order.userId ?? undefined);
      const st = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      return {
        success: false,
        orderId,
        status: (st?.status as OrderStatus) || 'FAILED',
        error: result.error,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isTimeout = msg === timeoutMessage;
      logger.error('[ORDER-FULFILLMENT] Exception', {
        orderId,
        error: msg,
        timestamp: new Date().toISOString(),
        isTimeout,
      });
      await this.markFailed(orderId, msg, order.userId ?? undefined);
      const st = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      return {
        success: false,
        orderId,
        status: (st?.status as OrderStatus) || 'FAILED',
        error: msg,
      };
    }
  }

  private async markFailed(orderId: string, errorMessage: string, userId?: number | null): Promise<void> {
    const now = new Date();
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED', errorMessage, lastAttemptAt: now },
    });
    const timestamp = now.toISOString();
    logger.error('[FULFILLMENT] FAILED', {
      orderId,
      errorMessage,
      timestamp,
      action: 'manual_fallback',
    });

    await maybeEscalateFailedOrderToManual(orderId, errorMessage, userId);

    const after = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (after?.status === 'MANUAL_ACTION_REQUIRED') {
      logger.warn('[PHASE47B] order_moved_to_manual_queue', { orderId });
      return;
    }

    if (userId) {
      try {
        const { notificationService } = await import('./notification.service');
        await notificationService.sendToUser(userId, {
          type: 'SYSTEM_ALERT',
          title: 'Action required: order pending fulfillment',
          message: `Order ${orderId} could not be fulfilled automatically. ${errorMessage}. Please complete it manually in Compras pendientes.`,
          data: { orderId, errorMessage },
          priority: 'HIGH',
          category: 'SYSTEM',
        });
      } catch (notifErr: any) {
        logger.warn('[FULFILLMENT] Failed to send notification', { orderId, error: notifErr?.message });
      }
    }
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
