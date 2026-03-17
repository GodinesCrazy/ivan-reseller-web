/**
 * Phase 30 — API Health Tracking
 * Track per-marketplace status: OK | DEGRADED | FAILED.
 * For Control Center and self-healing logic.
 */

import logger from '../config/logger';

export type MarketplaceHealthStatus = 'OK' | 'DEGRADED' | 'FAILED';

export interface MarketplaceHealthEntry {
  marketplace: string;
  status: MarketplaceHealthStatus;
  lastError: string | null;
  lastSuccess: string | null;
  lastCheck: string | null;
}

const store = new Map<string, MarketplaceHealthEntry>();

function key(marketplace: string, userId?: number): string {
  return userId != null ? `${marketplace}:${userId}` : marketplace;
}

export function setApiHealth(
  marketplace: string,
  status: MarketplaceHealthStatus,
  options?: { userId?: number; errorMessage?: string }
): void {
  const k = key(marketplace, options?.userId);
  const now = new Date().toISOString();
  const existing = store.get(k) || {
    marketplace,
    status: 'OK',
    lastError: null,
    lastSuccess: null,
    lastCheck: null,
  };
  store.set(k, {
    ...existing,
    status,
    lastCheck: now,
    lastError: status !== 'OK' ? (options?.errorMessage ?? existing.lastError) : null,
    lastSuccess: status === 'OK' ? now : existing.lastSuccess,
  });
  if (status !== 'OK') {
    logger.warn('[API-HEALTH] Marketplace status updated', { marketplace, status, error: options?.errorMessage });
  }
}

export function getApiHealth(marketplace?: string, userId?: number): MarketplaceHealthEntry | MarketplaceHealthEntry[] {
  if (marketplace) {
    const k = key(marketplace, userId);
    return store.get(k) || { marketplace, status: 'OK', lastError: null, lastSuccess: null, lastCheck: null };
  }
  const entries = Array.from(store.values());
  const byMp = new Map<string, MarketplaceHealthEntry>();
  for (const e of entries) {
    const m = e.marketplace;
    if (!byMp.has(m) || (e.status !== 'OK' && byMp.get(m)!.status === 'OK')) byMp.set(m, e);
  }
  return Array.from(byMp.values());
}

export function isMarketplaceHealthy(marketplace: string, userId?: number): boolean {
  const entry = getApiHealth(marketplace, userId) as MarketplaceHealthEntry;
  return entry.status === 'OK' || entry.status === 'DEGRADED';
}

export const apiHealthTracking = {
  set: setApiHealth,
  get: getApiHealth,
  isHealthy: isMarketplaceHealthy,
};
