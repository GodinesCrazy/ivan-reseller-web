/**
 * CJ → eBay UK — trend discovery service.
 * UK-specific mock seeds based on eBay UK bestseller heuristics.
 *
 * DATA CLASSIFICATION:
 * - HEURISTIC: Based on known eBay UK category performance patterns (public data).
 * - Not connected to live eBay UK Browse API (requires eBay UK OAuth with Browse scope).
 * - Seasonal signals are approximate based on month.
 *
 * Provider priority (same architecture as USA):
 * 1. Manual seeds (if provided)
 * 2. EBAY_RESEARCH (live Browse API — requires eBay UK OAuth — NOT YET WIRED)
 * 3. UK_HEURISTIC fallback (mock seeds tuned for UK market)
 */

import { logger } from '../../../config/logger';

export type UkTrendSeedSource = 'UK_HEURISTIC' | 'EBAY_UK_RESEARCH' | 'MANUAL';

export interface UkTrendSeed {
  keyword: string;
  category?: string;
  productConcept?: string;
  trendConfidence: number;
  source: UkTrendSeedSource;
  rawSignal?: Record<string, unknown>;
  evidenceSummary?: string;
}

/** UK-specific heuristic seeds. Source: HEURISTIC — based on eBay UK category trends (public). */
const UK_HEURISTIC_SEEDS: Omit<UkTrendSeed, 'source'>[] = [
  {
    keyword: 'phone case wireless charging UK',
    category: 'Mobile Phone & Communication > Cases & Covers',
    productConcept: 'Qi-compatible MagSafe-style slim case for iPhone/Samsung',
    trendConfidence: 0.85,
    rawSignal: { region: 'GB', basisPoints: 8500, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — eBay UK top mobile accessories category; wireless charging mainstream in UK since 2022.',
  },
  {
    keyword: 'LED strip lights smart home UK',
    category: 'Home, Furniture & DIY > Lighting',
    productConcept: 'Wi-Fi or Bluetooth LED strip 5m, app-controlled, works with Alexa/Google Home',
    trendConfidence: 0.83,
    rawSignal: { region: 'GB', basisPoints: 8300, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — Smart home accessories consistently strong on eBay UK; Alexa/Google ecosystem dominant.',
  },
  {
    keyword: 'gym resistance bands set UK',
    category: 'Sporting Goods > Exercise & Fitness',
    productConcept: 'Multi-resistance fabric/latex loop bands + carry bag',
    trendConfidence: 0.80,
    rawSignal: { region: 'GB', basisPoints: 8000, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — Home gym equipment sustained demand post-2020; eBay UK sporting goods consistent.',
  },
  {
    keyword: 'car phone holder wireless charging dashboard',
    category: 'Vehicle Parts & Accessories > Car Accessories',
    productConcept: 'Magsafe-compatible dashboard mount with 15W wireless charge',
    trendConfidence: 0.78,
    rawSignal: { region: 'GB', basisPoints: 7800, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — High UK car accessory search volume; wireless charging mounts replace cable holders.',
  },
  {
    keyword: 'portable mini projector UK',
    category: 'Sound & Vision > TV, Video & Home Audio',
    productConcept: 'Mini LED projector 1080p-capable, HDMI+USB, 200 lumens, compact carry',
    trendConfidence: 0.74,
    rawSignal: { region: 'GB', basisPoints: 7400, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — UK budget entertainment segment growing; projectors replacing small screens at home.',
  },
  {
    keyword: 'pet grooming brush self cleaning',
    category: 'Pet Supplies > Dog & Cat Grooming',
    productConcept: 'Retractable slicker brush for dogs/cats, push-button hair eject',
    trendConfidence: 0.77,
    rawSignal: { region: 'GB', basisPoints: 7700, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — UK pet ownership at record high; grooming tools stable repeatable purchase.',
  },
  {
    keyword: 'desk cable organiser UK office',
    category: 'Home, Furniture & DIY > Office Supplies',
    productConcept: 'Silicone cable clips + box management, WFH desk bundle',
    trendConfidence: 0.71,
    rawSignal: { region: 'GB', basisPoints: 7100, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — WFH culture established in UK; home office accessories steady demand.',
  },
  {
    keyword: 'posture corrector back brace UK',
    category: 'Health & Beauty > Medical & Mobility',
    productConcept: 'Adjustable breathable posture brace, unisex S-XL',
    trendConfidence: 0.68,
    rawSignal: { region: 'GB', basisPoints: 6800, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — Back support accessories perennial eBay UK bestseller; NHS physio demand driving awareness.',
  },
  {
    keyword: 'bluetooth speaker waterproof outdoor UK',
    category: 'Sound & Vision > Portable Audio & Headphones',
    productConcept: 'IPX6 portable speaker, USB-C, 10h battery, 360-degree sound',
    trendConfidence: 0.75,
    rawSignal: { region: 'GB', basisPoints: 7500, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — UK outdoor / festival culture drives waterproof speaker demand; summer seasonal boost.',
  },
  {
    keyword: 'plant self watering pots indoor UK',
    category: 'Garden & Patio > Plant Pots & Window Boxes',
    productConcept: 'Self-watering ceramic/plastic planters for succulents/herbs, set of 3-6',
    trendConfidence: 0.65,
    rawSignal: { region: 'GB', basisPoints: 6500, dataAge: 'heuristic' },
    evidenceSummary: 'HEURISTIC — UK indoor gardening trend growing since 2020; eBay Garden category strong Q1-Q3.',
  },
];

function getSeasonalBoost(month: number): string {
  if (month >= 11 || month <= 1) return 'Q4/Q1 — electronics + gift season (UK Christmas peak)';
  if (month >= 2 && month <= 4) return 'Q1/Q2 — spring fitness + home garden trends';
  if (month >= 5 && month <= 8) return 'Q2/Q3 — outdoor, summer, back-to-school';
  return 'Q3/Q4 — general retail strength, pre-Christmas';
}

export const cjEbayUkTrendDiscoveryService = {
  async discoverSeeds(
    maxSeeds: number,
    manualSeeds?: UkTrendSeed[],
  ): Promise<{ seeds: UkTrendSeed[]; providerUsed: UkTrendSeedSource; providerNote: string }> {
    if (manualSeeds && manualSeeds.length > 0) {
      return {
        seeds: manualSeeds.slice(0, maxSeeds),
        providerUsed: 'MANUAL',
        providerNote: `Manual seeds provided (${manualSeeds.length})`,
      };
    }

    const month = new Date().getMonth() + 1;
    const seasonalContext = getSeasonalBoost(month);
    const seeds = UK_HEURISTIC_SEEDS.slice(0, maxSeeds).map((s) => ({
      ...s,
      source: 'UK_HEURISTIC' as UkTrendSeedSource,
      evidenceSummary: `${s.evidenceSummary} | Seasonal context: ${seasonalContext}`,
    }));

    logger.info(`[CjEbayUkTrendDiscovery] UK_HEURISTIC provider returned ${seeds.length} seeds`);
    return {
      seeds,
      providerUsed: 'UK_HEURISTIC',
      providerNote:
        `UK_HEURISTIC seeds: ${seeds.length} — based on eBay UK category performance patterns. ` +
        'NOT live market data. Classification: HEURISTIC. ' +
        'Wire EbayResearchProvider with EBAY_GB scope for REAL signals.',
    };
  },
};
