/**
 * Orders Routes - GET /api/orders, GET /api/orders/:id, POST /api/orders/:id/retry-fulfill
 * Post-sale dropshipping orders (PayPal ? AliExpress fulfillment)
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import logger from '../../config/logger';
import { authenticate } from '../../middleware/auth.middleware';
import { orderFulfillmentService } from '../../services/order-fulfillment.service';
import { hasSufficientFreeCapital } from '../../services/working-capital.service';
import { toNumber } from '../../utils/decimal.utils';

const router = Router();

const FAILED_INSUFFICIENT_FUNDS = 'FAILED_INSUFFICIENT_FUNDS';
const MAX_RETRIES = 3;

router.use(authenticate);

/**
 * Normalize shipping address to Order format (matches webhooks.routes.ts shape).
 */
function normalizeShippingAddress(addr: any, buyerName?: string | null): Record<string, string> {
  if (!addr || typeof addr !== 'object') {
    return {
      fullName: buyerName || 'Buyer',
      addressLine1: 'Address not provided',
      addressLine2: '',
      city: 'City not provided',
      state: 'State not provided',
      zipCode: '00000',
      country: 'US',
      phoneNumber: '0000000000',
    };
  }
  return {
    fullName: addr.fullName || addr.name || buyerName || 'Buyer',
    addressLine1: addr.addressLine1 || addr.street || addr.address_line || addr.line1 || '',
    addressLine2: addr.addressLine2 || addr.line2 || '',
    city: addr.city || '',
    state: addr.state || addr.stateOrProvince || '',
    zipCode: addr.zipCode || addr.zip || addr.postal_code || addr.postalCode || '',
    country: addr.country || addr.countryCode || 'US',
    phoneNumber: addr.phoneNumber || addr.phone || '',
  };
}

/**
 * POST /api/orders/import-ebay-order
 * Manual ingestion of an eBay order when webhook did not fire or failed.
 * Idempotent: if order with paypalOrderId "ebay:{ebayOrderId}" exists, returns it.
 */
router.post('/import-ebay-order', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as Record<string, any>;
    const ebayOrderId = typeof body.ebayOrderId === 'string' ? body.ebayOrderId.trim() : '';
    const listingIdRaw = body.listingId ?? body.itemId ?? '';
    const listingId = typeof listingIdRaw === 'string' ? listingIdRaw.trim() : String(listingIdRaw);
    const amount = Number(body.amount) || 0;
    const buyerName = typeof body.buyerName === 'string' ? body.buyerName.trim() : '';
    const buyerEmail = typeof body.buyerEmail === 'string' ? body.buyerEmail.trim() : null;
    const shippingAddress = body.shippingAddress;
    const productIdParam = body.productId != null ? Number(body.productId) : null;

    if (!ebayOrderId) return res.status(400).json({ error: 'ebayOrderId is required' });
    if (!isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

    const paypalOrderId = `ebay:${ebayOrderId}`;
    const existing = await prisma.order.findFirst({
      where: { paypalOrderId },
      select: { id: true, status: true, productId: true, userId: true },
    });
    if (existing) {
      if (existing.userId !== userId) return res.status(403).json({ error: 'Not authorized to view this order' });
      logger.info('[ORDERS] import-ebay-order idempotent', { ebayOrderId, orderId: existing.id });
      const full = await prisma.order.findUnique({ where: { id: existing.id } });
      return res.status(200).json({ order: full, created: false });
    }

    let product: { id: number; title: string; aliexpressUrl: string | null; userId: number } | null = null;
    let listing: { productId: number; userId: number } | null = null;

    if (listingId) {
      listing = await prisma.marketplaceListing.findFirst({
        where: { marketplace: 'ebay', listingId },
        select: { productId: true, userId: true },
      });
      if (listing && listing.userId !== userId) listing = null;
    }
    if (listing) {
      product = await prisma.product.findUnique({
        where: { id: listing.productId },
        select: { id: true, title: true, aliexpressUrl: true, userId: true },
      });
    }
    if (!product && productIdParam != null && !Number.isNaN(productIdParam)) {
      product = await prisma.product.findFirst({
        where: { id: productIdParam, userId },
        select: { id: true, title: true, aliexpressUrl: true, userId: true },
      });
    }
    if (!product) {
      return res.status(400).json({
        error: listingId
          ? 'No eBay listing or product found for the given listingId/itemId. Provide a valid productId if the listing is not in the system.'
          : 'productId or listingId/itemId is required',
      });
    }

    let productUrl = (product.aliexpressUrl || '').trim();
    if (!productUrl) {
      const ref = await prisma.product.findUnique({
        where: { id: product.id },
        select: { aliexpressUrl: true },
      });
      productUrl = (ref?.aliexpressUrl || '').trim();
    }
    if (!productUrl) {
      return res.status(400).json({
        error: `Product ${product.id} has no AliExpress URL. Set aliexpressUrl on the product to enable fulfillment.`,
      });
    }

    const normalizedAddr = normalizeShippingAddress(shippingAddress, buyerName || undefined);
    const shippingAddressStr = JSON.stringify(normalizedAddr);

    const order = await prisma.order.create({
      data: {
        userId,
        productId: product.id,
        title: product.title,
        price: amount,
        currency: 'USD',
        customerName: normalizedAddr.fullName,
        customerEmail: buyerEmail || 'buyer@unknown.com',
        shippingAddress: shippingAddressStr,
        status: 'PAID',
        paypalOrderId,
        productUrl,
      },
    });

    logger.info('[ORDERS] import-ebay-order created', { ebayOrderId, orderId: order.id, userId });
    return res.status(201).json({ order, created: true });
  } catch (err: any) {
    logger.error('[ORDERS] import-ebay-order failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Import failed' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    const envParam = (req.query.environment as string)?.toLowerCase();
    const environment = envParam === 'sandbox' ? 'sandbox' : envParam === 'production' ? 'production' : undefined;

    let whereClause: { userId?: number; id?: { in: string[] } } = isAdmin ? {} : { userId: userId! };

    if (environment) {
      const saleWhere: { environment: string; userId?: number } = { environment };
      if (!isAdmin && userId != null) {
        saleWhere.userId = userId;
      }
      const sales = await prisma.sale.findMany({
        where: saleWhere,
        select: { orderId: true },
      });
      const orderIds = sales.map((s) => s.orderId).filter(Boolean) as string[];
      if (orderIds.length === 0) {
        return res.status(200).json([]);
      }
      whereClause = { ...whereClause, id: { in: orderIds } };
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.status(200).json(orders);
  } catch (err: any) {
    logger.error('[ORDERS] List failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Failed to list orders' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    if (!isAdmin && order.userId != null && order.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }
    return res.status(200).json(order);
  } catch (err: any) {
    logger.error('[ORDERS] Get failed', { error: err?.message, id: req.params.id });
    return res.status(500).json({ error: err?.message || 'Failed to get order' });
  }
});

/**
 * POST /api/orders/:id/retry-fulfill
 * Retry fulfillment for an order that failed due to insufficient funds.
 * Requires authentication. Order must be FAILED with FAILED_INSUFFICIENT_FUNDS and fulfillRetryCount < 3.
 */
router.post('/:id/retry-fulfill', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const userId = req.user!.userId;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status !== 'FAILED') {
      return res.status(400).json({
        error: 'Order is not in FAILED status',
        status: order.status,
      });
    }
    if (!order.errorMessage?.includes(FAILED_INSUFFICIENT_FUNDS)) {
      return res.status(400).json({
        error: 'Order did not fail due to insufficient funds; retry not applicable',
      });
    }
    if (order.fulfillRetryCount >= MAX_RETRIES) {
      return res.status(400).json({
        error: `Maximum retry count (${MAX_RETRIES}) reached for this order`,
        fulfillRetryCount: order.fulfillRetryCount,
      });
    }
    if (order.userId != null && userId != null && order.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to retry this order' });
    }

    const cost = toNumber(order.price) || 0;
    if (cost <= 0) {
      return res.status(400).json({ error: 'Invalid order price' });
    }
    const capitalCheck = await hasSufficientFreeCapital(cost);
    if (!capitalCheck.sufficient) {
      return res.status(400).json({
        error: 'Insufficient funds to retry. Deposit more to the platform PayPal account.',
        freeWorkingCapital: capitalCheck.freeWorkingCapital,
        required: capitalCheck.required,
      });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        errorMessage: null,
        fulfillRetryCount: order.fulfillRetryCount + 1,
      },
    });

    const fulfillResult = await orderFulfillmentService.fulfillOrder(orderId);
    return res.status(200).json({
      success: fulfillResult.status === 'PURCHASED',
      orderId,
      status: fulfillResult.status,
      error: fulfillResult.error,
      aliexpressOrderId: fulfillResult.aliexpressOrderId,
    });
  } catch (err: any) {
    logger.error('[ORDERS] Retry fulfill failed', { error: err?.message, id: req.params.id });
    return res.status(500).json({ error: err?.message || 'Retry fulfill failed' });
  }
});

