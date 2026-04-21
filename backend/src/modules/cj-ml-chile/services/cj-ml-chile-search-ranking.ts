/**
 * CJ → ML Chile — heuristic search relevance ranking.
 *
 * ROOT CAUSE: CJ product/listV2 uses its own fuzzy text matching that can
 * return semantically unrelated products (e.g. "air buds" → flower clips,
 * wigs, accessories). This module re-ranks those results locally so the most
 * relevant items surface first within each operability tier.
 *
 * STRATEGY
 *  1. Normalize query → lowercase, strip punctuation, remove stopwords.
 *  2. Expand query with a curated synonym dictionary.
 *  3. Score each product title (0–100 textRelevanceScore).
 *  4. Sort: operability tier first → textRelevanceScore DESC → operationalScore DESC.
 *  5. Attach `relevanceScore` + `relevanceTier` to each item for frontend display.
 *
 * NOT machine-learning. Pure deterministic heuristics — easy to audit and tune.
 */

import type { CjProductSummary } from '../../cj-ebay/adapters/cj-supplier.adapter.interface';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelevanceTier = 'alta' | 'media' | 'baja';
export type MlChileOperabilityStatus = 'operable' | 'stock_unknown' | 'unavailable';
export type MlChileLocalStockStatus = 'chile_local' | 'global_only' | 'stock_unknown' | 'out_of_stock';

export interface RankedCjProduct extends CjProductSummary {
  operabilityStatus: MlChileOperabilityStatus;
  localStockStatus?: MlChileLocalStockStatus;
  warehouseChileConfirmed?: boolean;
  localStockEvidenceSource?: string;
  localReadyVariantId?: string;
  relevanceScore: number;    // 0–100: textual match quality
  relevanceTier: RelevanceTier;
}

export interface NormalizedQuery {
  raw: string;
  normalized: string;
  tokens: string[];
  expansions: string[];      // synonym alternatives (normalized), ready to match against titles
}

// ── Synonym dictionary ────────────────────────────────────────────────────────
// Conservative by design — only terms with high commercial precision.
// Key = normalized query term/phrase.  Value = alternative strings that should
// also match (all will be normalised before comparison).

