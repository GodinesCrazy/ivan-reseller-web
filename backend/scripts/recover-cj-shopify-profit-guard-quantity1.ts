import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/database';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { CJ_SHOPIFY_USA_LISTING_STATUS } from '../src/modules/cj-shopify-usa/cj-shopify-usa.constants';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { cjShopifyUsaQualificationService, type PricingBreakdown } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-qualification.service';

const userId = Number(process.argv[2] ?? 1);
const limit = Math.max(1, Math.min(100, Number(process.argv[3] ?? 50)));

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function withSnapshots(payload: unknown, input: {
  shipping: {
    amountUsd: number;
    serviceName?: string | null;
    estimatedMaxDays?: number | null;
    originCountryCode?: string | null;
    confidence?: string | null;
  };
  pricing: PricingBreakdown;
}): Prisma.InputJsonValue {
  const draft = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? { ...(payload as Record<string, unknown>) }
    : {};

  draft.shippingSnapshot = {
    ...(draft.shippingSnapshot && typeof draft.shippingSnapshot === 'object' && !Array.isArray(draft.shippingSnapshot)
      ? draft.shippingSnapshot as Record<string, unknown>
      : {}),
    amountUsd: roundMoney(input.shipping.amountUsd),
    serviceName: input.shipping.serviceName ?? null,
    estimatedMaxDays: input.shipping.estimatedMaxDays ?? null,
    originCountryCode: input.shipping.originCountryCode ?? null,
    confidence: input.shipping.confidence ?? 'known',
    correctedToOrderQuantity: 1,
    correctedAt: new Date().toISOString(),
  };

  draft.pricingSnapshot = {
    ...(draft.pricingSnapshot && typeof draft.pricingSnapshot === 'object' && !Array.isArray(draft.pricingSnapshot)
      ? draft.pricingSnapshot as Record<string, unknown>
      : {}),
    ...input.pricing,
    correctedAt: new Date().toISOString(),
  };

  return draft as Prisma.InputJsonValue;
}

async function main() {
  const rows = await prisma.cjShopifyUsaListing.findMany({
    where: {
      userId,
      status: CJ_SHOPIFY_USA_LISTING_STATUS.PAUSED,
      lastError: { startsWith: 'Profit guard paused:' },
      shippingQuote: { quantity: { gt: 1 } },
    },
    include: {
      product: true,
      variant: true,
      shippingQuote: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  const adapter = createCjSupplierAdapter(userId);
  const probe = await cjShopifyUsaAdminService.probeConnection(userId).catch(() => null);
  const publicationId = probe?.publications?.find((p) => p.name === 'Online Store')?.id
    ?? probe?.publications?.[0]?.id
    ?? null;
  const publishedProducts = new Set<string>();

  let corrected = 0;
  let reactivated = 0;
  let stillPaused = 0;
  let priceIncreases = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const listing of rows) {
    if (!listing.variant?.cjVid || !listing.shopifyProductId || !listing.shopifyVariantId) {
      stillPaused++;
      details.push({ listingId: listing.id, action: 'SKIP', reason: 'missing CJ/Shopify ids' });
      continue;
    }

    const quote = await adapter.quoteShippingToUsWarehouseAware({
      variantId: listing.variant.cjVid,
      productId: listing.product.cjProductId,
      quantity: 1,
      destCountryCode: 'US',
    });
    const shippingUsd = quote.quote.cost;
    const qualification = await cjShopifyUsaQualificationService.evaluate(
      userId,
      Number(listing.variant.unitCostUsd),
      shippingUsd,
    );

    const savedQuote = await prisma.cjShopifyUsaShippingQuote.create({
      data: {
        userId,
        productId: listing.productId,
        variantId: listing.variantId,
        quantity: 1,
        amountUsd: shippingUsd,
        currency: 'USD',
        serviceName: quote.quote.method ?? null,
        estimatedMaxDays: quote.quote.estimatedDays ?? null,
        confidence: quote.quote.warehouseEvidence === 'assumed' ? 'unknown' : 'known',
        originCountryCode: quote.fulfillmentOrigin,
      },
    });
    corrected++;

    const suggestedPrice = roundMoney(qualification.breakdown.suggestedSellPriceUsd);
    const currentPrice = Number(listing.listedPriceUsd ?? 0);
    const payload = withSnapshots(listing.draftPayload, {
      shipping: {
        amountUsd: shippingUsd,
        serviceName: quote.quote.method ?? null,
        estimatedMaxDays: quote.quote.estimatedDays ?? null,
        originCountryCode: quote.fulfillmentOrigin,
        confidence: quote.quote.warehouseEvidence === 'assumed' ? 'unknown' : 'known',
      },
      pricing: qualification.breakdown,
    });

    if (qualification.decision === 'APPROVED') {
      if (suggestedPrice > currentPrice + 0.49) {
        await cjShopifyUsaAdminService.updateVariantPrice({
          userId,
          productId: listing.shopifyProductId,
          variantId: listing.shopifyVariantId,
          price: suggestedPrice,
        });
        priceIncreases++;
      }
      await cjShopifyUsaAdminService.updateProductStatus({
        userId,
        productId: listing.shopifyProductId,
        status: 'ACTIVE',
      }).catch(() => undefined);
      if (publicationId && !publishedProducts.has(listing.shopifyProductId)) {
        await cjShopifyUsaAdminService.publishProductToPublication({
          userId,
          productId: listing.shopifyProductId,
          publicationId,
        }).catch(() => undefined);
        publishedProducts.add(listing.shopifyProductId);
      }
      await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
          shippingQuoteId: savedQuote.id,
          listedPriceUsd: suggestedPrice > currentPrice + 0.49 ? suggestedPrice : listing.listedPriceUsd,
          draftPayload: payload,
          lastError: null,
        },
      });
      reactivated++;
      details.push({ listingId: listing.id, action: 'REACTIVATED', shippingUsd, suggestedPrice });
    } else {
      await prisma.cjShopifyUsaListing.update({
        where: { id: listing.id },
        data: {
          shippingQuoteId: savedQuote.id,
          draftPayload: payload,
          lastError: `Profit guard paused after quantity-1 correction: ${qualification.reasons.join('; ')}`,
        },
      });
      stillPaused++;
      details.push({ listingId: listing.id, action: 'STILL_PAUSED', shippingUsd, reasons: qualification.reasons });
    }
  }

  console.log(JSON.stringify({
    scanned: rows.length,
    corrected,
    reactivated,
    stillPaused,
    priceIncreases,
    details: details.slice(0, 50),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
