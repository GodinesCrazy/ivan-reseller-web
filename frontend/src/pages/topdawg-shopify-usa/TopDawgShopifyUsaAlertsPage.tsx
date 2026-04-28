import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api';

type Alert = { id: number; type: string; severity: string; status: string; title: string; message: string; createdAt: string };

export default function TopDawgShopifyUsaAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/api/topdawg-shopify-usa/alerts');
    setAlerts(res.data.alerts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(id: number, action: 'acknowledge' | 'resolve') {
    setBusyId(id);
    await api.post(`/api/topdawg-shopify-usa/alerts/${id}/${action}`);
    await load();
    setBusyId(null);
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando alertas…</p>;
  if (!alerts.length) return <p className="text-sm text-slate-500">Sin alertas activas.</p>;

  return (
    <div className="space-y-3">
      {alerts.map(a => (
        <div key={a.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{a.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{a.message}</p>
            </div>
            <span className={`rounded px-2 py-0.5 text-xs font-medium flex-shrink-0 ${a.status === 'OPEN' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{a.status}</span>
          </div>
          {a.status === 'OPEN' && (
            <div className="flex gap-2">
              <button onClick={() => void act(a.id, 'acknowledge')} disabled={busyId === a.id}
                className="rounded px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-50">Acknowledge</button>
              <button onClick={() => void act(a.id, 'resolve')} disabled={busyId === a.id}
                className="rounded px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 disabled:opacity-50">Resolver</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
