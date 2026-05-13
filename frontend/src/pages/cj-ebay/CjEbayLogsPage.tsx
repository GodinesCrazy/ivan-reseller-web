import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { RefreshCw, ScrollText } from 'lucide-react';

type TraceRow = {
  id: string;
  step: string;
  route: string | null;
  message: string;
  correlationId: string | null;
  meta?: unknown;
  createdAt: string;
};

const STEP_COLOR: Record<string, string> = {
  'request.error': 'text-red-400',
  'request.start': 'text-slate-400',
  'request.complete': 'text-emerald-400',
  'listing.publish.error': 'text-red-400',
  'listing.publish.account_policy_block': 'text-amber-300',
  'listing.reconcile.pending': 'text-violet-300',
  'listing.reconcile.success': 'text-emerald-400',
  'order.import.error': 'text-red-400',
  'order.import.success': 'text-emerald-400',
  'tracking.sync.error': 'text-red-400',
  'tracking.sync.success': 'text-emerald-400',
  'cj.order.pay.balance_blocked': 'text-amber-300',
};

function stepColor(step: string): string {
  if (STEP_COLOR[step]) return STEP_COLOR[step];
  if (step.includes('error') || step.includes('failed')) return 'text-red-400';
  if (step.includes('success') || step.includes('complete')) return 'text-emerald-400';
  if (step.includes('pending') || step.includes('reconcile')) return 'text-violet-300';
  return 'text-slate-400';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function axiosMsg(e: unknown, fb: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

export default function CjEbayLogsPage() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStep, setFilterStep] = useState('');
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (filterStep) params.set('step', filterStep);
      const res = await api.get<{ ok: boolean; traces: TraceRow[] }>(`/api/cj-ebay/logs?${params.toString()}`);
      setTraces(Array.isArray(res.data.traces) ? res.data.traces : []);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar los logs CJ-eBay.'));
    } finally {
      setLoading(false);
    }
  }, [filterStep, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const errorSteps = traces.filter((t) => t.step.includes('error') || t.step.includes('failed')).length;
  const policySteps = traces.filter((t) => t.step.includes('policy') || t.step.includes('balance_blocked')).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-slate-400" />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Logs CJ → eBay USA</h1>
            <p className="text-xs text-slate-400">Trazas reales de publicación, reconciliación, órdenes, CJ checkout y tracking.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={filterStep} onChange={(e) => setFilterStep(e.target.value)} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
          <option value="">Todos los steps</option>
          <option value="error">Solo errores</option>
          <option value="listing.publish">Publicación eBay</option>
          <option value="listing.reconcile">Reconciliación eBay</option>
          <option value="order.">Órdenes</option>
          <option value="cj.order">CJ checkout</option>
          <option value="tracking">Tracking</option>
          <option value="alert">Alertas</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
          <option value={50}>Últimos 50</option>
          <option value={100}>Últimos 100</option>
          <option value={200}>Últimos 200</option>
        </select>
        {errorSteps > 0 && <button type="button" onClick={() => setFilterStep('error')} className="rounded-full bg-red-900/40 px-3 py-1 text-xs font-medium text-red-200">Errores ({errorSteps})</button>}
        {policySteps > 0 && <span className="rounded-full bg-amber-900/40 px-3 py-1 text-xs font-medium text-amber-200">Política/saldo ({policySteps})</span>}
      </div>

      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        {loading ? (
          <div className="px-6 py-10 text-sm text-slate-400">Cargando logs...</div>
        ) : traces.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">Sin trazas para el filtro actual.</div>
        ) : (
          <div className="max-h-[660px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-left font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Ruta</th>
                  <th className="px-3 py-2">Mensaje</th>
                  <th className="px-3 py-2">Correlation</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <tr key={trace.id} className="border-t border-slate-900 hover:bg-slate-900/80">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">{fmtDate(trace.createdAt)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 font-mono ${stepColor(trace.step)}`}>{trace.step}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">{trace.route ?? '-'}</td>
                    <td className="max-w-xl px-3 py-2 text-slate-300">
                      <div className="line-clamp-2">{trace.message}</div>
                      {trace.meta != null && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-slate-500">meta</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/30 p-2 text-[11px] text-slate-400">{JSON.stringify(trace.meta, null, 2)}</pre>
                        </details>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">{trace.correlationId ? trace.correlationId.slice(0, 10) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
