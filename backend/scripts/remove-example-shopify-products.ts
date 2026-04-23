import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const SHOP = String(process.env.SHOPIFY_SHOP || 'ivanreseller-2.myshopify.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const TARGET_TITLE = 'Example product';

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
  if (!response.ok || !data.access_token) {
    throw new Error(`Shopify token failed ${response.status}`);
  }
  return data.access_token as string;
}

async function shopifyRest<T>(accessToken: string, method: string, endpoint: string, body?: unknown): Promise<T> {
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
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 240)}`);
  }
  return data as T;
}

async function main() {
  const accessToken = await getShopifyAccessToken();
  const response = await shopifyRest<{ products: Array<{ id: number; title: string; handle: string; status: string }> }>(
    accessToken,
    'GET',
    'products.json?limit=250&fields=id,title,handle,status'
  );

  const matches = (response.products || []).filter((product) => String(product.title).trim() === TARGET_TITLE);
  const removed: Array<{ id: number; handle: string }> = [];

  for (const product of matches) {
    await shopifyRest(accessToken, 'DELETE', `products/${product.id}.json`);
    removed.push({ id: product.id, handle: product.handle });
  }

  console.log(JSON.stringify({
    shop: SHOP,
    targetTitle: TARGET_TITLE,
    found: matches.length,
    removed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
