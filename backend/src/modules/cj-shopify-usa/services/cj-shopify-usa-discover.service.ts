import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import { cjShopifyUsaQualificationService } from './cj-shopify-usa-qualification.service';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import { CJ_SHOPIFY_USA_TRACE_STEP } from '../cj-shopify-usa.constants';
import type { CjProductSummary, CjVariantDetail } from '../../cj-ebay/adapters/cj-supplier.adapter.interface';
import type { CjShippingQuoteNormalized } from '../../cj-ebay/adapters/cj-freight-calculate.official';

async function recordTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({ data: { userId, step, message, meta } });
}

function confidenceFromEvidence(evidence: CjShippingQuoteNormalized['warehouseEvidence']): string {
  return evidence === 'assumed' ? 'unknown' : 'known';
}

function hasMinimumStock(stock: number | null | undefined, minStock: number): boolean {
  return Number(stock ?? 0) >= minStock;
}

export interface DiscoverShippingResult {
  amountUsd: number;
  method?: string;
  estimatedDays: number | null;
  fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
  confidence: string;
}

export interface DiscoverEvaluationResult {
  cjProductId: string;
  title: string;
  imageUrls: string[];
  variants: CjVariantDetail[];
  shipping: DiscoverShippingResult | null;
  qualification: {
    decision: string;
    breakdown: {
      supplierCostUsd: number;
      shippingCostUsd: number;
      totalCostUsd: number;
      paymentProcessingFeeUsd: number;
      targetProfitUsd: number;
      suggestedSellPriceUsd: number;
    };
  } | null;
  shippingError?: string;
}

export interface DiscoverImportDraftResult {
  dbProductId: number;
  listing: {
    id: number;
    status: string;
    listedPriceUsd: number | null;
    shopifySku: string | null;
  };
}

