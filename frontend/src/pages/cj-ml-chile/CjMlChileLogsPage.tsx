import { useEffect, useState } from 'react';
import { api } from '@/services/api';

interface Trace {
  id: string;
  step: string;
  message: string;
  route: string | null;
  correlationId: string | null;
  meta: unknown;
  createdAt: string;
}

const STEP_COLORS: Record<string, string> = {
  'request.error': 'text-red-500',
  'pricing.error': 'text-red-500',
  'cj.freight.error': 'text-red-500',
  'listing.publish.error': 'text-red-500',
  'warehouse.chile.not_found': 'text-amber-500',
  'qualification.result': 'text-emerald-600 dark:text-emerald-400',
  'listing.publish.success': 'text-emerald-600 dark:text-emerald-400',
  'warehouse.chile.confirmed': 'text-emerald-600 dark:text-emerald-400',
};

export default function CjMlChileLogsPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correlationFilter, setCorrelationFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = (cid?: string) => {
    setLoading(true);
    const params = cid ? `?correlationId=${encodeURIComponent(cid)}&limit=100` : '?limit=100';
    api.get(`/api/cj-ml-chile/logs${params}`)
      .then((r) => setTraces(r.data.traces ?? []))
      .catch((e) => setError(e?.response?.data?.message ?? e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={correlationFilter}
          onChange={(e) => setCorrelationFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(correlationFilter || undefined)}
          placeholder="Filtrar por correlationId"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <button
          onClick={() => load(correlationFilter || undefined)}
          className="px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-300"
        >
          Filtrar
        </button>
        <button onClick={() => { setCorrelationFilter(''); load(); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Limpiar</button>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando logs…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && traces.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">Sin logs. Los logs se generan al usar el módulo.</div>
      )}

      <div className="space-y-1.5 font-mono">
        {traces.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2">
            <div className="flex items-start gap-2 cursor-pointer" onClick={() => toggle(t.id)}>
              <span className="text-xs text-slate-400 flex-shrink-0 w-16 text-right pt-0.5">
                {new Date(t.createdAt).toLocaleTimeString('es-CL')}
              </span>
              <span className={`text-xs flex-shrink-0 ${STEP_COLORS[t.step] ?? 'text-slate-600 dark:text-slate-400'}`}>{t.step}</span>
              <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{t.message}</span>
              {t.meta != null && <span className="text-xs text-slate-400 flex-shrink-0">{expanded.has(t.id) ? '▾' : '▸'}</span>}
            </div>
            {t.correlationId && (
              <p className="text-xs text-slate-400 pl-[4.5rem] mt-0.5">cid: {t.correlationId}</p>
            )}
            {expanded.has(t.id) && t.meta != null && (
              <pre className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 rounded p-2 mt-1 ml-[4.5rem] overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(t.meta, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
