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
import MarketplaceService from '../../services/marketplace.service';
import { EbayService, EbayCredentials } from '../../services/ebay.service';
import {
  upsertOrderFromEbayPayload,
  runMarketplaceOrderSyncForUser,
  getLastMarketplaceSyncAt,
  setLastMarketplaceSyncAt,
} from '../../services/marketplace-order-sync.service';
import { syncMercadoLibreOrdersForUser } from '../../services/mercadolibre-order-sync.service';
import { syncAmazonOrdersForUser } from '../../services/amazon-order-sync.service';
import { buildRealOrdersWhere, REAL_ORDERS_EXCLUDE_PAYPAL_PREFIXES } from '../../utils/orders-real-filter';

const marketplaceService = new MarketplaceService();

const router = Router();

const FAILED_INSUFFICIENT_FUNDS = 'FAILED_INSUFFICIENT_FUNDS';
const MAX_RETRIES = 3;

router.use(authenticate);

/** GET /api/orders/sync-status — Last marketplace order sync time (eBay/ML/Amazon). */
router.get('/sync-status', async (_req: Request, res: Response) => {
  try {
    const lastSyncAt = getLastMarketplaceSyncAt();
    res.json({
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      source: 'marketplace-order-sync',
    });
  } catch (err: any) {
    logger.error('[ORDERS] sync-status failed', { error: err?.message });
    res.status(500).json({ error: err?.message ?? 'Failed' });
  }
});

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

/**
 * POST /api/orders/fetch-ebay-order
 * Fetch a single eBay order by ID from the API and upsert into DB; if new and mapeada, trigger fulfillment.
 * Body: { ebayOrderId: "12-11320-43716" }. Idempotent by paypalOrderId.
 */
router.post('/fetch-ebay-order', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { ebayOrderId?: string };
    const ebayOrderId = typeof body?.ebayOrderId === 'string' ? body.ebayOrderId.trim() : '';
    if (!ebayOrderId) return res.status(400).json({ error: 'ebayOrderId is required' });

    const credsResult = await marketplaceService.getCredentials(userId, 'ebay', 'production');
    if (!credsResult?.isActive || !credsResult?.credentials) {
      return res.status(400).json({
        error:
          'eBay production credentials not found or inactive. Connect your eBay account in Ajustes → APIs to sync and fetch orders.',
      });
    }

    const ebayService = new EbayService({
      ...(credsResult.credentials as EbayCredentials),
      sandbox: false,
    });
    const ebayOrder = await ebayService.getOrderById(ebayOrderId);

    const upserted = await upsertOrderFromEbayPayload(userId, ebayOrder, 'production');
    const fullOrder = await prisma.order.findUnique({
      where: { id: upserted.order.id },
    });
    if (!fullOrder) {
      return res.status(500).json({ error: 'Order created but not found' });
    }

    let fulfilled = false;
    if (upserted.created && upserted.hasProductUrl && fullOrder.status === 'PAID') {
      const fulfillResult = await orderFulfillmentService.fulfillOrder(fullOrder.id);
      fulfilled = fulfillResult.success;
      logger.info('[ORDERS] fetch-ebay-order triggered fulfill', {
        orderId: fullOrder.id,
        ebayOrderId,
        success: fulfillResult.success,
        error: fulfillResult.error,
      });
    }

    return res.status(upserted.created ? 201 : 200).json({
      order: fullOrder,
      created: upserted.created,
      fulfilled,
    });
  } catch (err: any) {
    const is404 = err?.statusCode === 404 || err?.message?.includes('not found');
    const code = is404 ? 404 : 500;
    logger.error('[ORDERS] fetch-ebay-order failed', { error: err?.message });
    const message = is404
      ? 'Pedido no encontrado en eBay. Comprueba el ID (debe ser exactamente el del Centro de ventas de eBay, p. ej. 17-11370-63716).'
      : (err?.message || 'Fetch failed');
    return res.status(code).json({ error: message });
  }
});

