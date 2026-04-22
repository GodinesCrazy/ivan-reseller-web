import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import { cjShopifyUsaQualificationService } from './cj-shopify-usa-qualification.service';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import { CJ_SHOPIFY_USA_TRACE_STEP } from '../cj-shopify-usa.constants';
import type {
  CjProductDetail,
  CjProductSummary,
  CjVariantDetail,
  ICjSupplierAdapter,
} from '../../cj-ebay/adapters/cj-supplier.adapter.interface';
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

function liveStockVariantKeys(detail: CjProductDetail): string[] {
  return detail.variants
    .map((variant) => String(variant.cjVid || '').trim())
    .filter(Boolean);
}

async function enrichProductDetailWithLiveStock(
  adapter: ICjSupplierAdapter,
  detail: CjProductDetail,
): Promise<CjProductDetail> {
  const probeKeys = liveStockVariantKeys(detail);
  if (probeKeys.length === 0) {
    return detail;
  }

  const liveStock = await adapter.getStockForSkus(probeKeys);
  return {
    ...detail,
    variants: detail.variants.map((variant) => {
      const key = String(variant.cjVid || '').trim();
      const stock = key ? liveStock.get(key) : undefined;
      return stock === undefined ? variant : { ...variant, stock };
    }),
  };
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
    reasons?: string[];
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

export interface DiscoverAiSuggestionItem {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  keyword: string;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
  stock: number;
  shippingUsd: number;
  suggestedSellPriceUsd: number;
  netMarginPct: number;
}

export interface DiscoverAiSuggestionsResult {
  generatedAt: string;
  totalAnalyzed: number;
  suggestions: DiscoverAiSuggestionItem[];
}

const SHOPIFY_USA_AI_DISCOVERY_KEYWORDS = [
  'car phone holder',
  'kitchen organizer',
  'pet grooming',
  'travel accessories',
];

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function confidenceFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 75) return 'HIGH';
  if (score >= 58) return 'MEDIUM';
  return 'LOW';
}

function buildSuggestionReason(input: {
  fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN';
  shippingUsd: number;
  marginPct: number;
  stock: number;
}): string {
  const originText =
    input.fulfillmentOrigin === 'US'
      ? 'origen US'
      : input.fulfillmentOrigin === 'CN'
      ? 'origen CN'
      : 'origen no confirmado';
  return `Margen estimado ${input.marginPct.toFixed(1)}%, envío ${input.shippingUsd.toFixed(
    2,
  )} USD, stock ${input.stock}, ${originText}.`;
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
    const product = await enrichProductDetailWithLiveStock(adapter, await adapter.getProductById(cjProductId));
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
    const product = await enrichProductDetailWithLiveStock(adapter, await adapter.getProductById(cjProductId));
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));

    if (!product.variants.length) {
      throw new AppError('CJ product has no variants — cannot create draft.', 400, ErrorCode.VALIDATION_ERROR);
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
      throw new AppError(
        `Selected CJ variant does not meet minimum stock requirement (${minStock}).`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const eligibleVariants = upsertedVariants.filter((variant) => hasMinimumStock(variant.stockLastKnown, minStock));
    const targetVariant = requestedVariant ?? eligibleVariants[0];

    if (!targetVariant) {
      throw new AppError(
        `No CJ variant meets minimum stock requirement (${minStock}).`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
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

  async aiSuggestions(
    userId: number,
    input?: { count?: number; destPostalCode?: string; keywords?: string[] },
  ): Promise<DiscoverAiSuggestionsResult> {
    const adapter = createCjSupplierAdapter(userId);
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));
    const maxItems = clamp(Number(input?.count ?? 6), 3, 12);
    const keywordPool = (input?.keywords && input.keywords.length > 0
      ? input.keywords
      : SHOPIFY_USA_AI_DISCOVERY_KEYWORDS
    ).slice(0, 5);

    const ranked: DiscoverAiSuggestionItem[] = [];
    let analyzed = 0;

    for (const keyword of keywordPool) {
      const searchResults = await adapter.searchProducts({
        keyword,
        page: 1,
        pageSize: 8,
      });

      for (const summary of searchResults.slice(0, 2)) {
        if (ranked.length >= maxItems + 3) break;
        analyzed += 1;

        try {
          const detail = await adapter.getProductById(summary.cjProductId);
          const variant =
            (detail.variants.find((v) => hasMinimumStock(v.stock, minStock)) as CjVariantDetail | undefined) ||
            (detail.variants[0] as CjVariantDetail | undefined);
          if (!variant || variant.unitCostUsd <= 0) continue;

          let shippingUsd = 0;
          let fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN' = 'UNKNOWN';
          let estimatedDays: number | null = null;
          try {
            const shipping = await adapter.quoteShippingToUsWarehouseAware({
              variantId: variant.cjVid,
              productId: detail.cjProductId,
              quantity: 1,
              destPostalCode: input?.destPostalCode,
              destCountryCode: 'US',
            });
            shippingUsd = shipping.quote.cost;
            fulfillmentOrigin = shipping.fulfillmentOrigin;
            estimatedDays = shipping.quote.estimatedDays;
          } catch {
            // Fast fallback to avoid long-running suggestion requests in production.
            shippingUsd = Math.max(2, Number(settings.maxShippingUsd ?? 12) * 0.55);
            fulfillmentOrigin = 'UNKNOWN';
          }

          const qualification = await cjShopifyUsaQualificationService.evaluate(
            userId,
            variant.unitCostUsd,
            shippingUsd,
          );
          if (qualification.decision !== 'APPROVED') continue;
          if (!hasMinimumStock(variant.stock, minStock)) continue;

          const marginPct = qualification.breakdown.netMarginPct;
          const baseScore =
            45 +
            Math.min(20, marginPct) +
            (fulfillmentOrigin === 'US' ? 14 : fulfillmentOrigin === 'CN' ? 8 : 4) +
            Math.max(0, 12 - shippingUsd) +
            Math.min(8, (variant.stock ?? 0) / 25) +
            (estimatedDays != null ? Math.max(0, 4 - Math.floor(estimatedDays / 5)) : 0);

          const score = clamp(Math.round(baseScore), 1, 99);

          ranked.push({
            cjProductId: detail.cjProductId,
            title: detail.title,
            mainImageUrl: detail.imageUrls?.[0],
            keyword,
            score,
            confidence: confidenceFromScore(score),
            reason: buildSuggestionReason({
              fulfillmentOrigin,
              shippingUsd,
              marginPct,
              stock: Number(variant.stock ?? 0),
            }),
            fulfillmentOrigin,
            stock: Number(variant.stock ?? 0),
            shippingUsd,
            suggestedSellPriceUsd: qualification.breakdown.suggestedSellPriceUsd,
            netMarginPct: marginPct,
          });
        } catch {
          // skip invalid/unavailable candidate silently
        }
      }
    }

    const deduped = Array.from(
      new Map(ranked.map((item) => [item.cjProductId, item])).values(),
    )
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems);

    await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_COMPLETE, 'discover.ai_suggestions', {
      requestedCount: maxItems,
      analyzed,
      suggestedCount: deduped.length,
      keywords: keywordPool,
    } as Prisma.InputJsonValue);

    return {
      generatedAt: new Date().toISOString(),
      totalAnalyzed: analyzed,
      suggestions: deduped,
    };
  },
};
