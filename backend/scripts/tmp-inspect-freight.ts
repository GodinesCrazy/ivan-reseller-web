#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { CredentialsManager } from '../src/services/credentials-manager.service';
import { aliexpressDropshippingAPIService, refreshAliExpressDropshippingToken } from '../src/services/aliexpress-dropshipping-api.service';

const productId = (process.argv[2] || '3256810520655465').trim();
const userId = Number(process.argv[3] || '1');

async function main() {
  let creds: any = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
  if (!creds?.accessToken) creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
  if (!creds?.accessToken) throw new Error('missing ds creds');
  try {
    const ref = await refreshAliExpressDropshippingToken(userId, 'production', { minTtlMs: 60000 });
    if (ref.credentials?.accessToken) creds = ref.credentials;
  } catch {}
  aliexpressDropshippingAPIService.setCredentials(creds);

  const info = await aliexpressDropshippingAPIService.getProductInfo(productId, { localCountry: 'US', localLanguage: 'en' });
  const firstSku = (info.skus || []).find((s) => Number(s.stock || 0) > 0) || info.skus?.[0];
  const freight = await aliexpressDropshippingAPIService.calculateBuyerFreight({
    countryCode: 'US',
    productId,
    productNum: 1,
    sendGoodsCountryCode: 'CN',
    skuId: firstSku?.skuId || undefined,
    price: String(Math.max(0.01, Number(firstSku?.salePrice || info.salePrice || 0.01))),
    priceCurrency: String(info.currency || 'USD').toUpperCase(),
  });

  const out = {
    productId: info.productId,
    title: info.productTitle,
    dsShippingInfo: info.shippingInfo || null,
    freightOptionsCount: freight.options.length,
    freightOptions: freight.options,
    freightRawTopKeys: freight.rawTopKeys,
    freightRawOptionNodeCount: freight.rawOptionNodeCount,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