const SYNONYM_MAP: Readonly<Record<string, readonly string[]>> = {
  // ── Audio ─────────────────────────────────────────────────────────────────
  'air buds':    ['earbuds', 'ear buds', 'wireless earbuds', 'bluetooth earphones', 'tws'],
  'airbuds':     ['earbuds', 'ear buds', 'wireless earbuds', 'bluetooth earphones', 'tws'],
  'earbuds':     ['ear buds', 'wireless earbuds', 'bluetooth earbuds', 'tws earbuds', 'in ear'],
  'earbud':      ['ear bud', 'wireless earbud', 'tws'],
  'earphones':   ['earbuds', 'headphones', 'headset', 'in ear headphones'],
  'earphone':    ['earbud', 'headphone', 'earpiece'],
  'headphones':  ['earphones', 'headset', 'over ear', 'wireless headphones'],
  'headset':     ['headphones', 'earphones', 'gaming headset'],
  'tws':         ['wireless earbuds', 'true wireless', 'earbuds', 'bluetooth earbuds'],
  'speaker':     ['bluetooth speaker', 'wireless speaker', 'portable speaker', 'soundbar'],
  'speakers':    ['bluetooth speakers', 'wireless speakers', 'portable speakers'],

  // ── Charging ──────────────────────────────────────────────────────────────
  'charger':     ['charging cable', 'usb charger', 'power adapter', 'fast charger', 'wireless charger'],
  'charging':    ['charger', 'usb cable', 'power cable', 'fast charging'],
  'cable':       ['usb cable', 'data cable', 'charging cable', 'cord'],
  'usb cable':   ['data cable', 'charging cable', 'type c cable', 'lightning cable'],
  'power bank':  ['portable charger', 'external battery', 'backup battery', 'portable battery'],
  'powerbank':   ['portable charger', 'external battery', 'backup battery'],

  // ── Cases & Protection ────────────────────────────────────────────────────
  'case':        ['protective case', 'phone case', 'back cover', 'casing', 'cover', 'shell'],
  'cover':       ['case', 'protective cover', 'phone cover', 'back cover'],
  'funda':       ['case', 'cover', 'phone case', 'protective case'],
  'screen protector': ['tempered glass', 'glass protector', 'screen film', 'protective film'],

  // ── Wearables ─────────────────────────────────────────────────────────────
  'watch':       ['smartwatch', 'smart watch', 'fitness tracker', 'smart band', 'wristwatch'],
  'smartwatch':  ['smart watch', 'fitness watch', 'sport watch', 'digital watch'],
  'smart watch': ['smartwatch', 'fitness tracker', 'sport watch', 'wristwatch'],
  'band':        ['smart band', 'fitness band', 'wristband', 'sport band'],
  'fitness tracker': ['smart band', 'activity tracker', 'sport tracker', 'health tracker'],

  // ── Jewelry ───────────────────────────────────────────────────────────────
  'ring':        ['finger ring', 'fashion ring', 'band ring', 'jewelry ring'],
  'necklace':    ['pendant necklace', 'chain necklace', 'fashion necklace'],
  'bracelet':    ['bangle bracelet', 'fashion bracelet', 'charm bracelet'],

  // ── Networking ────────────────────────────────────────────────────────────
  'router':      ['wifi router', 'wireless router', 'network router', 'wifi extender'],
  'wifi extender': ['range extender', 'wifi repeater', 'wireless extender'],
  'wifi':        ['wireless', 'wi-fi'],

  // ── Phone mounts & holders ────────────────────────────────────────────────
  'holder':      ['stand', 'mount', 'phone holder', 'phone stand', 'car holder'],
  'stand':       ['holder', 'mount', 'phone stand', 'desk stand', 'tablet stand'],
  'mount':       ['holder', 'stand', 'car mount', 'phone mount', 'dashboard mount'],

  // ── Lighting ──────────────────────────────────────────────────────────────
  'led':         ['led light', 'led strip', 'led lamp', 'light strip', 'led lights'],
  'lamp':        ['light', 'desk lamp', 'led lamp', 'night light', 'table lamp'],
  'light':       ['lamp', 'led light', 'night light', 'reading light'],

  // ── Generic signal tokens ─────────────────────────────────────────────────
  'wireless':    ['bluetooth', 'cordless'],
  'bluetooth':   ['wireless', 'bt'],
};

// ── Text normalisation ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'with', 'and', 'or', 'of', 'in', 'to',
  'is', 'by', 'on', 'at', 'it', 'its', 'new', 'hot',
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-/]/g, ' ')          // hyphens and slashes become spaces
    .replace(/[^\w\s]/g, ' ')       // remaining punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// ── Query expansion ───────────────────────────────────────────────────────────

export function expandQuery(rawQuery: string): NormalizedQuery {
  const normalized = normalizeText(rawQuery);
  const tokens = tokenize(rawQuery);
  const expansions: string[] = [];

  // Full-phrase synonyms first
  const phraseExp = SYNONYM_MAP[normalized];
  if (phraseExp) {
    for (const e of phraseExp) expansions.push(normalizeText(e));
  }

  // Per-token synonyms
  for (const token of tokens) {
    const tokenExp = SYNONYM_MAP[token];
    if (tokenExp) {
      for (const e of tokenExp) expansions.push(normalizeText(e));
    }
  }

  return {
    raw: rawQuery,
    normalized,
    tokens,
    expansions: [...new Set(expansions)],
  };
}

// ── Text relevance scoring (0–100) ────────────────────────────────────────────
//
//  A  Exact phrase match     50 pts   Full query phrase present in title
//  B  Token coverage         35 pts   % of query tokens found in title
//  C  Synonym hit            10 pts   At least one synonym expansion matched
//  D  Prefix bonus            5 pts   Title begins with a core query token
//
//  Score 0 means: no query tokens + no synonyms found → almost certainly irrelevant.
//  Score 60+ means: high confidence match.

