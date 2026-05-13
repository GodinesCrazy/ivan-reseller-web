/**
 * CJ → eBay USA — Trend Discovery Service (FASE 3G / 3G.1).
 *
 * Provider adapter pattern: the system tries real providers in priority
 * order and falls back to mock only when no real data is available.
 *
 * 3G.1 changes:
 *  - discoverSeeds() now accepts userId so the EbayResearchProvider can
 *    look up eBay credentials for the requesting user.
 *  - EbayResearchProvider is constructed on demand (not a singleton)
 *    because it is user-scoped.
 *  - providerUsed and providerNote are surfaced in the run record so the
 *    UI can show REAL / MOCK / MANUAL badges correctly.
 *
 * All providers produce the same TrendSeed[] contract.
 */

import { logger } from '../../../config/logger';
import type { TrendSeed, TrendSeedSource, OpportunityRunSettings } from './cj-ebay-opportunity.types';
import { EbayResearchProvider } from './cj-ebay-ebay-research.provider';

// ====================================
// PROVIDER INTERFACE
// ====================================

export interface IMarketTrendProvider {
  readonly providerId: TrendSeedSource;
  /** Returns true if this provider can operate (credentials present, etc.). */
  isAvailable(): Promise<boolean>;
  /** Fetch trend seeds for the given run config. */
  fetchSeeds(settings: OpportunityRunSettings): Promise<TrendSeed[]>;
}

// ====================================
// MOCK TREND PROVIDER
// ====================================
// Realistic seeds derived from observed eBay dropshipping performance data.
// Source type is always MOCK_TREND — surfaced clearly in UI badges.

