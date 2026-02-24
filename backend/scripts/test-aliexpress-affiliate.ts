/**
 * FASE 5 ? Test AliExpress Affiliate API: product query with stored access_token.
 * Usage: npx tsx -r dotenv/config scripts/test-aliexpress-affiliate.ts
 *        DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/test-aliexpress-affiliate.ts
 */

import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { getToken } from '../src/services/aliexpress-token.store';

const KEYWORDS = ['phone case', 'wireless earbuds', 'usb charger', 'led strip'];

async function main() {
  const token = getToken();
  if (!token?.accessToken) {
    console.error('No access_token. Run get-aliexpress-token.ts with a fresh authorization code first.');
    process.exit(1);
  }

  await aliexpressAffiliateAPIService.loadTokenFromDatabase();
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error('ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET required.');
    process.exit(1);
  }

  aliexpressAffiliateAPIService.setCredentials({
    appKey,
    appSecret,
    trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
    sandbox: false,
  });

  let totalProducts = 0;
  let firstProduct: any = null;

  for (const kw of KEYWORDS) {
    try {
      const products = await aliexpressAffiliateAPIService.searchProducts({
        keywords: kw,
        pageNo: 1,
        pageSize: 5,
      });
      const count = products?.length ?? 0;
      totalProducts += count;
      console.log(`[${kw}]: ${count} products`);
      if (count > 0 && !firstProduct) firstProduct = products[0];
    } catch (err: any) {
      console.log(`[${kw}]: ERROR ${err?.message || err}`);
    }
  }

  if (totalProducts > 0) {
    console.log('totalProducts:', totalProducts);
    if (firstProduct) {
      console.log('first product:', {
        productId: firstProduct.productId,
        productTitle: (firstProduct.productTitle || '').substring(0, 60),
        salePrice: firstProduct.salePrice,
      });
    }
    process.exit(0);
  }

  console.error('All queries returned 0 products.');
  process.exit(1);
}

main();
