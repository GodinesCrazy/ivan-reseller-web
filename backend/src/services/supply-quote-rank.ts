/**
 * Pure ranking / dedupe for Phase B supply candidates (testable without HTTP/env).
 */

import type { SupplyDiscoveryRow } from './supply-quote.types';

function normalizeTitleKey(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/gi, '')
    .slice(0, 80)
    .trim();
}

function dedupKey(row: SupplyDiscoveryRow): string {
  const t = normalizeTitleKey(row.title);
  const bucket = Math.round(row.price * 10) / 10;
  return `${t}|${bucket}`;
}

function landed(row: SupplyDiscoveryRow, defaultShip: number): number {
  return row.price + (row.shippingCost != null && row.shippingCost >= 0 ? row.shippingCost : defaultShip);
}

function confidenceRank(row: SupplyDiscoveryRow): number {
  const c = row.supplyMeta?.quoteConfidence;
  if (c === 'high') return 0;
  if (c === 'medium') return 1;
  return 2;
}

/** Rank by estimated landed cost, then confidence; dedupe by title+price bucket (keep best landed). */
export function rankDedupeSupplyRows(rows: SupplyDiscoveryRow[], maxItems: number, defaultShippingUsd: number): SupplyDiscoveryRow[] {
  const scored = rows.map((r) => ({
    r,
    land: landed(r, defaultShippingUsd),
    cr: confidenceRank(r),
  }));
  scored.sort((a, b) => a.land - b.land || a.cr - b.cr);
  const seen = new Set<string>();
  const out: SupplyDiscoveryRow[] = [];
  for (const x of scored) {
    const k = dedupKey(x.r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x.r);
    if (out.length >= maxItems) break;
  }
  return out;
}
