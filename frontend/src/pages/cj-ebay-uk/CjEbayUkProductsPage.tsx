import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

type CjProductSummary = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
  inventoryTotal?: number;
  fulfillmentOrigin?: 'GB' | 'CN' | 'UNKNOWN';
};

type UkCandidate = {
  id: string;
  seedKeyword: string;
  cjProductTitle: string;
  recommendationReason?: string;
  totalScore?: number;
  seedCategory?: string;
};

type SearchResponse = { ok: boolean; items: CjProductSummary[]; destination?: string };
type RecommendationsResponse = { ok: boolean; candidates: UkCandidate[] };

export default function CjEbayUkProductsPage() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<CjProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState<UkCandidate[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function doSearch(kw: string) {
    if (!kw.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<SearchResponse>('/api/cj-ebay-uk/cj/search', {
        keyword: kw.trim(),
        page: 1,
        pageSize: 20,
      });
      if (res.data?.ok) setResults(res.data.items);
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e) ? (e.response?.data as { detail?: string })?.detail || e.message : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecommendations() {
    setRecLoading(true);
    try {
      const res = await api.get<RecommendationsResponse>('/api/cj-ebay-uk/opportunities/recommendations');
      if (res.data?.ok) setRecommendations(res.data.candidates);
    } catch {
      // silently fail
    } finally {
      setRecLoading(false);
    }
  }

  function handleToggleRecommendations() {
    if (!showRecommendations && recommendations.length === 0) {
      loadRecommendations();
    }
    setShowRecommendations((v) => !v);
  }

  function injectSeed(seed: UkCandidate) {
    setKeyword(seed.seedKeyword);
    setShowRecommendations(false);
    doSearch(seed.seedKeyword);
    searchInputRef.current?.focus();
  }

  return (
    <div className="space-y-4">
      {/* Trend recommendation entrypoint */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggleRecommendations}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          <span>✦</span>
          <span>Suggest UK Winning Products</span>
        </button>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          HEURISTIC — based on eBay UK category performance data
        </span>
      </div>

      {/* Recommendations panel */}
      {showRecommendations && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              🇬🇧 UK Winning Product Suggestions
            </h3>
            <button
              type="button"
              onClick={() => setShowRecommendations(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
            >
              ✕ Close
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Classification: <strong>HEURISTIC</strong> — based on eBay UK category trends (not live API data).
            Click a suggestion to search CJ with that keyword.
          </p>

          {recLoading && <p className="text-sm text-slate-500">Loading UK recommendations…</p>}

          {!recLoading && recommendations.length === 0 && (
            <div className="text-sm text-slate-500 space-y-2">
              <p>No saved recommendations yet. Run UK opportunity discovery first.</p>
              <button
                type="button"
                onClick={() => {
                  api.post('/api/cj-ebay-uk/opportunities/discover', { mode: 'STARTER', maxSeeds: 8 })
                    .then(() => { loadRecommendations(); })
                    .catch(() => {});
                }}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Run UK Discovery
              </button>
            </div>
          )}

          {!recLoading && recommendations.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recommendations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => injectSeed(c)}
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group"
                >
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-300 line-clamp-1">
                    {c.seedKeyword}
                  </p>
                  {c.seedCategory && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{c.seedCategory}</p>
                  )}
                  {c.recommendationReason && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{c.recommendationReason}</p>
                  )}
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5 font-medium">→ Search CJ for this</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search form */}
      <form
        onSubmit={(e) => { e.preventDefault(); doSearch(keyword); }}
        className="flex gap-2"
      >
        <input
          ref={searchInputRef}
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search CJ catalog for UK… e.g. LED strip lights smart home"
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !keyword.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching…' : 'Search GB'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-900 dark:text-red-100">
          {error}
        </div>
      )}

      {/* UK shipping note */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          🇬🇧 Destination: UK (GB) · Shipping quotes: CJ→GB · Pricing: GBP · VAT: 20% marketplace-facilitated (eBay UK handles for orders ≤ £135)
          · Warehouse probing: startCountryCode=GB confirms UK stock presence.
        </p>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{results.length} results for UK market</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((item) => (
              <div
                key={item.cjProductId}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-2"
              >
                {item.mainImageUrl && (
                  <img
                    src={item.mainImageUrl}
                    alt={item.title}
                    className="w-full h-32 object-contain rounded bg-slate-50 dark:bg-slate-700"
                  />
                )}
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{item.title}</p>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  {item.listPriceUsd != null && (
                    <span>${item.listPriceUsd.toFixed(2)} USD</span>
                  )}
                  {item.fulfillmentOrigin === 'GB' && (
                    <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">
                      🇬🇧 UK Stock
                    </span>
                  )}
                  {item.fulfillmentOrigin === 'CN' && (
                    <span className="text-slate-400">Ships from CN</span>
                  )}
                </div>
                {item.inventoryTotal != null && (
                  <p className="text-xs text-slate-400">
                    Stock: {item.inventoryTotal === 0 ? 'Out of stock' : `${item.inventoryTotal} units`}
                  </p>
                )}
                <p className="text-xs font-mono text-slate-400">{item.cjProductId}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
