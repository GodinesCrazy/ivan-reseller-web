#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { CredentialsManager } from '../src/services/credentials-manager.service';
import { aliexpressDropshippingAPIService, refreshAliExpressDropshippingToken } from '../src/services/aliexpress-dropshipping-api.service';

const productId = (process.argv[2] || '3256809833425558').trim();
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
  const dto: any = info.logisticsInfoDto || {};

  const out = {
    productId: info.productId,
    title: info.productTitle,
    shippingInfoMethodsCount: info.shippingInfo?.availableShippingMethods?.length || 0,
    logisticsInfoKeys: Object.keys(dto),
    logisticsInfoDto: dto,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
