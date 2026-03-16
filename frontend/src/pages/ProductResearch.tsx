/**
 * Phase 2: Product Research UI
 * Search products, view demand/competition/margins, add to opportunities.
 * Phase 4: Market Opportunities section — discovered high-potential products from Market Intelligence Engine.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { formatCurrencySimple } from '../utils/currency';
import { Search, TrendingUp, BarChart3, DollarSign, PlusCircle, ExternalLink, Sparkles, Eye, Globe } from 'lucide-react';

type Marketplace = 'ebay' | 'amazon' | 'mercadolibre';

interface ResearchItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  productUrl?: string;
  image?: string;
  images?: string[];
  costUsd: number;
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number;
  roiPercentage: number;
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered?: Record<string, number>;
  shippingCost?: number;
  importTax?: number;
  totalCost?: number;
  targetCountry?: string;
  generatedAt?: string;
  trendData?: {
    trend: 'rising' | 'stable' | 'declining';
    searchVolume: number;
    validation?: { viable: boolean; confidence: number; reason: string };
  };
}

/** Phase 4: Market opportunity from /api/analytics/market-opportunities */
interface MarketOpportunityRow {
  id: number;
  productId: number | null;
  productTitle: string | null;
  aliexpressUrl: string | null;
  suggestedPrice: number | null;
  aliexpressPrice: number | null;
  source: string;
  score: number;
  trendScore: number | null;
  demandScore: number | null;
  competitionScore: number | null;
  marginScore: number | null;
  supplierScore: number | null;
  detectedAt: string;
}

/** Phase 7: Demand signal from Global Demand Radar */
interface DemandSignalRow {
  id: number;
  source: string;
  keyword: string;
  trendScore: number;
  demandScore: number | null;
  confidence: number;
  detectedAt: string;
}

const formatPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—');
const formatMoney = (value: number, currency: string) =>
  Number.isFinite(value) ? formatCurrencySimple(value, currency) : '—';

