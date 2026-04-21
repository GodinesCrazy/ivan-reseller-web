/**
 * Script: republish-product-32722.ts
 * Calls the production backend publish endpoint via HTTP with a minted JWT
 * Uses the production backend at ivan-reseller-backend-production.up.railway.app
 */
import jwt from 'jsonwebtoken';
import https from 'https';

const BACKEND_URL = 'https://ivan-reseller-backend-production.up.railway.app';
const JWT_SECRET = process.env.JWT_SECRET || 'ivan-reseller-super-secure-jwt-secret-key-2025-minimum-32-chars';

const PRODUCT_ID = 32722;
const MARKETPLACE = 'mercadolibre';
const ENVIRONMENT = 'production';

function httpPost(url: string, body: object, token: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const opts: https.RequestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: `Bearer ${token}`,
      },
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGet(url: string, token: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts: https.RequestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    };
    https.get(opts as any, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, body: raw }); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // 1. Mint JWT for admin user (userId=1)
  const token = jwt.sign(
    { userId: 1, username: 'admin', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  console.log('JWT minted for userId=1');
  console.log('Token prefix:', token.substring(0, 40) + '...');

  // 2. Test connectivity — health check
  console.log(`\nTesting backend at ${BACKEND_URL} ...`);
  const health = await httpGet(`${BACKEND_URL}/api/health`, token).catch(e => ({ status: 0, body: e.message }));
  console.log(`Health: ${health.status}`, JSON.stringify(health.body).substring(0, 100));

  if (health.status === 401) {
    console.error('\n❌ JWT rejected — production JWT_SECRET is different from local. Cannot proceed this way.');
    console.log('Solution: Re-login to Railway and use railway run, or change the JWT_SECRET in prod to match.');
    return;
  }

  if (health.status === 0 || health.status >= 500) {
    console.error('\n❌ Backend unreachable or error:', health.body);
    return;
  }

  // 3. Test ML connection
  console.log('\nTesting ML connection...');
  const mlTest = await httpGet(`${BACKEND_URL}/api/marketplace/test-connection/mercadolibre`, token)
    .catch(e => ({ status: 0, body: e.message }));
  console.log(`ML test: ${mlTest.status}`, JSON.stringify(mlTest.body).substring(0, 200));

  if (!mlTest.body?.success) {
    console.warn('\n⚠️  ML connection test failed. Publish may fail if token is expired.');
    console.log('Proceeding anyway — the backend will attempt token refresh before publishing.');
  }

  // 4. Call publish endpoint
  console.log(`\nPublishing product ${PRODUCT_ID} to ${MARKETPLACE} (${ENVIRONMENT})...`);
  const result = await httpPost(
    `${BACKEND_URL}/api/marketplace/publish`,
    { productId: PRODUCT_ID, marketplace: MARKETPLACE, environment: ENVIRONMENT },
    token
  );

  console.log(`\nPublish response: ${result.status}`);
  console.log(JSON.stringify(result.body, null, 2));

  if (result.status === 200 && result.body?.success) {
    const listing = result.body?.data?.listing || result.body?.data;
    console.log('\n✅ PUBLISH SUCCESS');
    console.log('  listingId:', listing?.listingId || listing?.id || '?');
    console.log('  status:', listing?.status || '?');
    console.log('  url:', listing?.listingUrl || '?');
    console.log('  legalTextsAppended:', listing?.legalTextsAppended ?? '?');
    console.log('  shippingTruthStatus:', listing?.shippingTruthStatus ?? '?');
  } else if (result.status === 401) {
    console.error('\n❌ 401 Unauthorized — production JWT_SECRET differs from local .env');
    console.error('   Cannot mint a valid token locally for the production server.');
  } else {
    console.error('\n❌ Publish failed:', result.body?.error || result.body?.message || 'Unknown error');
  }
}

main().catch(console.error);
