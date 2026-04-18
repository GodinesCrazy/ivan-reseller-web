import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderEvent = {
  id: string;
  step: string;
  message: string | null;
  meta: unknown;
  createdAt: string;
};

type TrackingInfo = {
  id: number;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string | null;
  updatedAt: string;
};

type OrderDetail = {
  id: string;
  mlOrderId: string;
  status: string;
  totalCLP: string | null;
  totalUsd: string | null;
  currency: string;
  cjOrderId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  rawMlSummary: Record<string, unknown> | null;
  listing: {
    id: number;
    mlListingId: string | null;
    mlSku: string | null;
    status: string;
    product: { title: string; cjProductId: string };
  } | null;
  events: OrderEvent[];
  tracking: TrackingInfo | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Detectada', VALIDATED: 'Validada',
  CJ_ORDER_PLACING: 'Creando orden CJ', CJ_ORDER_PLACED: 'Orden CJ creada',
  CJ_ORDER_CREATED: 'Orden CJ', CJ_ORDER_CONFIRMING: 'Confirmando',
  CJ_ORDER_CONFIRMED: 'Confirmada', CJ_PAYMENT_PENDING: 'Pago pendiente',
  CJ_PAYMENT_PROCESSING: 'Procesando pago', CJ_PAYMENT_COMPLETED: 'Pago OK',
  CJ_FULFILLING: 'En fulfillment', CJ_SHIPPED: 'Enviada',
  TRACKING_ON_ML: 'Tracking en ML', COMPLETED: 'Completada',
  FAILED: 'Fallida', NEEDS_MANUAL: 'Manual',
  SUPPLIER_PAYMENT_BLOCKED: 'Pago bloqueado',
};

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'bg-slate-100 text-slate-600',
  VALIDATED: 'bg-blue-100 text-blue-700',
  CJ_ORDER_CREATED: 'bg-blue-100 text-blue-700',
  CJ_ORDER_CONFIRMED: 'bg-indigo-100 text-indigo-700',
  CJ_PAYMENT_COMPLETED: 'bg-teal-100 text-teal-700',
  CJ_FULFILLING: 'bg-purple-100 text-purple-700',
  CJ_SHIPPED: 'bg-violet-100 text-violet-700',
  TRACKING_ON_ML: 'bg-cyan-100 text-cyan-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  NEEDS_MANUAL: 'bg-orange-100 text-orange-700',
  SUPPLIER_PAYMENT_BLOCKED: 'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200',
};

const STEP_LABELS: Record<string, string> = {
  DETECTED: 'Orden detectada / importada',
  VALIDATED: 'Datos ML obtenidos y validados',
  CJ_ORDER_PLACING: 'Enviando orden a CJ',
  CJ_ORDER_CREATED: 'Orden creada en CJ (pendiente confirm/pay)',
  CJ_ORDER_CONFIRMED: 'Orden confirmada en CJ',
  CJ_PAYMENT_COMPLETED: 'Pago a CJ completado',
  CJ_FULFILLING: 'CJ preparando envío',
  CJ_SHIPPED: 'CJ despacho confirmado, en tránsito',
  TRACKING_ON_ML: 'Tracking publicado en Mercado Libre',
  COMPLETED: 'Orden completada',
  FAILED: 'Error en procesamiento',
  NEEDS_MANUAL: 'Intervención manual requerida',
  SUPPLIER_PAYMENT_BLOCKED: 'Pago bloqueado (balance CJ insuficiente)',
};

function clpFormat(n: string | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n));
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`inline-flex rounded-lg px-3 py-1 text-sm font-semibold ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400 min-w-[140px]">{label}</span>
      <span className={`text-slate-800 dark:text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

function ActionButton({
  label, loading, loadingLabel, onClick, variant = 'primary', disabled,
}: {
  label: string; loading: boolean; loadingLabel: string;
  onClick: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  const base = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40';
  const cls = variant === 'primary'
    ? `${base} bg-emerald-600 hover:bg-emerald-700 text-white`
    : variant === 'danger'
      ? `${base} bg-red-600 hover:bg-red-700 text-white`
      : `${base} border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`;
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled} className={cls}>
      {loading ? loadingLabel : label}
    </button>
  );
}

// ── Order lifecycle states ────────────────────────────────────────────────────
const LIFECYCLE_STEPS = [
  'DETECTED', 'VALIDATED', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMED',
  'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_ML', 'COMPLETED',
];

