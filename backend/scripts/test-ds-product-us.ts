#!/usr/bin/env tsx
import 'dotenv/config';
import { AliExpressDropshippingAPIService, refreshAliExpressDropshippingToken } from '../src/services/aliexpress-dropshipping-api.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';

async function main() {
  const productId = (process.argv[2] || '').trim();
  const userId = Number(process.argv[3] || '1');
  if (!productId) {
    console.error('Usage: npx tsx scripts/test-ds-product-us.ts <productId> [userId]');
    process.exit(1);
  }

  let creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
  if (!creds?.accessToken) creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
  if (!creds?.accessToken) throw new Error(`No dropshipping creds for user ${userId}`);
  const refreshed = await refreshAliExpressDropshippingToken(userId, 'production', { minTtlMs: 60_000 });
  if (refreshed.credentials) creds = refreshed.credentials;

  const api = new AliExpressDropshippingAPIService();
  api.setCredentials(creds);
  const info = await api.getProductInfo(productId, { localCountry: 'US', localLanguage: 'en' });

  const skus = info.skus || [];
  console.log(
    JSON.stringify(
      {
        productId: info.productId,
        title: info.productTitle,
        salePrice: info.salePrice,
        stock: info.stock,
        skuCount: skus.length,
        skus: skus.map((s) => ({ skuId: s.skuId, stock: s.stock, salePrice: s.salePrice })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

