import dotenv from 'dotenv';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { prisma } from '../src/config/database';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

type Candidate = any;

const BASE_URL = 'https://ivan-reseller-backend-production.up.railway.app';
const LOGIN_USER = process.env.CJ_SHOPIFY_USA_VALIDATION_USER || process.env.AUTOPILOT_LOGIN_USER || 'admin';
const LOGIN_PASSWORD = process.env.CJ_SHOPIFY_USA_VALIDATION_PASSWORD || process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin123';
const SHOP = (process.env.SHOPIFY_SHOP || 'ivanreseller-2.myshopify.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const INPUT_PATH = path.resolve(process.cwd(), 'catalog-expansion-2026-04-21-results.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'catalog-expansion-2026-04-21-final-qa.json');

const COLLECTIONS = {
  travel: { title: 'Travel Comfort & Organizers', handle: 'travel-comfort-organizers' },
  workspace: { title: 'Desk / Workspace Upgrades', handle: 'desk-workspace-upgrades' },
  everyday: { title: 'Smart Everyday Accessories', handle: 'smart-everyday-accessories' },
};

const TITLE_FIXES: Record<string, string> = {
  '6 PCS Travel Storage Bag Set For Clothes': '6-Piece Travel Storage Bag Set',
  'Travel Cosmetic & Toiletry Organizer Bag': 'Travel Toiletry Organizer Bag',
  'Folding Aluminum Alloy Tablet Phone Lazy Stand': 'Foldable Aluminum Tablet Stand',
  'Carbon Fiber Card Holder RFID Metal Wallet': 'RFID Carbon Fiber Card Holder',
  'Car Seat Gap Filler Organizer Car Seat Console': 'Car Seat Gap Organizer',
  'Kitchen Silent Rotary Adjustable Digital Timer': 'Rotary Digital Kitchen Timer',
  'Wire Cable Organizer Clips Self-Adhesive': 'Self-Adhesive Cable Organizer Clips',
  'Keyboard Wrist Rest And Mouse Wrist Rest': 'Keyboard and Mouse Wrist Rest Set',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gidNumber(gid?: string | null): string {
  return String(gid || '').split('/').pop() || '';
}

function slug(title: string, listingId?: number) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  return listingId ? `${base}-${listingId}` : base;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function stricterPrice(cost: number, shipping: number): number {
  const total = cost + shipping;
  const buffer = total * 0.03;
  const fixedFee = 0.3;
  const feePct = 0.054;
  const marginPrice = (total + buffer + fixedFee) / (1 - feePct - 0.2);
  const profitPrice = (total + buffer + fixedFee + 3) / (1 - feePct);
  return roundMoney(Math.ceil(Math.max(marginPrice, profitPrice, 9.99)) - 0.01);
}

async function login() {
  const response = await fetch(new URL('/api/auth/login', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LOGIN_USER, password: LOGIN_PASSWORD }),
  });
  const cookie = response.headers.get('set-cookie') || '';
  const token = cookie.match(/token=([^;]+)/)?.[1] || '';
  if (!response.ok || !token) throw new Error(`login failed ${response.status}`);
  return token;
}

async function apiRequest<T>(token: string, method: string, pathname: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
    body: method !== 'GET' ? JSON.stringify(body || {}) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${method} ${pathname} failed ${response.status}: ${text.slice(0, 200)}`);
  return data;
}

async function getShopifyAccessToken() {
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
  const data: any = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Shopify token failed ${response.status}`);
  return data.access_token as string;
}

async function shopifyRest<T>(accessToken: string, method: string, endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 250)}`);
  return data as T;
}

async function updateProduct(accessToken: string, productGid: string, title: string, listingId?: number, status?: 'active' | 'draft') {
  const id = gidNumber(productGid);
  const payload: any = { id, title, handle: slug(title, listingId) };
  if (status) payload.status = status;
  const out = await shopifyRest<{ product: { id: number; title: string; handle: string; status: string } }>(
    accessToken,
    'PUT',
    `products/${id}.json`,
    { product: payload },
  );
  return out.product;
}

async function updatePrice(accessToken: string, variantGid: string, price: number) {
  const id = gidNumber(variantGid);
  if (!id) return;
  await shopifyRest(accessToken, 'PUT', `variants/${id}.json`, { variant: { id, price: price.toFixed(2) } });
}

async function addImages(accessToken: string, productGid: string, imageUrls: string[]) {
  const id = gidNumber(productGid);
  const existing = await shopifyRest<{ images: Array<any> }>(accessToken, 'GET', `products/${id}/images.json`);
  if ((existing.images || []).length > 0) return 0;
  let added = 0;
  for (const src of imageUrls.slice(0, 5)) {
    try {
      await shopifyRest(accessToken, 'POST', `products/${id}/images.json`, { image: { src } });
      added += 1;
      await sleep(500);
    } catch {
      // best effort
    }
  }
  return added;
}

async function ensureCollections(accessToken: string) {
  const current = await shopifyRest<{ custom_collections: Array<{ id: number; handle: string; title: string }> }>(
    accessToken,
    'GET',
    'custom_collections.json?limit=250',
  );
  return new Map((current.custom_collections || []).map((c) => [c.handle, c.id]));
}

async function assign(accessToken: string, productGid: string, collectionId: number) {
  const productId = gidNumber(productGid);
  const existing = await shopifyRest<{ collects: Array<{ collection_id: number }> }>(
    accessToken,
    'GET',
    `collects.json?product_id=${productId}&limit=250`,
  );
  if ((existing.collects || []).some((c) => Number(c.collection_id) === Number(collectionId))) return;
  await shopifyRest(accessToken, 'POST', 'collects.json', { collect: { product_id: productId, collection_id: collectionId } });
}

async function getProduct(accessToken: string, productGid: string) {
  const id = gidNumber(productGid);
  const out = await shopifyRest<{ product: any }>(accessToken, 'GET', `products/${id}.json`);
  return out.product;
}

async function storefrontQa(handles: string[]) {
  const out = [];
  for (const handle of handles) {
    const response = await fetch(`https://${SHOP}/products/${handle}`, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 Ivan Reseller QA' },
    });
    const html = await response.text();
    out.push({
      handle,
      status: response.status,
      finalUrl: response.url,
      passwordGate: response.url.includes('/password') || /Opening soon|Enter store using password/i.test(html),
      hasAddToCart: /\/cart\/add|Add to cart|Agregar al carrito|data-type="add-to-cart-form"|name="add"/i.test(html),
      hasPrice: /\$\s?\d|USD/i.test(html),
      hasProductTitle: !/404|not found/i.test(html.slice(0, 2000)),
    });
    await sleep(300);
  }
  return out;
}

