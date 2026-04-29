/**
 * Pinterest Backfill Script
 * Processes all PENDING/FAILED social posts and creates pins.
 * Run after obtaining Pinterest Standard access:
 *   npx ts-node src/scripts/pinterest-backfill.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STORE_BASE_URL = 'https://shop.ivanreseller.com';
const DELAY_MS = 1500; // stay well under 1000/day rate limit

async function getShopifyAccessToken(): Promise<string> {
  const res = await fetch('https://ivanreseller-2.myshopify.com/admin/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID!,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET!,
    }),
  });
  const data = (await res.json()) as { access_token?: string };
  return data.access_token!;
}

async function getShopifyProductImage(shopifyProductId: string, shopifyToken: string): Promise<string | null> {
  const numericId = shopifyProductId.replace('gid://shopify/Product/', '');
  const res = await fetch(
    `https://ivanreseller-2.myshopify.com/admin/api/2026-04/products/${numericId}/images.json`,
    { headers: { 'X-Shopify-Access-Token': shopifyToken } },
  );
  const data = (await res.json()) as { images?: Array<{ src: string }> };
  return data.images?.[0]?.src ?? null;
}

async function createPin(opts: {
  token: string;
  boardId: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
}): Promise<string> {
  const res = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      board_id: opts.boardId,
      title: opts.title,
      description: opts.description,
      link: opts.link,
      media_source: { source_type: 'image_url', url: opts.imageUrl },
    }),
  });
  const data = (await res.json()) as { id?: string; code?: number; message?: string };
  if (!data.id) throw new Error(`Pinterest error ${data.code}: ${data.message}`);
  return data.id;
}

async function main() {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!token || !boardId) throw new Error('PINTEREST_ACCESS_TOKEN and PINTEREST_BOARD_ID required');

  const shopifyToken = await getShopifyAccessToken();

  const posts = await prisma.cjShopifyUsaSocialPost.findMany({
    where: { platform: 'PINTEREST', status: { in: ['PENDING', 'FAILED'] } },
    include: { listing: { include: { product: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Processing ${posts.length} posts...`);
  let success = 0, failed = 0;

  for (const post of posts) {
    const listing = post.listing;
    const draft = listing.draftPayload as Record<string, any> | null;
    const images = Array.isArray(draft?.images) ? draft.images : [];
    const imageUrl =
      images[0]?.url || images[0]?.src ||
      (listing.shopifyProductId ? await getShopifyProductImage(listing.shopifyProductId, shopifyToken) : null);

    if (!imageUrl) {
      console.warn(`  SKIP ${post.id} — no image for listing ${listing.id}`);
      continue;
    }

    const title = (draft?.title || listing.product?.title || '').slice(0, 100);
    const description = (draft?.description || draft?.descriptionHtml || '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 499);
    const link = `${STORE_BASE_URL}/products/${listing.shopifyHandle}`;

    try {
      const pinId = await createPin({ token, boardId, title, description, link, imageUrl });
      const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
      await prisma.cjShopifyUsaSocialPost.update({
        where: { id: post.id },
        data: { status: 'SUCCESS', externalId: pinId, url: pinUrl, errorMsg: null, attempts: { increment: 1 } },
      });
      console.log(`  ✓ ${listing.shopifyHandle} → ${pinUrl}`);
      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.cjShopifyUsaSocialPost.update({
        where: { id: post.id },
        data: { status: 'FAILED', errorMsg: msg, attempts: { increment: 1 } },
      });
      console.error(`  ✗ ${listing.shopifyHandle}: ${msg}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\nDone — ${success} success, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
