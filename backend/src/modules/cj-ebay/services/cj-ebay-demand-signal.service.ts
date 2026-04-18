/**
 * CJ → eBay USA — Demand Signal Service (FASE 3G.1).
 *
 * Converts eBay Browse search results into a structured demand signal.
 * The signal drives trendConfidence in real seeds and dataQualityScore
 * in the scoring engine.
 */

import type { EbayBrowseSearchResult } from './cj-ebay-ebay-browse.client';
import type { DataSourceType } from './cj-ebay-opportunity.types';

// ====================================
// TYPES
// ====================================

export interface DemandSignal {
  keyword: string;
  totalListings: number;
  /** 0.0–1.0 trust score derived from live listing volume. */
  trendConfidence: number;
  sourceType: DataSourceType;
  evidenceSummary: string;
  rawSignal: Record<string, unknown>;
}

// ====================================
// CONFIDENCE MAPPING
// ====================================

function listingVolumeToConfidence(total: number): { confidence: number; demandLabel: string } {
  if (total >= 5_000) return { confidence: 0.90, demandLabel: 'muy alta' };
  if (total >= 1_500) return { confidence: 0.82, demandLabel: 'alta' };
  if (total >= 500)  return { confidence: 0.72, demandLabel: 'moderada-alta' };
  if (total >= 200)  return { confidence: 0.62, demandLabel: 'moderada' };
  if (total >= 80)   return { confidence: 0.52, demandLabel: 'baja-moderada' };
  if (total >= 30)   return { confidence: 0.42, demandLabel: 'baja' };
  return              { confidence: 0.30, demandLabel: 'mínima' };
}

// ====================================
// SERVICE
// ====================================

class CjEbayDemandSignalService {
  /**
   * Compute a demand signal from a real eBay Browse search result.
   * Source type is always REAL — use this path only for live Browse data.
   */
  computeFromBrowseResult(result: EbayBrowseSearchResult): DemandSignal {
    const { confidence, demandLabel } = listingVolumeToConfidence(result.total);

    return {
      keyword: result.searchQuery,
      totalListings: result.total,
      trendConfidence: confidence,
      sourceType: 'REAL',
      evidenceSummary: `eBay Browse API: ${result.total.toLocaleString('en-US')} listings activos para "${result.searchQuery}". Demanda de mercado ${demandLabel}.`,
      rawSignal: {
        totalListings: result.total,
        sampleCount: result.items.length,
        marketplace: 'EBAY_US',
        queryTimestamp: new Date().toISOString(),
      },
    };
  }
}

export const cjEbayDemandSignalService = new CjEbayDemandSignalService();
