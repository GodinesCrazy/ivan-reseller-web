import { useState } from 'react';
import { api } from '@/services/api';

interface CjProduct {
  cjProductId: string;
  title: string;
  listPriceUsd?: number;
  inventoryTotal?: number;
  imageUrls?: string[];
}

interface SearchResult {
  items: CjProduct[];
  total: number;
  note?: string;
}

interface PreviewResult {
  ok: boolean;
  product: { cjProductId: string; title: string };
  variant: { cjSku: string; stockLive: number; unitCostUsd: number | null };
  shipping: { cost: number; method: string; estimatedDays: number | null; startCountryCode: string } | null;
  warehouseChileConfirmed: boolean;
  mvpViable: boolean;
  pricing: Record<string, unknown> | null;
  pricingError: string | null;
}

interface EvaluateResult extends PreviewResult {
  decision: 'APPROVED' | 'REJECTED' | 'PENDING' | 'NOT_VIABLE';
  reasons: Array<{ rule: string; code: string; message: string; severity: string }>;
  ids?: { evaluationId: number };
}

function clpFormat(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function DecisionBadge({ d }: { d: string }) {
  const map: Record<string, string> = {
    APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800',
    REJECTED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
    PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    NOT_VIABLE: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[d] ?? map['PENDING']}`}>{d}</span>;
}

function WarehouseBadge({ confirmed }: { confirmed: boolean }) {
  return confirmed
    ? <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">🇨🇱 Chile ✓</span>
    : <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">Sin warehouse CL</span>;
}

export default function CjMlChileProductsPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<CjProduct | null>(null);
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [evalResult, setEvalResult] = useState<EvaluateResult | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [draftingEvalId, setDraftingEvalId] = useState<number | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftOk, setDraftOk] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchErr(null);
    setResults(null);
    setSelected(null);
    setPreviewResult(null);
    setEvalResult(null);
    try {
      const res = await api.post('/api/cj-ml-chile/cj/search', { query, pageSize: 20 });
      setResults(res.data);
    } catch (e: unknown) {
      setSearchErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setSearching(false); }
  }

  async function doPreview() {
    if (!selected || !variantId) return;
    setPreviewing(true);
    setPreviewResult(null);
    setEvalResult(null);
    setActionErr(null);
    try {
      const res = await api.post('/api/cj-ml-chile/preview', { productId: selected.cjProductId, variantId, quantity: qty });
      setPreviewResult(res.data);
    } catch (e: unknown) {
      setActionErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setPreviewing(false); }
  }

  async function doEvaluate() {
    if (!selected || !variantId) return;
    setEvaluating(true);
    setEvalResult(null);
    setActionErr(null);
    try {
      const res = await api.post('/api/cj-ml-chile/evaluate', { productId: selected.cjProductId, variantId, quantity: qty });
      setEvalResult(res.data);
    } catch (e: unknown) {
      setActionErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setEvaluating(false); }
  }

  async function doDraft(evaluationId: number) {
    setDraftingEvalId(evaluationId);
    setDraftLoading(true);
    setDraftOk(false);
    try {
      await api.post('/api/cj-ml-chile/listings/draft', { evaluationId });
      setDraftOk(true);
    } catch (e: unknown) {
      setActionErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setDraftLoading(false); }
  }

  const pricing = previewResult?.pricing ?? evalResult?.pricing;

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Buscar productos CJ (ej: wireless earbuds)"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <button
          onClick={search}
          disabled={searching}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {searchErr && <p className="text-sm text-red-600">{searchErr}</p>}

      {results && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{results.total} resultados · {results.note}</p>
          <div className="space-y-2">
            {results.items.map((item) => (
              <div
                key={item.cjProductId}
                onClick={() => { setSelected(item); setPreviewResult(null); setEvalResult(null); setVariantId(''); }}
                className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selected?.cjProductId === item.cjProductId ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'}`}
              >
                {item.imageUrls?.[0] && (
                  <img src={item.imageUrls[0]} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">{item.title}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.listPriceUsd != null && (
                      <span className="text-xs text-slate-500">${item.listPriceUsd.toFixed(2)} USD</span>
                    )}
                    {item.inventoryTotal != null && (
                      <span className={`text-xs ${item.inventoryTotal > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        Stock: {item.inventoryTotal}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected product actions */}
      {selected && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">{selected.title}</p>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Variant ID / SKU</label>
              <input
                type="text"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                placeholder="ej: 10001234567890"
                className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 w-48"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 w-20"
              />
            </div>
          </div>
          {actionErr && <p className="text-sm text-red-600 dark:text-red-400">{actionErr}</p>}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={doPreview}
              disabled={!variantId || previewing}
              className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 transition-colors"
            >
              {previewing ? 'Calculando…' : 'Preview pricing'}
            </button>
            <button
              onClick={doEvaluate}
              disabled={!variantId || evaluating}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {evaluating ? 'Evaluando…' : 'Evaluate (persistir)'}
            </button>
          </div>

          {/* Preview result */}
          {previewResult && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Preview</p>
                <WarehouseBadge confirmed={previewResult.warehouseChileConfirmed} />
                {!previewResult.mvpViable && (
                  <span className="text-xs text-slate-500">OUT OF SCOPE para MVP</span>
                )}
              </div>
              {previewResult.shipping && (
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                  <p>Envío: ${previewResult.shipping.cost.toFixed(2)} USD · {previewResult.shipping.method} · {previewResult.shipping.estimatedDays ?? '?'} días · origen: {previewResult.shipping.startCountryCode}</p>
                </div>
              )}
              {pricing && <PricingTable p={pricing} />}
              {previewResult.pricingError && <p className="text-xs text-red-600">{previewResult.pricingError}</p>}
            </div>
          )}

          {/* Eval result */}
          {evalResult && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Evaluación</p>
                <DecisionBadge d={evalResult.decision} />
                <WarehouseBadge confirmed={evalResult.warehouseChileConfirmed} />
              </div>
              <div className="space-y-1">
                {evalResult.reasons.map((r, i) => (
                  <p key={i} className={`text-xs ${r.severity === 'block' ? 'text-red-600 dark:text-red-400' : r.severity === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                    [{r.rule}] {r.code}: {r.message}
                  </p>
                ))}
              </div>
              {pricing && <PricingTable p={pricing} />}
              {evalResult.decision === 'APPROVED' && evalResult.ids?.evaluationId && !draftOk && (
                <button
                  onClick={() => doDraft(evalResult.ids!.evaluationId)}
                  disabled={draftLoading || draftingEvalId === evalResult.ids?.evaluationId}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-300 disabled:opacity-50 transition-colors"
                >
                  {draftLoading ? 'Creando draft…' : 'Crear draft listing'}
                </button>
              )}
              {draftOk && <p className="text-sm text-green-600 dark:text-green-400 font-medium">Draft creado. Ve a Listings para publicar.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PricingTable({ p }: { p: Record<string, unknown> }) {
  const row = (label: string, usd: unknown, clp?: unknown) => (
    <tr key={label} className="border-t border-slate-100 dark:border-slate-700">
      <td className="py-1 text-xs text-slate-600 dark:text-slate-400">{label}</td>
      <td className="py-1 text-xs text-right text-slate-800 dark:text-slate-200">{typeof usd === 'number' && usd != null ? `$${usd.toFixed(2)}` : '—'}</td>
      {clp !== undefined && (
        <td className="py-1 text-xs text-right text-emerald-700 dark:text-emerald-300">
          {typeof clp === 'number' && clp != null ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(clp) : '—'}
        </td>
      )}
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px]">
        <thead>
          <tr>
            <th className="text-left text-xs text-slate-400 pb-1 font-normal">Concepto</th>
            <th className="text-right text-xs text-slate-400 pb-1 font-normal">USD</th>
            <th className="text-right text-xs text-slate-400 pb-1 font-normal">CLP</th>
          </tr>
        </thead>
        <tbody>
          {row('Costo proveedor CJ', p.supplierCostUsd)}
          {row('Envío CJ → Chile', p.shippingUsd)}
          {row(`IVA 19% (${((p.ivaRate as number) * 100).toFixed(0)}%)`, p.ivaUsd)}
          {row('Costo aterrizado', p.landedCostUsd)}
          {row('Fee ML Chile', p.mlFeeUsd)}
          {row('Fee Mercado Pago', p.mpPaymentFeeUsd)}
          {row('Buffer incidentes', p.incidentBufferUsd)}
          {row('COSTO TOTAL', p.totalCostUsd)}
          {row('PRECIO LISTA', p.listPriceUsd, p.listPriceCLP)}
          {row('Precio sugerido', p.suggestedPriceUsd, p.suggestedPriceCLP)}
          {row('Ganancia neta', p.netProfitUsd)}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 dark:border-slate-600">
            <td className="pt-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">Margen neto</td>
            <td className="pt-1.5 text-right text-xs font-semibold text-emerald-700 dark:text-emerald-300" colSpan={2}>
              {p.netMarginPct != null ? `${(p.netMarginPct as number).toFixed(1)}%` : '—'}
            </td>
          </tr>
          <tr>
            <td className="pt-1 text-xs text-slate-400">FX rate</td>
            <td className="pt-1 text-right text-xs text-slate-400" colSpan={2}>
              1 USD = {p.fxRateCLPperUSD as number} CLP (fuente: {p.fxRateAt ? new Date(p.fxRateAt as string).toLocaleTimeString() : '—'})
            </td>
          </tr>
        </tfoot>
      </table>
      {p.feeDefaultsApplied != null && Object.keys(p.feeDefaultsApplied as object).length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Defaults aplicados: {Object.entries(p.feeDefaultsApplied as Record<string, number>).map(([k, v]) => `${k}=${v}`).join(', ')}
        </p>
      )}
    </div>
  );
}
