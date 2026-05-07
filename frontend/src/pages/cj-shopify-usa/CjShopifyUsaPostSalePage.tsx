import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import { api } from '@/services/api';

type Stage = {
  id: string;
  label: string;
  ok: number;
  pending: number;
  blocked: number;
  next: string;
};

type TrackingInfo = {
  trackingNumber?: string | null;
  carrierCode?: string | null;
  status?: string | null;
};

type RecentOrder = {
  id: string;
  shopifyOrderId: string;
  cjOrderId?: string | null;
  status: string;
  totalUsd?: number | string | null;
  updatedAt: string;
  lastError?: string | null;
  paymentBlockReason?: string | null;
  rawShopifySummary?: {
    name?: string | null;
    displayFinancialStatus?: string | null;
    displayFulfillmentStatus?: string | null;
  } | null;
  buyerPayload?: {
    countryCodeV2?: string | null;
    city?: string | null;
    provinceCode?: string | null;
  } | null;
  tracking?: TrackingInfo | null;
  listing?: {
    id: number;
    status: string;
    listedPriceUsd?: number | string | null;
    product?: { title?: string | null; cjProductId?: string | null } | null;
  } | null;
  events?: Array<{ id: string; step: string; message?: string | null; createdAt: string }>;
};

type RecentEvent = {
  id: string;
  step: string;
  message?: string | null;
  createdAt: string;
  order: {
    id: string;
    shopifyOrderId: string;
    status: string;
    rawShopifySummary?: { name?: string | null } | null;
  };
};

type OpenAlert = {
  id: number;
  type: string;
  severity: string;
  updatedAt: string;
  payload?: unknown;
};

type Dashboard = {
  ok: boolean;
  countsByStatus: Record<string, number>;
  stages: Stage[];
  totals: {
    orders: number;
    activeQueue: number;
    waitingPayment: number;
    needsAttention: number;
    completed: number;
    traceSignals72h: number;
  };
  health: {
    lastOrder?: { id: string; createdAt: string; status: string; rawShopifySummary?: { name?: string | null } | null } | null;
    lastTracking?: { orderId: string; trackingNumber?: string | null; updatedAt: string; status?: string | null } | null;
    openAlerts: number;
    queueCanRun: boolean;
  };
  recentOrders: RecentOrder[];
  recentEvents: RecentEvent[];
  openAlerts: OpenAlert[];
};

const stageIcons: Record<string, ComponentType<{ className?: string }>> = {
  payment: CreditCard,
  guardrails: ShieldCheck,
  supplier: PackageCheck,
  balance: Wallet,
  tracking: Truck,
  complete: CheckCircle2,
};

const statusLabel: Record<string, string> = {
  WAITING_PAYMENT: 'Esperando pago Shopify',
  DETECTED: 'Detectada',
  VALIDATED: 'Validada para CJ',
  CJ_ORDER_PLACING: 'Comprando en CJ',
  CJ_ORDER_PLACED: 'Orden CJ creada',
  CJ_ORDER_CREATED: 'Orden CJ creada',
  CJ_ORDER_CONFIRMING: 'Confirmando CJ',
  CJ_ORDER_CONFIRMED: 'CJ confirmado',
  CJ_PAYMENT_PENDING: 'Pago CJ pendiente',
  CJ_PAYMENT_PROCESSING: 'Pago CJ procesando',
  CJ_PAYMENT_COMPLETED: 'Pago CJ OK',
  CJ_FULFILLING: 'CJ preparando',
  CJ_SHIPPED: 'CJ enviado',
  TRACKING_ON_SHOPIFY: 'Tracking en Shopify',
  COMPLETED: 'Completada',
  FAILED: 'Fallida',
  NEEDS_MANUAL: 'Revisión manual',
  SUPPLIER_PAYMENT_BLOCKED: 'Esperando saldo CJ',
};

function axiosMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const data = e.response.data as { message?: string; error?: string };
    return data.message || data.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function money(value: number | string | null | undefined): string {
  if (value == null) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '-';
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-CL', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function orderName(order: RecentOrder | RecentEvent['order']): string {
  return order.rawShopifySummary?.name || order.shopifyOrderId;
}

function stageTone(stage: Stage): string {
  if (stage.blocked > 0) return 'border-rose-500/50 bg-rose-950/20 text-rose-100';
  if (stage.pending > 0) return 'border-amber-500/50 bg-amber-950/20 text-amber-100';
  return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-100';
}

export default function CjShopifyUsaPostSalePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<Dashboard>('/api/cj-shopify-usa/post-sale/dashboard');
      setData(res.data);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo cargar el panel post venta.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const primaryAction = useMemo(() => {
    if (!data) return 'sync';
    if (data.health.queueCanRun) return 'queue';
    if ((data.totals.activeQueue ?? 0) > 0) return 'tracking';
    return 'sync';
  }, [data]);

  async function runAction(action: 'sync' | 'queue' | 'tracking') {
    setRunning(action);
    setMessage(null);
    setError(null);
    try {
      if (action === 'sync') {
        const res = await api.post<{ count?: number }>('/api/cj-shopify-usa/orders/sync', { sinceHours: 72, first: 75 });
        setMessage(`Shopify sincronizado: ${res.data.count ?? 0} ordenes revisadas.`);
      }
      if (action === 'queue') {
        const res = await api.post<{ checked: number; processed: unknown[]; stoppedForBalance: boolean; tracking?: { synced: number; checked: number } }>('/api/cj-shopify-usa/post-sale/run-safe-queue');
        const suffix = res.data.stoppedForBalance ? ' Se detuvo porque CJ aun necesita saldo.' : '';
        setMessage(`Cola post venta: ${res.data.processed.length}/${res.data.checked} procesadas; tracking ${res.data.tracking?.synced ?? 0}/${res.data.tracking?.checked ?? 0}.${suffix}`);
      }
      if (action === 'tracking') {
        const res = await api.post<{ synced: number; checked: number }>('/api/cj-shopify-usa/orders/auto-sync-tracking');
        setMessage(`Tracking sincronizado: ${res.data.synced}/${res.data.checked} ordenes actualizadas.`);
      }
      await load(true);
    } catch (e) {
      setError(axiosMsg(e, 'La accion post venta no pudo completarse.'));
    } finally {
      setRunning(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Cargando control post venta...</p>;
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100">
      <section className="rounded-lg border border-cyan-500/40 bg-slate-950/40 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{'Post Venta CJ -> Shopify USA'}</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Controla el ciclo desde el pago Shopify hasta la compra en CJ, espera de saldo, tracking y cierre de la orden.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAction(primaryAction)}
              disabled={!!running}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
            >
              <PackageCheck className={`h-4 w-4 ${running === primaryAction ? 'animate-pulse' : ''}`} />
              Ejecutar accion prioritaria
            </button>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {(message || error) && (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-rose-500/50 bg-rose-950/30 text-rose-100' : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100'}`}>
            {error || message}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase text-cyan-300">Ordenes</p>
            <p className="mt-2 text-3xl font-bold">{data?.totals.orders ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase text-amber-300">Esperando pago</p>
            <p className="mt-2 text-3xl font-bold">{data?.totals.waitingPayment ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-300">Cola activa</p>
            <p className="mt-2 text-3xl font-bold">{data?.totals.activeQueue ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase text-rose-300">Atencion</p>
            <p className="mt-2 text-3xl font-bold">{data?.totals.needsAttention ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase text-sky-300">Completadas</p>
            <p className="mt-2 text-3xl font-bold">{data?.totals.completed ?? 0}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-950/30 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Linea de control del ciclo</h3>
            <p className="text-sm text-slate-400">Cada etapa muestra OK, pendientes y bloqueos reales desde la base de datos.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/cj-shopify-usa/orders')}
            className="hidden items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 sm:inline-flex"
          >
            Ver ordenes <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          {(data?.stages ?? []).map((stage) => {
            const Icon = stageIcons[stage.id] || Clock3;
            return (
              <div key={stage.id} className={`rounded-lg border p-4 ${stageTone(stage)}`}>
                <div className="flex items-center justify-between gap-2">
                  <Icon className="h-5 w-5" />
                  {stage.blocked > 0 ? <AlertTriangle className="h-4 w-4 text-rose-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                </div>
                <p className="mt-3 text-sm font-semibold">{stage.label}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-300">
                  <p>OK: <span className="font-semibold text-emerald-200">{stage.ok}</span></p>
                  <p>Pendiente: <span className="font-semibold text-amber-200">{stage.pending}</span></p>
                  <p>Bloqueado: <span className="font-semibold text-rose-200">{stage.blocked}</span></p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-400">{stage.next}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Ordenes recientes</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void runAction('sync')}
                disabled={!!running}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                Sincronizar Shopify
              </button>
              <button
                type="button"
                onClick={() => void runAction('tracking')}
                disabled={!!running}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                Sync tracking
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Orden</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Pago</th>
                  <th className="px-3 py-2 text-left">CJ</th>
                  <th className="px-3 py-2 text-left">Tracking</th>
                  <th className="px-3 py-2 text-left">Actualizada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/20">
                {(data?.recentOrders ?? []).map((order) => (
                  <tr key={order.id} className="hover:bg-slate-900/70">
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => navigate(`/cj-shopify-usa/orders/${order.id}`)} className="font-semibold text-cyan-200 hover:underline">
                        {orderName(order)}
                      </button>
                      <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{order.listing?.product?.title || order.shopifyOrderId}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">{statusLabel[order.status] || order.status}</span>
                      {order.lastError && <p className="mt-1 max-w-xs truncate text-xs text-rose-300">{order.lastError}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <p>{String(order.rawShopifySummary?.displayFinancialStatus || 'UNKNOWN').toUpperCase()}</p>
                      <p className="text-xs text-slate-500">{money(order.totalUsd)}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{order.cjOrderId || '-'}</td>
                    <td className="px-3 py-3 text-slate-300">{order.tracking?.trackingNumber || order.tracking?.status || '-'}</td>
                    <td className="px-3 py-3 text-slate-400">{fmtDate(order.updatedAt)}</td>
                  </tr>
                ))}
                {(data?.recentOrders.length ?? 0) === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={6}>Aun no hay ordenes post venta registradas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-4">
            <h3 className="text-lg font-semibold">Estado operativo</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg bg-slate-900/70 p-3">
                <p className="text-xs uppercase text-slate-500">Ultima orden</p>
                <p className="mt-1 font-semibold">{data?.health.lastOrder ? `${data.health.lastOrder.rawShopifySummary?.name || data.health.lastOrder.id} · ${statusLabel[data.health.lastOrder.status] || data.health.lastOrder.status}` : '-'}</p>
                <p className="text-xs text-slate-500">{fmtDate(data?.health.lastOrder?.createdAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-900/70 p-3">
                <p className="text-xs uppercase text-slate-500">Ultimo tracking</p>
                <p className="mt-1 font-semibold">{data?.health.lastTracking?.trackingNumber || '-'}</p>
                <p className="text-xs text-slate-500">{fmtDate(data?.health.lastTracking?.updatedAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-900/70 p-3">
                <p className="text-xs uppercase text-slate-500">Senales 72h</p>
                <p className="mt-1 font-semibold">{data?.totals.traceSignals72h ?? 0} eventos tecnicos post venta</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/40 bg-amber-950/10 p-4">
            <h3 className="text-lg font-semibold">Alertas abiertas</h3>
            <div className="mt-3 space-y-2">
              {(data?.openAlerts ?? []).map((alert) => (
                <div key={alert.id} className="rounded-lg bg-slate-950/50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-amber-200">{alert.type}</span>
                    <span className="text-xs uppercase text-slate-500">{alert.severity}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{fmtDate(alert.updatedAt)}</p>
                </div>
              ))}
              {(data?.openAlerts.length ?? 0) === 0 && (
                <p className="rounded-lg bg-emerald-950/30 p-3 text-sm text-emerald-200">Sin alertas post venta abiertas.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-950/30 p-4">
        <h3 className="text-lg font-semibold">Bitacora reciente</h3>
        <div className="mt-3 space-y-2">
          {(data?.recentEvents ?? []).map((event) => (
            <button
              type="button"
              key={event.id}
              onClick={() => navigate(`/cj-shopify-usa/orders/${event.order.id}`)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-sm hover:border-cyan-500/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-100">{orderName(event.order)} · {statusLabel[event.order.status] || event.order.status}</span>
                <span className="text-xs text-slate-500">{fmtDate(event.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{event.message || event.step}</p>
            </button>
          ))}
          {(data?.recentEvents.length ?? 0) === 0 && (
            <p className="rounded-lg bg-slate-900/60 p-3 text-sm text-slate-500">Sin eventos de orden aun.</p>
          )}
        </div>
      </section>
    </div>
  );
}
