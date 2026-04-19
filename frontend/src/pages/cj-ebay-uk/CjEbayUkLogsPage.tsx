import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Trace = { id: number; step: string; message?: string; route?: string; durationMs?: number; createdAt: string; correlationId?: string };

export default function CjEbayUkLogsPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ ok: boolean; traces: Trace[] }>('/api/cj-ebay-uk/logs')
      .then((r) => { if (r.data?.ok) setTraces(r.data.traces); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Cargando logs UK…</p>;

  return (
    <div className="space-y-2">
      {traces.length === 0 ? (
        <p className="text-sm text-slate-500">No execution traces yet.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">Time</th>
                <th className="px-3 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">Step</th>
                <th className="px-3 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">Route</th>
                <th className="px-3 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">Message</th>
                <th className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 font-medium">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {traces.map((t) => (
                <tr key={t.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-1.5 text-slate-400 font-mono whitespace-nowrap">{new Date(t.createdAt).toLocaleTimeString()}</td>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 font-mono">{t.step}</td>
                  <td className="px-3 py-1.5 text-slate-400 font-mono">{t.route || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 max-w-xs truncate">{t.message || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-400 text-right">{t.durationMs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
