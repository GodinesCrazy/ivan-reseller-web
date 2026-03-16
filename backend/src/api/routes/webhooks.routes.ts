import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { notificationService } from '../../services/notification.service';
import { createWebhookSignatureValidator } from '../../middleware/webhook-signature.middleware';
import { orderFulfillmentService } from '../../services/order-fulfillment.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import { CredentialsManager, clearCredentialsCache } from '../../services/credentials-manager.service';
import { decrypt } from '../../utils/encryption';

const router = Router();

/**
 * GET /api/webhooks/status
 * Returns whether webhook secrets are configured (for dashboard/circle checklist).
 * Does not expose secret values.
 */
router.get('/status', (_req: Request, res: Response) => {
  const ebaySecret = process.env.WEBHOOK_SECRET_EBAY?.trim();
  const mlSecret = process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim();
  const amazonSecret = process.env.WEBHOOK_SECRET_AMAZON?.trim();
  res.json({
    ebay: { configured: !!ebaySecret },
    mercadolibre: { configured: !!mlSecret },
    amazon: { configured: !!amazonSecret },
  });
});

export interface MercadoLibreCredentialResult {
  creds: Record<string, any>;
  userId: number;
  environment: 'sandbox' | 'production';
}

/**
 * Find MercadoLibre credentials by ML seller user_id (from webhook body.user_id).
 * Falls back to first active credential if no match (single-seller case).
 * Returns creds + userId/environment for token refresh persistence.
 */
async function findMercadoLibreCredentialsBySellerId(
  mlSellerId: number | string | undefined
): Promise<MercadoLibreCredentialResult | null> {
  const sellerIdStr = mlSellerId != null ? String(mlSellerId) : null;
  const rows = await prisma.apiCredential.findMany({
    where: { apiName: 'mercadolibre', isActive: true },
  });
  let fallback: MercadoLibreCredentialResult | null = null;
  for (const row of rows) {
    try {
      const creds = JSON.parse(decrypt(row.credentials)) as Record<string, any>;
      if (!creds?.accessToken) continue;
      const env = (row.environment || 'production') as 'sandbox' | 'production';
      const result: MercadoLibreCredentialResult = { creds, userId: row.userId, environment: env };
      if (sellerIdStr != null && creds?.userId != null && String(creds.userId) === sellerIdStr) return result;
      if (!fallback) fallback = result;
    } catch {
      continue;
    }
  }
  return fallback;
}

/**
 * Normalize webhook shipping address to Order format (addressLine1, fullName, etc.)
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
 * Webhook → Order → Fulfill → SaleService → Payout
 * Single source of truth: Sale created ONLY via saleService.createSaleFromOrder
 */
