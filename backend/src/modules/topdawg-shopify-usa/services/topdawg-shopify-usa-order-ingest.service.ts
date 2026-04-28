import { prisma } from '../../../config/database';
import { getTopDawgClient } from './topdawg-api-client.service';
import { TOPDAWG_SHOPIFY_USA_ORDER_STATUS } from '../topdawg-shopify-usa.constants';
import { env } from '../../../config/env';

const SHOP = () => (env.SHOPIFY_SHOP ?? 'ivanreseller-2.myshopify.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const API  = '2026-04';

async function shopifyToken(): Promise<string> {
  const res = await fetch(`https://${SHOP()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }),
  });
  const d = await res.json() as { access_token?: string };
  if (!d.access_token) throw new Error('Shopify token exchange failed');
  return d.access_token;
}

export class TopDawgShopifyUsaOrderIngestService {
  async syncOrders(userId: number, opts: { sinceHours?: number; first?: number; shopifyOrderId?: string }) {
    const tok = await shopifyToken();
    const since = new Date(Date.now() - (opts.sinceHours ?? 24) * 3600 * 1000).toISOString();
    const limit = opts.first ?? 50;

    let url = `/orders.json?limit=${limit}&status=any&created_at_min=${since}&financial_status=paid`;
    if (opts.shopifyOrderId) url = `/orders.json?name=${encodeURIComponent(opts.shopifyOrderId)}&status=any`;

    const res = await fetch(`https://${SHOP()}/admin/api/${API}${url}`, {
      headers: { 'X-Shopify-Access-Token': tok },
    });
    const data = await res.json() as { orders?: ShopifyOrder[] };
    const orders = data.orders ?? [];

    let imported = 0;
    for (const order of orders) {
      await this.ingestOrder(userId, order);
      imported++;
    }
    return { imported, total: orders.length };
  }

  async ingestOrder(userId: number, order: ShopifyOrder) {
    const existing = await prisma.topDawgShopifyUsaOrder.findUnique({
      where: { userId_shopifyOrderId: { userId, shopifyOrderId: String(order.id) } },
    });
    if (existing) return existing;

    // Find matching TopDawg listing via line items
    let listingId: number | null = null;
    for (const item of order.line_items ?? []) {
      const shopifyProductGid = `gid://shopify/Product/${item.product_id}`;
      const listing = await prisma.topDawgShopifyUsaListing.findFirst({
        where: { userId, shopifyProductId: shopifyProductGid, status: 'ACTIVE' },
      });
      if (listing) { listingId = listing.id; break; }
    }

    if (!listingId) return null; // Not a TopDawg order

    const total = order.line_items?.reduce((s, i) => s + Number(i.price) * i.quantity, 0) ?? 0;

    const created = await prisma.topDawgShopifyUsaOrder.create({
      data: {
        userId,
        listingId,
        shopifyOrderId:    String(order.id),
        shopifyLineItemId: String(order.line_items?.[0]?.id ?? ''),
        status:            TOPDAWG_SHOPIFY_USA_ORDER_STATUS.DETECTED,
        totalUsd:          total,
        rawShopifyOrder:   order as never,
      },
    });

    await this.logEvent(created.id, 'order.detected', `Order ${order.name} detected from Shopify`);
    return created;
  }

  async processOrder(userId: number, orderId: number) {
    const order = await prisma.topDawgShopifyUsaOrder.findFirst({
      where: { id: orderId, userId },
      include: { listing: { include: { product: true, variant: true } } },
    });
    if (!order) throw new Error(`Order ${orderId} not found`);

    const shopifyOrder = order.rawShopifyOrder as Record<string, unknown>;
    const shipping = shopifyOrder['shipping_address'] as Record<string, unknown> | null;
    if (!shipping) throw new Error('No shipping address on order');

    await prisma.topDawgShopifyUsaOrder.update({ where: { id: orderId }, data: { status: TOPDAWG_SHOPIFY_USA_ORDER_STATUS.TD_ORDER_PLACING } });
    await this.logEvent(orderId, 'td.order.placing', 'Placing order with TopDawg');

    try {
      const client = await getTopDawgClient(userId);
      const tdSku = order.listing?.variant?.tdVariantSku ?? order.listing?.product?.tdSku;
      if (!tdSku) throw new Error('No TopDawg SKU found on listing');

      const lineItems = order.rawShopifyOrder
        ? (shopifyOrder['line_items'] as Array<{ product_id: number; quantity: number }> ?? [])
        : [];
      const qty = lineItems[0]?.quantity ?? 1;

      // TODO: Verify order format matches TopDawg API spec
      const tdOrder = await client.placeOrder({
        orderRef: `PAWVAULT-${order.shopifyOrderId}`,
        shippingAddress: {
          name:     String(shipping['name'] ?? ''),
          address1: String(shipping['address1'] ?? ''),
          address2: shipping['address2'] ? String(shipping['address2']) : undefined,
          city:     String(shipping['city'] ?? ''),
          state:    String(shipping['province_code'] ?? shipping['province'] ?? ''),
          zip:      String(shipping['zip'] ?? ''),
          country:  String(shipping['country_code'] ?? 'US'),
          phone:    shipping['phone'] ? String(shipping['phone']) : undefined,
        },
        items: [{ sku: tdSku, qty }],
      });

      await prisma.topDawgShopifyUsaOrder.update({
        where: { id: orderId },
        data: { tdOrderId: tdOrder.orderId, status: TOPDAWG_SHOPIFY_USA_ORDER_STATUS.TD_ORDER_PLACED },
      });
      await this.logEvent(orderId, 'td.order.placed', `TopDawg order placed: ${tdOrder.orderId}`);

      return { success: true, tdOrderId: tdOrder.orderId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.topDawgShopifyUsaOrder.update({
        where: { id: orderId },
        data: { status: TOPDAWG_SHOPIFY_USA_ORDER_STATUS.FAILED, lastError: msg.slice(0, 500) },
      });
      await this.logEvent(orderId, 'td.order.error', msg);
      throw e;
    }
  }

  async syncTracking(userId: number, orderId: number) {
    const order = await prisma.topDawgShopifyUsaOrder.findFirst({ where: { id: orderId, userId } });
    if (!order?.tdOrderId) throw new Error('No TopDawg order ID — cannot sync tracking');

    const client = await getTopDawgClient(userId);
    const status = await client.getOrderStatus(order.tdOrderId);

    if (status.tracking?.number) {
      await prisma.topDawgShopifyUsaTracking.upsert({
        where: { id: (await prisma.topDawgShopifyUsaTracking.findFirst({ where: { orderId } }))?.id ?? 0 },
        create: { orderId, trackingNumber: status.tracking.number, carrierCode: status.tracking.carrier, status: 'SHIPPED' },
        update: { trackingNumber: status.tracking.number, carrierCode: status.tracking.carrier },
      });
      await prisma.topDawgShopifyUsaOrder.update({
        where: { id: orderId },
        data: { status: TOPDAWG_SHOPIFY_USA_ORDER_STATUS.TD_SHIPPED },
      });
      await this.logEvent(orderId, 'td.tracking.synced', `Tracking: ${status.tracking.number}`);
    }

    return { tracking: status.tracking };
  }

  private async logEvent(orderId: number, step: string, message: string) {
    await prisma.topDawgShopifyUsaOrderEvent.create({ data: { orderId, step, message } });
  }
}

type ShopifyOrder = {
  id: number;
  name: string;
  line_items?: Array<{ id: number; product_id: number; quantity: number; price: string }>;
  shipping_address?: Record<string, unknown>;
};

export const topDawgShopifyUsaOrderIngestService = new TopDawgShopifyUsaOrderIngestService();