async function main() {
  const previous = JSON.parse(await readFile(INPUT_PATH, 'utf8'));
  const token = await login();
  const accessToken = await getShopifyAccessToken();
  const selected: Candidate[] = previous.selected || [];
  const timer = selected.find((p) => p.cleanTitle === 'Kitchen Silent Rotary Adjustable Digital Timer');
  if (!timer) throw new Error('replacement timer candidate not found');

  const q = timer.evaluation.qualification.breakdown;
  const price = stricterPrice(Number(q.supplierCostUsd), Number(timer.evaluation.shipping.amountUsd));
  const draft = await apiRequest<any>(token, 'POST', '/api/cj-shopify-usa/discover/import-draft', {
    cjProductId: timer.cjProductId,
    variantCjVid: timer.selectedVariantCjVid,
    quantity: 1,
    destPostalCode: '10001',
  });
  const publish = await apiRequest<any>(token, 'POST', '/api/cj-shopify-usa/listings/publish', { listingId: draft.listing.id });
  const replacementListing = publish.listing;
  const replacementTitle = TITLE_FIXES[timer.cleanTitle] || timer.cleanTitle;
  const updatedReplacement = await updateProduct(accessToken, replacementListing.shopifyProductId, replacementTitle, draft.listing.id, 'active');
  await updatePrice(accessToken, replacementListing.shopifyVariantId, price);
  await addImages(accessToken, replacementListing.shopifyProductId, timer.evaluation.imageUrls || []);

  const weak = (previous.published || []).find((p: any) => p.cleanTitle.startsWith('Lipstick Organizer'));
  let weakDrafted: any = null;
  if (weak?.shopifyProductId) {
    weakDrafted = await updateProduct(accessToken, weak.shopifyProductId, 'Drafted Beauty Organizer', weak.listingId, 'draft');
    await prisma.cjShopifyUsaListing.update({ where: { id: weak.listingId }, data: { status: 'DRAFT' } }).catch(() => null);
  }

  const titleUpdates = [];
  for (const p of previous.published || []) {
    if (p.listingId === weak?.listingId || !p.shopifyProductId) continue;
    const title = TITLE_FIXES[p.cleanTitle] || p.cleanTitle;
    const updated = await updateProduct(accessToken, p.shopifyProductId, title, p.listingId, 'active');
    titleUpdates.push({ listingId: p.listingId, title: updated.title, handle: updated.handle });
    await sleep(250);
  }

  const collectionIds = await ensureCollections(accessToken);
  const everydayId = collectionIds.get(COLLECTIONS.everyday.handle);
  if (everydayId) await assign(accessToken, replacementListing.shopifyProductId, everydayId);

  const activeProductsResp = await shopifyRest<{ products: Array<any> }>(
    accessToken,
    'GET',
    'products.json?limit=250&status=active',
  );
  const activeCjProducts = (activeProductsResp.products || []).filter((p) => String(p.tags || '').includes('cj-shopify-usa'));

  const distribution: Record<string, number> = {};
  for (const def of Object.values(COLLECTIONS)) {
    const id = collectionIds.get(def.handle);
    if (!id) {
      distribution[def.title] = 0;
      continue;
    }
    const collects = await shopifyRest<{ collects: Array<{ product_id: number }> }>(
      accessToken,
      'GET',
      `collects.json?collection_id=${id}&limit=250`,
    );
    const activeIds = new Set(activeCjProducts.map((p) => Number(p.id)));
    distribution[def.title] = (collects.collects || []).filter((c) => activeIds.has(Number(c.product_id))).length;
  }

  const sampleProducts = [
    replacementListing.shopifyProductId,
    ...((previous.published || []).filter((p: any) => p.listingId !== weak?.listingId).slice(0, 4).map((p: any) => p.shopifyProductId)),
  ].filter(Boolean);
  const currentSamples = [];
  for (const id of sampleProducts) {
    currentSamples.push(await getProduct(accessToken, id));
  }
  const qa = await storefrontQa(currentSamples.map((p) => p.handle));

  const overviewAfter = await apiRequest<any>(token, 'GET', '/api/cj-shopify-usa/overview');
  const output = {
    finishedAt: new Date().toISOString(),
    replacementPublished: {
      title: updatedReplacement.title,
      listingId: draft.listing.id,
      shopifyProductId: replacementListing.shopifyProductId,
      handle: updatedReplacement.handle,
      price,
      cost: Number(q.supplierCostUsd),
      shipping: Number(timer.evaluation.shipping.amountUsd),
    },
    weakProductDrafted: weakDrafted,
    titleUpdates,
    activeShopifyCjProductCount: activeCjProducts.length,
    backendOverviewAfter: overviewAfter,
    collectionDistributionActiveOnly: distribution,
    storefrontQa: qa,
    activeProductTitles: activeCjProducts.map((p) => p.title).sort(),
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
