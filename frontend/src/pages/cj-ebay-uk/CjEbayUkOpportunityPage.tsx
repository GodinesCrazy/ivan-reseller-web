import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

type Run = { id: string; status: string; mode: string; seedCount: number; candidateCount: number; providerUsed?: string; providerNote?: string; createdAt: string };
type Candidate = {
  id: string;
  seedKeyword: string;
  seedCategory?: string;
  cjProductTitle: string;
  shippingGbp?: number;
  totalScore?: number;
  recommendationReason?: string;
  trendSourceType?: string;
  status: string;
  pricingSnapshot?: { suggestedPriceGbp?: number; netMarginPct?: number };
};

export default function CjEbayUkOpportunityPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const [runsRes, recsRes] = await Promise.allSettled([
      api.get<{ ok: boolean; runs: Run[] }>('/api/cj-ebay-uk/opportunities/runs'),
      api.get<{ ok: boolean; candidates: Candidate[] }>('/api/cj-ebay-uk/opportunities/recommendations'),
    ]);
    if (runsRes.status === 'fulfilled' && runsRes.value.data?.ok) setRuns(runsRes.value.data.runs.slice(0, 5));
    if (recsRes.status === 'fulfilled' && recsRes.value.data?.ok) setCandidates(recsRes.value.data.candidates);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function startDiscovery() {
    setRunning(true);
    try {
      await api.post('/api/cj-ebay-uk/opportunities/discover', { mode: 'STARTER', maxSeeds: 8 });
      await loadData();
    } catch (e) {
      alert(`Discovery error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function approve(id: string) {
    await api.post(`/api/cj-ebay-uk/opportunities/candidates/${id}/approve`);
    await loadData();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading UK opportunity data…</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">UK Market Opportunity Discovery</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Discover CJ products with UK market potential. Seeds: HEURISTIC (eBay UK category performance data).
            Not live market signals — clearly labeled.
          </p>
        </div>
        <button
          type="button"
          onClick={startDiscovery}
          disabled={running}
          className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? 'Discovering…' : '✦ Discover UK Products'}
        </button>
      </div>

      {/* Data quality banner */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <strong>Data Classification:</strong>
          &nbsp;Seeds = HEURISTIC (eBay UK category patterns, not live API) ·
          Market pricing = ESTIMATED (no live eBay UK price scrape) ·
          Shipping = REAL (CJ freightCalculate destCountry=GB) ·
          VAT = REAL rule (20% UK marketplace facilitator for ≤ £135 orders)
        </p>
      </div>

      {/* Recent runs */}
      {runs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Recent Runs</h3>
          <div className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium mr-2 ${r.status === 'COMPLETED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{r.status}</span>
                  <span className="text-slate-600 dark:text-slate-400">{r.mode} · {r.seedCount} seeds · {r.candidateCount} candidates</span>
                  {r.providerUsed && <span className="ml-2 text-xs text-slate-400">({r.providerUsed})</span>}
                </div>
                <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shortlist */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          UK Shortlist ({candidates.length} candidates)
        </h3>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">No shortlisted candidates yet. Run discovery above.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {candidates.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-1">{c.seedKeyword}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{c.cjProductTitle}</p>
                    {c.seedCategory && <p className="text-xs text-slate-400 dark:text-slate-500">{c.seedCategory}</p>}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {c.totalScore != null && (
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{Number(c.totalScore).toFixed(0)} pts</span>
                    )}
                    {c.trendSourceType && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        {c.trendSourceType}
                      </span>
                    )}
                  </div>
                </div>

                {c.pricingSnapshot && (
                  <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                    {c.pricingSnapshot.suggestedPriceGbp != null && (
                      <span>Suggested: <strong className="text-slate-800 dark:text-slate-200">£{c.pricingSnapshot.suggestedPriceGbp.toFixed(2)}</strong></span>
                    )}
                    {c.pricingSnapshot.netMarginPct != null && (
                      <span>Margin: <strong className={c.pricingSnapshot.netMarginPct > 20 ? 'text-green-700 dark:text-green-300' : 'text-slate-700 dark:text-slate-300'}>{c.pricingSnapshot.netMarginPct.toFixed(1)}%</strong></span>
                    )}
                  </div>
                )}

                {c.recommendationReason && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{c.recommendationReason}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => navigate(`/cj-ebay-uk/products?q=${encodeURIComponent(c.seedKeyword)}`)}
                    className="flex-1 px-2 py-1.5 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    Search Products
                  </button>
                  <button
                    onClick={() => approve(c.id)}
                    className="px-2 py-1.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 text-xs hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
