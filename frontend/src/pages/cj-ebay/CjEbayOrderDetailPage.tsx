import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '@/services/api';

// ── Types ────────────────────────────────────────────────────────────────────

type OrderEvent = {
  id: string;
  step: string;
  message: string | null;
  meta: unknown;
  createdAt: string;
};

type OrderDetail = {
  id: string;
  ebayOrderId: string;
  status: string;
  cjOrderId: string | null;
  ebaySku: string | null;
  lineQuantity: number;
  totalUsd: number | null;
  listingId: number | null;
  lastError: string | null;
  cjConfirmedAt: string | null;
  cjPaidAt: string | null;
  updatedAt: string;
  buyerPayload: unknown;
  rawEbaySummary: unknown;
  events: OrderEvent[];
  tracking: {
    status: string;
    trackingNumber: string | null;
    carrierCode: string | null;
  } | null;
  listing: {
    id: number;
    ebaySku: string | null;
    status: string;
    ebayListingId: string | null;
  } | null;
};

type FlowGate = { name: string; met: boolean; note?: string };

type OperationalFlow = {
  gates?: FlowGate[];
  suggestedNext?: string | null;
  lastTraces?: Array<{ step: string; message: string | null; createdAt: string }>;
  [key: string]: unknown;
};

type EvidenceSummary = Record<string, unknown>;

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DETECTED:                'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  VALIDATED:               'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  CJ_ORDER_CREATED:        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  CJ_ORDER_CONFIRMING:     'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  CJ_PAYMENT_PENDING:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  CJ_PAYMENT_PROCESSING:   'bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  CJ_PAYMENT_COMPLETED:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CJ_FULFILLING:           'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  CJ_SHIPPED:              'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  TRACKING_ON_EBAY:        'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  COMPLETED:               'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  FAILED:                  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  NEEDS_MANUAL:            'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_COLORS[status] ??
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

type ActionButtonProps = {
  label: string;
  description: string;
  color: 'emerald' | 'indigo' | 'violet' | 'slate';
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
};

