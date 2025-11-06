import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

type Marketplace = 'ebay' | 'amazon' | 'mercadolibre';

interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  image?: string;
  costUsd: number;
  suggestedPriceUsd: number;
  profitMargin: number; // 0-1
  roiPercentage: number; // 0-100
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  generatedAt: string;
}

export default function Opportunities() {
  const [query, setQuery] = useState('organizador cocina');
  const [region, setRegion] = useState('us');
  const [maxItems, setMaxItems] = useState(5);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>(['ebay', 'amazon', 'mercadolibre']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OpportunityItem[]>([]);

  const marketplacesParam = useMemo(() => marketplaces.join(','), [marketplaces]);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/opportunities', {
        params: { query, maxItems, marketplaces: marketplacesParam, region }
      });
      setItems(data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Error fetching opportunities');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMarketplace(mp: Marketplace) {
    setMarketplaces(prev => prev.includes(mp) ? prev.filter(m => m !== mp) : [...prev, mp]);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Real Opportunities</h1>
      <div className="bg-white border rounded p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search terms (e.g. organizador cocina)"
          className="border rounded px-3 py-2"
        />
        <select value={region} onChange={e => setRegion(e.target.value)} className="border rounded px-3 py-2">
          <option value="us">US</option>
          <option value="uk">UK</option>
          <option value="mx">MX</option>
          <option value="de">DE</option>
          <option value="es">ES</option>
          <option value="br">BR</option>
        </select>
        <input
          type="number"
          min={1}
          max={10}
          value={maxItems}
          onChange={e => setMaxItems(Math.max(1, Math.min(10, Number(e.target.value))))}
          className="border rounded px-3 py-2"
        />
        <button onClick={search} disabled={loading} className="bg-primary-600 text-white rounded px-4 py-2">
          {loading ? 'Searching…' : 'Search'}
        </button>
        <div className="md:col-span-4 flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('ebay')} onChange={() => toggleMarketplace('ebay')} /> eBay</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('amazon')} onChange={() => toggleMarketplace('amazon')} /> Amazon</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('mercadolibre')} onChange={() => toggleMarketplace('mercadolibre')} /> MercadoLibre</label>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="overflow-auto bg-white border rounded">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={8} />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Title</th>
                <th className="text-right p-3">Cost (USD)</th>
                <th className="text-right p-3">Suggested (USD)</th>
                <th className="text-right p-3">Margin %</th>
                <th className="text-right p-3">ROI %</th>
                <th className="text-center p-3">Competition</th>
                <th className="text-center p-3">Targets</th>
                <th className="text-center p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
              <tr key={idx} className="border-t">
                <td className="p-3">
                  <div className="font-medium line-clamp-2">{it.title}</div>
                  <div className="text-xs text-gray-500">Conf: {Math.round((it.confidenceScore || 0) * 100) / 100}%</div>
                </td>
                <td className="p-3 text-right">${it.costUsd.toFixed(2)}</td>
                <td className="p-3 text-right">${it.suggestedPriceUsd.toFixed(2)}</td>
                <td className="p-3 text-right">{Math.round(it.profitMargin * 100)}%</td>
                <td className="p-3 text-right">{Math.round(it.roiPercentage)}%</td>
                <td className="p-3 text-center capitalize">{it.competitionLevel}</td>
                <td className="p-3 text-center">{(it.targetMarketplaces || []).join(', ')}</td>
                <td className="p-3 text-center"><a className="text-primary-600 underline" href={it.aliexpressUrl} target="_blank" rel="noreferrer">AliExpress</a></td>
              </tr>
            ))}
              {items.length === 0 && (
                <tr><td className="p-6 text-center text-gray-500" colSpan={8}>No results</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

