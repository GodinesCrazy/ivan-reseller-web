/**
 * CJ catalog → opportunity discovery rows (isolated from AliExpress Affiliate).
 * Respects QPS via CjSupplierAdapter throttle + 429 retry.
 */

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';

export type CjOpportunityDiscoveryRow = {
  title: string;
  price: number;
  priceMin: number;
  priceMax: number;
  currency: string;
  sourcePrice: number;
  sourceCurrency: string;
  productUrl: string;
  imageUrl?: string;
  images: string[];
  productId?: string;
  /** Marks pipeline merge/dedup vs Affiliate rows. */
  supplierSource: 'cj';
};

function cjProductUrl(pid: string): string {
  const id = encodeURIComponent(pid);
  return `https://www.cjdropshipping.com/product/${id}`;
}

/**
 * Search CJ listV2 and map to the same loose shape `opportunity-finder` uses before OpportunityItem build.
 * Skips rows without a parseable list price (required by filters).
 */
export async function cjSearchForOpportunityRows(
  userId: number,
  query: string,
  maxItems: number,
  baseCurrency: string,
  options?: { skipEnvGate?: boolean }
): Promise<CjOpportunityDiscoveryRow[]> {
  if (!options?.skipEnvGate && env.OPPORTUNITY_CJ_SUPPLY_MODE === 'off') {
    return [];
  }
  const q = String(query || '').trim();
  if (!q) return [];

  try {
    const adapter = createCjSupplierAdapter(userId);
    const n = Math.max(1, Math.min(maxItems, 50));
    const summaries = await adapter.searchProducts({
      keyword: q,
      page: 1,
      pageSize: n,
    });
    const out: CjOpportunityDiscoveryRow[] = [];
    for (const s of summaries) {
      const unit = s.listPriceUsd;
      if (unit == null || !Number.isFinite(unit) || unit <= 0) continue;
      const img = s.mainImageUrl?.trim();
      const images = img && img.startsWith('http') ? [img] : [];
      if (images.length === 0) continue;
      out.push({
        title: s.title,
        price: unit,
        priceMin: unit,
        priceMax: unit,
        currency: baseCurrency,
        sourcePrice: unit,
        sourceCurrency: 'USD',
        productUrl: cjProductUrl(s.cjProductId),
        imageUrl: img,
        images,
        productId: s.cjProductId,
        supplierSource: 'cj',
      });
      if (out.length >= n) break;
    }
    if (out.length > 0) {
      logger.info('[cj-opportunity-supply] CJ discovery rows', { userId, count: out.length, queryLen: q.length });
    }
    return out;
  } catch (e) {
    logger.warn('[cj-opportunity-supply] CJ search failed (soft fail)', {
      userId,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
