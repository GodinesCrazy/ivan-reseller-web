/**
 * PayPal Checkout Routes - Create Order, Capture Order, Webhook
 */

import { Router, Request, Response } from 'express';
import { PayPalCheckoutService } from '../../services/paypal-checkout.service';
import logger from '../../config/logger';

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
      return res.status(200).json({ success: true, orderId: result.orderId });
    }
    return res.status(400).json({ success: false, error: result.error });
  } catch (err: any) {
    logger.error('[PAYPAL] create-order failed', { error: err?.message });
    return res.status(500).json({ success: false, error: err?.message || 'Create order failed' });
  }
});

router.post('/capture-order', async (req: Request, res: Response) => {
  if (!service) {
    return res.status(503).json({ success: false, error: 'PayPal not configured' });
  }
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId required' });
    }
    const result = await service.captureOrder(orderId);
    if (result.success) {
      return res.status(200).json({
        success: true,
        orderId: result.orderId,
        status: result.status,
        payerEmail: result.payerEmail,
        captureId: result.captureId,
      });
    }
    return res.status(400).json({ success: false, error: result.error });
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
