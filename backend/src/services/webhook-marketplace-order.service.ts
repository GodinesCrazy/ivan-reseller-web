/**
 * Shared webhook → internal Order + fulfillment path (Mercado Libre, eBay, etc.).
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { notificationService } from './notification.service';
import { orderFulfillmentService } from './order-fulfillment.service';
import { decrypt } from '../utils/encryption';

export interface MercadoLibreCredentialResult {
  creds: Record<string, any>;
  userId: number;
  environment: 'sandbox' | 'production';
}

export async function findMercadoLibreCredentialsBySellerId(
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

export function normalizeShippingAddress(addr: any, buyerName?: string | null): Record<string, string> {
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
export async function recordSaleFromWebhook(
  params: {
    marketplace: 'ebay' | 'mercadolibre' | 'amazon';
    listingId: string;
    orderId?: string;
    amount?: number;
    buyer?: string;
    buyerEmail?: string;
    shipping?: string;
    shippingAddress?: any;
  },
  correlationId?: string
) {
  const orderIdRaw = params.orderId?.trim() || '';
  const marketplaceOrderId =
    orderIdRaw || `${params.marketplace.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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

  const buyerEmail =
    params.buyerEmail || (typeof params.buyer === 'string' && params.buyer.includes('@') ? params.buyer : null);
  const buyerName = params.buyer && !params.buyer.includes('@') ? params.buyer : null;
  const normalizedAddr = normalizeShippingAddress(params.shippingAddress, buyerName);
  const shippingAddressStr = JSON.stringify(normalizedAddr);

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