/**
 * POST /api/orders/:id/submit-tracking
 * Phase 41: Manual tracking submission — user bought from supplier manually, submits tracking to resume flow.
 * Updates Order (PURCHASED), Sale (trackingNumber, SHIPPED), and sends tracking to eBay if applicable.
 */
router.post('/:id/submit-tracking', async (req: Request, res: Response) => {
  try {
    const orderId = (req.params.id || '').trim();
    const userId = req.user!.userId;
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    const body = req.body as { trackingNumber?: string };
    const trackingNumber = typeof body?.trackingNumber === 'string' ? body.trackingNumber.trim() : '';

    if (!orderId) return res.status(400).json({ error: 'Order ID required' });
    if (!trackingNumber) return res.status(400).json({ error: 'trackingNumber is required' });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, paypalOrderId: true, aliexpressOrderId: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!isAdmin && order.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PURCHASED',
        aliexpressOrderId: order.aliexpressOrderId || 'manual',
        errorMessage: null,
      },
    });

    const sale = await prisma.sale.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (sale) {
      await prisma.sale.update({
        where: { id: sale.id },
        data: { trackingNumber, status: 'SHIPPED' },
      });
    }

    const paypalOrderId = (order.paypalOrderId || '').trim();
    if (paypalOrderId.startsWith('ebay:') && order.userId) {
      const ebayOrderId = paypalOrderId.slice(5).trim();
      if (ebayOrderId) {
        const { submitTrackingToEbay } = await import('../../services/ebay-fulfillment.service');
        const result = await submitTrackingToEbay({
          userId: order.userId,
          ebayOrderId,
          trackingNumber,
        });
        if (!result.success) {
          logger.warn('[ORDERS] submit-tracking: eBay update failed', { orderId, error: result.error });
        }
      }
    }

    logger.info('[ORDERS] Manual tracking submitted', { orderId, trackingNumber });
    return res.status(200).json({
      success: true,
      orderId,
      trackingNumber,
      saleUpdated: !!sale,
    });
  } catch (err: any) {
    logger.error('[ORDERS] submit-tracking failed', { error: err?.message, id: req.params.id });
    return res.status(500).json({ error: err?.message || 'Submit tracking failed' });
  }
});

export default router;
