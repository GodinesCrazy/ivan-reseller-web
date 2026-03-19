#!/usr/bin/env tsx
import 'dotenv/config';
import { prisma } from '../src/config/database';
import { AliExpressDropshippingAPIService, refreshAliExpressDropshippingToken } from '../src/services/aliexpress-dropshipping-api.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { orderFulfillmentService } from '../src/services/order-fulfillment.service';

const DEFAULT_CANDIDATES = [
  '1005010738822789', // original
  '3256810552508037', // historical same 24-slot watch box listing in db
  '3256804107982588', // web-discovered item
  '3256805217991791', // web-discovered item
  '1005006769988622', // web-discovered item
];

async function getApi(userId: number): Promise<AliExpressDropshippingAPIService> {
  let creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
  if (!creds?.accessToken) creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
  if (!creds?.accessToken) throw new Error(`No dropshipping creds for user ${userId}`);
  const refreshed = await refreshAliExpressDropshippingToken(userId, 'production', { minTtlMs: 60_000 });
  if (refreshed.credentials) creds = refreshed.credentials;
  const api = new AliExpressDropshippingAPIService();
  api.setCredentials(creds);
  return api;
}

async function main(): Promise<number> {
  const ebayOrderId = (process.env.EBAY_ORDER_ID || process.argv[2] || '17-14370-63716').trim();
  const userId = Number(process.env.TEST_USER_ID || process.argv[3] || '1');
  const candidatesArg = (process.env.CANDIDATE_PRODUCT_IDS || process.argv[4] || '').trim();
  const candidates = candidatesArg
    ? candidatesArg.split(',').map((x) => x.trim()).filter(Boolean)
    : DEFAULT_CANDIDATES;

  process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY = 'true';
  process.env.ALIEXPRESS_FALLBACK_ALTERNATIVE_PRODUCT = 'true';

  const order = await prisma.order.findFirst({
    where: { paypalOrderId: `ebay:${ebayOrderId}` },
    select: { id: true, shippingAddress: true, status: true, productId: true },
  });
  if (!order) throw new Error(`Order not found: ${ebayOrderId}`);

  const parsedShipping = JSON.parse(order.shippingAddress || '{}');
  const shipCountry = String(parsedShipping.country || 'US');
  const api = await getApi(userId);

  for (const productId of candidates) {
    const candidateUrl = `https://www.aliexpress.com/item/${productId}.html`;
    console.log('\n=== TRY CANDIDATE ===', { productId, candidateUrl, shipCountry });

    let preferredSkuId: string | undefined;
    try {
      const info = await api.getProductInfo(productId, { localCountry: shipCountry, localLanguage: 'en' });
      const skus = info.skus || [];
      const inStock = skus.find((s) => (s.stock ?? 0) > 0);
      preferredSkuId = (inStock?.skuId || skus[0]?.skuId || '').trim() || undefined;
      console.log('getProductInfo:', {
        title: info.productTitle,
        salePrice: info.salePrice,
        skuCount: skus.length,
        preferredSkuId: preferredSkuId ?? null,
        firstSkus: skus.slice(0, 3).map((s) => ({ skuId: s.skuId, stock: s.stock })),
      });
    } catch (e: any) {
      console.log('getProductInfo failed:', e?.message || String(e));
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        errorMessage: null,
        productUrl: candidateUrl,
        ...(order.productId ? {} : { productId: null }),
      },
    });

    if (order.productId && preferredSkuId) {
      await prisma.product.update({
        where: { id: order.productId },
        data: { aliexpressSku: preferredSkuId, aliexpressUrl: candidateUrl },
      });
    }

    const result = await orderFulfillmentService.fulfillOrder(order.id, {
      preferredSkuId,
    });
    console.log('fulfill result:', result);
    if (result.status === 'PURCHASED' && result.aliexpressOrderId) {
      console.log('SUCCESS_PURCHASED', { productId, aliexpressOrderId: result.aliexpressOrderId });
      return 0;
    }
  }

  console.log('NO_CANDIDATE_WORKED');
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