/**
 * POST /api/orders/sync-marketplace — Phase 44: Force order sync for the current user (eBay, Mercado Libre, Amazon).
 * Fetches orders from each connected marketplace, upserts into Order table.
 * Optional body: { ebayOrderId?: "17-11370-63716" } to verify that order exists after sync.
 */
router.post('/sync-marketplace', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ebayResults = await runMarketplaceOrderSyncForUser(userId, 'production');
    const mlResult = await syncMercadoLibreOrdersForUser(userId, 'production');
    const amazonResult = await syncAmazonOrdersForUser(userId, 'production');

    setLastMarketplaceSyncAt();
    const lastSyncAt = getLastMarketplaceSyncAt();

    const results = [
      ...ebayResults.map((r) => ({ ...r, createdUnmapped: r.createdUnmapped ?? 0 })),
      {
        marketplace: mlResult.marketplace,
        userId: mlResult.userId,
        fetched: mlResult.fetched,
        created: mlResult.created,
        skipped: mlResult.skipped,
        createdUnmapped: 0,
        errors: mlResult.errors ?? [],
      },
      {
        marketplace: amazonResult.marketplace,
        userId: amazonResult.userId,
        fetched: amazonResult.fetched,
        created: amazonResult.created,
        skipped: amazonResult.skipped,
        createdUnmapped: 0,
        errors: amazonResult.errors ?? [],
      },
    ];

    const ebayOrderIdToVerify = (req.body as any)?.ebayOrderId ?? (req.query as any).ebayOrderId;
    let verifiedOrder: { orderId: string; status: string; exists: boolean } | null = null;
    if (ebayOrderIdToVerify && typeof ebayOrderIdToVerify === 'string') {
      const id = ebayOrderIdToVerify.trim();
      if (id) {
        const order = await prisma.order.findFirst({
          where: { paypalOrderId: `ebay:${id}` },
          select: { id: true, status: true },
        });
        verifiedOrder = order ? { orderId: order.id, status: order.status, exists: true } : { orderId: id, status: '', exists: false };
        logger.info('[ORDERS] sync-marketplace verify', { ebayOrderId: id, exists: !!order, orderId: order?.id });
      }
    }

    const totalFetched = results.reduce((s, r) => s + (r.fetched ?? 0), 0);
    const totalCreated = results.reduce((s, r) => s + (r.created ?? 0) + (r.createdUnmapped ?? 0), 0);
    const syncErrors: string[] = [];
    for (const r of results) {
      if (r.errors?.length) syncErrors.push(...r.errors.slice(0, 3));
    }

    const credsError = (e: string) => /credentials not found|not found or inactive/i.test(String(e));
    const noEbayCredentials =
      ebayResults.length === 0 || ebayResults.some((r) => r.errors?.some(credsError));
    const noMercadoLibreCredentials = mlResult.errors?.some(credsError) ?? false;
    const noAmazonCredentials = amazonResult.errors?.some(credsError) ?? false;

    const payload = {
      ok: true,
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      totalFetched,
      totalCreated,
      noEbayCredentials,
      noMercadoLibreCredentials,
      noAmazonCredentials,
      syncErrors: syncErrors.length ? syncErrors : undefined,
      results: results.map((r) => ({
        marketplace: r.marketplace,
        userId: r.userId,
        fetched: r.fetched,
        created: r.created,
        skipped: r.skipped,
        createdUnmapped: r.createdUnmapped,
        errors: r.errors,
      })),
      ...(verifiedOrder ? { verifiedOrder } : {}),
    };
    return res.json(payload);
  } catch (err: any) {
    logger.error('[ORDERS] sync-marketplace failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Sync failed' });
  }
});

