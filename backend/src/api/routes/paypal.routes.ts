/**
 * PayPal Checkout Routes - Create Order, Capture Order, Webhook
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { PayPalCheckoutService } from '../../services/paypal-checkout.service';
import { orderFulfillmentService } from '../../services/order-fulfillment.service';
import { prisma } from '../../config/database';
import logger from '../../config/logger';
import { checkDailyLimits } from '../../services/daily-limits.service';
import { checkProfitGuard } from '../../services/profit-guard.service';

const router = Router();
const service = PayPalCheckoutService.fromEnv();

router.post('/create-order', async (req: Request, res: Response) => {
  if (!service) {
    return res.status(503).json({ success: false, error: 'PayPal not configured' });
  }
  try {
    const { amount, currency, productTitle, productUrl, returnUrl, cancelUrl } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await service.createOrder({
      amount: parseFloat(amount) || 0,
      currency: currency || 'USD',
      productTitle: productTitle || 'Order',
      productUrl: productUrl || undefined,
      returnUrl: returnUrl || `${baseUrl}/api/paypal/success`,
      cancelUrl: cancelUrl || `${baseUrl}/api/paypal/cancel`,
    });
    if (result.success && result.orderId) {
      return res.status(200).json({
        success: true,
        paypalOrderId: result.orderId,
        approveUrl: result.approveUrl,
      });
    }
    return res.status(400).json({ success: false, error: result.error });
  } catch (err: any) {
    logger.error('[PAYPAL] create-order failed', { error: err?.message });
    return res.status(500).json({ success: false, error: err?.message || 'Create order failed' });
  }
});

router.post('/capture-order', authenticate, async (req: Request, res: Response) => {
  if (!service) {
    return res.status(503).json({ success: false, error: 'PayPal not configured' });
  }
  try {
    const {
      orderId: paypalOrderId,
      productUrl,
      productTitle,
      price,
      currency,
      customerName,
      customerEmail,
      shippingAddress,
      supplierPriceUsd,
      productId: bodyProductId,
    } = req.body;
    if (!paypalOrderId) {
      return res.status(400).json({ success: false, error: 'orderId (PayPal token) required' });
    }
    const sellingPriceUsd = parseFloat(price) || 0;
    const limitCheck = await checkDailyLimits(undefined, sellingPriceUsd);
    if (!limitCheck.ok) {
      return res.status(429).json({ success: false, error: limitCheck.error });
    }
    const supplierUsd = typeof supplierPriceUsd === 'number' ? supplierPriceUsd : parseFloat(supplierPriceUsd) || 0;
    if (supplierUsd > 0) {
      const profitResult = checkProfitGuard({
        sellingPriceUsd,
        supplierPriceUsd: supplierUsd,
        taxUsd: 0,
        shippingUsd: 0,
      });
      if (!profitResult.allowed) {
        return res.status(400).json({
          success: false,
          error: profitResult.error || 'Profit guard: selling price must exceed supplier cost + fees',
        });
      }
    }
    const result = await service.captureOrder(paypalOrderId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    const shippingStr =
      typeof shippingAddress === 'string'
        ? shippingAddress
        : JSON.stringify(shippingAddress || {});
    const userId = req.user?.userId ?? undefined;
    const productId = bodyProductId != null ? Number(bodyProductId) : undefined;
    const order = await prisma.order.create({
      data: {
        userId: userId ?? undefined,
        productId: Number.isNaN(productId) ? undefined : productId,
        title: productTitle || 'Order',
        price: parseFloat(price) || 0,
        currency: currency || 'USD',
        customerName: customerName || 'Customer',
        customerEmail: customerEmail || result.payerEmail || '',
        shippingAddress: shippingStr,
        status: 'PAID',
        paypalOrderId,
        productUrl: productUrl || undefined,
      },
    });
    logger.info('[CAPTURE_ORDER]', {
      userId: userId ?? null,
      productId: Number.isNaN(productId) ? null : productId ?? null,
      orderId: order.id,
    });
    const fulfill = await orderFulfillmentService.fulfillOrder(order.id);
    return res.status(200).json({
      success: true,
      orderId: order.id,
      status: fulfill.status,
      aliexpressOrderId: fulfill.aliexpressOrderId,
    });
  } catch (err: any) {
    logger.error('[PAYPAL] capture-order failed', { error: err?.message });
    return res.status(500).json({ success: false, error: err?.message || 'Capture failed' });
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  if (!service) {
    return res.status(503).json({ success: false, error: 'PayPal not configured' });
  }
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const headers: Record<string, string> = {};
  Object.entries(req.headers).forEach(([k, v]) => {
    if (typeof v === 'string') headers[k.toLowerCase()] = v;
  });
  const verified = service.verifyWebhook(rawBody, headers);
  if (!verified) {
    return res.status(401).json({ success: false, error: 'Webhook verification failed' });
  }
  const body = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
  const eventType = body.event_type;
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
    logger.info('[PAYPAL] Webhook received', { eventType });
    // Trigger fulfillment from webhook payload if needed
  }
  return res.status(200).json({ received: true });
});

export default router;
