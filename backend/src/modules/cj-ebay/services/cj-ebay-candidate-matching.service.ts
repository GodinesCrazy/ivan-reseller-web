/**
 * CJ → eBay USA — Candidate Matching Service (FASE 3G).
 *
 * For each TrendSeed, searches CJ catalog, picks the best variant,
 * fetches a shipping quote, and returns a CjCandidateMatch.
 *
 * Filtering rules (hard):
 *  - No image → skip
 *  - No parseable cost → skip
 *  - Shipping unavailable + rejectOnUnknownShipping → mark as not viable
 *  - Zero stock (explicit) → skip
 *
 * Output is an array of CjCandidateMatch ready for pricing + scoring.
 */

import { logger } from '../../../config/logger';
import type { ICjSupplierAdapter, CjProductDetail, CjVariantDetail } from '../adapters/cj-supplier.adapter.interface';
import { CjSupplierError } from '../adapters/cj-supplier.errors';
import type {
  TrendSeed,
  CjCandidateMatch,
  OpportunityRunSettings,
} from './cj-ebay-opportunity.types';
import { cjEbayUsWarehouseEvidenceService } from './cj-ebay-us-warehouse-evidence.service';

class CjEbayCandidateMatchingService {
  /**
   * Match all seeds against CJ catalog. Returns all viable matches.
   * Concurrency is intentionally sequential per seed to avoid CJ rate limits.
   */
  async matchSeeds(
    seeds: TrendSeed[],
    settings: OpportunityRunSettings,
    adapter: ICjSupplierAdapter,
    options?: { requireUsWarehouseOnly?: boolean }
  ): Promise<CjCandidateMatch[]> {
    const allMatches: CjCandidateMatch[] = [];

    for (const seed of seeds) {
      try {
        const matches = await this.matchSingleSeed(seed, settings, adapter, options);
        allMatches.push(...matches);
      } catch (err) {
        logger.warn(
          `[CandidateMatching] Seed "${seed.keyword}" failed: ${(err as Error).message}`
        );
      }
    }

    return allMatches;
  }

  private async matchSingleSeed(
    seed: TrendSeed,
    settings: OpportunityRunSettings,
    adapter: ICjSupplierAdapter,
    options?: { requireUsWarehouseOnly?: boolean }
  ): Promise<CjCandidateMatch[]> {
    logger.info(`[CandidateMatching] Searching CJ for seed: "${seed.keyword}"`);

    const summaries = await adapter.searchProducts({
      keyword: seed.keyword,
      pageSize: 20,
    });

    if (summaries.length === 0) {
      logger.info(`[CandidateMatching] No CJ results for seed: "${seed.keyword}"`);
      return [];
    }

    // Filter out products without image or price signal.
    const viable = summaries.filter(
      (s) =>
        typeof s.mainImageUrl === 'string' &&
        s.mainImageUrl.startsWith('http') &&
        s.listPriceUsd != null &&
        s.listPriceUsd > 0 &&
        s.inventoryTotal !== 0 // 0 = explicit dead stock
    );

    // Take top N by raw CJ order (already ranked by the search endpoint).
    const topSummaries = viable.slice(0, settings.maxCandidatesPerSeed);

    const matches: CjCandidateMatch[] = [];

    for (const summary of topSummaries) {
      try {
        const match = await this.buildCandidateMatch(seed, summary.cjProductId, settings, adapter, options);
        if (match) matches.push(match);
      } catch (err) {
        logger.warn(
          `[CandidateMatching] Failed to build match for ${summary.cjProductId}: ${(err as Error).message}`
        );
      }
    }

    return matches;
  }

  private async buildCandidateMatch(
    seed: TrendSeed,
    cjProductId: string,
    settings: OpportunityRunSettings,
    adapter: ICjSupplierAdapter,
    options?: { requireUsWarehouseOnly?: boolean }
  ): Promise<CjCandidateMatch | null> {
    const detail = await adapter.getProductById(cjProductId);

    if (detail.variants.length === 0) {
      logger.info(`[CandidateMatching] Product ${cjProductId} has no variants — skip`);
      return null;
    }

    if (detail.imageUrls.length === 0) {
      logger.info(`[CandidateMatching] Product ${cjProductId} has no images — skip`);
      return null;
    }

    const variants = await this.enrichVariantsWithLiveStock(detail.variants, adapter);

    // Pick best variant: highest confirmed stock, then lowest cost (most marketable entry).
    // Variant count is scored later; it should not eliminate otherwise safe PET items.
    const bestVariant = this.pickBestVariant(variants);
    if (!bestVariant) return null;

    if (!Number.isFinite(bestVariant.unitCostUsd) || bestVariant.unitCostUsd <= 0) {
      logger.info(`[CandidateMatching] Variant ${bestVariant.cjSku} has no valid cost — skip`);
      return null;
    }

    // Fetch shipping quote.
    const shipping = await this.fetchShippingQuote(cjProductId, bestVariant, adapter, detail);

    const shippingViable = this.isShippingViable(shipping, settings);
    if (!shippingViable) {
      logger.info(
        `[CandidateMatching] Product ${cjProductId} shipping not viable (amount: ${shipping?.amountUsd}, confidence: ${shipping?.confidence}) — skip`
      );
      return null;
    }
    if (options?.requireUsWarehouseOnly && shipping?.fulfillmentOrigin !== 'US') {
      logger.info(
        `[CandidateMatching] Product ${cjProductId} skipped: US warehouse required but origin=${shipping?.fulfillmentOrigin ?? 'UNKNOWN'} status=${shipping?.usWarehouseStatus ?? 'UNKNOWN'}`
      );
      return null;
    }

    return {
      seed,
      cjProductId: detail.cjProductId,
      cjProductTitle: detail.title,
      images: detail.imageUrls.slice(0, 5),
      selectedVariant: {
        cjSku: bestVariant.cjSku,
        cjVid: bestVariant.cjVid,
        attributes: bestVariant.attributes,
        unitCostUsd: bestVariant.unitCostUsd,
        stock: bestVariant.stock,
      },
      totalVariants: detail.variants.length,
      shipping: shipping
        ? {
            amountUsd: shipping.amountUsd,
            confidence: shipping.confidence,
            daysMin: shipping.daysMin,
            daysMax: shipping.daysMax,
            serviceName: shipping.serviceName,
            fulfillmentOrigin: shipping.fulfillmentOrigin,
          }
        : null,
      shippingViable: true,
    };
  }

