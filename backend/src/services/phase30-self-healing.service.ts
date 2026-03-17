/**
 * Phase 30 — Self-Healing Loop
 * Detect failure (API health DEGRADED) → retry (reconciliation) → recover (token refresh in reconciliation) → continue.
 * Call periodically (e.g. every 15 min) so system never stays blocked.
 */

import logger from '../config/logger';
import { apiHealthTracking } from './api-health-tracking.service';
import { listingStateReconciliationService } from './listing-state-reconciliation.service';

export interface SelfHealingRunResult {
  ran: boolean;
  reconciled: number;
  corrected: number;
  errors: number;
  marketplacesChecked: string[];
}

/**
 * Run one self-healing pass: reconcile a small batch of listings so that
 * token refresh and retries get a chance to recover DEGRADED marketplaces.
 */
export async function runSelfHealingPass(options?: { batchSize?: number }): Promise<SelfHealingRunResult> {
  const batchSize = options?.batchSize ?? 50;
  try {
    const result = await listingStateReconciliationService.reconcileAll({ batchSize });
    const health = apiHealthTracking.get() as any[];
    const marketplacesChecked = Array.isArray(health) ? health.map((h) => h.marketplace) : ['mercadolibre', 'ebay', 'amazon'];
    logger.info('[Phase30-SelfHealing] Pass complete', {
      scanned: result.scanned,
      updated: result.updated,
      republishEnqueued: result.republishEnqueued,
      errors: result.errors,
    });
    return {
      ran: true,
      reconciled: result.scanned,
      corrected: result.updated,
      errors: result.errors,
      marketplacesChecked,
    };
  } catch (e: any) {
    logger.warn('[Phase30-SelfHealing] Pass failed', { error: e?.message });
    return {
      ran: false,
      reconciled: 0,
      corrected: 0,
      errors: 1,
      marketplacesChecked: [],
    };
  }
}

export const Phase30SelfHealing = {
  run: runSelfHealingPass,
};
