import 'dotenv/config';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { cjEbayConfigService } from '../src/modules/cj-ebay/services/cj-ebay-config.service';
import { cjEbayOpportunityPipelineService } from '../src/modules/cj-ebay/services/cj-ebay-opportunity-pipeline.service';
import { cjEbaySystemReadinessService } from '../src/modules/cj-ebay/services/cj-ebay-system-readiness.service';

const userId = Number(process.env.REAL_CYCLE_USER_ID || process.env.CJ_EBAY_SMOKE_USER_ID || 1);
const publish = process.env.CJ_EBAY_SMOKE_PUBLISH === 'true';
const detailDelayMs = Number(process.env.CJ_EBAY_SMOKE_DETAIL_DELAY_MS || 6000);
const keywords = (process.env.CJ_EBAY_SMOKE_KEYWORDS || 'pet supplies,dog grooming brush,pet hair remover,cat toy')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  console.log('[cj-ebay-bounded-smoke] starting', { userId, publish, keywords });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, isActive: true },
  });
  if (!user?.isActive) throw new Error(`User ${userId} not found or inactive`);

  const settings = await cjEbayConfigService.getOrCreateSettings(userId);
  const readiness = await cjEbaySystemReadinessService.evaluateForUser(userId);
  console.log('[cj-ebay-bounded-smoke] user', { id: user.id, username: user.username, email: user.email });
  console.log('[cj-ebay-bounded-smoke] mode', { publish, blockNewPublications: env.BLOCK_NEW_PUBLICATIONS });
  console.log('[cj-ebay-bounded-smoke] settings', {
    marketNiche: settings.marketNiche,
    requirePetCategory: settings.requirePetCategory,
    requireUsWarehouseOnly: settings.requireUsWarehouseOnly,
    minMarginPct: settings.minMarginPct,
    minProfitUsd: settings.minProfitUsd,
    defaultEbayFeePct: settings.defaultEbayFeePct,
    defaultPaymentFeePct: settings.defaultPaymentFeePct,
    monthlyListingLimit: settings.monthlyListingLimit,
    monthlyAmountLimitUsd: settings.monthlyAmountLimitUsd,
  });
  console.log('[cj-ebay-bounded-smoke] readiness', {
    ready: readiness.ready,
    checks: readiness.checks?.map((check) => ({ id: check.id, ok: check.ok, detail: check.detail })),
  });

  const adapter = createCjSupplierAdapter(userId);
  for (const keyword of keywords) {
    console.log('[cj-ebay-bounded-smoke] CJ search', keyword);
    const products = await adapter.searchProducts({ keyword, page: 1, pageSize: 5 });
    console.log('[cj-ebay-bounded-smoke] CJ results', products.map((p) => ({
      id: p.cjProductId,
      title: p.title?.slice(0, 80),
      inventoryTotal: p.inventoryTotal,
      fulfillmentOrigin: p.fulfillmentOrigin,
    })));

    for (const product of products) {
      const productId = String(product.cjProductId || '').trim();
      if (!productId) continue;
      if (settings.requireUsWarehouseOnly && product.fulfillmentOrigin === 'CN') {
        console.log('[cj-ebay-bounded-smoke] skip non-USA origin summary', { productId, origin: product.fulfillmentOrigin });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, detailDelayMs)));
      let detail;
      try {
        detail = await adapter.getProductById(productId);
      } catch (error) {
        console.log('[cj-ebay-bounded-smoke] skip detail error', {
          productId,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      const variant =
        detail.variants.find((v) => Number(v.stock || 0) > 0 && String(v.cjVid || v.cjSku || '').trim()) ||
        detail.variants.find((v) => String(v.cjVid || v.cjSku || '').trim());
      if (!variant) {
        console.log('[cj-ebay-bounded-smoke] skip no usable variant', { productId });
        continue;
      }
      console.log('[cj-ebay-bounded-smoke] candidate', {
        productId,
        title: detail.title?.slice(0, 90),
        variant: variant.cjVid || variant.cjSku,
        stock: variant.stock,
        unitCostUsd: variant.unitCostUsd,
      });

      const result = await cjEbayOpportunityPipelineService.run({
        userId,
        route: 'cj-ebay-bounded-cycle-smoke',
        body: {
          productId,
          variantId: variant.cjVid || variant.cjSku,
          quantity: 1,
          draftOnly: !publish,
          publish,
        },
      });
      console.log('[cj-ebay-bounded-smoke] pipeline result', {
        evaluateDecision: result.evaluate.decision,
        listing: result.listing,
        publish: result.publish,
        publishSkippedReason: result.publishSkippedReason,
      });

      if (!result.listing?.id) continue;
      const listing = await prisma.cjEbayListing.findUnique({
        where: { id: result.listing.id },
        include: {
          product: { select: { title: true, cjProductId: true } },
          variant: { select: { cjSku: true, cjVid: true, stockLastKnown: true } },
          evaluation: { select: { decision: true, estimatedMarginPct: true, estimatedProfitUsd: true, evaluatedAt: true } },
          shippingQuote: { select: { amountUsd: true, originCountryCode: true, confidence: true, createdAt: true } },
        },
      });
      console.log('[cj-ebay-bounded-smoke] reflected listing state', listing);
      return;
    }
  }
  throw new Error('No publishable PET CJ USA candidate found in bounded smoke keywords.');
}

main()
  .catch((error) => {
    console.error('[cj-ebay-bounded-smoke] FAILED', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