  private pickBestVariant(variants: CjVariantDetail[]): CjVariantDetail | null {
    const withCost = variants.filter(
      (v) => Number.isFinite(v.unitCostUsd) && v.unitCostUsd > 0
    );
    if (withCost.length === 0) return null;

    // Sort: highest in-stock first, then lowest cost for entry-level viability.
    return [...withCost].sort((a, b) => {
      if (b.stock !== a.stock) return b.stock - a.stock;
      return a.unitCostUsd - b.unitCostUsd;
    })[0];
  }

  private async enrichVariantsWithLiveStock(
    variants: CjVariantDetail[],
    adapter: ICjSupplierAdapter
  ): Promise<CjVariantDetail[]> {
    const probeable = variants
      .filter((v) => String(v.cjVid || '').trim())
      .sort((a, b) => a.unitCostUsd - b.unitCostUsd)
      .slice(0, 12);
    if (probeable.length === 0) return variants;

    try {
      const stockMap = await adapter.getStockForSkus(probeable.map((v) => String(v.cjVid).trim()));
      if (stockMap.size === 0) return variants;
      return variants.map((variant) => {
        const key = String(variant.cjVid || '').trim();
        const liveStock = key ? stockMap.get(key) : undefined;
        return liveStock === undefined ? variant : { ...variant, stock: liveStock };
      });
    } catch (err) {
      logger.warn(`[CandidateMatching] Live stock enrichment failed: ${(err as Error).message}`);
      return variants;
    }
  }

  private async fetchShippingQuote(
    cjProductId: string,
    variant: CjVariantDetail,
    adapter: ICjSupplierAdapter,
    detail?: Pick<CjProductDetail, 'destinationInventories'>
  ): Promise<{
    amountUsd: number;
    confidence: 'KNOWN' | 'ESTIMATED' | 'UNKNOWN';
    daysMin?: number;
    daysMax?: number;
    serviceName?: string;
    fulfillmentOrigin?: 'US' | 'CN';
    usWarehouseStatus?: string;
  } | null> {
    try {
      const quoteInput = variant.cjVid
        ? { variantId: variant.cjVid, quantity: 1 }
        : { productId: cjProductId, quantity: 1 };

      const result = await cjEbayUsWarehouseEvidenceService.resolve({
        adapter,
        product: detail,
        freightInput: quoteInput,
      });
      const freight = result.freight;
      if (!freight) return null;

      if (!Number.isFinite(freight.quote.cost) || freight.quote.cost < 0) return null;

      return {
        amountUsd: freight.quote.cost,
        confidence: freight.quote.estimatedDays != null ? 'KNOWN' : 'ESTIMATED',
        daysMin: freight.quote.estimatedDays ?? undefined,
        daysMax: freight.quote.estimatedDays ?? undefined,
        serviceName: freight.quote.method,
        fulfillmentOrigin: freight.fulfillmentOrigin,
        usWarehouseStatus: result.status,
      };
    } catch (err) {
      if (err instanceof CjSupplierError && err.code === 'CJ_SHIPPING_UNAVAILABLE') {
        return null;
      }
      logger.warn(
        `[CandidateMatching] Shipping quote error for ${cjProductId}: ${(err as Error).message}`
      );
      return null;
    }
  }

  private isShippingViable(
    shipping: { amountUsd: number; confidence: 'KNOWN' | 'ESTIMATED' | 'UNKNOWN' } | null,
    settings: OpportunityRunSettings
  ): boolean {
    if (!shipping) return false;
    if (!Number.isFinite(shipping.amountUsd)) return false;
    if (shipping.amountUsd > settings.maxShippingUsdFilter) return false;
    return true;
  }
}

export const cjEbayCandidateMatchingService = new CjEbayCandidateMatchingService();
