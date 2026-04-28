import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const SHOP = String(process.env.SHOPIFY_SHOP || 'ivanreseller-2.myshopify.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const USER_ID = Number(process.env.CJ_SHOPIFY_USA_CLEANUP_USER_ID || '1');
const PRICE_LIMIT_USD = Number(process.env.CJ_SHOPIFY_USA_MAX_ACTIVE_PRICE_USD || '45');
const EXECUTE = process.argv.includes('--execute');

const prisma = new PrismaClient();

const PET_PATTERNS = [
  /\bpet(s)?\b/i,
  /\bdog(s)?\b/i,
  /\bcat(s)?\b/i,
  /\bpuppy\b/i,
  /\bkitten\b/i,
  /\bpaw(s)?\b/i,
  /\bleash(es)?\b/i,
  /\bharness(es)?\b/i,
  /\bcollar(s)?\b/i,
  /\bgroom(ing)?\b/i,
  /\btreat(s)?\b/i,
  /\bchew(s|y)?\b/i,
  /\bbowl(s)?\b/i,
  /\bfeeder(s)?\b/i,
  /\blitter\b/i,
  /\bcatnip\b/i,
  /\bhamster(s)?\b/i,
  /\bbird(s)?\b/i,
  /\brabbit(s)?\b/i,
  /\bbunny\b/i,
  /\baquarium(s)?\b/i,
  /\bfish\b/i,
  /\breptile(s)?\b/i,
  /\bkennel(s)?\b/i,
  /\bcarrier(s)?\b/i,
  /\bcrate(s)?\b/i,
  /\bcage(s)?\b/i,
  /\bscratch(ing)?\b/i,
  /\bperch(es)?\b/i,
  /\bslow feeder(s)?\b/i,
  /\bpet supplies\b/i,
];

function plainText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPetProduct(product) {
  const haystack = [
    product.title,
    product.product_type,
    product.tags,
    plainText(product.body_html),
  ].join(' ');
  return PET_PATTERNS.some((pattern) => pattern.test(haystack));
}

function maxVariantPrice(product) {
  const prices = (product.variants || [])
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price));
  return prices.length > 0 ? Math.max(...prices) : 0;
}

async function getShopifyAccessToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SHOPIFY_CLIENT_ID || '',
    client_secret: process.env.SHOPIFY_CLIENT_SECRET || '',
  });

  const response = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Shopify token failed ${response.status}: ${JSON.stringify(data).slice(0, 250)}`);
  }
  return data.access_token;
}

async function shopifyRest(accessToken, method, endpoint, body) {
  const response = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 300)}`);
  return { data, link: response.headers.get('link') || '' };
}

async function getAllActiveProducts(accessToken) {
  const products = [];
  let endpoint = 'products.json?limit=250&status=active&fields=id,title,handle,status,product_type,tags,body_html,variants';

  while (endpoint) {
    const { data, link } = await shopifyRest(accessToken, 'GET', endpoint);
    products.push(...(data.products || []));
    const next = link.match(/<https:\/\/[^/]+\/admin\/api\/[^/]+\/([^>]+)>;\s*rel="next"/);
    endpoint = next ? next[1] : '';
  }

  return products;
}

function numericShopifyProductId(productId) {
  const raw = String(productId || '');
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

async function findLocalListings(product) {
  const gid = `gid://shopify/Product/${product.id}`;
  const id = String(product.id);
  const handle = String(product.handle || '');
  const title = String(product.title || '').trim();

  return prisma.cjShopifyUsaListing.findMany({
    where: {
      userId: USER_ID,
      OR: [
        { shopifyProductId: gid },
        { shopifyProductId: id },
        { shopifyProductId: { endsWith: `/${id}` } },
        handle ? { shopifyHandle: handle } : undefined,
        title
          ? {
              OR: [
                { draftPayload: { path: ['title'], equals: title } },
                { product: { title } },
              ],
            }
          : undefined,
      ].filter(Boolean),
    },
    select: { id: true, status: true, listedPriceUsd: true },
  });
}

async function archiveProduct(accessToken, product, reason, localListings) {
  const updated = await shopifyRest(accessToken, 'PUT', `products/${product.id}.json`, {
    product: { id: product.id, status: 'archived' },
  });

  if (localListings.length > 0) {
    await prisma.cjShopifyUsaListing.updateMany({
      where: { id: { in: localListings.map((listing) => listing.id) } },
      data: {
        status: 'ARCHIVED',
        publishedAt: null,
        lastSyncedAt: new Date(),
        lastError: `Archived from Shopify cleanup: ${reason}`,
      },
    });
  }

  return updated.data.product;
}

async function main() {
  console.log(`Shopify cleanup: ${SHOP} | max active price USD ${PRICE_LIMIT_USD} | ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);

  const accessToken = await getShopifyAccessToken();
  const products = await getAllActiveProducts(accessToken);
  const targets = [];

  for (const product of products) {
    const maxPrice = maxVariantPrice(product);
    const pet = isPetProduct(product);
    const reasons = [];
    if (maxPrice > PRICE_LIMIT_USD) reasons.push(`price ${maxPrice.toFixed(2)} > ${PRICE_LIMIT_USD.toFixed(2)}`);
    if (!pet) reasons.push('non-pet');
    if (reasons.length === 0) continue;
    targets.push({ product, maxPrice, pet, reason: reasons.join('; ') });
  }

  console.log(`Active products scanned: ${products.length}`);
  console.log(`Products to archive: ${targets.length}`);

  let archived = 0;
  let errors = 0;

  for (const [index, target] of targets.entries()) {
    const localListings = await findLocalListings(target.product);
    const prefix = `[${index + 1}/${targets.length}] #${numericShopifyProductId(target.product.id)} ${target.product.title}`;
    console.log(`${prefix} | $${target.maxPrice.toFixed(2)} | ${target.reason} | local listings: ${localListings.map((l) => l.id).join(',') || 'none'}`);

    if (!EXECUTE) continue;

    try {
      const archivedProduct = await archiveProduct(accessToken, target.product, target.reason, localListings);
      archived++;
      console.log(`  archived: ${archivedProduct.status}`);
    } catch (error) {
      errors++;
      console.log(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 550));
  }

  const activeAfter = EXECUTE ? await getAllActiveProducts(accessToken) : products;
  console.log(JSON.stringify({
    execute: EXECUTE,
    scannedActiveProducts: products.length,
    matchedForArchive: targets.length,
    archived,
    errors,
    activeProductsAfter: activeAfter.length,
    finishedAt: new Date().toISOString(),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
