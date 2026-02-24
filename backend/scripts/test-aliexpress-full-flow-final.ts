/**
 * FASE 8 ? Full flow test: tokens + affiliate product query.
 * Exit 0 only if access_token valid and affiliate.product.query returns real products.
 */

import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

import { getOAuthStatus, getAuthorizationUrl } from '../src/services/aliexpress-oauth.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { getToken } from '../src/services/aliexpress-token.store';

async function main() {
  const status = getOAuthStatus();
  if (!status.hasToken || status.expired) {
    console.log('No valid token. Start OAuth:');
    console.log(getAuthorizationUrl());
    process.exit(1);
  }

  await aliexpressAffiliateAPIService.loadTokenFromDatabase();
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error('ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET required.');
    process.exit(1);
  }

  aliexpressAffiliateAPIService.setCredentials({
    appKey,
    appSecret,
    trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
    sandbox: false,
  });

  try {
    const products = await aliexpressAffiliateAPIService.searchProducts({
      keywords: 'phone case',
      pageNo: 1,
      pageSize: 5,
    });
    const count = products?.length ?? 0;
    if (count === 0) {
      console.error('affiliate.product.query returned 0 products.');
      process.exit(1);
    }
    console.log('access_token valid.');
    console.log('affiliate.product.query returned', count, 'real products.');
    if (products[0]) {
      console.log('First product:', products[0].productId, (products[0].productTitle || '').substring(0, 50));
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Test failed:', err?.message || err);
    process.exit(1);
  }
}

main();