function ActionButton({ label, description, color, disabled, busy, onClick }: ActionButtonProps) {
  const colorMap = {
    emerald:
      'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
    indigo:
      'text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30',
    violet:
      'text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-950/30',
    slate:
      'text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50',
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colorMap[color]}`}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block text-[11px] opacity-70 mt-0.5">{description}</span>
      </span>
      {busy && (
        <span className="mt-0.5 h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
      )}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function axiosMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjEbayOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [flow, setFlow] = useState<OperationalFlow | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    setError(null);
    try {
      const [orderRes, flowRes, evidenceRes] = await Promise.allSettled([
        api.get<{ ok: boolean; order: OrderDetail }>(`/api/cj-ebay/orders/${orderId}`),
        api.get<{ ok: boolean; snapshot: OperationalFlow }>(
          `/api/cj-ebay/orders/${orderId}/operational-flow`
        ),
        api.get<{ ok: boolean; summary: EvidenceSummary }>(
          `/api/cj-ebay/orders/${orderId}/evidence-summary`
        ),
      ]);

      if (orderRes.status === 'fulfilled' && orderRes.value.data?.ok) {
        setOrder(orderRes.value.data.order);
      } else if (orderRes.status === 'rejected') {
        setError(axiosMsg(orderRes.reason, 'No se pudo cargar la orden.'));
      }
      if (flowRes.status === 'fulfilled' && flowRes.value.data?.ok) {
        setFlow(flowRes.value.data.snapshot);
      }
      if (evidenceRes.status === 'fulfilled' && evidenceRes.value.data?.ok) {
        setEvidence(evidenceRes.value.data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  async function runAction(action: string, fn: () => Promise<unknown>) {
    setBusyAction(action);
    setActionMsg(null);
    setError(null);
    try {
      const res = await fn() as { data?: { needsManual?: boolean; skipped?: boolean; stub?: boolean; message?: string; checkoutNote?: string } };
      const d = (res as { data?: Record<string, unknown> })?.data ?? {};
      if (d.needsManual) {
        setActionMsg(
          String(d.checkoutNote || 'Place completado (needsManual). Revisa eventos y lastError.')
        );
      } else if (d.skipped) {
        setActionMsg(`Acción omitida — ya procesada anteriormente.`);
      } else if (d.stub) {
        setActionMsg(String(d.message || `${action}: stub / no disponible aún.`));
      } else {
        setActionMsg(`${action} ejecutado correctamente.`);
      }
      await loadOrder();
    } catch (e) {
      setError(axiosMsg(e, `Error en acción ${action}.`));
    } finally {
      setBusyAction(null);
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-primary-600 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/cj-ebay/orders')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Órdenes CJ
        </button>
        <p className="text-sm text-red-700 dark:text-red-300">{error || 'Orden no encontrada.'}</p>
      </div>
    );
  }

  const canPlace =
    order.status === 'VALIDATED' ||
    (order.listingId != null &&
      (order.status === 'NEEDS_MANUAL' || order.status === 'FAILED'));
  const canConfirm = !!order.cjOrderId && order.status === 'CJ_ORDER_CREATED';
  const canPay     = !!order.cjOrderId && order.status === 'CJ_PAYMENT_PENDING';
  const canSync    = !!order.cjOrderId && order.status !== 'COMPLETED';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => navigate('/cj-ebay/orders')}
          className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Órdenes
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono truncate">
              {order.ebayOrderId}
            </h2>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ID interno: <span className="font-mono">{order.id}</span>
            {' · '}actualizado {new Date(order.updatedAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOrder()}
          className="mt-1 p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Refrescar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Feedback banners ─────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}
      {actionMsg && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          {actionMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Datos base + mapping ─────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Datos de la orden
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">eBay order ID</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200 break-all">{order.ebayOrderId}</dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">CJ order ID</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">{order.cjOrderId || '—'}</dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">eBay SKU</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">{order.ebaySku || '—'}</dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Cantidad</dt>
            <dd className="text-slate-800 dark:text-slate-200">{order.lineQuantity}</dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Total USD</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {order.totalUsd != null ? `$${order.totalUsd.toFixed(2)}` : '—'}
            </dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Listing ID (local)</dt>
            <dd className="text-slate-800 dark:text-slate-200">{order.listingId ?? '—'}</dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">eBay listing ID</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">
              {order.listing?.ebayListingId || '—'}
            </dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">CJ confirmado</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {order.cjConfirmedAt ? new Date(order.cjConfirmedAt).toLocaleString() : '—'}
            </dd>

            <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap">CJ pagado</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {order.cjPaidAt ? new Date(order.cjPaidAt).toLocaleString() : '—'}
            </dd>
          </dl>

          {order.lastError && (
            <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-2">
              <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-200 mb-1">
                Último error
              </p>
              <pre className="text-[11px] text-rose-700 dark:text-rose-300 whitespace-pre-wrap break-all">
                {order.lastError}
              </pre>
            </div>
          )}
        </div>

        {/* ── Acciones del ciclo postventa ──────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Acciones del ciclo postventa
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Solo las acciones disponibles para el estado actual están activas.
          </p>
          <div className="space-y-2">
            <ActionButton
              label="Place CJ"
              description="Crea la orden en CJ (createOrderV2 payType=3)"
              color="emerald"
              disabled={!canPlace || busyAction !== null}
              busy={busyAction === 'place'}
              onClick={() =>
                void runAction('place', () =>
                  api.post(`/api/cj-ebay/orders/${order.id}/place`)
                )
              }
            />
            <ActionButton
              label="Confirmar CJ"
              description="Confirma la orden creada en CJ (confirmOrder)"
              color="indigo"
              disabled={!canConfirm || busyAction !== null}
              busy={busyAction === 'confirm'}
              onClick={() =>
                void runAction('confirm', () =>
                  api.post(`/api/cj-ebay/orders/${order.id}/confirm`)
                )
              }
            />
            <ActionButton
              label="Pagar balance CJ"
              description="Paga con balance de cuenta CJ (payBalance)"
              color="violet"
              disabled={!canPay || busyAction !== null}
              busy={busyAction === 'pay'}
              onClick={() =>
                void runAction('pay', () =>
                  api.post(`/api/cj-ebay/orders/${order.id}/pay`)
                )
              }
            />
            <ActionButton
              label="Actualizar estado CJ"
              description="Consulta el estado actualizado desde la API de CJ"
              color="slate"
              disabled={!canSync || busyAction !== null}
              busy={busyAction === 'status'}
              onClick={() =>
                void runAction('status', () =>
                  api.get(`/api/cj-ebay/orders/${order.id}/status`)
                )
              }
            />
            <ActionButton
              label="Sincronizar tracking"
              description="Obtiene tracking desde CJ y lo actualiza localmente"
              color="slate"
              disabled={!canSync || busyAction !== null}
              busy={busyAction === 'tracking'}
              onClick={() =>
                void runAction('tracking', () =>
                  api.post(`/api/cj-ebay/orders/${order.id}/sync-tracking`)
                )
              }
            />
          </div>
        </div>
      </div>

      {/* ── Tracking ─────────────────────────────────────────────────────── */}
      {order.tracking && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Tracking
          </h3>
          <dl className="flex flex-wrap gap-x-8 gap-y-1.5 text-xs">
            <div>
              <dt className="inline text-slate-500 dark:text-slate-400">Estado: </dt>
              <dd className="inline font-medium text-slate-800 dark:text-slate-200">
                {order.tracking.status}
              </dd>
            </div>
            {order.tracking.trackingNumber && (
              <div>
                <dt className="inline text-slate-500 dark:text-slate-400">Número: </dt>
                <dd className="inline font-mono text-slate-800 dark:text-slate-200">
                  {order.tracking.trackingNumber}
                </dd>
              </div>
            )}
            {order.tracking.carrierCode && (
              <div>
                <dt className="inline text-slate-500 dark:text-slate-400">Carrier: </dt>
                <dd className="inline text-slate-800 dark:text-slate-200">
                  {order.tracking.carrierCode}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* ── Timeline de eventos ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Timeline de eventos
        </h3>
        {order.events.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Sin eventos registrados.</p>
        ) : (
          <ul className="space-y-2 border-l-2 border-slate-200 dark:border-slate-700 pl-4">
            {order.events.map((ev) => (
              <li key={ev.id} className="text-xs">
                <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>{' '}
                <strong className="text-slate-800 dark:text-slate-200">{ev.step}</strong>
                {ev.message ? (
                  <span className="text-slate-600 dark:text-slate-400"> — {ev.message}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Flujo operacional ─────────────────────────────────────────────── */}
      {flow && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Flujo operacional
          </h3>

          {flow.suggestedNext && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-900 dark:text-blue-100">
              Siguiente paso sugerido:{' '}
              <strong className="font-semibold">{flow.suggestedNext}</strong>
            </div>
          )}

          {flow.gates && flow.gates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Gates del flujo
              </p>
              {flow.gates.map((gate, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span
                    className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      gate.met
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {gate.met ? '✓' : '○'}
                  </span>
                  <span
                    className={
                      gate.met
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {gate.name}
                    {gate.note ? (
                      <span className="text-slate-400 dark:text-slate-500 ml-1">({gate.note})</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}

          {flow.lastTraces && flow.lastTraces.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 select-none">
                Últimas trazas ({flow.lastTraces.length})
              </summary>
              <ul className="mt-2 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                {flow.lastTraces.map((t, i) => (
                  <li key={i} className="text-[11px]">
                    <span className="font-mono text-slate-400 dark:text-slate-500">
                      {new Date(t.createdAt).toLocaleString()}
                    </span>{' '}
                    <strong className="text-slate-700 dark:text-slate-300">{t.step}</strong>
                    {t.message ? (
                      <span className="text-slate-500 dark:text-slate-400"> — {t.message}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ── Evidencia resumida (audit trail) ─────────────────────────────── */}
      {evidence && (
        <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4">
          <summary className="text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer select-none">
            Evidencia resumida (audit trail)
          </summary>
          <pre className="mt-3 text-[11px] text-slate-600 dark:text-slate-400 max-h-72 overflow-auto rounded bg-slate-50 dark:bg-slate-950 p-3 whitespace-pre-wrap break-all">
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </details>
      )}

      {/* ── Raw eBay summary ─────────────────────────────────────────────── */}
      <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4">
        <summary className="text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer select-none">
          Raw eBay summary
        </summary>
        <pre className="mt-3 text-[11px] text-slate-600 dark:text-slate-400 max-h-64 overflow-auto rounded bg-slate-50 dark:bg-slate-950 p-3 whitespace-pre-wrap break-all">
          {JSON.stringify(order.rawEbaySummary, null, 2)}
        </pre>
      </details>
    </div>
  );
}
