import dotenv from 'dotenv';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const SHOP = (process.env.SHOPIFY_SHOP || 'ivanreseller-2.myshopify.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const OUTPUT_PATH = path.resolve(process.cwd(), 'catalog-expansion-2026-04-21-stray-cleanup.json');
const STRAY_TITLES = new Set(['Earbuds wireless bluetooth headset', 'Drafted Beauty Organizer']);

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
    });
  }
  return out;
}

async function main() {
  const accessToken = await getShopifyAccessToken();
  const products = await shopifyRest<{ products: Array<any> }>(accessToken, 'GET', 'products.json?limit=250&status=active');
  const activeCj = (products.products || []).filter((p) => String(p.tags || '').includes('cj-shopify-usa'));
  const drafted = [];
  for (const product of activeCj) {
    if (!STRAY_TITLES.has(product.title)) continue;
    const updated = await shopifyRest<{ product: any }>(accessToken, 'PUT', `products/${product.id}.json`, {
      product: { id: product.id, status: 'draft' },
    });
    drafted.push({ id: product.id, title: product.title, handle: product.handle, status: updated.product.status });
  }

  const after = await shopifyRest<{ products: Array<any> }>(accessToken, 'GET', 'products.json?limit=250&status=active');
  const activeAfter = (after.products || []).filter((p) => String(p.tags || '').includes('cj-shopify-usa'));
  const sampleHandles = [
    'rotary-digital-kitchen-timer-33',
    '6-piece-travel-storage-bag-set-26',
    'travel-toiletry-organizer-bag-27',
    'self-adhesive-cable-organizer-clips-28',
    'foldable-aluminum-tablet-stand-29',
  ];
  const qa = await storefrontQa(sampleHandles);
  const output = {
    finishedAt: new Date().toISOString(),
    drafted,
    activeShopifyCjProductCount: activeAfter.length,
    activeProductTitles: activeAfter.map((p) => p.title).sort(),
    storefrontQa: qa,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