export const cjShopifyUsaDiscoverService = {
  async search(userId: number, keyword: string, page: number, pageSize: number): Promise<CjProductSummary[]> {
    const adapter = createCjSupplierAdapter(userId);
    const results = await adapter.searchProducts({ keyword, page, pageSize });
    await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_COMPLETE, 'discover.search', {
      keyword,
      page,
      pageSize,
      resultCount: results.length,
    } as Prisma.InputJsonValue);
    return results;
  },

  async evaluate(
    userId: number,
    cjProductId: string,
    quantity: number,
    destPostalCode?: string,
  ): Promise<DiscoverEvaluationResult> {
    const adapter = createCjSupplierAdapter(userId);
    const product = await adapter.getProductById(cjProductId);
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));
    const firstVariant = product.variants[0] as CjVariantDetail | undefined;
    const candidateVariant =
      product.variants.find((variant) => hasMinimumStock(variant.stock, minStock)) as CjVariantDetail | undefined;
    const selectedVariant = candidateVariant ?? firstVariant;

    let shippingResult: DiscoverShippingResult | null = null;
    let shippingError: string | undefined;

    if (selectedVariant) {
      try {
        const waResult = await adapter.quoteShippingToUsWarehouseAware({
          variantId: selectedVariant.cjVid,
          productId: cjProductId,
          quantity,
          destPostalCode,
          destCountryCode: 'US',
        });
        shippingResult = {
          amountUsd: waResult.quote.cost,
          method: waResult.quote.method,
          estimatedDays: waResult.quote.estimatedDays,
          fulfillmentOrigin: waResult.fulfillmentOrigin,
          confidence: confidenceFromEvidence(waResult.quote.warehouseEvidence),
        };
      } catch (err) {
        shippingError = err instanceof Error ? err.message : String(err);
      }
    }

    let qualification: DiscoverEvaluationResult['qualification'] = null;
    if (selectedVariant && selectedVariant.unitCostUsd > 0) {
      const shippingUsd = shippingResult?.amountUsd ?? 0;
      qualification = await cjShopifyUsaQualificationService.evaluate(userId, selectedVariant.unitCostUsd, shippingUsd);
      if (!hasMinimumStock(selectedVariant.stock, minStock)) {
        qualification = {
          ...qualification,
          decision: 'REJECTED',
        };
        shippingError = shippingError ?? `No CJ variant meets minimum stock requirement (${minStock}).`;
      }
    }

    await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_COMPLETE, 'discover.evaluate', {
      cjProductId,
      decision: qualification?.decision ?? 'NO_COST_DATA',
    } as Prisma.InputJsonValue);

    return {
      cjProductId: product.cjProductId,
      title: product.title,
      imageUrls: product.imageUrls,
      variants: product.variants,
      shipping: shippingResult,
      qualification,
      shippingError,
    };
  },

  async importAndDraft(
    userId: number,
    cjProductId: string,
    variantCjVid: string | undefined,
    quantity: number,
    destPostalCode: string | undefined,
  ): Promise<DiscoverImportDraftResult> {
    const adapter = createCjSupplierAdapter(userId);
    const product = await adapter.getProductById(cjProductId);
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));

    if (!product.variants.length) {
      throw new Error('CJ product has no variants — cannot create draft.');
    }

    // Upsert product snapshot
    const dbProduct = await prisma.cjShopifyUsaProduct.upsert({
      where: { userId_cjProductId: { userId, cjProductId } },
      create: {
        userId,
        cjProductId,
        title: product.title,
        description: product.description ?? null,
        images: (product.imageUrls ?? []) as Prisma.InputJsonValue,
        snapshotStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
      update: {
        title: product.title,
        description: product.description ?? null,
        images: (product.imageUrls ?? []) as Prisma.InputJsonValue,
        snapshotStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    // Upsert all variants
    const upsertedVariants = await Promise.all(
      product.variants.map((v: CjVariantDetail) =>
        prisma.cjShopifyUsaProductVariant.upsert({
          where: { productId_cjSku: { productId: dbProduct.id, cjSku: v.cjSku } },
          create: {
            productId: dbProduct.id,
            cjSku: v.cjSku,
            cjVid: v.cjVid ?? null,
            attributes: (v.attributes ?? {}) as Prisma.InputJsonValue,
            unitCostUsd: v.unitCostUsd > 0 ? v.unitCostUsd : null,
            stockLastKnown: v.stock ?? null,
            stockCheckedAt: new Date(),
          },
          update: {
            cjVid: v.cjVid ?? null,
            attributes: (v.attributes ?? {}) as Prisma.InputJsonValue,
            unitCostUsd: v.unitCostUsd > 0 ? v.unitCostUsd : null,
            stockLastKnown: v.stock ?? null,
            stockCheckedAt: new Date(),
          },
        }),
      ),
    );

    const requestedVariant = variantCjVid ? upsertedVariants.find((v) => v.cjVid === variantCjVid) : undefined;
    if (requestedVariant && !hasMinimumStock(requestedVariant.stockLastKnown, minStock)) {
      throw new Error(
        `Selected CJ variant does not meet minimum stock requirement (${minStock}).`,
      );
    }

    const eligibleVariants = upsertedVariants.filter((variant) => hasMinimumStock(variant.stockLastKnown, minStock));
    const targetVariant = requestedVariant ?? eligibleVariants[0];

    if (!targetVariant) {
      throw new Error(`No CJ variant meets minimum stock requirement (${minStock}).`);
    }

    const sourceVariant =
      product.variants.find((v: CjVariantDetail) => v.cjVid === targetVariant.cjVid) ?? product.variants[0];

    // Get shipping quote from CJ and save it; proceed with $0 on failure
    let shippingAmountUsd = 0;
    let shippingMethod: string | null = null;
    let shippingDays: number | null = null;
    let fulfillmentOrigin = 'CN';

    try {
      const waResult = await adapter.quoteShippingToUsWarehouseAware({
        variantId: (sourceVariant as CjVariantDetail).cjVid,
        productId: cjProductId,
        quantity,
        destPostalCode,
        destCountryCode: 'US',
      });
      shippingAmountUsd = waResult.quote.cost;
      shippingMethod = waResult.quote.method;
      shippingDays = waResult.quote.estimatedDays;
      fulfillmentOrigin = waResult.fulfillmentOrigin;

      await prisma.cjShopifyUsaShippingQuote.create({
        data: {
          userId,
          productId: dbProduct.id,
          variantId: targetVariant.id,
          quantity,
          amountUsd: shippingAmountUsd,
          currency: 'USD',
          serviceName: shippingMethod,
          estimatedMaxDays: shippingDays,
          confidence: confidenceFromEvidence(waResult.quote.warehouseEvidence),
          originCountryCode: fulfillmentOrigin === 'US' ? 'US' : 'CN',
        },
      });
    } catch (_err) {
      // Shipping quote unavailable — draft proceeds with $0 shipping cost
    }

    await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_COMPLETE, 'discover.import', {
      cjProductId,
      dbProductId: dbProduct.id,
      variantId: targetVariant.id,
      shippingAmountUsd,
      fulfillmentOrigin,
    } as Prisma.InputJsonValue);

    const listing = await cjShopifyUsaPublishService.buildDraft({
      userId,
      productId: dbProduct.id,
      variantId: targetVariant.id,
      quantity,
    });

    return {
      dbProductId: dbProduct.id,
      listing: {
        id: listing.id,
        status: listing.status,
        listedPriceUsd: listing.listedPriceUsd ? Number(listing.listedPriceUsd) : null,
        shopifySku: listing.shopifySku,
      },
    };
  },
};
