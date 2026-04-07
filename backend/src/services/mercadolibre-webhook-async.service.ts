/**
 * Mercado Libre webhook: idempotency, persistence, and async processing entrypoint.
 */

import { createHash } from 'crypto';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { MercadoLibreService } from './mercadolibre.service';
import { CredentialsManager, clearCredentialsCache } from './credentials-manager.service';
import { recordWebhookEventProof } from './webhook-event-proof.service';
import {
  findMercadoLibreCredentialsBySellerId,
  recordSaleFromWebhook,
} from './webhook-marketplace-order.service';

export function computeMercadoLibreWebhookIdempotencyKey(body: Record<string, unknown>): string {
  const bid = body?._id;
  if (bid != null && String(bid).trim() !== '') {
    return `ml_wh:id:${String(bid)}`;
  }
  const topic = String(body?.topic ?? '');
  const resource = String(body?.resource ?? '');
  const userId = String(body?.user_id ?? '');
  const data = body?.data as Record<string, unknown> | undefined;
  const dataId = data?.id != null ? String(data.id) : '';
  const base = `${topic}|${resource}|${userId}|${dataId}`;
  if (base.replace(/\|/g, '').length > 0) {
    const h = createHash('sha256').update(base).digest('hex').slice(0, 40);
    return `ml_wh:h:${h}`;
  }
  const h = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 40);
  return `ml_wh:full:${h}`;
}

export type MlWebhookEventStatus = 'received' | 'queued' | 'processed' | 'failed';

/**
 * Heavy ML webhook work (API fetch, order create, fulfillment). Invoked from BullMQ worker only.
 */
export async function processMercadoLibreWebhookPayload(
  body: Record<string, any>,
  correlationId: string
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  let listingId =
    body.listingId ||
    body.resourceId ||
    body?.order?.order_items?.[0]?.item?.id ||
    body?.order_items?.[0]?.item?.id;
  let amount = Number(
    body.amount || body.total_amount || body?.order?.total_amount || body?.order_items?.[0]?.unit_price
  );
  let orderId = String(body.id || body.order_id || body.resource || body?.data?.id || '');
  let receiverAddress = body?.shipping?.receiver_address || body?.order?.shipping?.receiver_address;
  let buyer = body?.buyer?.nickname || body?.buyer?.first_name || body?.buyer?.last_name || body?.buyer?.email;
  let buyerEmail =
    body?.buyer?.email || (body?.buyer?.nickname && body.buyer.nickname.includes('@') ? body.buyer.nickname : null);

  if (body?.data?.id && !body?.order) {
    const mlOrderId = String(body.data.id);
    const mlSellerId = body.user_id;
    const credResult = await findMercadoLibreCredentialsBySellerId(mlSellerId);
    if (!credResult) {
      logger.warn('[WEBHOOK_ML_ASYNC] No credentials for seller', { correlationId, mlSellerId });
      return { ok: true, skipped: true, reason: 'no_credentials_for_seller' };
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
        } catch {
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

  const shippingAddress = receiverAddress
    ? {
        addressLine1: receiverAddress.address_line || receiverAddress.street_name || '',
        city: receiverAddress.city?.name || receiverAddress.city || '',
        state: receiverAddress.state?.name || receiverAddress.state || '',
        zipCode: receiverAddress.zip_code || receiverAddress.postal_code || '',
        country: receiverAddress.country?.name || receiverAddress.country || '',
      }
    : null;

  if (!listingId) {
    logger.warn('[WEBHOOK_ML_ASYNC] listingId missing after resolution', { correlationId, orderId });
    return { ok: true, skipped: true, reason: 'listingId_missing' };
  }

  await recordWebhookEventProof({
    marketplace: 'mercadolibre',
    eventType: String(body?.topic || body?.resource || 'mercadolibre_event'),
    orderReference: orderId || null,
    verified: !!process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim(),
  });

  await recordSaleFromWebhook(
    {
      marketplace: 'mercadolibre',
      listingId,
      amount,
      orderId: orderId || undefined,
      buyer,
      buyerEmail,
      shippingAddress,
    },
    correlationId
  );

  return { ok: true };
}

export async function persistMercadoLibreWebhookLedger(params: {
  idempotencyKey: string;
  payload: Record<string, any>;
  correlationId: string;
}): Promise<{ eventId: string; alreadyHandled: boolean }> {
  const topic = params.payload?.topic != null ? String(params.payload.topic) : null;
  const resource = params.payload?.resource != null ? String(params.payload.resource) : null;
  const payloadJson = JSON.stringify(params.payload);

  const existing = await prisma.mercadoLibreWebhookEvent.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    if (existing.status === 'processed' || existing.status === 'queued') {
      return { eventId: existing.id, alreadyHandled: true };
    }
    await prisma.mercadoLibreWebhookEvent.update({
      where: { id: existing.id },
      data: {
        status: 'received',
        payloadJson,
        topic,
        resource,
        correlationId: params.correlationId,
        errorMessage: null,
        bullmqJobId: null,
      },
    });
    return { eventId: existing.id, alreadyHandled: false };
  }

  const row = await prisma.mercadoLibreWebhookEvent.create({
    data: {
      idempotencyKey: params.idempotencyKey,
      topic,
      resource,
      payloadJson,
      status: 'received',
      correlationId: params.correlationId,
    },
  });
  return { eventId: row.id, alreadyHandled: false };
}

export async function markMercadoLibreWebhookQueued(eventId: string, bullmqJobId: string): Promise<void> {
  await prisma.mercadoLibreWebhookEvent.update({
    where: { id: eventId },
    data: { status: 'queued', bullmqJobId },
  });
}

export async function markMercadoLibreWebhookProcessed(eventId: string): Promise<void> {
  await prisma.mercadoLibreWebhookEvent.update({
    where: { id: eventId },
    data: { status: 'processed', processedAt: new Date(), errorMessage: null },
  });
}

export async function markMercadoLibreWebhookFailed(eventId: string, message: string): Promise<void> {
  await prisma.mercadoLibreWebhookEvent.update({
    where: { id: eventId },
    data: { status: 'failed', errorMessage: message.slice(0, 8000) },
  });
}
