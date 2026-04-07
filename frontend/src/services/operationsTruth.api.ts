import api from './api';
import type { OperationsTruthItem, OperationsTruthResponse } from '@/types/operations';

interface FetchOperationsTruthParams {
  ids?: Array<string | number>;
  limit?: number;
  environment?: 'production' | 'sandbox' | 'all';
}

export async function fetchOperationsTruth(params: FetchOperationsTruthParams = {}): Promise<OperationsTruthResponse> {
  const query: Record<string, string | number> = {};
  if (params.ids && params.ids.length > 0) query.ids = params.ids.join(',');
  if (typeof params.limit === 'number') query.limit = params.limit;
  if (params.environment) query.environment = params.environment;

  const response = await api.get<OperationsTruthResponse>('/api/dashboard/operations-truth', { params: query });
  return response.data;
}

function emptySummary(): OperationsTruthResponse['summary'] {
  return {
    liveStateCounts: { active: 0, under_review: 0, paused: 0, failed_publish: 0, unknown: 0 },
    blockerCounts: [],
    proofCounts: {
      orderIngested: 0,
      supplierPurchaseProved: 0,
      trackingAttached: 0,
      deliveredTruthObtained: 0,
      releasedFundsObtained: 0,
      realizedProfitObtained: 0,
    },
  };
}

/** Merge chunked operations-truth responses (backend caps `ids` at 50 per request). */
export function mergeOperationsTruthResponses(responses: OperationsTruthResponse[]): OperationsTruthResponse | null {
  if (responses.length === 0) return null;
  const itemMap = new Map<number, OperationsTruthItem>();
  for (const r of responses) {
    for (const it of r.items) {
      const pid = Number(it.productId);
      if (Number.isFinite(pid)) itemMap.set(pid, it);
    }
  }
  const items = Array.from(itemMap.values());
  const blockerAcc = new Map<string, number>();
  const mergedSummary = emptySummary();
  for (const r of responses) {
    const s = r.summary;
    mergedSummary.liveStateCounts.active += s.liveStateCounts.active;
    mergedSummary.liveStateCounts.under_review += s.liveStateCounts.under_review;
    mergedSummary.liveStateCounts.paused += s.liveStateCounts.paused;
    mergedSummary.liveStateCounts.failed_publish += s.liveStateCounts.failed_publish;
    mergedSummary.liveStateCounts.unknown += s.liveStateCounts.unknown;
    mergedSummary.proofCounts.orderIngested += s.proofCounts.orderIngested;
    mergedSummary.proofCounts.supplierPurchaseProved += s.proofCounts.supplierPurchaseProved;
    mergedSummary.proofCounts.trackingAttached += s.proofCounts.trackingAttached;
    mergedSummary.proofCounts.deliveredTruthObtained += s.proofCounts.deliveredTruthObtained;
    mergedSummary.proofCounts.releasedFundsObtained += s.proofCounts.releasedFundsObtained;
    mergedSummary.proofCounts.realizedProfitObtained += s.proofCounts.realizedProfitObtained;
    for (const b of s.blockerCounts) {
      blockerAcc.set(b.blockerCode, (blockerAcc.get(b.blockerCode) || 0) + b.count);
    }
  }
  mergedSummary.blockerCounts = Array.from(blockerAcc.entries()).map(([blockerCode, count]) => ({ blockerCode, count }));
  const sortedGeneratedAt = responses.map((r) => r.generatedAt).sort();
  const generatedAt = sortedGeneratedAt[sortedGeneratedAt.length - 1] ?? responses[0].generatedAt;
  return { generatedAt, items, summary: mergedSummary };
}

const OPS_TRUTH_MAX_IDS = 50;

/**
 * Fetches operations truth for an arbitrary number of product ids by batching (dashboard route slices ids to 50).
 */
export async function fetchOperationsTruthForProductIds(
  params: Omit<FetchOperationsTruthParams, 'ids'> & { ids: Array<string | number> }
): Promise<OperationsTruthResponse> {
  const raw = params.ids
    .map((id) => (typeof id === 'string' ? Number.parseInt(id, 10) : Number(id)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const unique = Array.from(new Set(raw));
  if (unique.length === 0) {
    return { generatedAt: new Date().toISOString(), items: [], summary: emptySummary() };
  }
  const { ids: _drop, ...rest } = params;
  if (unique.length <= OPS_TRUTH_MAX_IDS) {
    return fetchOperationsTruth({ ...rest, ids: unique, limit: unique.length });
  }
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += OPS_TRUTH_MAX_IDS) {
    chunks.push(unique.slice(i, i + OPS_TRUTH_MAX_IDS));
  }
  const responses = await Promise.all(
    chunks.map((ids) => fetchOperationsTruth({ ...rest, ids, limit: ids.length }))
  );
  return mergeOperationsTruthResponses(responses) ?? { generatedAt: new Date().toISOString(), items: [], summary: emptySummary() };
}
