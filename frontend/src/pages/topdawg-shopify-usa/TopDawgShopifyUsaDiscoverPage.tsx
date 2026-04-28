import { useState } from 'react';
import { api } from '@/services/api';

type TdProduct = { sku: string; title: string; brand?: string; wholesaleCost?: number; msrp?: number; images?: string[] };
type EvalResult = { product: TdProduct; qualification: { approved: boolean; reason: string; pricing: Record<string, number> } };

export default function TopDawgShopifyUsaDiscoverPage() {
  const [keyword, setKeyword]   = useState('');
  const [results, setResults]   = useState<TdProduct[]>([]);
  const [loading, setLoading]   = useState(false);
  const [evalResult, setEval]   = useState<EvalResult | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function search() {
    if (!keyword.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await api.get('/api/topdawg-shopify-usa/discover/search', { params: { keyword, pageSize: 20 } });
      setResults(res.data.results ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error searching TopDawg catalog');
    } finally { setLoading(false); }
  }

  async function evaluate(sku: string) {
    setError(null); setEval(null);
    try {
      const res = await api.post('/api/topdawg-shopify-usa/discover/evaluate', { tdSku: sku });
      setEval(res.data);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Evaluation error'); }
  }

  async function importDraft(sku: string) {
    setImporting(sku); setImportMsg(null); setError(null);
    try {
      const res = await api.post('/api/topdawg-shopify-usa/discover/import-draft', { tdSku: sku });
      setImportMsg(res.data.alreadyExists ? 'Ya importado anteriormente.' : 'Importado como DRAFT exitosamente.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Import error'); }
    finally { setImporting(null); }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void search()}
          placeholder="Buscar en catálogo TopDawg (ej: dog collar, cat toy)…"
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <button
          onClick={() => void search()}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">{error}</div>}
      {importMsg && <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200">{importMsg}</div>}

      {/* Evaluation panel */}
      {evalResult && (
        <div className={`rounded-xl border p-4 text-sm ${evalResult.qualification.approved ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : 'border-red-300 bg-red-50 dark:bg-red-950/30'}`}>
          <p className="font-semibold">{evalResult.qualification.approved ? '✓ Aprobado' : '✗ Rechazado'} — {evalResult.qualification.reason}</p>
          {evalResult.qualification.pricing && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {Object.entries(evalResult.qualification.pricing).map(([k, v]) => (
                <div key={k}><span className="text-slate-500">{k}:</span> <span className="font-mono">${Number(v).toFixed(2)}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-xs font-medium text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-left">Marca</th>
                <th className="px-3 py-2 text-right">Costo</th>
                <th className="px-3 py-2 text-right">MSRP</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {results.map(p => (
                <tr key={p.sku} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {p.images?.[0] && <img src={p.images[0]} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" />}
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1">{p.title}</p>
                        <p className="text-xs font-mono text-slate-400">{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{p.brand ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.wholesaleCost != null ? `$${p.wholesaleCost.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{p.msrp != null ? `$${p.msrp.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => void evaluate(p.sku)} className="rounded px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">Evaluar</button>
                      <button onClick={() => void importDraft(p.sku)} disabled={importing === p.sku} className="rounded px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                        {importing === p.sku ? '…' : 'Importar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
