#!/usr/bin/env tsx
/**
 * Find order by eBay ID -> find Product & MarketplaceListing -> get AliExpress SKU from API -> save to Product.aliexpressSku -> run fulfillment.
 * Use when the order fails with SKU_NOT_EXIST and we want to rescue the SKU from getProductInfo and retry.
 * Usage: EBAY_ORDER_ID=17-14370-63716 npx tsx scripts/rescue-aliexpress-sku-and-fulfill.ts
 *    Or: npx tsx scripts/rescue-aliexpress-sku-and-fulfill.ts 17-14370-63716
 */

import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

const PRODUCT_ID_FROM_URL_REGEX = /[\/_](\d+)\.html/;

async function main(): Promise<number> {
  const ebayOrderId = (process.env.EBAY_ORDER_ID || process.argv[2] || '').trim();
  if (!ebayOrderId) {
    console.error('Usage: EBAY_ORDER_ID=17-14370-63716 npx tsx scripts/rescue-aliexpress-sku-and-fulfill.ts');
    return 1;
  }

  const paypalOrderId = `ebay:${ebayOrderId}`;
  const order = await prisma.order.findFirst({
    where: { paypalOrderId },
    select: {
      id: true,
      status: true,
      productId: true,
      productUrl: true,
      userId: true,
      title: true,
    },
  });

  if (!order) {
    console.error('Order not found for eBay ID:', ebayOrderId);
    return 1;
  }

  const productUrl = (order.productUrl || '').trim();
  const match = productUrl.match(PRODUCT_ID_FROM_URL_REGEX);
  const productIdFromUrl = match ? match[1] : null;
  if (!productIdFromUrl) {
    console.error('Could not extract AliExpress product ID from order productUrl:', productUrl?.slice(0, 80));
    return 1;
  }

  let productIdDb = order.productId;
  let listing: { id: number; listingId: string; sku: string | null; supplierUrl: string | null } | null = null;
  if (order.productId) {
    listing = await prisma.marketplaceListing.findFirst({
      where: { productId: order.productId, marketplace: 'ebay' },
      select: { id: true, listingId: true, sku: true, supplierUrl: true },
    });
    console.log('Order productId:', order.productId, 'eBay listing:', listing ? { listingId: listing.listingId, sku: listing.sku } : 'none');
  } else {
    const bySupplierUrl = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'ebay', supplierUrl: { contains: productIdFromUrl } },
      select: { id: true, productId: true, listingId: true, sku: true, supplierUrl: true },
    });
    if (bySupplierUrl) {
      listing = bySupplierUrl;
      productIdDb = bySupplierUrl.productId;
      console.log('Found listing by supplierUrl containing product id:', productIdFromUrl, 'productId:', productIdDb, 'eBay sku:', listing.sku);
      if (!order.productId) {
        await prisma.order.update({
          where: { id: order.id },
          data: { productId: bySupplierUrl.productId },
        });
        console.log('Linked order to Product.id', bySupplierUrl.productId);
      }
    }
  }

  const userId = order.userId ?? 1;
  const canonicalProductUrl =
    productUrl.startsWith('http') ? productUrl : `https://www.aliexpress.com/item/${productIdFromUrl}.html`;

  const { AliExpressDropshippingAPIService } = await import('../src/services/aliexpress-dropshipping-api.service');
  const { CredentialsManager } = await import('../src/services/credentials-manager.service');
  const { refreshAliExpressDropshippingToken } = await import('../src/services/aliexpress-dropshipping-api.service');
  let creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
  if (!creds?.accessToken) {
    creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
  }
  if (!creds?.accessToken) {
    console.error('AliExpress Dropshipping credentials not found for userId', userId);
    return 1;
  }
  const refreshed = await refreshAliExpressDropshippingToken(userId, 'production', { minTtlMs: 60_000 });
  if (refreshed.credentials) creds = refreshed.credentials;

  const api = new AliExpressDropshippingAPIService();
  api.setCredentials(creds);

  const productInfo = await api.getProductInfo(productIdFromUrl, { localCountry: 'US', localLanguage: 'en' });
  const skus = productInfo.skus || [];
  const firstWithStock = skus.find((s) => s.stock > 0);
  const firstSkuId = firstWithStock?.skuId ?? skus[0]?.skuId ?? null;
  if (!firstSkuId) {
    console.log('getProductInfo returned no SKUs; skuArrayLength:', skus.length, 'productId:', productIdFromUrl);
    console.log('Sample product keys:', Object.keys(productInfo).slice(0, 15));
  } else {
    console.log('Rescued SKU from API:', firstSkuId, 'stock:', firstWithStock?.stock ?? skus[0]?.stock, 'total SKUs:', skus.length);
  }

  if (!productIdDb && (productInfo.product_title || order.title)) {
    const productTitle = (productInfo.product_title || order.title).slice(0, 500);
    const newProduct = await prisma.product.create({
      data: {
        userId,
        aliexpressUrl: canonicalProductUrl,
        title: productTitle,
        description: null,
        aliexpressPrice: 0,
        suggestedPrice: 0,
        currency: 'USD',
        images: '[]',
        status: 'PENDING',
      },
    });
    const rescueListingId = `rescue-${ebayOrderId}`;
    await prisma.marketplaceListing.create({
      data: {
        productId: newProduct.id,
        userId,
        marketplace: 'ebay',
        listingId: rescueListingId,
        supplierUrl: canonicalProductUrl,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { productId: newProduct.id },
    });
    productIdDb = newProduct.id;
    console.log('Created Product.id', newProduct.id, 'and listing', rescueListingId, '; linked order to product.');
  }

  if (productIdDb && firstSkuId) {
    await prisma.product.update({
      where: { id: productIdDb },
      data: { aliexpressSku: firstSkuId },
    });
    console.log('Updated Product.id', productIdDb, 'with aliexpressSku:', firstSkuId);
  } else if (!productIdDb) {
    console.log('Order has no productId; cannot save aliexpressSku. Link order to a product or run sync.');
  }

  if (order.status === 'PURCHASING') {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', errorMessage: null },
    });
    console.log('Reset order from PURCHASING to PAID');
  } else if (order.status === 'FAILED') {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', errorMessage: null },
    });
    console.log('Reset order from FAILED to PAID');
  }

  const prevApiOnly = process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY;
  process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY = 'true';
  try {
    const { orderFulfillmentService } = await import('../src/services/order-fulfillment.service');
    const result = await orderFulfillmentService.fulfillOrder(order.id, {
      preferredSkuId: firstSkuId ?? undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'PURCHASED') {
      console.log('OK Order PURCHASED. aliexpressOrderId:', result.aliexpressOrderId);
      return 0;
    }
    console.error('Fulfillment ended with status:', result.status, result.error || '');
    return 1;
  } finally {
    if (prevApiOnly !== undefined) process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY = prevApiOnly;
    else delete process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