/**
 * GET /api/orders — List only REAL marketplace orders (Phase 44: eBay, Mercado Libre, Amazon).
 * Excludes test/demo/mock and checkout; only paypalOrderId starting with ebay:, mercadolibre:, or amazon:.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    const limitParam = req.query.limit;
    const effectiveTake =
      limitParam != null ? Math.min(100, Math.max(1, parseInt(String(limitParam), 10) || 100)) : 100;

    const baseWhere = isAdmin ? {} : { userId: userId! };
    const realOnlyWhere = buildRealOrdersWhere(baseWhere);

    const orders = await prisma.order.findMany({
      where: realOnlyWhere,
      orderBy: { createdAt: 'desc' },
      take: effectiveTake,
    });
    return res.status(200).json(orders);
  } catch (err: any) {
    logger.error('[ORDERS] List failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Failed to list orders' });
  }
});

/**
 * GET /api/orders/by-ebay-id/:ebayOrderId — Find order by marketplace (eBay) order ID.
 * Used to validate visibility of a specific sale (e.g. 17-14370-63716).
 */
router.get('/by-ebay-id/:ebayOrderId', async (req: Request, res: Response) => {
  try {
    const ebayOrderId = (req.params.ebayOrderId || '').trim();
    if (!ebayOrderId) return res.status(400).json({ error: 'ebayOrderId required' });
    const paypalOrderId = `ebay:${ebayOrderId}`;
    const order = await prisma.order.findFirst({
      where: { paypalOrderId },
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found', ebayOrderId });
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    if (!isAdmin && order.userId != null && order.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }
    const sale = await prisma.sale.findUnique({ where: { orderId: order.id }, select: { id: true, status: true, trackingNumber: true } });
    return res.status(200).json({
      ...order,
      marketplaceOrderId: ebayOrderId,
      sale: sale ? { id: sale.id, status: sale.status, trackingNumber: sale.trackingNumber } : null,
    });
  } catch (err: any) {
    logger.error('[ORDERS] Get by eBay ID failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Failed' });
  }
});

/**
 * POST /api/orders/by-ebay-id/:ebayOrderId/force-fulfill — Phase 44: Trigger fulfillment for one order by eBay ID.
 * Finds order by paypalOrderId = ebay:{ebayOrderId}, then calls orderFulfillmentService.fulfillOrder(order.id).
 */
router.post('/by-ebay-id/:ebayOrderId/force-fulfill', async (req: Request, res: Response) => {
  try {
    const ebayOrderId = (req.params.ebayOrderId || '').trim();
    if (!ebayOrderId) return res.status(400).json({ error: 'ebayOrderId required' });
    const userId = req.user!.userId;
    const paypalOrderId = `ebay:${ebayOrderId}`;
    const order = await prisma.order.findFirst({
      where: { paypalOrderId },
      select: { id: true, status: true, userId: true, productUrl: true },
    });
    if (!order) {
      logger.warn('[ORDERS] force-fulfill: order not found', { ebayOrderId });
      return res.status(404).json({
        error: 'Order not found. Run sync first: POST /api/orders/sync-marketplace or use "Traer pedido desde eBay" with this ID.',
        ebayOrderId,
      });
    }
    if (order.userId != null && order.userId !== userId && req.user!.role?.toUpperCase() !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to fulfill this order' });
    }
    if (order.status === 'PURCHASED') {
      return res.status(200).json({
        success: true,
        orderId: order.id,
        ebayOrderId,
        status: 'PURCHASED',
        message: 'Order already fulfilled',
      });
    }
    if (order.status === 'PURCHASING') {
      return res.status(409).json({
        success: false,
        error:
          "La compra ya está en curso. Espera unos minutos y actualiza la página, o usa 'Cancelar compra en curso' para volver a intentar.",
        orderId: order.id,
        ebayOrderId,
        status: 'PURCHASING',
      });
    }
    if (order.status !== 'PAID') {
      return res.status(400).json({
        error: `Order status is ${order.status}. Only PAID orders can be fulfilled.`,
        orderId: order.id,
        status: order.status,
      });
    }
    if (order.userId == null) {
      await prisma.order.update({
        where: { id: order.id },
        data: { userId },
      });
      logger.info('[ORDERS] force-fulfill: set order userId', { orderId: order.id, userId });
    }
    const fulfill = await orderFulfillmentService.fulfillOrder(order.id);
    logger.info('[ORDERS] force-fulfill executed', {
      ebayOrderId,
      orderId: order.id,
      status: fulfill.status,
      success: fulfill.success,
      error: fulfill.error,
    });
    return res.status(200).json({
      success: fulfill.success,
      orderId: order.id,
      ebayOrderId,
      status: fulfill.status,
      aliexpressOrderId: fulfill.aliexpressOrderId,
      error: fulfill.error,
    });
  } catch (err: any) {
    logger.error('[ORDERS] force-fulfill failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Fulfillment failed' });
  }
});

