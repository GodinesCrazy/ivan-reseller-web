import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { notificationService } from '../../services/notification.service';
import { createWebhookSignatureValidator } from '../../middleware/webhook-signature.middleware';
import { orderFulfillmentService } from '../../services/order-fulfillment.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import { CredentialsManager, clearCredentialsCache } from '../../services/credentials-manager.service';
import { decrypt } from '../../utils/encryption';
import { getWebhookStatusWithProof, getWebhookStatus } from '../../services/webhook-readiness.service';
import { recordWebhookEventProof } from '../../services/webhook-event-proof.service';
import {
  computeMercadoLibreWebhookIdempotencyKey,
  persistMercadoLibreWebhookLedger,
  markMercadoLibreWebhookQueued,
  markMercadoLibreWebhookFailed,
  markMercadoLibreWebhookProcessed,
  processMercadoLibreWebhookPayload,
} from '../../services/mercadolibre-webhook-async.service';
import { jobService } from '../../services/job.service';
import { mercadoLibreWebhookRequiresBullmq } from '../../utils/ml-operational-guards';
import {
  buildEbayChallengeResponse,
  resolveEbayWebhookEndpoint,
  resolveEbayWebhookVerificationToken,
} from '../../services/ebay-webhook.service';

const router = Router();

/**
 * GET /api/webhooks/status
 * Returns whether webhook secrets are configured (for dashboard/circle checklist).
 * Does not expose secret values.
 */
router.get('/status', async (_req: Request, res: Response) => {
  const status = await getWebhookStatusWithProof().catch(() => getWebhookStatus());
  res.json(status);
});

router.get('/ebay', async (req: Request, res: Response) => {
  const challengeCode = String(req.query.challenge_code || req.query.challengeCode || '').trim();
  if (!challengeCode) {
    return res.status(400).json({
      success: false,
      error: 'challenge_code missing',
      message: 'eBay destination validation requires challenge_code in the query string.',
    });
  }

  const verificationToken = resolveEbayWebhookVerificationToken();
  const endpoint = resolveEbayWebhookEndpoint();
  if (!verificationToken || !endpoint) {
    logger.warn('[WEBHOOK_EBAY] Challenge requested but webhook configuration is incomplete', {
      hasVerificationToken: !!verificationToken,
      endpoint,
    });
    return res.status(503).json({
      success: false,
      error: 'ebay_webhook_not_configured',
      hasVerificationToken: !!verificationToken,
      endpoint,
    });
  }

  const challengeResponse = buildEbayChallengeResponse({
    challengeCode,
    verificationToken,
    endpoint,
  });

  return res.status(200).json({ challengeResponse });
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
    const signatureVerified = (req as any).webhookSignatureVerified === true;
    const eventType = String(body?.topic || body?.resource || 'mercadolibre_event');
    const earlyOrderReference =
      body?.data?.id != null
        ? String(body.data.id)
        : body?._id != null
          ? String(body._id)
          : body?.id != null
            ? String(body.id)
            : null;
    await recordWebhookEventProof({
      marketplace: 'mercadolibre',
      eventType,
      orderReference: earlyOrderReference,
      verified: signatureVerified,
    }).catch((proofError) => {
      logger.warn('[WEBHOOK_MERCADOLIBRE] Could not persist early webhook proof', {
        correlationId,
        error: proofError instanceof Error ? proofError.message : String(proofError),
      });
    });

    const idempotencyKey = computeMercadoLibreWebhookIdempotencyKey(body as Record<string, unknown>);
    const { eventId, alreadyHandled } = await persistMercadoLibreWebhookLedger({
      idempotencyKey,
      payload: body as Record<string, any>,
      correlationId,
    });

    if (alreadyHandled) {
      return res.status(200).json({ ok: true, duplicate: true, eventId });
    }

    const requiresQueue = mercadoLibreWebhookRequiresBullmq();
    if (requiresQueue) {
      const job = await jobService.addMlWebhookJob({ eventId, correlationId });
      if (!job) {
        await markMercadoLibreWebhookFailed(eventId, 'queue unavailable: Redis/BullMQ not ready');
        return res.status(503).json({ ok: false, error: 'queue_unavailable', eventId });
      }

      const jobId = String(job.id ?? '');
      await markMercadoLibreWebhookQueued(eventId, jobId);
      return res.status(200).json({ ok: true, enqueued: true, eventId, jobId });
    }

    const result = await processMercadoLibreWebhookPayload(body as Record<string, any>, correlationId);
    if (!result.ok) {
      await markMercadoLibreWebhookFailed(eventId, result.reason || 'sync_processing_failed');
      return res.status(500).json({ ok: false, error: 'sync_processing_failed', eventId });
    }

    await markMercadoLibreWebhookProcessed(eventId);
    return res.status(200).json({
      ok: true,
      processedSync: true,
      eventId,
      skipped: result.skipped === true,
      reason: result.reason || null,
    });
  } catch (e: any) {
    logger.error('[WEBHOOK_MERCADOLIBRE] Error', { correlationId, error: (e as Error)?.message });
    return res.status(500).json({ ok: false, error: 'ingest_failed' });
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
    // Robust parsing: accept multiple payload shapes (Sell Fulfillment, Trading, notifications)
    const listingId =
      body.listingId ||
      body.itemId ||
      body?.transaction?.itemId ||
      body?.lineItems?.[0]?.itemId ||
      body?.orderLineItems?.[0]?.itemId ||
      body?.listing?.listingId ||
      body?.item?.itemId;
    const amount = Number(
      body.amount ||
        body.total ||
        body?.transaction?.amountPaid ||
        body?.transaction?.transactionPrice?.value ||
        body?.pricingSummary?.total?.value ||
        body?.orderTotal?.value ||
        body?.lineItems?.[0]?.unitPrice?.value
    );
    const orderId = String(
      body.orderId ||
        body.id ||
        body?.transaction?.orderId ||
        body?.orderId ||
        body?.order?.orderId ||
        ''
    ).trim();

    const shipTo = body?.fulfillmentStartInstructions?.shippingStep?.shipTo || body?.shippingFulfillment?.shipTo;
    const contactAddr = shipTo?.contactAddress || shipTo?.contactAddress;
    const shippingAddress = (body?.shippingAddress || body?.transaction?.shippingAddress || shipTo) ? {
      fullName: shipTo?.fullName || body?.buyer?.username || body?.buyer?.name || '',
      addressLine1: contactAddr?.addressLine1 || contactAddr?.addressLine || '',
      addressLine2: contactAddr?.addressLine2 || '',
      city: contactAddr?.city || '',
      state: contactAddr?.stateOrProvince || contactAddr?.state || '',
      zipCode: contactAddr?.postalCode || contactAddr?.zipCode || '',
      country: contactAddr?.countryCode || contactAddr?.country || '',
      phoneNumber: shipTo?.primaryPhone?.phoneNumber || shipTo?.phoneNumber || '',
    } : null;

    const buyer = body?.buyer?.username || body?.buyer?.name || body?.transaction?.buyer?.username || body?.buyer?.fullName;
    const buyerEmail = body?.buyer?.email || body?.transaction?.buyer?.email || null;

    if (!listingId) return res.status(400).json({ success: false, error: 'listingId missing' });
    await recordWebhookEventProof({
      marketplace: 'ebay',
      eventType: String(body?.notificationType || body?.eventType || 'ebay_event'),
      orderReference: orderId || null,
      verified: true,
    });
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
