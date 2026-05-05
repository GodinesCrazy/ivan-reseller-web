import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';
import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierError } from '../../cj-ebay/adapters/cj-supplier.errors';
import { cjShopifyUsaQualificationService } from './cj-shopify-usa-qualification.service';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import { isCjShopifyUsaPetProduct } from './cj-shopify-usa-policy.service';
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
  'pet grooming',
  'dog leash',
  'cat toy',
  'pet bowl',
  'pet carrier',
  'cat scratching post',
];
const CJ_RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

function isCjRateLimitError(err: unknown): err is CjSupplierError {
  return err instanceof CjSupplierError && err.code === 'CJ_RATE_LIMIT';
}

function createCjRateLimitError(action: string): AppError {
  return new AppError(
    'CJ esta limitando temporalmente las solicitudes. Espera cerca de 1 minuto antes de evaluar mas productos.',
    429,
    ErrorCode.API_RATE_LIMIT,
    {
      supplier: 'CJ',
      code: 'CJ_RATE_LIMIT',
      retryAfterSeconds: CJ_RATE_LIMIT_RETRY_AFTER_SECONDS,
      retryable: true,
      action,
    },
  );
}

async function withSoftTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  /** Number of additional variant drafts created as siblings for multi-variant publishing. */
  siblingsDrafted?: number;
}

