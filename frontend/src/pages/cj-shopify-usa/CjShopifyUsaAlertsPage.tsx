import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertMeta = { label: string; description: string };

type Alert = {
  id: number;
  type: string;
  severity: string;
  status: string;
  payload: unknown;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  meta: AlertMeta;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  error:   'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
  warning: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
  info:    'bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800',
};

const SEVERITY_DOT: Record<string, string> = {
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  info:    'bg-sky-500',
};

const STATUS_BADGE: Record<string, string> = {
  OPEN:         'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ACKNOWLEDGED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  RESOLVED:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta', ACKNOWLEDGED: 'Vista', RESOLVED: 'Resuelta',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
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

export default function CjShopifyUsaAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const query = filterStatus !== 'ALL' ? `?status=${filterStatus}` : '';
      const res = await api.get<{ ok: boolean; alerts: Alert[] }>(`/api/cj-shopify-usa/alerts${query}`);
      if (res.data?.ok && Array.isArray(res.data.alerts)) {
        setAlerts(res.data.alerts);
      }
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar las alertas.'));
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { void load(); }, [load]);

  async function acknowledge(id: number) {
    setBusyId(id);
    try {
      await api.post(`/api/cj-shopify-usa/alerts/${id}/acknowledge`);
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error al reconocer alerta.'));
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(id: number) {
    setBusyId(id);
    try {
      await api.post(`/api/cj-shopify-usa/alerts/${id}/resolve`);
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error al resolver alerta.'));
    } finally {
      setBusyId(null);
    }
  }

  const openCount = alerts.filter((a) => a.status === 'OPEN').length;
  const ackCount  = alerts.filter((a) => a.status === 'ACKNOWLEDGED').length;

  if (loading) return <p className="text-sm text-slate-500">Cargando alertas…</p>;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {[
          { key: 'ALL',         label: `Todas (${alerts.length})`,    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
          { key: 'OPEN',        label: `Abiertas (${openCount})`,     cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
          { key: 'ACKNOWLEDGED',label: `Vistas (${ackCount})`,        cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
          { key: 'RESOLVED',    label: 'Resueltas',                   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
        ].map(({ key, label, cls }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterStatus(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity ${cls} ${filterStatus === key ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-80 hover:opacity-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-6 py-10 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {filterStatus === 'OPEN' ? 'Sin alertas abiertas. Todo en orden.' : 'Sin alertas en esta categoría.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border px-4 py-4 ${SEVERITY_COLORS[alert.severity] ?? 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${SEVERITY_DOT[alert.severity] ?? 'bg-slate-400'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.meta.label}</p>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[alert.status] ?? ''}`}>
                        {STATUS_LABEL[alert.status] ?? alert.status}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">{alert.type}</span>
                    </div>
                    {alert.meta.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{alert.meta.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{fmtDate(alert.createdAt)}</p>
                    {alert.resolvedAt && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Resuelta: {fmtDate(alert.resolvedAt)}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {alert.status === 'OPEN' && (
                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={() => void acknowledge(alert.id)}
                      className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-40"
                    >
                      {busyId === alert.id ? '…' : 'Marcar vista'}
                    </button>
                  )}
                  {alert.status !== 'RESOLVED' && (
                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={() => void resolve(alert.id)}
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-40"
                    >
                      {busyId === alert.id ? '…' : 'Resolver'}
                    </button>
                  )}
                </div>
              </div>
              {alert.payload != null && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Ver payload</summary>
                  <pre className="mt-1 text-xs bg-white/60 dark:bg-slate-900/60 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                    {JSON.stringify(alert.payload as Record<string, unknown>, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
