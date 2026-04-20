import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type TraceRow = {
  id: number;
  step: string;
  message: string;
  correlationId: string | null;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STEP_COLOR: Record<string, string> = {
  'request.error':            'text-red-600 dark:text-red-400',
  'request.start':            'text-slate-500',
  'request.complete':         'text-emerald-600 dark:text-emerald-400',
  'listing.publish.error':    'text-red-600 dark:text-red-400',
  'listing.publish.success':  'text-emerald-600 dark:text-emerald-400',
  'order.import.error':       'text-red-600 dark:text-red-400',
  'order.import.success':     'text-emerald-600 dark:text-emerald-400',
  'tracking.sync.error':      'text-red-600 dark:text-red-400',
  'tracking.sync.success':    'text-emerald-600 dark:text-emerald-400',
  'cj.order.create.error':    'text-red-600 dark:text-red-400',
  'cj.order.create.success':  'text-emerald-600 dark:text-emerald-400',
  'alert.created':            'text-amber-600 dark:text-amber-400',
};

function stepColor(step: string): string {
  if (step in STEP_COLOR) return STEP_COLOR[step];
  if (step.includes('error')) return 'text-red-600 dark:text-red-400';
  if (step.includes('success') || step.includes('complete')) return 'text-emerald-600 dark:text-emerald-400';
  if (step.includes('start')) return 'text-blue-600 dark:text-blue-400';
  return 'text-slate-500 dark:text-slate-400';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function axiosMsg(e: unknown, fb: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjShopifyUsaLogsPage() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStep, setFilterStep] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (filterStep) params.set('step', filterStep);
      const res = await api.get<{ ok: boolean; traces: TraceRow[]; count: number }>(
        `/api/cj-shopify-usa/logs?${params.toString()}`,
      );
      if (res.data?.ok && Array.isArray(res.data.traces)) {
        setTraces(res.data.traces);
      }
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar los logs.'));
    } finally {
      setLoading(false);
    }
  }, [filterStep, limit]);

  useEffect(() => { void load(); }, [load]);

  const errorSteps = traces.filter((t) => t.step.includes('error')).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filtrar por step (ej: listing.publish.error)"
          value={filterStep}
          onChange={(e) => setFilterStep(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 w-72"
        />
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300"
        >
          <option value={50}>Últimos 50</option>
          <option value={100}>Últimos 100</option>
          <option value={200}>Últimos 200</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          Recargar
        </button>
        {errorSteps > 0 && (
          <button
            type="button"
            onClick={() => setFilterStep('error')}
            className="rounded-full px-3 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          >
            Solo errores ({errorSteps})
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando logs…</p>
      ) : traces.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-6 py-10 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {filterStep ? `Sin traces con step "${filterStep}".` : 'Sin traces de ejecución registrados aún.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-slate-900 dark:bg-slate-950 p-1">
            <div className="overflow-auto max-h-[600px]">
              <table className="min-w-full text-xs font-mono">
                <thead className="sticky top-0 bg-slate-800 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Timestamp</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Step</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Mensaje</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Correlation</th>
                  </tr>
                </thead>
                <tbody>
                  {traces.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800 hover:bg-slate-800/60">
                      <td className="px-3 py-1.5 text-slate-400 shrink-0 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                      <td className={`px-3 py-1.5 whitespace-nowrap ${stepColor(t.step)}`}>{t.step}</td>
                      <td className="px-3 py-1.5 text-slate-300 break-all">{t.message}</td>
                      <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">
                        {t.correlationId ? t.correlationId.slice(0, 8) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/80 text-xs text-slate-500 flex justify-between">
            <span>{traces.length} entradas mostradas</span>
            <span>{errorSteps} errores</span>
          </div>
        </div>
      )}
    </div>
  );
}
