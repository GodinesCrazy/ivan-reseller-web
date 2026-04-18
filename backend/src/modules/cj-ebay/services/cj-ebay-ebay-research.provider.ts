/**
 * CJ → eBay USA — eBay Research Trend Provider (FASE 3G.1).
 *
 * Implements IMarketTrendProvider using the eBay Browse API.
 * For each curated seed keyword it probes the live eBay marketplace,
 * counts active listings, and converts that signal into a real trendConfidence.
 *
 * This replaces MockTrendProvider as the primary provider whenever eBay
 * credentials are available for the user.  The mock is retained as fallback.
 */

import { logger } from '../../../config/logger';
import type { IMarketTrendProvider } from './cj-ebay-trend-discovery.service';
import type { TrendSeed, TrendSeedSource, OpportunityRunSettings } from './cj-ebay-opportunity.types';
import { createEbayBrowseClient } from './cj-ebay-ebay-browse.client';
import { cjEbayDemandSignalService } from './cj-ebay-demand-signal.service';

// ====================================
// CURATED SEED DEFINITIONS
// ====================================
// These represent eBay US dropshipping categories with historically
// strong CJ catalog coverage.  The Browse API measures actual market
// activity for each keyword, producing a data-driven trendConfidence.

const RESEARCH_SEEDS: Array<{ keyword: string; category: string; productConcept: string }> = [
  {
    keyword: 'LED strip lights bedroom',
    category: 'Home & Garden > Lighting',
    productConcept: 'Decorative LED strips with remote, 5m, multicolor',
  },
  {
    keyword: 'phone case wireless charging',
    category: 'Cell Phones & Accessories > Cases',
    productConcept: 'Qi-compatible slim protective case for popular phone models',
  },
  {
    keyword: 'car phone holder dashboard',
    category: 'eBay Motors > Auto Parts > Accessories',
    productConcept: 'Magnetic or suction mount, 360-degree rotation, universal fit',
  },
  {
    keyword: 'kitchen gadgets set',
    category: 'Home & Garden > Kitchen',
    productConcept: 'Compact multipurpose kitchen tools bundle',
  },
  {
    keyword: 'portable bluetooth speaker outdoor',
    category: 'Consumer Electronics > Portable Audio',
    productConcept: 'Waterproof mini speaker, USB-C charge, 8h battery',
  },
  {
    keyword: 'fitness resistance bands set',
    category: 'Sporting Goods > Fitness',
    productConcept: 'Multi-resistance loop bands + carry bag',
  },
  {
    keyword: 'cable organizer desk',
    category: 'Computers > Accessories',
    productConcept: 'Silicone cable clips + box management, compact desk bundle',
  },
  {
    keyword: 'pet grooming brush self cleaning',
    category: 'Pet Supplies > Grooming',
    productConcept: 'Retractable slicker brush for dogs/cats, push-button hair removal',
  },
  {
    keyword: 'posture corrector back support',
    category: 'Health & Beauty > Back Support',
    productConcept: 'Adjustable brace, breathable material, unisex M-XL',
  },
  {
    keyword: 'plant watering spikes set',
    category: 'Home & Garden > Plants',
    productConcept: 'Ceramic slow-drip self-watering stakes (set of 6)',
  },
];

// ====================================
// PROVIDER
// ====================================

export class EbayResearchProvider implements IMarketTrendProvider {
  readonly providerId: TrendSeedSource = 'EBAY_RESEARCH';

  constructor(private readonly userId: number) {}

  async isAvailable(): Promise<boolean> {
    const client = await createEbayBrowseClient(this.userId);
    return client !== null;
  }

  async fetchSeeds(settings: OpportunityRunSettings): Promise<TrendSeed[]> {
    const client = await createEbayBrowseClient(this.userId);
    if (!client) {
      logger.warn('[EbayResearchProvider] No eBay credentials available — cannot fetch real seeds');
      return [];
    }

    const wantedSeeds = settings.maxSeedsPerRun ?? 8;
    // Probe a few extra so we can sort and trim to the top N by confidence
    const probeCount = Math.min(wantedSeeds + 2, RESEARCH_SEEDS.length);
    const seeds: TrendSeed[] = [];

    for (const def of RESEARCH_SEEDS.slice(0, probeCount)) {
      try {
        const searchResult = await client.searchItems(def.keyword, 50);
        const signal = cjEbayDemandSignalService.computeFromBrowseResult(searchResult);

        seeds.push({
          keyword: def.keyword,
          category: def.category,
          productConcept: def.productConcept,
          trendConfidence: signal.trendConfidence,
          source: 'EBAY_RESEARCH',
          rawSignal: signal.rawSignal,
          evidenceSummary: signal.evidenceSummary,
        });

        logger.info(
          `[EbayResearchProvider] "${def.keyword}": ${searchResult.total} listings → confidence ${signal.trendConfidence.toFixed(2)}`,
        );
      } catch (err) {
        logger.warn(
          `[EbayResearchProvider] Skipping "${def.keyword}": ${(err as Error).message}`,
        );
      }
    }

    if (seeds.length === 0) return [];

    // Sort by confidence desc, return top N
    seeds.sort((a, b) => b.trendConfidence - a.trendConfidence);
    return seeds.slice(0, wantedSeeds);
  }
}
