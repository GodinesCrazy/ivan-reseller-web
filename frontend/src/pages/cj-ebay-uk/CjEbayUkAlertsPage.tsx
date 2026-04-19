import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Alert = { id: number; type: string; severity: string; status: string; message?: string; createdAt: string };

export default function CjEbayUkAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    api.get<{ ok: boolean; alerts: Alert[] }>('/api/cj-ebay-uk/alerts?status=OPEN')
      .then((r) => { if (r.data?.ok) setAlerts(r.data.alerts); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function resolve(id: number) {
    await api.post(`/api/cj-ebay-uk/alerts/${id}/resolve`);
    load();
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando alertas UK…</p>;

  return (
    <div className="space-y-3">
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-500">No open alerts for CJ → eBay UK.</p>
      ) : (
        alerts.map((a) => (
          <div key={a.id} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{a.type}</p>
              {a.message && <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{a.message}</p>}
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
            <button onClick={() => resolve(a.id)} className="shrink-0 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">
              Resolve
            </button>
          </div>
        ))
      )}
    </div>
  );
}
