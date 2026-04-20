import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackingInfo = {
  id: number;
  trackingNumber: string | null;
  carrierCode: string | null;
  trackingUrl: string | null;
  status: string | null;
  submittedToShopifyAt: string | null;
};

type OrderEvent = {
  id: number;
  step: string;
  message: string;
  createdAt: string;
};

type Refund = {
  id: number;
  status: string;
  refundType: string | null;
  amountUsd: number | null;
  createdAt: string;
};

type OrderDetail = {
  id: string;
  shopifyOrderId: string;
  cjOrderId: string | null;
  status: string;
  totalUsd: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  tracking: TrackingInfo | null;
  events: OrderEvent[];
  refunds: Refund[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  DETECTED: 'Detectada', VALIDATED: 'Validada',
  CJ_ORDER_PLACING: 'Colocando en CJ', CJ_ORDER_PLACED: 'Colocada',
  CJ_ORDER_CREATED: 'Orden CJ creada', CJ_ORDER_CONFIRMING: 'Confirmando',
  CJ_ORDER_CONFIRMED: 'Confirmada', CJ_PAYMENT_PENDING: 'Pago pendiente',
  CJ_PAYMENT_PROCESSING: 'Procesando pago', CJ_PAYMENT_COMPLETED: 'Pago OK',
  CJ_FULFILLING: 'En fulfillment', CJ_SHIPPED: 'Enviada por CJ',
  TRACKING_ON_SHOPIFY: 'Tracking en Shopify', COMPLETED: 'Completada',
  FAILED: 'Fallida', NEEDS_MANUAL: 'Intervención manual',
  SUPPLIER_PAYMENT_BLOCKED: 'Pago bloqueado',
};

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
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

export default function CjShopifyUsaOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingTracking, setSyncingTracking] = useState(false);
  const [trackingMsg, setTrackingMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    void (async () => {
      try {
        const res = await api.get<{ ok: boolean; order: OrderDetail }>(`/api/cj-shopify-usa/orders/${orderId}`);
        if (res.data?.ok && res.data.order) {
          setOrder(res.data.order);
        } else {
          setError('Orden no encontrada.');
        }
      } catch (e) {
        setError(axiosMsg(e, 'No se pudo cargar la orden.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  async function syncTracking() {
    if (!orderId) return;
    setSyncingTracking(true);
    setTrackingMsg(null);
    try {
      const res = await api.post<{ ok: boolean; message?: string }>(`/api/cj-shopify-usa/orders/${orderId}/sync-tracking`, {});
      setTrackingMsg(res.data?.message ?? 'Tracking sincronizado.');
      const res2 = await api.get<{ ok: boolean; order: OrderDetail }>(`/api/cj-shopify-usa/orders/${orderId}`);
      if (res2.data?.ok) setOrder(res2.data.order);
    } catch (e) {
      setTrackingMsg(axiosMsg(e, 'Error al sincronizar tracking.'));
    } finally {
      setSyncingTracking(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando detalle de orden…</p>;
  if (error) return (
    <div className="space-y-3">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-primary-600 dark:text-primary-400 underline">← Volver</button>
      <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">{error}</div>
    </div>
  );
  if (!order) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => navigate(-1)} className="text-sm text-primary-600 dark:text-primary-400 underline">← Órdenes</button>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Orden: <span className="font-mono">{order.shopifyOrderId}</span>
        </h2>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-500 mb-1">Estado</p>
          <p className="font-semibold">{STATUS_LABEL[order.status] ?? order.status}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Total</p>
          <p className="font-semibold tabular-nums">{usd(order.totalUsd)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">CJ Order ID</p>
          <p className="font-mono text-xs">{order.cjOrderId ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Creada</p>
          <p className="text-xs">{fmtDate(order.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Actualizada</p>
          <p className="text-xs">{fmtDate(order.updatedAt)}</p>
        </div>
      </div>

      {/* Last error */}
      {order.lastError && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-100">
          <p className="font-semibold mb-1">Último error</p>
          <pre className="whitespace-pre-wrap text-xs">{order.lastError}</pre>
        </div>
      )}

      {/* Tracking */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tracking</h3>
          {order.status === 'CJ_SHIPPED' && (
            <button
              type="button"
              disabled={syncingTracking}
              onClick={() => void syncTracking()}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 disabled:opacity-40"
            >
              {syncingTracking ? 'Sincronizando…' : 'Sincronizar tracking → Shopify'}
            </button>
          )}
        </div>
        {trackingMsg && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{trackingMsg}</p>
        )}
        {order.tracking ? (
          <div className="text-sm space-y-1">
            <p><span className="text-slate-500">Número:</span> <span className="font-mono">{order.tracking.trackingNumber ?? '—'}</span></p>
            <p><span className="text-slate-500">Carrier:</span> {order.tracking.carrierCode ?? '—'}</p>
            <p><span className="text-slate-500">Estado:</span> {order.tracking.status ?? '—'}</p>
            {order.tracking.trackingUrl && (
              <p>
                <a href={order.tracking.trackingUrl} target="_blank" rel="noreferrer"
                  className="text-primary-600 dark:text-primary-400 underline text-xs">
                  Rastrear envío →
                </a>
              </p>
            )}
            {order.tracking.submittedToShopifyAt && (
              <p className="text-xs text-slate-400">Enviado a Shopify: {fmtDate(order.tracking.submittedToShopifyAt)}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin tracking aún.</p>
        )}
      </section>

      {/* Events timeline */}
      {order.events.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Timeline de eventos</h3>
          <ol className="space-y-2">
            {order.events.map((ev) => (
              <li key={ev.id} className="flex gap-3 text-xs">
                <span className="text-slate-400 shrink-0 w-32">{fmtDate(ev.createdAt)}</span>
                <span className="font-mono text-slate-600 dark:text-slate-400 shrink-0">{ev.step}</span>
                <span className="text-slate-700 dark:text-slate-300">{ev.message}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Refunds */}
      {order.refunds.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Reembolsos</h3>
          <div className="space-y-2">
            {order.refunds.map((r) => (
              <div key={r.id} className="text-xs flex gap-4">
                <span className="rounded px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-medium">{r.status}</span>
                <span>{r.refundType ?? '—'}</span>
                <span className="tabular-nums">{usd(r.amountUsd)}</span>
                <span className="text-slate-400">{fmtDate(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
