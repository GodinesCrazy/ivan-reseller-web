/**
 * Trends API - Real backend trends discovery
 * GET /api/trends/keywords
 */

import api from './api';

export interface TrendKeyword {
  keyword: string;
  trend?: 'rising' | 'stable' | 'declining';
  searchVolume?: number;
  region?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface TrendsKeywordsResponse {
  keywords: TrendKeyword[];
  region?: string;
  source?: string;
}

export async function getTrendingKeywords(params?: {
  region?: string;
  maxKeywords?: number;
}): Promise<TrendKeyword[]> {
  const res = await api.get<{ success?: boolean; data?: TrendKeyword[]; keywords?: TrendKeyword[] }>('/api/trends/keywords', {
    params: { region: params?.region || 'US', maxKeywords: params?.maxKeywords || 10 },
  });
  const raw = res.data?.data ?? res.data?.keywords ?? [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((k: any) =>
    typeof k === 'string' ? { keyword: k } : { keyword: k.keyword ?? k.name ?? '', trend: k.trend, searchVolume: k.searchVolume, region: k.region, priority: k.priority }
  );
}
