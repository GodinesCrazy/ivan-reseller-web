import type { OperationsTruthItem } from '@/types/operations';

/** While truth is loading for a non-empty pending list, do not allow publish (fail-closed). */
export function isPendingTruthLoading(pendingLength: number, operationsTruthFetchLoading: boolean): boolean {
  return pendingLength > 0 && operationsTruthFetchLoading;
}

/**
 * Row is not publishable from Intelligent Publisher when:
 * - truth still loading
 * - no truth item (missing / error)
 * - canonical blockerCode from operations truth
 * - agent trace explicitly blocking (e.g. ML image remediation publishSafe === false)
 */
export function isPendingRowPublishBlocked(
  truth: OperationsTruthItem | null | undefined,
  truthLoading: boolean
): boolean {
  if (truthLoading) return true;
  if (!truth) return true;
  if (truth.blockerCode) return true;
  if (truth.agentTrace?.blocking === true) return true;
  return false;
}

/** Mercado Libre canary shortlist: publishable + positive ML estimated profit when present. */
export function isMlCanaryCandidateRow(
  product: { estimatedProfitByMarketplace?: Record<string, number> },
  truth: OperationsTruthItem | null | undefined,
  truthLoading: boolean
): boolean {
  if (isPendingRowPublishBlocked(truth, truthLoading)) return false;
  const ml = Number(product?.estimatedProfitByMarketplace?.mercadolibre);
  return Number.isFinite(ml) && ml > 0;
}
