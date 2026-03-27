import type { OperationsTruthItem } from '@/types/operations';

function hasCanonicalBlocker(truth: OperationsTruthItem): boolean {
  const rawBc = truth.blockerCode;
  if (rawBc != null) {
    const s = String(rawBc);
    if (s.trim().length > 0) return true;
    if (s.length > 0) return true; // whitespace-only payload → fail-closed
  }
  const prs = String(truth.publicationReadinessState ?? '').trim().toUpperCase();
  if (prs === 'BLOCKED') return true;
  return false;
}

/** While truth is loading for a non-empty pending list, do not allow publish (fail-closed). */
export function isPendingTruthLoading(pendingLength: number, operationsTruthFetchLoading: boolean): boolean {
  return pendingLength > 0 && operationsTruthFetchLoading;
}

/**
 * Row is not publishable from Intelligent Publisher when:
 * - truth still loading
 * - no truth item (missing / error)
 * - canonical blockerCode from operations truth (trimmed; whitespace-only counts as no code)
 * - publication readiness BLOCKED (fail-closed if API ever omits blockerCode)
 * - agent trace explicitly blocking (e.g. ML image remediation publishSafe === false)
 */
export function isPendingRowPublishBlocked(
  truth: OperationsTruthItem | null | undefined,
  truthLoading: boolean
): boolean {
  if (truthLoading) return true;
  if (!truth) return true;
  if (hasCanonicalBlocker(truth)) return true;
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
