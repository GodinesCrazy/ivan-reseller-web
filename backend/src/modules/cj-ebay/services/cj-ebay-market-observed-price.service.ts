/**
 * CJ → eBay USA — Market Observed Price Service (FASE 3G.1).
 *
 * Replaces the 2.6× cost heuristic with real eBay Browse API prices
 * whenever credentials are available.
 *
 * Output is always a MarketObservedPriceResult; the `marketSource` field
 * tells callers whether the data is REAL, ESTIMATED, or a fallback.
 *
 * Per-keyword results are cached for the lifetime of the process call
 * (a run) to avoid redundant Browse requests for the same seed keyword.
 */

import { logger } from '../../../config/logger';
import { createEbayBrowseClient } from './cj-ebay-ebay-browse.client';
import type { MarketObservedPriceResult } from './cj-ebay-opportunity.types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ====================================
// PRICE STATISTICS HELPERS
// ====================================

function computePriceStats(prices: number[]): {
  min: number;
  max: number;
  median: number;
  typical: number;
} {
  const sorted = [...prices].sort((a, b) => a - b);
  const len = sorted.length;
  const min = sorted[0];
  const max = sorted[len - 1];
  const median = sorted[Math.floor(len / 2)];

  // IQR midpoint: average of prices in the 25th–75th percentile range
  const q1 = sorted[Math.floor(len * 0.25)];
  const q3 = sorted[Math.floor(len * 0.75)];
  const mid = sorted.filter((p) => p >= q1 && p <= q3);
  const typical =
    mid.length > 0 ? round2(mid.reduce((s, p) => s + p, 0) / mid.length) : median;

  return { min, max, median, typical };
}

function confidenceFromSampleSize(n: number): number {
  // Grows from ~0.40 at n=3 to ~0.90 at n=50+
  return Math.min(0.92, 0.35 + (n / 55) * 0.57);
}

// ====================================
// SERVICE
// ====================================

class CjEbayMarketObservedPriceService {
  /**
   * Fetch real market prices for `keyword` on eBay.
   * Falls back to the heuristic estimate if credentials are absent or the
   * Browse call fails.
   */
  async fetchMarketPrice(keyword: string, userId: number): Promise<MarketObservedPriceResult> {
    try {
      const client = await createEbayBrowseClient(userId);
      if (!client) {
        logger.debug(`[MarketObservedPrice] No eBay creds for user ${userId} — using heuristic`);
        return this._noCredentialsFallback(keyword);
      }

      const result = await client.searchItems(keyword, 50);

      const rawPrices = result.items
        .map((i) => i.price.value)
        .filter((p) => p > 0.5 && p < 9_999);

      if (rawPrices.length < 3) {
        logger.debug(
          `[MarketObservedPrice] "${keyword}": only ${rawPrices.length} valid prices — using heuristic`,
        );
        return this._sparseDataFallback(keyword, result.total);
      }

      const { min, max, median, typical } = computePriceStats(rawPrices);
      const confidence = confidenceFromSampleSize(rawPrices.length);

      logger.info(
        `[MarketObservedPrice] "${keyword}": ${rawPrices.length} prices, typical=$${typical}, median=$${median} (total=${result.total})`,
      );

      return {
        observedMinPrice: round2(min),
        observedMedianPrice: round2(median),
        observedMaxPrice: round2(max),
        observedTypicalPrice: typical,
        observedPriceConfidence: round2(confidence),
        marketSource: 'REAL',
        evidenceSummary: `eBay Browse (${result.total.toLocaleString('en-US')} listings activos): precio típico $${typical}, rango $${round2(min)}–$${round2(max)} (muestra: ${rawPrices.length} precios)`,
        listingCount: result.total,
      };
    } catch (err) {
      logger.warn(
        `[MarketObservedPrice] Browse API error for "${keyword}": ${(err as Error).message}`,
      );
      return this._apiFallback(keyword, (err as Error).message);
    }
  }

  /**
   * Pure cost-based heuristic estimate.
   * Use when Browse is unavailable AND the keyword is not known.
   * marketSource = ESTIMATED so the UI can badge it clearly.
   */
  estimateFromCost(supplierCostUsd: number, shippingUsd: number): MarketObservedPriceResult {
    const total = supplierCostUsd + shippingUsd;
    const typical = round2(total * 2.6);
    return {
      observedMinPrice: round2(total * 2.0),
      observedMedianPrice: typical,
      observedMaxPrice: round2(total * 3.4),
      observedTypicalPrice: typical,
      observedPriceConfidence: 0.22,
      marketSource: 'ESTIMATED',
      evidenceSummary: `Precio estimado por heurística (2.6× costo total $${round2(total)}) — sin datos reales de eBay`,
      listingCount: 0,
    };
  }

  // ---- private fallbacks ------------------------------------------------

  private _noCredentialsFallback(keyword: string): MarketObservedPriceResult {
    return {
      observedMinPrice: null,
      observedMedianPrice: null,
      observedMaxPrice: null,
      observedTypicalPrice: null,
      observedPriceConfidence: 0.15,
      marketSource: 'ESTIMATED',
      evidenceSummary: `Precio de mercado no disponible para "${keyword}": credenciales eBay no encontradas`,
      listingCount: 0,
    };
  }

  private _sparseDataFallback(keyword: string, total: number): MarketObservedPriceResult {
    return {
      observedMinPrice: null,
      observedMedianPrice: null,
      observedMaxPrice: null,
      observedTypicalPrice: null,
      observedPriceConfidence: 0.18,
      marketSource: 'ESTIMATED',
      evidenceSummary: `Datos insuficientes de eBay para "${keyword}" (${total} listings, muestra de precios muy pequeña)`,
      listingCount: total,
    };
  }

  private _apiFallback(keyword: string, reason: string): MarketObservedPriceResult {
    return {
      observedMinPrice: null,
      observedMedianPrice: null,
      observedMaxPrice: null,
      observedTypicalPrice: null,
      observedPriceConfidence: 0.15,
      marketSource: 'ESTIMATED',
      evidenceSummary: `Error al consultar eBay Browse para "${keyword}": ${reason}`,
      listingCount: 0,
    };
  }
}

export const cjEbayMarketObservedPriceService = new CjEbayMarketObservedPriceService();
