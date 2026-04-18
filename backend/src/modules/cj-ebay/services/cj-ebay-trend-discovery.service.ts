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
    keyword: 'LED strip lights bedroom',
    category: 'Home & Garden > Lighting',
    productConcept: 'Decorative LED strips with remote, 5m, multicolor',
    trendConfidence: 0.88,
    rawSignal: { basisPoints: 8800, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real (fuente: datos de referencia internos)',
  },
  {
    keyword: 'phone case wireless charging',
    category: 'Cell Phones & Accessories > Cases',
    productConcept: 'Qi-compatible slim protective case for popular phone models',
    trendConfidence: 0.82,
    rawSignal: { basisPoints: 8200, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'car phone holder dashboard',
    category: 'eBay Motors > Auto Parts > Accessories',
    productConcept: 'Magnetic or suction mount, 360-degree rotation, universal fit',
    trendConfidence: 0.79,
    rawSignal: { basisPoints: 7900, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'kitchen gadgets set',
    category: 'Home & Garden > Kitchen',
    productConcept: 'Compact multipurpose kitchen tools bundle',
    trendConfidence: 0.74,
    rawSignal: { basisPoints: 7400, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'portable bluetooth speaker outdoor',
    category: 'Consumer Electronics > Portable Audio',
    productConcept: 'Waterproof mini speaker, USB-C charge, 8h battery',
    trendConfidence: 0.77,
    rawSignal: { basisPoints: 7700, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'fitness resistance bands set',
    category: 'Sporting Goods > Fitness',
    productConcept: 'Multi-resistance loop bands + carry bag',
    trendConfidence: 0.81,
    rawSignal: { basisPoints: 8100, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'cable organizer desk',
    category: 'Computers > Accessories',
    productConcept: 'Silicone cable clips + box management, compact desk bundle',
    trendConfidence: 0.72,
    rawSignal: { basisPoints: 7200, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'pet grooming brush self cleaning',
    category: 'Pet Supplies > Grooming',
    productConcept: 'Retractable slicker brush for dogs/cats, push-button hair removal',
    trendConfidence: 0.76,
    rawSignal: { basisPoints: 7600, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'posture corrector back support',
    category: 'Health & Beauty > Back Support',
    productConcept: 'Adjustable brace, breathable material, unisex M-XL',
    trendConfidence: 0.69,
    rawSignal: { basisPoints: 6900, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
  {
    keyword: 'plant watering spikes set',
    category: 'Home & Garden > Plants',
    productConcept: 'Ceramic/plastic slow-drip self-watering stakes (set of 6)',
    trendConfidence: 0.65,
    rawSignal: { basisPoints: 6500, region: 'US', dataAge: 'mock' },
    evidenceSummary: 'Seed mock — sin verificación de mercado real',
  },
];

class MockTrendProvider implements IMarketTrendProvider {
  readonly providerId: TrendSeedSource = 'MOCK_TREND';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetchSeeds(settings: OpportunityRunSettings): Promise<TrendSeed[]> {
    const limit = settings.maxSeedsPerRun ?? 8;
    const seeds = MOCK_SEEDS.slice(0, limit).map((s) => ({
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
    const seeds = await mock.fetchSeeds(settings);
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