function isTestOrderPaypalId(paypalOrderId: string | null): boolean {
  if (!paypalOrderId || !paypalOrderId.trim()) return false;
  const p = paypalOrderId.trim();
  return REAL_ORDERS_EXCLUDE_PAYPAL_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/** Normalize AliExpress URL to base form (optional). */
function normalizeAliExpressUrl(url: string): string {
  const u = url.trim();
  const m = u.match(/^(https?:\/\/(?:[a-z0-9-]+\.)?aliexpress\.com\/item\/(\d+)\.html)/i);
  if (m) return m[1];
  return u;
}

/**
 * PATCH /api/orders/:id/supplier-url
 * Set the supplier (AliExpress) URL for an order so "Forzar compra" can run.
 * When order has productId, also updates Product.aliexpressUrl and MarketplaceListing.supplierUrl.
 */
router.patch('/:id/supplier-url', async (req: Request, res: Response) => {
  try {
    const orderId = (req.params.id || '').trim();
    if (!orderId) return res.status(400).json({ error: 'Order id required' });
    const body = req.body as { url?: string };
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!rawUrl) return res.status(400).json({ error: 'url is required' });
    if (!/aliexpress\.com\/item\//i.test(rawUrl)) {
      return res.status(400).json({ error: 'URL must be an AliExpress product page (aliexpress.com/item/...)' });
    }
    const url = normalizeAliExpressUrl(rawUrl);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, productId: true, status: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    if (!isAdmin && order.userId != null && order.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Not authorized to update this order' });
    }

    const wasFailedMissingUrl = order.status === 'FAILED';
    await prisma.order.update({
      where: { id: orderId },
      data: {
        productUrl: url,
        errorMessage: null,
        ...(wasFailedMissingUrl ? { status: 'PAID' } : {}),
      },
    });

    if (order.productId != null) {
      await prisma.product.updateMany({
        where: { id: order.productId },
        data: { aliexpressUrl: url },
      });
      await prisma.marketplaceListing.updateMany({
        where: { productId: order.productId, marketplace: 'ebay' },
        data: { supplierUrl: url },
      });
    }

    logger.info('[ORDERS] supplier-url set', { orderId, productId: order.productId });
    const updated = await prisma.order.findUnique({ where: { id: orderId } });
    const pp = (updated?.paypalOrderId || '').trim();
    const marketplaceOrderId = pp.startsWith('ebay:') ? pp.slice(5) : pp.startsWith('mercadolibre:') ? pp.slice(13) : pp.startsWith('amazon:') ? pp.slice(7) : null;
    const sale = await prisma.sale.findUnique({ where: { orderId }, select: { id: true, status: true, trackingNumber: true } });
    return res.status(200).json({
      ...updated,
      marketplaceOrderId,
      sale: sale ? { id: sale.id, status: sale.status, trackingNumber: sale.trackingNumber } : null,
    });
  } catch (err: any) {
    logger.error('[ORDERS] supplier-url failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Failed to set supplier URL' });
  }
});