export default function ProductResearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('us');
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>(['ebay']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [marketOpportunities, setMarketOpportunities] = useState<MarketOpportunityRow[]>([]);
  const [marketOppLoading, setMarketOppLoading] = useState(true);
  const [demandSignals, setDemandSignals] = useState<DemandSignalRow[]>([]);
  const [demandSignalsLoading, setDemandSignalsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMarketOppLoading(true);
      try {
        const res = await api.get('/api/analytics/market-opportunities', { params: { limit: 30 } });
        if (!cancelled) setMarketOpportunities(res?.data?.opportunities ?? []);
      } catch {
        if (!cancelled) setMarketOpportunities([]);
      } finally {
        if (!cancelled) setMarketOppLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDemandSignalsLoading(true);
      try {
        const res = await api.get('/api/analytics/demand-signals', { params: { limit: 25, minTrendScore: 30 } });
        if (!cancelled) setDemandSignals(res?.data?.signals ?? []);
      } catch {
        if (!cancelled) setDemandSignals([]);
      } finally {
        if (!cancelled) setDemandSignalsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const search = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    if (overrideQuery) setQuery(overrideQuery);
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const res = await api.get('/api/opportunities/research', {
        params: {
          query: q,
          maxItems: 5,
          marketplaces: marketplaces.join(','),
          region,
        },
      });
      const list = res?.data?.items ?? [];
      setItems(list);
      if (list.length === 0) {
        toast.info('No results. Try different keywords or marketplaces.');
      }
    } catch (e: any) {
      if (e?.response?.status === 202) {
        const d = e.response?.data || {};
        const url = d.resolveCaptchaUrl || (d.token ? `/resolve-captcha/${d.token}` : null);
        if (url) {
          toast.info('AliExpress CAPTCHA required. Redirecting...');
          window.location.href = url.startsWith('http') ? url : `${window.location.origin}${url}`;
          return;
        }
      }
      const msg = e?.response?.data?.message || e?.message || 'Search failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [query, region, marketplaces]);

  const addToOpportunities = useCallback(
    async (item: ResearchItem) => {
      const id = item.aliexpressUrl || item.title.slice(0, 80);
      setAddingId(id);
      try {
        await api.post('/api/opportunities/add-from-research', {
          title: item.title,
          sourceMarketplace: item.sourceMarketplace,
          costUsd: item.costUsd,
          shippingCost: item.shippingCost,
          importTax: item.importTax,
          totalCost: item.totalCost,
          targetCountry: item.targetCountry,
          suggestedPriceUsd: item.suggestedPriceUsd,
          profitMargin: item.profitMargin,
          roiPercentage: item.roiPercentage,
          competitionLevel: item.competitionLevel,
          marketDemand: item.marketDemand,
          confidenceScore: item.confidenceScore,
          feesConsidered: item.feesConsidered ?? {},
          targetMarketplaces: item.targetMarketplaces?.length ? item.targetMarketplaces : ['ebay'],
        });
        toast.success('Added to opportunities');
        navigate('/opportunities');
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || 'Failed to add';
        toast.error(msg);
      } finally {
        setAddingId(null);
      }
    },
    [navigate]
  );

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Product Research</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Search products, view demand and competition signals, then add to opportunities.
      </p>

      {/* Phase 7: Global Trends — demand signals from Global Demand Radar */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Globe className="w-5 h-5 text-emerald-500" />
          Global Trends
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Keywords con alta demanda (trendScore, source, confidence). Usa uno como búsqueda para convertirlo en oportunidad.
        </p>
        {demandSignalsLoading ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-4">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : demandSignals.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No hay señales recientes. El radar se ejecuta diariamente.</p>
        ) : (
          <ul className="space-y-2">
            {demandSignals.map((s) => (
              <li
                key={s.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800/50 flex flex-wrap gap-3 items-center justify-between"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{s.keyword}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    Score: {s.trendScore.toFixed(0)} · Conf: {(s.confidence * 100).toFixed(0)}% · {s.source.replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => search(s.keyword)}
                  className="text-sm px-3 py-1.5 rounded bg-primary-600 text-white hover:bg-primary-700 flex items-center gap-1"
                >
                  <Search className="w-3 h-3" />
                  Use in research
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Phase 4: Market Opportunities — auto-discovered high-potential products */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Market Opportunities
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          High-potential products from the Market Intelligence Engine (score, trend, competition, margin).
        </p>
        {marketOppLoading ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-4">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : marketOpportunities.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500 py-4">No market opportunities yet. Run runs daily; add products and listing metrics to see scores.</p>
        ) : (
          <ul className="space-y-3">
            {marketOpportunities.map((o) => {
              const marginPct = o.suggestedPrice != null && o.aliexpressPrice != null && o.aliexpressPrice > 0
                ? ((o.suggestedPrice - o.aliexpressPrice) / o.suggestedPrice) * 100
                : null;
              return (
                <li
                  key={o.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800/50 flex flex-wrap gap-4 items-center"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate" title={o.productTitle ?? ''}>
                      {o.productTitle ?? '—'}
                    </h3>
                    <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                      <span>Score: <strong>{typeof o.score === 'number' ? o.score.toFixed(0) : o.score}</strong>/100</span>
                      {o.trendScore != null && <span>Trend: {o.trendScore.toFixed(0)}</span>}
                      {o.competitionScore != null && <span>Competition: {o.competitionScore.toFixed(0)}</span>}
                      {o.marginScore != null && <span>Margin: {o.marginScore.toFixed(0)}</span>}
                      {marginPct != null && <span>Est. margin: {marginPct.toFixed(1)}%</span>}
                      <span className="text-gray-500">{o.source}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {o.productId != null && (
                      <button
                        type="button"
                        onClick={() => navigate(`/products/${o.productId}/preview`)}
                        className="text-sm px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        View product
                      </button>
                    )}
                    {o.aliexpressUrl && (
                      <a
                        href={o.aliexpressUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        AliExpress
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="e.g. wireless earbuds"
              className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
            />
            <button
              type="button"
              onClick={search}
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
          >
            <option value="us">US</option>
            <option value="uk">UK</option>
            <option value="es">ES</option>
            <option value="mx">MX</option>
            <option value="ar">AR</option>
          </select>
        </div>
        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Marketplaces</span>
          <div className="flex gap-2">
            {(['ebay', 'amazon', 'mercadolibre'] as Marketplace[]).map((mp) => (
              <label key={mp} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketplaces.includes(mp)}
                  onChange={(e) =>
                    setMarketplaces((prev) =>
                      e.target.checked ? [...prev, mp] : prev.filter((m) => m !== mp)
                    )
                  }
                  className="rounded"
                />
                <span className="text-sm capitalize">{mp}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 py-8">
          <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <span>Searching…</span>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="space-y-4">
          {items.map((item, idx) => (
            <li
              key={item.aliexpressUrl + String(idx)}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800/50 flex gap-4"
            >
              <div className="flex-shrink-0 w-24 h-24 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                {item.image ? (
                  <img src={item.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">—</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-white truncate" title={item.title}>
                  {item.title}
                </h3>
                <div className="flex flex-wrap gap-4 mt-2 text-sm">
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <DollarSign className="w-4 h-4" />
                    Cost: {formatMoney(item.costUsd, 'USD')} → Price: {formatMoney(item.suggestedPriceUsd, item.suggestedPriceCurrency)}
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-4 h-4" />
                    Margin: {formatPct(item.profitMargin)} · ROI: {item.roiPercentage?.toFixed(0) ?? '—'}%
                  </span>
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <TrendingUp className="w-4 h-4" />
                    Demand: {item.marketDemand} · Competition: {item.competitionLevel}
                  </span>
                  {item.trendData && (
                    <span className="text-gray-500 dark:text-gray-500">
                      Trend: {item.trendData.trend} · Vol: {item.trendData.searchVolume ?? '—'}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <a
                    href={item.aliexpressUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    AliExpress
                  </a>
                  <button
                    type="button"
                    onClick={() => addToOpportunities(item)}
                    disabled={addingId !== null}
                    className="text-sm px-3 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <PlusCircle className="w-3 h-3" />
                    {addingId === (item.aliexpressUrl || item.title.slice(0, 80)) ? 'Adding…' : 'Add to opportunities'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length === 0 && query && !error && (
        <p className="text-gray-500 dark:text-gray-500 text-sm">No results. Try another search.</p>
      )}
    </div>
  );
}
