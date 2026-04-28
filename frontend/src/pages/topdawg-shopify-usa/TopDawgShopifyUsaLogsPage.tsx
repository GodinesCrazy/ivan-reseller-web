import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type LogEntry = { id: number; step: string; status: string; message: string; durationMs: number | null; createdAt: string };

export default function TopDawgShopifyUsaLogsPage() {
  const [logs, setLogs]     = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/topdawg-shopify-usa/logs', { params: { limit: 100 } })
      .then(r => { setLogs(r.data.logs ?? []); setLoading(false); });
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Cargando logs…</p>;
  if (!logs.length) return <p className="text-sm text-slate-400">Sin logs registrados aún.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-full text-xs font-mono">
        <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 uppercase text-xs">
          <tr>
            <th className="px-3 py-2 text-left">Timestamp</th>
            <th className="px-3 py-2 text-left">Step</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Mensaje</th>
            <th className="px-3 py-2 text-right">ms</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-1.5 text-slate-400">{new Date(l.createdAt).toLocaleTimeString()}</td>
              <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{l.step}</td>
              <td className="px-3 py-1.5">
                <span className={`rounded px-1.5 py-0.5 ${l.status === 'ok' || l.status === 'success' ? 'bg-emerald-100 text-emerald-700' : l.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{l.status}</span>
              </td>
              <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">{l.message}</td>
              <td className="px-3 py-1.5 text-right text-slate-400">{l.durationMs ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