function OrderTimeline({ currentStatus, events }: { currentStatus: string; events: OrderEvent[] }) {
  const currentIdx = LIFECYCLE_STEPS.indexOf(currentStatus);
  const isFailed = currentStatus === 'FAILED' || currentStatus === 'NEEDS_MANUAL' || currentStatus === 'SUPPLIER_PAYMENT_BLOCKED';

  return (
    <div className="space-y-4">
      {/* Visual pipeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {LIFECYCLE_STEPS.map((step, idx) => {
          const isPast = idx <= currentIdx && !isFailed;
          const isCurrent = step === currentStatus;
          return (
            <div key={step} className="flex items-center gap-1 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isCurrent ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                  : isPast ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
                {isPast && !isCurrent ? '✓' : idx + 1}
              </div>
              {idx < LIFECYCLE_STEPS.length - 1 && (
                <div className={`w-6 h-0.5 ${isPast ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Error/blocked banner */}
      {isFailed && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span className="font-medium">{STATUS_LABELS[currentStatus]}</span>
          <span className="ml-1">— {STEP_LABELS[currentStatus]}</span>
        </div>
      )}

      {/* Events log */}
      {events.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Historial de eventos ({events.length})
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
            {events.map((ev) => (
              <div key={ev.id} className="px-4 py-2 flex items-start gap-3 text-xs">
                <span className="text-slate-400 dark:text-slate-500 whitespace-nowrap mt-0.5">
                  {fmtDate(ev.createdAt)}
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {ev.step}
                </span>
                {ev.message && (
                  <span className="text-slate-500 dark:text-slate-400 line-clamp-2">
                    {ev.message}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjMlChileOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; order: OrderDetail }>(`/api/cj-ml-chile/orders/${orderId}`);
      setOrder(res.data.order);
    } catch (e) {
      setError(axiosMsg(e, 'Error cargando orden'));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const doAction = async (action: string, label: string) => {
    setActionBusy(action);
    setActionMsg(null);
    try {
      if (action === 'fetch-ml') {
        await api.post(`/api/cj-ml-chile/orders/${orderId}/fetch-ml`);
      } else {
        await api.post(`/api/cj-ml-chile/orders/${orderId}/${action}`);
      }
      setActionMsg({ text: `${label} completado`, ok: true });
      void load();
    } catch (e) {
      setActionMsg({ text: axiosMsg(e, `Error: ${label}`), ok: false });
    } finally {
      setActionBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400 text-sm">
        Cargando detalle de orden…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/cj-ml-chile/orders')}
          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
        >
          ← Volver a órdenes
        </button>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-5 text-red-700 dark:text-red-300 text-sm">
          {error ?? 'Orden no encontrada'}
          <button onClick={() => void load()} className="ml-3 underline text-xs">Reintentar</button>
        </div>
      </div>
    );
  }

  const mlSummary = order.rawMlSummary;
  const buyer = mlSummary?.buyer as Record<string, unknown> | undefined;
  const buyerName = buyer?.nickname as string | undefined;
  const shippingData = mlSummary?.shipping as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => navigate('/cj-ml-chile/orders')}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-2 flex items-center gap-1"
          >
            ← Volver a órdenes
          </button>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            Orden ML: {order.mlOrderId}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Interna: <span className="font-mono text-xs">{order.id}</span>
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm flex items-center justify-between ${
          actionMsg.ok
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
            : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
        }`}>
          {actionMsg.text}
          <button type="button" onClick={() => setActionMsg(null)} className="text-xs underline ml-3">Cerrar</button>
        </div>
      )}

      {/* Error banner */}
      {order.lastError && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span className="font-medium">Último error: </span>{order.lastError}
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Order info */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
            Datos de la orden
          </h2>
          <InfoRow label="ML Order ID" value={order.mlOrderId} mono />
          <InfoRow label="Total (CLP)" value={clpFormat(order.totalCLP)} />
          <InfoRow label="Total (USD)" value={order.totalUsd ? `$${Number(order.totalUsd).toFixed(2)}` : null} />
          <InfoRow label="Moneda" value={order.currency} />
          <InfoRow label="CJ Order ID" value={order.cjOrderId} mono />
          <InfoRow label="Creada" value={fmtDate(order.createdAt)} />
          <InfoRow label="Actualizada" value={fmtDate(order.updatedAt)} />
          {buyerName && <InfoRow label="Comprador ML" value={buyerName} />}
        </div>

        {/* Right: Listing + Tracking */}
        <div className="space-y-4">
          {/* Linked listing */}
          {order.listing && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
                Listing vinculado
              </h2>
              <p className="text-sm text-slate-800 dark:text-slate-200 line-clamp-2">
                {order.listing.product.title}
              </p>
              <InfoRow label="ML Listing ID" value={order.listing.mlListingId} mono />
              <InfoRow label="SKU" value={order.listing.mlSku} mono />
              <InfoRow label="Estado listing" value={order.listing.status} />
            </div>
          )}

          {/* Tracking */}
          {order.tracking && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
                Tracking
              </h2>
              <InfoRow label="Carrier" value={order.tracking.carrier} />
              <InfoRow label="Tracking #" value={order.tracking.trackingNumber} mono />
              <InfoRow label="Estado" value={order.tracking.status} />
              {order.tracking.trackingUrl && (
                <a
                  href={order.tracking.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-600 hover:underline"
                >
                  Ver tracking externo →
                </a>
              )}
            </div>
          )}

          {/* Shipping from ML */}
          {shippingData && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
                Envío (datos ML)
              </h2>
              <InfoRow label="Shipping ID" value={shippingData.id != null ? String(shippingData.id) : null} mono />
              <InfoRow label="Status" value={(shippingData.status as string) ?? null} />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
          Acciones disponibles
        </h2>
        <div className="flex flex-wrap gap-3">
          <ActionButton
            label="Fetch datos ML"
            loading={actionBusy === 'fetch-ml'}
            loadingLabel="Consultando ML…"
            onClick={() => doAction('fetch-ml', 'Fetch ML')}
          />
          {(order.status === 'VALIDATED' || order.status === 'FAILED' || order.status === 'NEEDS_MANUAL') && (
            <ActionButton
              label="Crear orden CJ"
              loading={actionBusy === 'place'}
              loadingLabel="Creando…"
              onClick={() => doAction('place', 'Crear orden CJ')}
            />
          )}
          {order.status === 'CJ_ORDER_CREATED' && (
            <ActionButton
              label="Confirmar orden CJ"
              loading={actionBusy === 'confirm'}
              loadingLabel="Confirmando…"
              onClick={() => doAction('confirm', 'Confirmar orden')}
              variant="secondary"
            />
          )}
          {(order.status === 'CJ_ORDER_CONFIRMED' || order.status === 'CJ_PAYMENT_PENDING') && (
            <ActionButton
              label="Pagar balance CJ"
              loading={actionBusy === 'pay'}
              loadingLabel="Pagando…"
              onClick={() => doAction('pay', 'Pagar balance')}
            />
          )}
          {(order.status === 'CJ_SHIPPED' || order.status === 'CJ_FULFILLING') && (
            <ActionButton
              label="Consultar tracking CJ"
              loading={actionBusy === 'status'}
              loadingLabel="Consultando…"
              onClick={() => doAction('status', 'Consultar status')}
              variant="secondary"
            />
          )}
          {order.status === 'CJ_SHIPPED' && (
            <ActionButton
              label="Sincronizar tracking → ML"
              loading={actionBusy === 'sync-tracking'}
              loadingLabel="Sincronizando…"
              onClick={() => doAction('sync-tracking', 'Sync tracking')}
            />
          )}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Las acciones Place, Confirm y Pay requieren datos ML validados y credenciales CJ activas.
          Tracking sync publica el número de seguimiento en Mercado Libre.
        </p>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
          Pipeline de la orden
        </h2>
        <OrderTimeline currentStatus={order.status} events={order.events} />
      </div>

      {/* Reclamos / Claims — equivalent to eBay refunds section */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
          Reclamos / Devoluciones
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Mercado Libre gestiona reclamos a través del portal de ML. El seguimiento aquí es informativo.
          Los reclamos activos se reflejan en la sección de Alertas y en el cálculo de Profit.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Sin reclamos registrados para esta orden.
        </p>
      </div>

      {/* Raw ML summary (advanced) */}
      <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4">
        <summary className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          Datos raw ML (avanzado)
        </summary>
        <pre className="mt-3 text-[11px] text-slate-600 dark:text-slate-400 max-h-64 overflow-auto rounded bg-slate-50 dark:bg-slate-950 p-3 whitespace-pre-wrap break-all">
          {JSON.stringify(order.rawMlSummary, null, 2)}
        </pre>
      </details>
    </div>
  );
}
