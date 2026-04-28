import { prisma } from '../../../config/database';
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

async function shopify(method: string, path: string, body?: unknown, tok?: string): Promise<unknown> {
  const token = tok ?? await shopifyToken();
  const res = await fetch(`https://${SHOP()}/admin/api/${API}${path}`, {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export class TopDawgShopifyUsaPublishService {
  async publishListing(userId: number, listingId: number) {
    const listing = await prisma.topDawgShopifyUsaListing.findFirst({
      where: { id: listingId, userId },
      include: { product: true, variant: true },
    });

    if (!listing) throw new Error(`Listing ${listingId} not found`);
    if (listing.status === 'ACTIVE') throw new Error('Listing already active');

    const dp = listing.draftPayload as Record<string, unknown> | null;
    if (!dp) throw new Error('No draft payload — import product first');

    await prisma.topDawgShopifyUsaListing.update({ where: { id: listingId }, data: { status: 'PUBLISHING' } });

    const tok   = await shopifyToken();
    const price = String(listing.listedPriceUsd ?? dp['pricingSnapshot'] ? (dp['pricingSnapshot'] as Record<string, unknown>)['suggestedPriceUsd'] : 29.99);
    const compareAt = dp['pricingSnapshot'] ? String((dp['pricingSnapshot'] as Record<string, unknown>)['compareAtPriceUsd'] ?? '') : '';
    const sku   = String(dp['tdVariantSku'] ?? listing.variant?.tdVariantSku ?? '');
    const title = String(dp['title'] ?? listing.product?.title ?? 'Pet Product');
    const images = (dp['images'] as string[] | undefined ?? []).slice(0, 10).map((src: string) => ({ src }));

    const shippingNote = '<p><strong>🚀 Fast USA Shipping: 3-7 Business Days</strong> — Ships from US warehouse.</p>';
    const descHtml = `${shippingNote}<p>${listing.product?.description?.slice(0, 2000) ?? 'Premium pet supply from US warehouse.'}</p><p><strong>Free shipping</strong> on orders $50+. 30-day returns. Shop with confidence at PawVault.</p>`;

    const payload = {
      product: {
        title,
        body_html: descHtml,
        vendor: String(dp['vendor'] ?? listing.product?.brand ?? 'PawVault'),
        product_type: String(dp['productType'] ?? 'Pet Supplies'),
        status: 'active',
        tags: 'pets,pet-supplies,pawvault,fast-shipping,usa-warehouse,topdawg',
        images,
        variants: [{
          price,
          compare_at_price: compareAt || undefined,
          sku,
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          fulfillment_service: 'manual',
        }],
      },
    };

    try {
      const res = await shopify('POST', '/products.json', payload, tok) as { product?: { id: number; handle: string; variants: Array<{ id: number }> }; errors?: unknown };

      if (!res.product?.id) {
        throw new Error(`Shopify rejected product: ${JSON.stringify(res.errors ?? res).slice(0, 150)}`);
      }

      const sp = res.product;
      const gid = `gid://shopify/Product/${sp.id}`;
      const vid = sp.variants[0]?.id ? `gid://shopify/ProductVariant/${sp.variants[0].id}` : null;

      await prisma.topDawgShopifyUsaListing.update({
        where: { id: listingId },
        data: { status: 'ACTIVE', shopifyProductId: gid, shopifyHandle: sp.handle, shopifyVariantId: vid, shopifySku: sku, publishedAt: new Date() },
      });

      return { success: true, shopifyProductId: gid, handle: sp.handle };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.topDawgShopifyUsaListing.update({ where: { id: listingId }, data: { status: 'FAILED', lastError: msg.slice(0, 500) } });
      throw e;
    }
  }

  async pauseListing(userId: number, listingId: number) {
    const listing = await prisma.topDawgShopifyUsaListing.findFirst({ where: { id: listingId, userId } });
    if (!listing?.shopifyProductId) throw new Error('No Shopify product linked');
    const numId = listing.shopifyProductId.replace('gid://shopify/Product/', '');
    await shopify('PUT', `/products/${numId}.json`, { product: { id: numId, status: 'draft' } });
    await prisma.topDawgShopifyUsaListing.update({ where: { id: listingId }, data: { status: 'PAUSED' } });
    return { success: true };
  }

  async unpublishListing(userId: number, listingId: number) {
    const listing = await prisma.topDawgShopifyUsaListing.findFirst({ where: { id: listingId, userId } });
    if (!listing?.shopifyProductId) throw new Error('No Shopify product linked');
    const numId = listing.shopifyProductId.replace('gid://shopify/Product/', '');
    await shopify('DELETE', `/products/${numId}.json`);
    await prisma.topDawgShopifyUsaListing.update({ where: { id: listingId }, data: { status: 'ARCHIVED' } });
    return { success: true };
  }

  async bulkPublish(userId: number, listingIds: number[]) {
    const results: { id: number; ok: boolean; error?: string }[] = [];
    for (const id of listingIds) {
      try {
        await this.publishListing(userId, id);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return results;
  }
}

export const topDawgShopifyUsaPublishService = new TopDawgShopifyUsaPublishService();
