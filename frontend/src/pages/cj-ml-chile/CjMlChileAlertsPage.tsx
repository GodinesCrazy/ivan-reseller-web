import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Alert = {
  id: number;
  type: string;
  severity: string;
  status: string;
  payload: unknown;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  meta: { label: string; description: string };
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

export default function CjMlChileAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'>('OPEN');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await api.get<{ ok: boolean; alerts: Alert[] }>(`/api/cj-ml-chile/alerts${qs}`);
      setAlerts(res.data.alerts ?? []);
    } catch (e) {
      setError(axiosMsg(e, 'Error cargando alertas'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const acknowledge = async (id: number) => {
    setBusyId(id);
    setActionMsg(null);
    try {
      await api.post(`/api/cj-ml-chile/alerts/${id}/acknowledge`);
      setActionMsg('Alerta marcada como vista.');
      void load();
    } catch (e) {
      setActionMsg(axiosMsg(e, 'Error al reconocer alerta'));
    } finally {
      setBusyId(null);
    }
  };

  const resolve = async (id: number) => {
    setBusyId(id);
    setActionMsg(null);
    try {
      await api.post(`/api/cj-ml-chile/alerts/${id}/resolve`);
      setActionMsg('Alerta resuelta.');
      void load();
    } catch (e) {
      setActionMsg(axiosMsg(e, 'Error al resolver alerta'));
    } finally {
      setBusyId(null);
    }
  };

  const open  = alerts.filter((a) => a.status === 'OPEN').length;
  const acked = alerts.filter((a) => a.status === 'ACKNOWLEDGED').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Alertas del módulo</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {open > 0
              ? `${open} alerta${open !== 1 ? 's' : ''} abierta${open !== 1 ? 's' : ''} · ${acked} vista${acked !== 1 ? 's' : ''}`
              : 'Sin alertas abiertas'}
          </p>
        </div>
        {/* Filtros */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900">
          {(['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const).map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {s === 'ALL' ? 'Todas' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      {actionMsg && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          {actionMsg}
          <button type="button" onClick={() => setActionMsg(null)} className="text-xs underline ml-3">Cerrar</button>
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Cargando alertas…</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
          <button type="button" onClick={() => void load()} className="ml-2 underline text-xs">Reintentar</button>
        </div>
      )}

      {/* Lista vacía */}
      {!loading && !error && alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/30 px-5 py-10 text-center">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {statusFilter === 'OPEN' ? 'Sin alertas abiertas — operación normal.' : 'Sin alertas en este filtro.'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Las alertas se generan automáticamente cuando ocurren eventos como pago bloqueado, reclamo abierto, tracking ausente o margen negativo.
          </p>
        </div>
      )}

      {/* Cards de alertas */}
      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const sev = alert.severity as string;
            const payload = alert.payload as Record<string, unknown> | null;
            return (
              <div
                key={alert.id}
                className={`rounded-xl border px-4 py-3.5 flex items-start gap-3 ${
                  SEVERITY_COLORS[sev] ?? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* Dot */}
                <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[sev] ?? 'bg-slate-400'}`} />

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {alert.meta.label}
                    </span>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[alert.status] ?? ''}`}>
                      {STATUS_LABEL[alert.status] ?? alert.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {alert.meta.description}
                  </p>

                  {/* Payload relevante */}
                  {payload && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {Boolean(payload['mlOrderId']) && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          ML order: <span className="font-mono">{String(payload['mlOrderId'])}</span>
                        </span>
                      )}
                      {Boolean(payload['orderId']) && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          ID interno: <span className="font-mono text-[10px]">{String(payload['orderId']).slice(0, 12)}…</span>
                        </span>
                      )}
                      {Boolean(payload['message']) && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{String(payload['message'])}</span>
                      )}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Creada: {fmtDate(alert.createdAt)}
                    {alert.acknowledgedAt && ` · Vista: ${fmtDate(alert.acknowledgedAt)}`}
                    {alert.resolvedAt && ` · Resuelta: ${fmtDate(alert.resolvedAt)}`}
                  </div>
                </div>

                {/* Actions */}
                {alert.status !== 'RESOLVED' && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {alert.status === 'OPEN' && (
                      <button
                        type="button"
                        disabled={busyId === alert.id}
                        onClick={() => void acknowledge(alert.id)}
                        className="text-xs px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                      >
                        {busyId === alert.id ? '…' : 'Marcar vista'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={() => void resolve(alert.id)}
                      className="text-xs px-2.5 py-1 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-40"
                    >
                      {busyId === alert.id ? '…' : 'Resolver'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
