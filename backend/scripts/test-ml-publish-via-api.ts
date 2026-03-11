#!/usr/bin/env tsx
/**
 * Test MercadoLibre publication via HTTP API (login + POST /api/marketplace/publish).
 * Uses the same session as the app - credentials come from the backend's DB.
 *
 * Usage: API_BASE_URL=... AUTOPILOT_LOGIN_USER=... AUTOPILOT_LOGIN_PASSWORD=... npx tsx scripts/test-ml-publish-via-api.ts [productId]
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import axios from 'axios';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const LOGIN_USER = process.env.AUTOPILOT_LOGIN_USER || process.env.E2E_LOGIN_USER;
const LOGIN_PASSWORD = process.env.AUTOPILOT_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD;

function parseCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return first?.split(';')[0]?.trim() || null;
}

async function main() {
  if (!LOGIN_USER || !LOGIN_PASSWORD) {
    console.error('Set AUTOPILOT_LOGIN_USER and AUTOPILOT_LOGIN_PASSWORD');
    process.exit(1);
  }

  const client = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    validateStatus: () => true,
  });

  console.log('\n🧪 Test MercadoLibre publicación vía API\n');
  console.log('API:', API_BASE_URL);

  const loginRes = await client.post('/api/auth/login', {
    username: LOGIN_USER,
    password: LOGIN_PASSWORD,
  });
  if (loginRes.status !== 200 || !loginRes.data?.success) {
    console.error('Login failed:', loginRes.status, loginRes.data?.error || loginRes.data);
    process.exit(1);
  }

  const cookie = parseCookie(loginRes.headers['set-cookie']);
  if (!cookie) {
    console.error('No cookie from login');
    process.exit(1);
  }
  const headers = { Cookie: cookie };

  let productId: number | undefined;
  const productIdArg = process.argv[2];
  if (productIdArg) {
    productId = parseInt(productIdArg, 10);
    if (isNaN(productId)) {
      console.error('Invalid productId:', productIdArg);
      process.exit(1);
    }
    console.log('Producto especificado:', productId);
  } else {
    const productsRes = await client.get('/api/products?status=APPROVED&limit=20', { headers });
    if (productsRes.status !== 200 || !productsRes.data?.data?.products?.length) {
      console.error('No hay productos APPROVED. Especifica un productId: npx tsx scripts/test-ml-publish-via-api.ts 123');
      process.exit(1);
    }
    const products = productsRes.data.data.products;
    const withImages = products.find((p: any) => p.imageUrl || (p.images && JSON.parse(p.images || '[]').length > 0));
    productId = withImages ? Number(withImages.id) : Number(products[0].id);
    console.log('Producto encontrado:', productId, '-', (withImages || products[0]).title?.substring(0, 50) + '...');
  }

  console.log('\nPublicando en MercadoLibre...');
  const publishRes = await client.post(
    '/api/marketplace/publish',
    { productId, marketplace: 'mercadolibre' },
    { headers }
  );

  if (publishRes.status === 200 && publishRes.data?.success) {
    const d = publishRes.data.data;
    console.log('\n✅ Publicación exitosa');
    if (d?.listingId) console.log('   Listing ID:', d.listingId);
    if (d?.listingUrl) console.log('   URL:', d.listingUrl);
  } else {
    console.error('\n❌ Publicación fallida:', publishRes.status, publishRes.data?.error || publishRes.data?.message || publishRes.data);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Error:', e?.message || e);
  process.exit(1);
});