const PURCHASING_STALE_MS = 5 * 60 * 1000; // 5 min — auto-recover stuck PURCHASING

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    let order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (process.env.NODE_ENV === 'production' && isTestOrderPaypalId(order.paypalOrderId)) {
      return res.status(404).json({ error: 'Order not found' });
    }
    // Auto-recover orders stuck in PURCHASING for too long (e.g. process crashed before timeout)
    if (order.status === 'PURCHASING') {
      const updatedAtMs = order.updatedAt?.getTime() ?? 0;
      if (Date.now() - updatedAtMs > PURCHASING_STALE_MS) {
        const errMsg =
          'Compra en curso expirada (timeout). Usa "Forzar compra en AliExpress" para reintentar.';
        await prisma.order.update({
          where: { id },
          data: { status: 'FAILED', errorMessage: errMsg },
        });
        logger.info('[ORDERS] Auto-recovered stale PURCHASING order', { orderId: id, updatedAt: order.updatedAt });
        const refreshed = await prisma.order.findUnique({ where: { id } });
        if (refreshed) order = refreshed;
      }
    }
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    if (!isAdmin && order.userId != null && order.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }
    const pp = (order.paypalOrderId || '').trim();
    const marketplaceOrderId = pp.startsWith('ebay:') ? pp.slice(5) : pp.startsWith('mercadolibre:') ? pp.slice(13) : pp.startsWith('amazon:') ? pp.slice(7) : null;
    const sale = await prisma.sale.findUnique({ where: { orderId: order.id }, select: { id: true, status: true, trackingNumber: true } });
    return res.status(200).json({
      ...order,
      marketplaceOrderId,
      sale: sale ? { id: sale.id, status: sale.status, trackingNumber: sale.trackingNumber } : null,
    });
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
 * PATCH /api/orders/:id/reset-purchasing
 * Reset an order stuck in PURCHASING back to PAID so the user can use "Forzar compra en AliExpress" again.
 * Requires auth; user must be order owner or admin.
 */
router.patch('/:id/reset-purchasing', async (req: Request, res: Response) => {
  try {
    const orderId = (req.params.id || '').trim();
    const userId = req.user!.userId;
    const isAdmin = req.user!.role?.toUpperCase() === 'ADMIN';
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PURCHASING') {
      return res.status(400).json({
        error: 'Order is not in PURCHASING status',
        status: order.status,
      });
    }
    if (order.userId != null && order.userId !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to reset this order' });
    }
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAID', errorMessage: null },
    });
    logger.info('[ORDERS] reset-purchasing', { orderId, userId });
    return res.status(200).json(updated);
  } catch (err: any) {
    logger.error('[ORDERS] reset-purchasing failed', { error: err?.message, id: req.params.id });
    return res.status(500).json({ error: err?.message || 'Reset purchasing failed' });
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
    if (order.userId) {
      if (paypalOrderId.startsWith('ebay:')) {
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
      } else if (paypalOrderId.startsWith('mercadolibre:')) {
        const mlOrderId = paypalOrderId.slice(13).trim();
        if (mlOrderId) {
          const { submitTrackingToMercadoLibre } = await import('../../services/mercadolibre-fulfillment.service');
          const result = await submitTrackingToMercadoLibre({
            userId: order.userId,
            mlOrderId,
            trackingNumber,
          });
          if (!result.success) {
            logger.warn('[ORDERS] submit-tracking: Mercado Libre update failed', { orderId, error: result.error });
          }
        }
      } else if (paypalOrderId.startsWith('amazon:')) {
        const amazonOrderId = paypalOrderId.slice(7).trim();
        if (amazonOrderId) {
          const { submitTrackingToAmazon } = await import('../../services/amazon-fulfillment.service');
          const result = await submitTrackingToAmazon({
            userId: order.userId,
            amazonOrderId,
            trackingNumber,
          });
          if (!result.success) {
            logger.warn('[ORDERS] submit-tracking: Amazon update failed', { orderId, error: result.error });
          }
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
