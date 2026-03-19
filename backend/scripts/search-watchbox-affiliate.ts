#!/usr/bin/env tsx
import 'dotenv/config';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';

async function main() {
  const keywords = (process.argv[2] || '24 slot watch box carbon fiber').trim();
  const appKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
  const appSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim();
  let creds: any = null;
  if (appKey && appSecret) {
    creds = {
      appKey,
      appSecret,
      trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
      sandbox: false,
    };
  } else {
    creds = await CredentialsManager.getCredentials(1, 'aliexpress-affiliate', 'production');
  }
  if (!creds?.appKey || !creds?.appSecret) {
    throw new Error('Missing affiliate app credentials (env and DB)');
  }
  aliexpressAffiliateAPIService.setCredentials(creds);

  const result = await aliexpressAffiliateAPIService.searchProducts({
    keywords,
    pageNo: 1,
    pageSize: 20,
    targetCurrency: 'USD',
    shipToCountry: 'US',
  });
  const rows = (result.products || []).map((p) => ({
    productId: p.productId,
    salePrice: p.salePrice,
    title: p.productTitle,
    url: p.productDetailUrl || `https://www.aliexpress.com/item/${p.productId}.html`,
  }));
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