export function textRelevanceScore(nq: NormalizedQuery, title: string): number {
  if (!title) return 0;
  if (!nq.tokens.length) return 60;  // no parseable query → neutral passthrough

  const normTitle = normalizeText(title);
  let score = 0;

  // A — Exact phrase
  if (normTitle.includes(nq.normalized)) score += 50;

  // B — Token coverage
  const presentTokens = nq.tokens.filter(t => t.length > 1 && normTitle.includes(t));
  const coverage = presentTokens.length / nq.tokens.length;
  score += Math.round(coverage * 35);

  // C — Synonym expansion
  if (nq.expansions.some(exp => exp.length > 2 && normTitle.includes(exp))) score += 10;

  // D — Prefix: title starts with one of the main query tokens
  if (nq.tokens.some(t => t.length > 2 && normTitle.startsWith(t))) score += 5;

  return Math.min(100, score);
}

function toRelevanceTier(score: number): RelevanceTier {
  if (score >= 60) return 'alta';
  if (score >= 30) return 'media';
  return 'baja';
}

// ── Operational score (0–90) ──────────────────────────────────────────────────
// Calibrated for ML Chile: IVA 19% + import + ML fee ~16–20%.
// Viable margin window is roughly $3–$60 USD supplier cost.

function operationalScore(item: CjProductSummary): number {
  let score = 0;

  // Stock presence
  if (item.inventoryTotal !== undefined && item.inventoryTotal > 0) {
    score += 40;
    if (item.inventoryTotal >= 50) score += 5;
  } else if (item.inventoryTotal === undefined) {
    score += 20;
  }

  // Price viability for ML Chile
  if (item.listPriceUsd != null && item.listPriceUsd > 0) {
    if (item.listPriceUsd >= 3 && item.listPriceUsd <= 40) score += 25;
    else if (item.listPriceUsd <= 80) score += 15;
    else score += 5;
  } else {
    score += 12;
  }

  // Image (required for ML listing)
  if (typeof item.mainImageUrl === 'string' && item.mainImageUrl.startsWith('http')) score += 15;

  // Title depth
  const len = item.title?.trim().length ?? 0;
  if (len >= 40) score += 10;
  else if (len >= 20) score += 6;
  else if (len >= 10) score += 3;

  return score;
}

// ── Operability classification ─────────────────────────────────────────────────

function classifyInventory(inv: number | undefined): MlChileOperabilityStatus {
  if (inv !== undefined && inv > 0) return 'operable';
  if (inv === 0) return 'unavailable';
  return 'stock_unknown';
}

const OPERABILITY_RANK: Record<MlChileOperabilityStatus, number> = {
  operable: 0,
  stock_unknown: 1,
  unavailable: 2,
};

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Rank CJ search results for ML Chile:
 *  1. Classify each item with operabilityStatus.
 *  2. Score each title with textRelevanceScore.
 *  3. Sort: operability tier → relevance score → operational score.
 *  4. Return enriched items + the expanded query (for frontend display).
 */
export function rankMlChileSearchResults(
  rawQuery: string,
  items: Array<CjProductSummary & Partial<RankedCjProduct>>,
): { rankedItems: RankedCjProduct[]; query: NormalizedQuery } {
  const nq = expandQuery(rawQuery);

  const enriched: RankedCjProduct[] = items.map(item => {
    const operabilityStatus = item.operabilityStatus ?? classifyInventory(item.inventoryTotal);
    const relScore = textRelevanceScore(nq, item.title ?? '');
    return {
      ...item,
      operabilityStatus,
      relevanceScore: relScore,
      relevanceTier: toRelevanceTier(relScore),
    };
  });

  enriched.sort((a, b) => {
    // Primary: operability tier (operable always first)
    const opDelta = OPERABILITY_RANK[a.operabilityStatus] - OPERABILITY_RANK[b.operabilityStatus];
    if (opDelta !== 0) return opDelta;

    // Secondary: text relevance DESC (closer to query = better)
    const relDelta = b.relevanceScore - a.relevanceScore;
    if (relDelta !== 0) return relDelta;

    // Tertiary: operational quality DESC (stock depth, price, image)
    return operationalScore(b) - operationalScore(a);
  });

  return { rankedItems: enriched, query: nq };
}
