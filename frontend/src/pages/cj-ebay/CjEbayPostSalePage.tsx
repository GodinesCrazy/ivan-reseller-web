import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, Play, RefreshCw, Truck } from 'lucide-react';

type Dashboard = {
  kpis: {
    totalOrders: number;
    activeOrders: number;
    attentionOrders: number;
    completedOrders: number;
    trackingMissing: number;
    openAlerts: number;
    activeRefunds: number;
  };
  safeQueue: Array<{ orderId: string; ebayOrderId: string; status: string; nextAction: string; title: string; totalUsd: number | null }>;
  recentOrders: Array<{ orderId: string; ebayOrderId: string; status: string; title: string; totalUsd: number | null; trackingNumber: string | null; updatedAt: string }>;
  alerts: Array<{ id: number; type: string; severity: string; createdAt: string }>;
  refunds: Array<{ id: string; orderId: string; status: string; amountUsd: number | null; reason: string | null; updatedAt: string }>;
};

function apiError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const data = e.response.data as { message?: string; error?: string };
    return data.message || data.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CjEbayPostSalePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean } & Dashboard>('/api/cj-ebay/post-sale/dashboard');
      setData(res.data);
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar post venta CJ-eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSafeQueue() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<{ checked: number; stoppedForBalance: boolean; note?: string }>('/api/cj-ebay/post-sale/run-safe-queue');
      setMessage(`${res.data.note ?? 'Cola revisada.'} Revisadas: ${res.data.checked}${res.data.stoppedForBalance ? ' · saldo CJ requiere atención' : ''}.`);
      await load();
    } catch (e) {
      setError(apiError(e, 'No se pudo ejecutar la cola segura.'));
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando post venta eBay...</div>;
  }

  if (error && !data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{error}</div>;
  }

  const kpis = data?.kpis;

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-200"><PackageCheck className="h-6 w-6" /></div>
              <div>
                <h1 className="text-xl font-semibold text-white">Post Venta CJ → eBay USA</h1>
                <p className="text-sm text-slate-400">Cola segura, tracking, refunds y alertas posteriores a la venta.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                <RefreshCw className="h-4 w-4" /> Refrescar
              </button>
              <button type="button" onClick={() => void runSafeQueue()} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Ejecutar cola segura
              </button>
            </div>
          </div>
          {kpis && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              {[
                ['Total', kpis.totalOrders],
                ['Activas', kpis.activeOrders],
                ['Atención', kpis.attentionOrders],
                ['Completadas', kpis.completedOrders],
                ['Sin tracking', kpis.trackingMissing],
                ['Alertas', kpis.openAlerts],
                ['Refunds', kpis.activeRefunds],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {message && <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-100">Cola segura</h2>
            <span className="text-xs text-slate-500">{data?.safeQueue.length ?? 0} acciones</span>
          </div>
          <div className="divide-y divide-slate-900">
            {data?.safeQueue.map((item) => (
              <button key={item.orderId} type="button" onClick={() => navigate(`/cj-ebay/orders/${item.orderId}`)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-900/70">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.ebayOrderId} · {item.status}</p>
                </div>
                <div className="text-right">
                  <span className="rounded bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-200">{item.nextAction}</span>
                  <p className="mt-1 text-xs text-slate-500">{usd(item.totalUsd)}</p>
                </div>
              </button>
            ))}
            {data?.safeQueue.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">Sin acciones pendientes en cola segura.</div>}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><AlertTriangle className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-semibold text-slate-100">Alertas abiertas</h2></div>
            <div className="divide-y divide-slate-900">
              {data?.alerts.slice(0, 6).map((alert) => <div key={alert.id} className="px-4 py-3 text-sm text-slate-300">{alert.type}<p className="text-xs text-slate-500">{alert.severity} · {fmtDate(alert.createdAt)}</p></div>)}
              {data?.alerts.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">Sin alertas abiertas.</div>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><Truck className="h-4 w-4 text-sky-300" /><h2 className="text-sm font-semibold text-slate-100">Órdenes recientes</h2></div>
            <div className="divide-y divide-slate-900">
              {data?.recentOrders.slice(0, 8).map((order) => (
                <button key={order.orderId} type="button" onClick={() => navigate(`/cj-ebay/orders/${order.orderId}`)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-900/70">
                  <div><p className="text-sm text-slate-200">{order.ebayOrderId}</p><p className="text-xs text-slate-500">{order.status}</p></div>
                  {order.trackingNumber ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <span className="text-xs text-slate-500">{fmtDate(order.updatedAt)}</span>}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
