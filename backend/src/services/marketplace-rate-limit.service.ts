/**
 * Phase 1: Per-marketplace API rate limiting.
 * Ensures outbound API calls do not exceed marketplace limits.
 * Uses sliding-window in-memory; configurable via env (e.g. RATE_LIMIT_EBAY_PER_MIN).
 */

import logger from '../config/logger';

const DEFAULT_EBAY_PER_MIN = Number(process.env.RATE_LIMIT_EBAY_PER_MIN || '100');
const DEFAULT_MERCADOLIBRE_PER_MIN = Number(process.env.RATE_LIMIT_MERCADOLIBRE_PER_MIN || '50');
const DEFAULT_AMAZON_PER_MIN = Number(process.env.RATE_LIMIT_AMAZON_PER_MIN || '30');

const WINDOW_MS = 60 * 1000;

type MarketplaceKey = 'ebay' | 'mercadolibre' | 'amazon';

const limits: Record<MarketplaceKey, number> = {
  ebay: Math.max(1, Math.min(500, DEFAULT_EBAY_PER_MIN)),
  mercadolibre: Math.max(1, Math.min(200, DEFAULT_MERCADOLIBRE_PER_MIN)),
  amazon: Math.max(1, Math.min(100, DEFAULT_AMAZON_PER_MIN)),
};

const timestamps: Record<MarketplaceKey, number[]> = {
  ebay: [],
  mercadolibre: [],
  amazon: [],
};

function prune(marketplace: MarketplaceKey): void {
  const now = Date.now();
  const list = timestamps[marketplace];
  while (list.length > 0 && now - list[0]! >= WINDOW_MS) {
    list.shift();
  }
}

/**
 * Wait until we are under the rate limit for the given marketplace, then record one call.
 * Call this before making an outbound API request to eBay, Mercado Libre, or Amazon.
 */
export async function acquireMarketplaceRateLimit(marketplace: MarketplaceKey): Promise<void> {
  const key = marketplace;
  const limit = limits[key];
  prune(key);
  const list = timestamps[key];
  if (list.length >= limit) {
    const waitMs = list[0]! + WINDOW_MS - Date.now();
    if (waitMs > 0) {
      logger.debug('[RATE-LIMIT] Waiting before marketplace call', {
        marketplace: key,
        waitMs,
        currentInWindow: list.length,
        limit,
      });
      await new Promise((r) => setTimeout(r, waitMs));
      prune(key);
    }
  }
  list.push(Date.now());
}