const MOCK_SEEDS: Omit<TrendSeed, 'source'>[] = [
  {
    keyword: 'dog grooming brush self cleaning',
    category: 'Pet Supplies > Dog Grooming',
    productConcept: 'Self-cleaning slicker brush for dogs, one-button hair release',
    trendConfidence: 0.88,
    rawSignal: { basisPoints: 8800, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — producto liviano, repetible y compatible con eBay Pet Supplies.',
  },
  {
    keyword: 'cat water fountain filter',
    category: 'Pet Supplies > Cat Supplies',
    productConcept: 'Replacement filters or small automatic water fountain accessories',
    trendConfidence: 0.84,
    rawSignal: { basisPoints: 8400, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — consumible/repuesto con buena recurrencia potencial.',
  },
  {
    keyword: 'dog poop bag holder leash',
    category: 'Pet Supplies > Dog Supplies',
    productConcept: 'Clip-on waste bag dispenser for leash walking',
    trendConfidence: 0.81,
    rawSignal: { basisPoints: 8100, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — bajo costo, bajo riesgo logístico y demanda cotidiana.',
  },
  {
    keyword: 'cat toy interactive wand',
    category: 'Pet Supplies > Cat Toys',
    productConcept: 'Interactive teaser wand or feather toy for indoor cats',
    trendConfidence: 0.78,
    rawSignal: { basisPoints: 7800, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — artículo liviano, no electrónico y fácil de publicar.',
  },
  {
    keyword: 'pet nail grinder replacement',
    category: 'Pet Supplies > Grooming',
    productConcept: 'Pet nail grinder accessories or low-voltage grooming tool',
    trendConfidence: 0.75,
    rawSignal: { basisPoints: 7500, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — grooming demand; requires policy/image check if powered.',
  },
  {
    keyword: 'dog training clicker',
    category: 'Pet Supplies > Dog Training',
    productConcept: 'Small dog training clicker with wrist strap',
    trendConfidence: 0.73,
    rawSignal: { basisPoints: 7300, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — simple, small, low capital risk.',
  },
  {
    keyword: 'pet hair remover laundry',
    category: 'Pet Supplies > Cleaning & Odor Removal',
    productConcept: 'Reusable pet hair remover for laundry or furniture',
    trendConfidence: 0.72,
    rawSignal: { basisPoints: 7200, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — household pet pain point, repeatable accessory.',
  },
  {
    keyword: 'slow feeder dog bowl insert',
    category: 'Pet Supplies > Dog Bowls & Feeders',
    productConcept: 'Slow-feeder insert or puzzle bowl for dogs',
    trendConfidence: 0.76,
    rawSignal: { basisPoints: 7600, region: 'US', dataAge: 'mock', niche: 'PET_SUPPLIES' },
    evidenceSummary: 'Seed pet mock — practical accessory; watch dimensions and material claims.',
  },
];

class MockTrendProvider implements IMarketTrendProvider {
  readonly providerId: TrendSeedSource = 'MOCK_TREND';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetchSeeds(settings: OpportunityRunSettings): Promise<TrendSeed[]> {
    const limit = settings.maxSeedsPerRun ?? 8;
    const pool = settings.requirePetCategory ? MOCK_SEEDS.filter(isPetSeed) : MOCK_SEEDS;
    const seeds = pool.slice(0, limit).map((s) => ({
      ...s,
      source: 'MOCK_TREND' as TrendSeedSource,
    }));
    logger.info(`[TrendDiscovery] MockTrendProvider returned ${seeds.length} seeds`);
    return seeds;
  }
}

// ====================================
// MANUAL TREND PROVIDER
// ====================================

export class ManualTrendProvider implements IMarketTrendProvider {
  readonly providerId: TrendSeedSource = 'MANUAL';
  private seeds: TrendSeed[];

  constructor(seeds: TrendSeed[]) {
    this.seeds = seeds;
  }

  async isAvailable(): Promise<boolean> {
    return this.seeds.length > 0;
  }

  async fetchSeeds(_settings: OpportunityRunSettings): Promise<TrendSeed[]> {
    return this.seeds;
  }
}

// ====================================
// TREND DISCOVERY SERVICE
// ====================================

class CjEbayTrendDiscoveryService {
  /**
   * Returns seeds from the best available provider.
   *
   * Priority:
   *   1. manualSeeds (if provided in request body)
   *   2. EbayResearchProvider (real Browse API — requires userId + eBay creds)
   *   3. MockTrendProvider (always available, always last resort)
   *
   * The returned `providerUsed` is persisted on the run record so the UI
   * can display REAL / MOCK / MANUAL badges.
   */
  async discoverSeeds(
    settings: OpportunityRunSettings,
    manualSeeds?: TrendSeed[],
    userId?: number,
  ): Promise<{
    seeds: TrendSeed[];
    providerUsed: TrendSeedSource;
    providerNote: string;
  }> {
    // 1. Manual override — highest priority
    if (manualSeeds && manualSeeds.length > 0) {
      const manual = new ManualTrendProvider(manualSeeds);
      const seeds = await manual.fetchSeeds(settings);
      return {
        seeds,
        providerUsed: 'MANUAL',
        providerNote: `Manual seeds provided (${seeds.length}) — source: MANUAL`,
      };
    }

    // 2. Real eBay research provider — requires userId
    if (userId != null) {
      const realProvider = new EbayResearchProvider(userId);
      try {
        const available = await realProvider.isAvailable();
        if (available) {
          const seeds = await realProvider.fetchSeeds(settings);
          if (seeds.length > 0) {
            logger.info(
              `[TrendDiscovery] EbayResearchProvider returned ${seeds.length} real seeds for user ${userId}`,
            );
            return {
              seeds,
              providerUsed: 'EBAY_RESEARCH',
              providerNote: `EbayResearchProvider: ${seeds.length} seeds from live eBay Browse API (source: REAL)`,
            };
          }
          logger.warn('[TrendDiscovery] EbayResearchProvider returned 0 seeds — falling back to mock');
        } else {
          logger.info('[TrendDiscovery] EbayResearchProvider not available (no eBay creds) — using mock');
        }
      } catch (err) {
        logger.warn(`[TrendDiscovery] EbayResearchProvider error: ${(err as Error).message} — falling back to mock`);
      }
    }

    // 3. Mock fallback — always available, clearly labelled
    const mock = new MockTrendProvider();
    const seeds = await mock.fetchSeeds({ ...settings, marketNiche: 'PET_SUPPLIES', requirePetCategory: true });
    return {
      seeds,
      providerUsed: 'MOCK_TREND',
      providerNote:
        userId == null
          ? 'MockTrendProvider — no userId provided; plug in EbayResearchProvider for real signals'
          : 'MockTrendProvider fallback — EbayResearchProvider unavailable or returned no seeds',
    };
  }

  /** List provider availability (useful for /system-readiness endpoint). */
  async getProviderStatus(userId?: number): Promise<Array<{ id: TrendSeedSource; available: boolean }>> {
    const statuses: Array<{ id: TrendSeedSource; available: boolean }> = [
      { id: 'MANUAL', available: true },
    ];

    if (userId != null) {
      const real = new EbayResearchProvider(userId);
      const avail = await real.isAvailable().catch(() => false);
      statuses.push({ id: 'EBAY_RESEARCH', available: avail });
    } else {
      statuses.push({ id: 'EBAY_RESEARCH', available: false });
    }

    statuses.push({ id: 'MOCK_TREND', available: true });
    return statuses;
  }
}

export const cjEbayTrendDiscoveryService = new CjEbayTrendDiscoveryService();

function isPetSeed(seed: Pick<TrendSeed, 'keyword' | 'category' | 'productConcept'>): boolean {
  const haystack = `${seed.keyword} ${seed.category ?? ''} ${seed.productConcept ?? ''}`.toLowerCase();
  return /\b(pet|dog|cat|puppy|kitten|grooming|leash|bowl|feeder|toy|poop|litter)\b/.test(haystack);
}