async function recordSaleFromWebhook(params: {
  marketplace: 'ebay' | 'mercadolibre' | 'amazon';
  listingId: string;
  orderId?: string;
  amount?: number;
  buyer?: string;
  buyerEmail?: string;
  shipping?: string;
  shippingAddress?: any;
}, correlationId?: string) {
  const orderIdRaw = params.orderId?.trim() || '';
  const marketplaceOrderId = orderIdRaw || `${params.marketplace.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Idempotency: Order already processed for this marketplace orderId
  if (orderIdRaw) {
    const existingOrder = await prisma.order.findFirst({
      where: { paypalOrderId: `${params.marketplace}:${orderIdRaw}` },
      select: { id: true },
    });
    if (existingOrder) {
      const existingSale = await prisma.sale.findUnique({ where: { orderId: existingOrder.id } });
      logger.info('[WEBHOOK] Idempotent: Order already exists', {
        orderId: orderIdRaw,
        internalOrderId: existingOrder.id,
        saleId: existingSale?.id,
        correlationId: correlationId ?? null,
        marketplace: params.marketplace,
      });
      return existingSale || existingOrder;
    }
  }

  const { marketplace, listingId } = params;
  const listing = await prisma.marketplaceListing.findFirst({ where: { marketplace, listingId } });
  if (!listing) throw new Error('Listing not found');

  const product = await prisma.product.findUnique({ where: { id: listing.productId } });
  if (!product) throw new Error('Product not found');

  // Guarantee productUrl so fulfillOrder does not fail with "Product URL missing"
  let productUrl = (product.aliexpressUrl || '').trim();
  if (!productUrl) {
    const refreshed = await prisma.product.findUnique({
      where: { id: listing.productId },
      select: { aliexpressUrl: true },
    });
    productUrl = (refreshed?.aliexpressUrl || '').trim();
  }
  if (!productUrl) {
    throw new Error(
      `Product ${listing.productId} has no AliExpress URL; cannot create order. Ensure the listing's product has aliexpressUrl set.`
    );
  }

  const salePrice = Number(params.amount || product.suggestedPrice || 0);
  if (!isFinite(salePrice) || salePrice <= 0) throw new Error('Invalid amount');

  const buyerEmail = params.buyerEmail || (typeof params.buyer === 'string' && params.buyer.includes('@') ? params.buyer : null);
  const buyerName = params.buyer && !params.buyer.includes('@') ? params.buyer : null;
  const normalizedAddr = normalizeShippingAddress(params.shippingAddress, buyerName);
  const shippingAddressStr = JSON.stringify(normalizedAddr);

  // Create Order (single ingestion point)
  const order = await prisma.order.create({
    data: {
      userId: listing.userId,
      productId: listing.productId,
      title: product.title,
      price: salePrice,
      currency: 'USD',
      customerName: normalizedAddr.fullName,
      customerEmail: buyerEmail || 'buyer@unknown.com',
      shippingAddress: shippingAddressStr,
      status: 'PAID',
      paypalOrderId: `${marketplace}:${marketplaceOrderId}`,
      productUrl,
    },
  });

  logger.info('[WEBHOOK] Order created, invoking fulfillOrder', {
    orderId: order.id,
    marketplaceOrderId,
    correlationId: correlationId ?? null,
    marketplace,
  });

  // Fulfill → SaleService.createSaleFromOrder (on PURCHASED)
  const fulfill = await orderFulfillmentService.fulfillOrder(order.id);

  if (fulfill.status === 'PURCHASED') {
    const sale = await prisma.sale.findUnique({ where: { orderId: order.id } });
    if (sale) {
      await notificationService.sendToUser(listing.userId, {
        type: 'SALE_CREATED',
        title: 'Nueva venta recibida',
        message: `Orden ${marketplaceOrderId} en ${marketplace} por $${salePrice.toFixed(2)}`,
        category: 'SALE',
        priority: 'HIGH',
        data: { orderId: order.id, saleId: sale.id, marketplaceOrderId, marketplace, amount: salePrice },
        actions: [{ id: 'view_sale', label: 'Ver venta', url: '/sales', variant: 'primary' }],
      });
      return sale;
    }
    return order;
  }

  // FAILED: notify for manual action
  await notificationService.sendToUser(listing.userId, {
    type: 'USER_ACTION',
    title: 'Compra manual requerida',
    message: `Fulfillment falló: ${fulfill.error || 'Unknown'}. Orden ${marketplaceOrderId} requiere acción manual.`,
    category: 'SALE',
    priority: 'HIGH',
    data: {
      orderId: order.id,
      marketplaceOrderId,
      productUrl: product.aliexpressUrl || '',
      manualPurchaseRequired: true,
      error: fulfill.error,
    },
  });
  return order;
}

