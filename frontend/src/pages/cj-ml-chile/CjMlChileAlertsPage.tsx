import { useEffect, useState } from 'react';
import { api } from '@/services/api';

interface Alert {
  id: number;
  type: string;
  severity: string;
  status: string;
  payload: unknown;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
  warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
};

export default function CjMlChileAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = () => {
    api.get('/api/cj-ml-chile/alerts')
      .then((r) => setAlerts(r.data.alerts ?? []))
      .catch((e) => setError(e?.response?.data?.message ?? e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function doAction(id: number, action: 'acknowledge' | 'resolve') {
    setActionLoading(id);
    try {
      await api.post(`/api/cj-ml-chile/alerts/${id}/${action}`);
      load();
    } catch { /* ignore */ } finally { setActionLoading(null); }
  }

  if (loading) return <div className="text-sm text-slate-500">Cargando alertas…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  const open = alerts.filter((a) => a.status === 'OPEN');
  const rest = alerts.filter((a) => a.status !== 'OPEN');

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{open.length} alerta{open.length !== 1 ? 's' : ''} abiert{open.length !== 1 ? 'as' : 'a'}</p>

      {open.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">Sin alertas abiertas.</div>}

      {[...open, ...rest].map((a) => (
        <div key={a.id} className={`rounded-xl border p-4 space-y-2 ${a.status === 'RESOLVED' ? 'opacity-50' : ''} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800`}>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.warning}`}>{a.severity}</span>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.type}</span>
            </div>
            <span className="text-xs text-slate-500">{a.status}</span>
          </div>
          {a.payload != null && (
            <pre className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(a.payload, null, 2)}
            </pre>
          )}
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString('es-CL')}</span>
            {a.status === 'OPEN' && (
              <button
                onClick={() => doAction(a.id, 'acknowledge')}
                disabled={actionLoading === a.id}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Ack
              </button>
            )}
            {a.status !== 'RESOLVED' && (
              <button
                onClick={() => doAction(a.id, 'resolve')}
                disabled={actionLoading === a.id}
                className="px-2 py-1 rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs disabled:opacity-50 hover:bg-slate-700 dark:hover:bg-slate-300"
              >
                Resolver
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
