/**
 * PRODUCTION PROFIT MODE — Affiliate API validation.
 * Usage: cd backend && npx tsx scripts/test-affiliate-api.ts
 *        Or: npx tsx backend/scripts/test-affiliate-api.ts (from repo root)
 */

import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });
dotenv.config({ path: path.join(__dirname, '../.env') });

const KEYWORDS_TO_TRY = ['phone case', 'wireless earbuds', 'usb cable', 'organizador cocina', 'led strip'];

async function run() {
  console.log('[TEST] Starting Affiliate API validation (PRODUCTION PROFIT MODE)');

  const { aliexpressAffiliateAPIService } = await import('../src/services/aliexpress-affiliate-api.service');

  let totalProducts = 0;
  let sampleProduct: any = null;

  for (const keywords of KEYWORDS_TO_TRY) {
    try {
      const result = await aliexpressAffiliateAPIService.searchProducts({
        keywords,
        pageNo: 1,
        pageSize: 5,
        targetCurrency: 'USD',
        targetLanguage: 'EN',
        shipToCountry: 'US',
      });
      const products = result?.products ?? [];
      if (products.length > 0) {
        totalProducts += products.length;
        if (!sampleProduct) sampleProduct = products[0];
        break;
      }
    } catch (e: any) {
      if (!e?.message?.includes('Affiliate permission missing')) continue;
    }
  }

  console.log('[TEST] Products returned:', totalProducts);

  if (totalProducts > 0 && sampleProduct) {
    console.log('[TEST] Sample product:', {
      title: sampleProduct.productTitle,
      price: sampleProduct.salePrice,
      currency: sampleProduct.currency,
      productUrl: sampleProduct.promotionLink || sampleProduct.productDetailUrl,
      imageUrl: sampleProduct.productMainImageUrl,
      commissionRate: sampleProduct.commissionRate,
      estimatedProfit: sampleProduct.estimatedProfit,
    });
    console.log('AFFILIATE_API_STATUS = WORKING');
  } else {
    console.log('AFFILIATE_API_STATUS = NO_PRODUCTS_RETURNED');
  }
}

run().catch((err) => {
  console.error('AFFILIATE_API_STATUS = FAILED');
  console.error(err?.message || err);
  process.exit(1);
});