router.post('/mercadolibre', createWebhookSignatureValidator('mercadolibre'), async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId ?? `webhook-ml-${Date.now()}`;
  try {
    const body: any = req.body || {};
    let listingId = body.listingId || body.resourceId || body?.order?.order_items?.[0]?.item?.id || body?.order_items?.[0]?.item?.id;
    let amount = Number(body.amount || body.total_amount || body?.order?.total_amount || body?.order_items?.[0]?.unit_price);
    let orderId = String(body.id || body.order_id || body.resource || body?.data?.id || '');
    let receiverAddress = body?.shipping?.receiver_address || body?.order?.shipping?.receiver_address;
    let buyer = body?.buyer?.nickname || body?.buyer?.first_name || body?.buyer?.last_name || body?.buyer?.email;
    let buyerEmail = body?.buyer?.email || (body?.buyer?.nickname && body.buyer.nickname.includes('@') ? body.buyer.nickname : null);

    // orders_v2 format: body.data.id = order ID, body.user_id = ML seller id. Fetch full order via API.
    if (body?.data?.id && !body?.order) {
      const mlOrderId = String(body.data.id);
      const mlSellerId = body.user_id;
      const credResult = await findMercadoLibreCredentialsBySellerId(mlSellerId);
      if (!credResult) {
        logger.warn('[WEBHOOK_MERCADOLIBRE] No credentials for seller', { correlationId, mlSellerId });
        return res.status(200).json({ success: true });
      }
      const { creds, userId: credUserId, environment } = credResult;
      const mlService = new MercadoLibreService(creds as any);
      let orderData: {
        order_items?: Array<{ item?: { id?: string }; unit_price?: number }>;
        total_amount?: number;
        shipping?: { receiver_address?: any };
        buyer?: { nickname?: string; email?: string };
      };
      try {
        orderData = await mlService.getOrder(mlOrderId);
      } catch (err: any) {
        const is401 = err?.statusCode === 401 || err?.response?.status === 401;
        if (is401 && creds?.refreshToken) {
          try {
            const refreshed = await mlService.refreshAccessToken();
            const updatedCreds = { ...creds, accessToken: refreshed.accessToken };
            await CredentialsManager.saveCredentials(credUserId, 'mercadolibre', updatedCreds, environment);
            clearCredentialsCache(credUserId, 'mercadolibre', environment);
            const retryService = new MercadoLibreService(updatedCreds as any);
            orderData = await retryService.getOrder(mlOrderId);
          } catch (refreshErr: any) {
            logger.error('[WEBHOOK_MERCADOLIBRE] Token refresh failed', {
              correlationId,
              error: (refreshErr as Error)?.message,
            });
            throw err;
          }
        } else {
          throw err;
        }
      }
      listingId = orderData?.order_items?.[0]?.item?.id ?? null;
      amount = Number(orderData?.total_amount ?? 0) || Number(orderData?.order_items?.[0]?.unit_price ?? 0);
      orderId = mlOrderId;
      receiverAddress = orderData?.shipping?.receiver_address;
      buyer = orderData?.buyer?.nickname || orderData?.buyer?.email;
      buyerEmail = orderData?.buyer?.email ?? null;
    }

    const shippingAddress = receiverAddress ? {
      addressLine1: receiverAddress.address_line || receiverAddress.street_name || '',
      city: receiverAddress.city?.name || receiverAddress.city || '',
      state: receiverAddress.state?.name || receiverAddress.state || '',
      zipCode: receiverAddress.zip_code || receiverAddress.postal_code || '',
      country: receiverAddress.country?.name || receiverAddress.country || '',
    } : null;

    if (!listingId) return res.status(400).json({ success: false, error: 'listingId missing' });
    await recordSaleFromWebhook(
      { marketplace: 'mercadolibre', listingId, amount, orderId: orderId || undefined, buyer, buyerEmail, shippingAddress },
      correlationId
    );
    res.status(200).json({ success: true });
  } catch (e: any) {
    logger.error('[WEBHOOK_MERCADOLIBRE] Error', { correlationId, error: (e as Error)?.message });
    res.status(200).json({ success: true });
  }
});

router.post('/ebay', createWebhookSignatureValidator('ebay'), async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId ?? `webhook-ebay-${Date.now()}`;
  logger.info('[WEBHOOK_EBAY] Received', {
    correlationId,
    hasBody: !!req.body,
    listingId: (req.body as any)?.listingId ?? (req.body as any)?.itemId ?? null,
    orderId: (req.body as any)?.orderId ?? (req.body as any)?.id ?? null,
  });
  try {
    const body: any = req.body || {};
    const listingId = body.listingId || body.itemId || body?.transaction?.itemId;
    const amount = Number(body.amount || body.total || body?.transaction?.amountPaid || body?.transaction?.transactionPrice?.value);
    const orderId = String(body.orderId || body.id || body?.transaction?.orderId || '');

    const shipTo = body?.fulfillmentStartInstructions?.shippingStep?.shipTo;
    const contactAddr = shipTo?.contactAddress;
    const shippingAddress = (body?.shippingAddress || body?.transaction?.shippingAddress || shipTo) ? {
      fullName: shipTo?.fullName || '',
      addressLine1: contactAddr?.addressLine1 || '',
      addressLine2: contactAddr?.addressLine2 || '',
      city: contactAddr?.city || '',
      state: contactAddr?.stateOrProvince || '',
      zipCode: contactAddr?.postalCode || '',
      country: contactAddr?.countryCode || '',
      phoneNumber: shipTo?.primaryPhone?.phoneNumber || '',
    } : null;

    const buyer = body?.buyer?.username || body?.buyer?.name || body?.transaction?.buyer?.username;
    const buyerEmail = body?.buyer?.email || body?.transaction?.buyer?.email || null;

    if (!listingId) return res.status(400).json({ success: false, error: 'listingId missing' });
    const result = await recordSaleFromWebhook(
      { marketplace: 'ebay', listingId, amount, orderId: orderId || undefined, buyer, buyerEmail, shippingAddress },
      correlationId
    );
    logger.info('[WEBHOOK_EBAY] Success', { correlationId, resultId: result.id, ebayOrderId: orderId });
    res.status(200).json({ success: true });
  } catch (e: any) {
    logger.error('[WEBHOOK_EBAY] Error', { correlationId, error: (e as Error)?.message });
    res.status(200).json({ success: true });
  }
});

export default router;
