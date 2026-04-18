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
import type { ICjSupplierAdapter, CjVariantDetail } from '../adapters/cj-supplier.adapter.interface';
import { CjSupplierError } from '../adapters/cj-supplier.errors';
import type {
  TrendSeed,
  CjCandidateMatch,
  OpportunityRunSettings,
} from './cj-ebay-opportunity.types';

class CjEbayCandidateMatchingService {
  /**
   * Match all seeds against CJ catalog. Returns all viable matches.
   * Concurrency is intentionally sequential per seed to avoid CJ rate limits.
   */
  async matchSeeds(
    seeds: TrendSeed[],
    settings: OpportunityRunSettings,
    adapter: ICjSupplierAdapter
  ): Promise<CjCandidateMatch[]> {
    const allMatches: CjCandidateMatch[] = [];

    for (const seed of seeds) {
      try {
        const matches = await this.matchSingleSeed(seed, settings, adapter);
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
    adapter: ICjSupplierAdapter
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
        const match = await this.buildCandidateMatch(seed, summary.cjProductId, settings, adapter);
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
    adapter: ICjSupplierAdapter
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

    // STARTER mode: enforce max variant count.
    if (
      settings.mode === 'STARTER' &&
      settings.starterModeConfig &&
      detail.variants.length > settings.starterModeConfig.maxVariants
    ) {
      logger.info(
        `[CandidateMatching] Product ${cjProductId} has ${detail.variants.length} variants > starter max ${settings.starterModeConfig.maxVariants} — skip`
      );
      return null;
    }

    // Pick best variant: highest stock, then lowest cost (most marketable entry).
    const bestVariant = this.pickBestVariant(detail.variants);
    if (!bestVariant) return null;

    if (!Number.isFinite(bestVariant.unitCostUsd) || bestVariant.unitCostUsd <= 0) {
      logger.info(`[CandidateMatching] Variant ${bestVariant.cjSku} has no valid cost — skip`);
      return null;
    }

    // Fetch shipping quote.
    const shipping = await this.fetchShippingQuote(cjProductId, bestVariant, adapter);

    const shippingViable = this.isShippingViable(shipping, settings);
    if (!shippingViable) {
      logger.info(
        `[CandidateMatching] Product ${cjProductId} shipping not viable (amount: ${shipping?.amountUsd}, confidence: ${shipping?.confidence}) — skip`
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

  private async fetchShippingQuote(
    cjProductId: string,
    variant: CjVariantDetail,
    adapter: ICjSupplierAdapter
  ): Promise<{
    amountUsd: number;
    confidence: 'KNOWN' | 'ESTIMATED' | 'UNKNOWN';
    daysMin?: number;
    daysMax?: number;
    serviceName?: string;
  } | null> {
    try {
      const quoteInput = variant.cjVid
        ? { variantId: variant.cjVid, quantity: 1, destCountry: 'US' as const }
        : { productId: cjProductId, quantity: 1, destCountry: 'US' as const };

      const result = await adapter.quoteShippingToUs(quoteInput);

      if (!Number.isFinite(result.amountUsd) || result.amountUsd < 0) return null;

      return {
        amountUsd: result.amountUsd,
        confidence: result.confidence === 'known' ? 'KNOWN' : 'ESTIMATED',
        daysMin: result.estimatedMinDays,
        daysMax: result.estimatedMaxDays,
        serviceName: result.serviceName,
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