export const cjShopifyUsaDiscoverService = {
  async search(userId: number, keyword: string, page: number, pageSize: number): Promise<CjProductSummary[]> {
    console.log(`[cj-shopify-usa-discover] Starting search for user ${userId}: "${keyword}" (page ${page})`);
    const adapter = createCjSupplierAdapter(userId);
    const results = await adapter.searchProducts({ keyword, page, pageSize });
    console.log(`[cj-shopify-usa-discover] Search returned ${results.length} results from adapter`);
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
    try {
      const adapter = createCjSupplierAdapter(userId);
      const product = await enrichProductDetailWithLiveStock(adapter, await adapter.getProductById(cjProductId));
      if (!isCjShopifyUsaPetProduct({ title: product.title, description: product.description })) {
        throw new AppError('CJ product is not related to the pet store catalog.', 400, ErrorCode.VALIDATION_ERROR);
      }
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
          if (isCjRateLimitError(err)) {
            shippingError = 'CJ esta limitando las cotizaciones de envio. Espera cerca de 1 minuto y vuelve a evaluar.';
          } else {
            shippingError = err instanceof Error ? err.message : String(err);
          }
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
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (isCjRateLimitError(err)) {
        await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_ERROR, 'discover.evaluate.rate_limited', {
          cjProductId,
          error: err.message,
          code: err.code,
          retryAfterSeconds: CJ_RATE_LIMIT_RETRY_AFTER_SECONDS,
        } as Prisma.InputJsonValue).catch(() => {});
        throw createCjRateLimitError('discover.evaluate');
      }
      const msg = err instanceof Error ? err.message : String(err);
      // Map remaining CJ/runtime failures to 400 for better UX (avoid 500s on search/eval).
      throw new AppError(`Error evaluando producto CJ: ${msg}`, 400, ErrorCode.EXTERNAL_API_ERROR);
    }
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
    if (!isCjShopifyUsaPetProduct({ title: product.title, description: product.description })) {
      throw new AppError('CJ product is not related to the pet store catalog.', 400, ErrorCode.VALIDATION_ERROR);
    }
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
            attributes: { ...(v.attributes ?? {}), variantImage: v.variantImage } as Prisma.InputJsonValue,
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

    // ── Auto-draft ALL other eligible variants as siblings ──
    // When publishListing runs on the primary listing, it will detect these
    // sibling DRAFT listings and create a multi-variant Shopify product with
    // a proper variant picker (Color / Size / Style selector).
    const otherEligible = eligibleVariants.filter(
      (v) => v.id !== targetVariant.id && Number(v.unitCostUsd ?? 0) > 0,
    );
    let siblingsDrafted = 0;

    for (const sibVar of otherEligible) {
      try {
        await cjShopifyUsaPublishService.buildDraft({
          userId,
          productId: dbProduct.id,
          variantId: sibVar.id,
          quantity: 1,
        });
        siblingsDrafted++;
      } catch {
        // Sibling draft failure is non-blocking; primary draft is already created.
      }
    }

    if (siblingsDrafted > 0) {
      console.log(
        `[ShopifyDiscover] Auto-drafted ${siblingsDrafted} sibling variants for product ${cjProductId} (total eligible: ${eligibleVariants.length})`,
      );
    }

    return {
      dbProductId: dbProduct.id,
      listing: {
        id: listing.id,
        status: listing.status,
        listedPriceUsd: listing.listedPriceUsd ? Number(listing.listedPriceUsd) : null,
        shopifySku: listing.shopifySku,
      },
      siblingsDrafted,
    };
  },

  async aiSuggestions(
    userId: number,
    input?: { count?: number; destPostalCode?: string; keywords?: string[] },
  ): Promise<DiscoverAiSuggestionsResult> {
    console.log(`[cj-shopify-usa-discover] Starting AI suggestions for user ${userId}`, input);
    const adapter = createCjSupplierAdapter(userId);
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const minStock = Math.max(0, Number(settings.minStock ?? 1));
    const maxItems = clamp(Number(input?.count ?? 6), 3, 12);
    const keywordPool = (input?.keywords && input.keywords.length > 0
      ? input.keywords
      : SHOPIFY_USA_AI_DISCOVERY_KEYWORDS
    ).slice(0, 2);

    const ranked: DiscoverAiSuggestionItem[] = [];
    let analyzed = 0;

    for (const keyword of keywordPool) {
      let searchResults: CjProductSummary[] = [];
      try {
        searchResults = await withSoftTimeout(
          adapter.searchProducts({ keyword, page: 1, pageSize: 6 }),
          7000,
        );
      } catch {
        continue;
      }

      for (const summary of searchResults.slice(0, 1)) {
        if (ranked.length >= maxItems + 3) break;
        analyzed += 1;

        try {
          const detail = await withSoftTimeout(adapter.getProductById(summary.cjProductId), 7000);
          if (!isCjShopifyUsaPetProduct({ title: detail.title, description: detail.description })) continue;
          const variant =
            (detail.variants.find((v) => hasMinimumStock(v.stock, minStock)) as CjVariantDetail | undefined) ||
            (detail.variants[0] as CjVariantDetail | undefined);
          if (!variant || variant.unitCostUsd <= 0) continue;

          let shippingUsd = 0;
          let fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN' = 'UNKNOWN';
          let estimatedDays: number | null = null;
          try {
            const shipping = await withSoftTimeout(
              adapter.quoteShippingToUsWarehouseAware({
                variantId: variant.cjVid,
                productId: detail.cjProductId,
                quantity: 1,
                destPostalCode: input?.destPostalCode,
                destCountryCode: 'US',
              }),
              7000,
            );
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
          const hasStock = hasMinimumStock(variant.stock, minStock);
          if (!hasStock && qualification.decision !== 'APPROVED') continue;

          const marginPct = qualification.breakdown.netMarginPct;
          const approvalBoost = qualification.decision === 'APPROVED' ? 12 : -8;
          const baseScore =
            45 +
            Math.min(20, marginPct) +
            (fulfillmentOrigin === 'US' ? 14 : fulfillmentOrigin === 'CN' ? 8 : 4) +
            Math.max(0, 12 - shippingUsd) +
            Math.min(8, (variant.stock ?? 0) / 25) +
            (estimatedDays != null ? Math.max(0, 4 - Math.floor(estimatedDays / 5)) : 0) +
            approvalBoost;

          const score = clamp(Math.round(baseScore), 1, 99);
          const reasonText =
            qualification.decision === 'APPROVED'
              ? buildSuggestionReason({
                  fulfillmentOrigin,
                  shippingUsd,
                  marginPct,
                  stock: Number(variant.stock ?? 0),
                })
              : `${qualification.reasons[0] || 'Ajustar pricing/operación'} · ${buildSuggestionReason({
                  fulfillmentOrigin,
                  shippingUsd,
                  marginPct,
                  stock: Number(variant.stock ?? 0),
                })}`;

          ranked.push({
            cjProductId: detail.cjProductId,
            title: detail.title,
            mainImageUrl: detail.imageUrls?.[0],
            keyword,
            score,
            confidence: confidenceFromScore(score),
            reason: reasonText,
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
