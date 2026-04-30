import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackingInfo = {
  id: number;
  trackingNumber: string | null;
  carrierCode: string | null;
  status: string | null;
};

type BuyerPayload = {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  countryCodeV2?: string | null;
  phone?: string | null;
};

type OrderRow = {
  id: string;
  shopifyOrderId: string;
  status: string;
  cjOrderId: string | null;
  totalUsd: number | null;
  lastError: string | null;
  updatedAt: string;
  tracking: TrackingInfo | null;
  buyerPayload?: BuyerPayload | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  DETECTED:                'Detectada',
  VALIDATED:               'Validada',
  CJ_ORDER_PLACING:        'Colocando en CJ',
  CJ_ORDER_PLACED:         'Colocada en CJ',
  CJ_ORDER_CREATED:        'Orden CJ creada',
  CJ_ORDER_CONFIRMING:     'Confirmando',
  CJ_ORDER_CONFIRMED:      'Confirmada',
  CJ_PAYMENT_PENDING:      'Pago pendiente',
  CJ_PAYMENT_PROCESSING:   'Procesando pago',
  CJ_PAYMENT_COMPLETED:    'Pago OK',
  CJ_FULFILLING:           'En fulfillment',
  CJ_SHIPPED:              'Enviada por CJ',
  TRACKING_ON_SHOPIFY:     'Tracking en Shopify',
  COMPLETED:               'Completada',
  FAILED:                  'Fallida',
  NEEDS_MANUAL:            'Intervención manual',
  SUPPLIER_PAYMENT_BLOCKED:'Pago bloqueado',
};

const STATUS_COLORS: Record<string, string> = {
  DETECTED:                'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  VALIDATED:               'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  CJ_ORDER_PLACING:        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  CJ_ORDER_PLACED:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  CJ_ORDER_CREATED:        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  CJ_ORDER_CONFIRMING:     'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  CJ_ORDER_CONFIRMED:      'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  CJ_PAYMENT_PENDING:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  CJ_PAYMENT_PROCESSING:   'bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  CJ_PAYMENT_COMPLETED:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CJ_FULFILLING:           'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  CJ_SHIPPED:              'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  TRACKING_ON_SHOPIFY:     'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  COMPLETED:               'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  FAILED:                  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  NEEDS_MANUAL:            'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  SUPPLIER_PAYMENT_BLOCKED:'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200',
};

const NEXT_STEP: Record<string, string> = {
  DETECTED:                'Pendiente de validación',
  VALIDATED:               'Ordenar en CJ',
  CJ_ORDER_PLACING:        'Esperando respuesta CJ',
  CJ_ORDER_PLACED:         'Confirmar con CJ',
  CJ_ORDER_CREATED:        'Confirmar con CJ',
  CJ_ORDER_CONFIRMING:     'Esperando confirmación',
  CJ_ORDER_CONFIRMED:      'Procesar pago',
  CJ_PAYMENT_PENDING:      'Pagar balance CJ',
  CJ_PAYMENT_PROCESSING:   'Esperando confirmación pago',
  CJ_PAYMENT_COMPLETED:    'Esperando fulfillment',
  CJ_FULFILLING:           'CJ preparando envío',
  CJ_SHIPPED:              'Sincronizar tracking',
  TRACKING_ON_SHOPIFY:     'Tracking subido a Shopify',
  COMPLETED:               '—',
  FAILED:                  'Revisar error',
  NEEDS_MANUAL:            'Intervención requerida',
  SUPPLIER_PAYMENT_BLOCKED:'Recargar balance CJ y reintentar',
};

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function shippingCountry(order: OrderRow): string {
  const code = order.buyerPayload?.countryCodeV2?.trim();
  return code ? code.toUpperCase() : 'Falta país';
}

function shippingCity(order: OrderRow): string {
  const buyer = order.buyerPayload;
  return [buyer?.city, buyer?.provinceCode].filter(Boolean).join(', ') || '—';
}

function trackingLabel(order: OrderRow): string {
  if (order.tracking?.trackingNumber) return order.tracking.trackingNumber;
  if (order.tracking?.status === 'NOT_AVAILABLE') return 'CJ aún sin tracking';
  if (['CJ_ORDER_PLACED', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMED', 'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING'].includes(order.status)) {
    return 'Pendiente proveedor';
  }
  return '—';
}

function axiosMsg(e: unknown, fb: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

const ALL_STATUSES = Object.keys(STATUS_LABEL);

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjShopifyUsaOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; orders: OrderRow[] }>('/api/cj-shopify-usa/orders');
      if (res.data?.ok && Array.isArray(res.data.orders)) {
        setOrders(res.data.orders);
      }
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar las órdenes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function syncRecent() {
    setSyncing(true);
    setError(null);
    try {
      await api.post('/api/cj-shopify-usa/orders/sync', { sinceHours: 24, first: 50 });
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error al sincronizar órdenes.'));
    } finally {
      setSyncing(false);
    }
  }

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);

  async function triggerOrderAction(orderId: string, action: string, label: string) {
    setActionBusy(orderId + action);
    setActionMsg(null);
    try {
      await api.post(`/api/cj-shopify-usa/orders/${orderId}/${action}`);
      setActionMsg(`${label} completado para orden ${orderId}`);
      await load();
    } catch (e) {
      setError(axiosMsg(e, `Error al ${label.toLowerCase()}.`));
    } finally {
      setActionBusy(null);
    }
  }

  async function bulkRetryFailed() {
    const failedOrders = orders.filter(o => ['FAILED', 'NEEDS_MANUAL'].includes(o.status));
    if (!failedOrders.length) return;
    const ok = window.confirm(`¿Reintentar ${failedOrders.length} orden${failedOrders.length > 1 ? 'es' : ''} fallida${failedOrders.length > 1 ? 's' : ''}?`);
    if (!ok) return;
    setBulkRetrying(true);
    setError(null);
    let success = 0, failed = 0;
    for (const o of failedOrders) {
      try {
        await api.post(`/api/cj-shopify-usa/orders/${o.id}/process`);
        success++;
      } catch { failed++; }
    }
    setActionMsg(`Reintento masivo: ${success} enviadas a CJ, ${failed} errores.`);
    await load();
    setBulkRetrying(false);
  }

  async function autoSyncTracking() {
    setAutoSyncing(true);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; synced: number; checked: number }>('/api/cj-shopify-usa/orders/auto-sync-tracking');
      setActionMsg(`Auto-sync tracking: ${res.data.synced} actualizados de ${res.data.checked} revisados.`);
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'Error en auto-sync tracking.'));
    } finally {
      setAutoSyncing(false);
    }
  }

  function trackingUrl(carrierCode: string | null, trackingNumber: string): string {
    const carrier = (carrierCode || '').toLowerCase();
    if (carrier.includes('usps'))   return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
    if (carrier.includes('ups'))    return `https://www.ups.com/track?tracknum=${trackingNumber}`;
    if (carrier.includes('fedex'))  return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
    if (carrier.includes('dhl'))    return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
    return `https://t.17track.net/en#nums=${trackingNumber}`;
  }

  const filtered = orders.filter((o) => filterStatus === 'ALL' || o.status === filterStatus);

  const attention = orders.filter((o) =>
    ['FAILED', 'NEEDS_MANUAL', 'SUPPLIER_PAYMENT_BLOCKED'].includes(o.status)
  ).length;

  if (loading) return <p className="text-sm text-slate-500">Cargando órdenes…</p>;

  return (
    <div className="space-y-4">
      {actionMsg && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {actionMsg}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={`rounded-full px-3 py-1 font-medium ${filterStatus === 'ALL' ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            Todas ({orders.length})
          </button>
          {attention > 0 && (
            <button
              type="button"
              onClick={() => setFilterStatus('FAILED')}
              className="rounded-full px-3 py-1 font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            >
              Requieren atención ({attention})
            </button>
          )}
          {ALL_STATUSES.filter((s) => orders.some((o) => o.status === s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`rounded-full px-2 py-0.5 font-medium ${filterStatus === s ? 'ring-2 ring-slate-400' : ''} ${STATUS_COLORS[s] ?? 'bg-slate-100 text-slate-700'}`}
            >
              {STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncRecent()}
          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar últimas 24h'}
        </button>
        <button
          type="button"
          disabled={autoSyncing}
          onClick={() => void autoSyncTracking()}
          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/60 disabled:opacity-40"
        >
          {autoSyncing ? 'Sincronizando tracking…' : '📦 Auto-sync Tracking'}
        </button>
        {orders.some(o => ['FAILED','NEEDS_MANUAL'].includes(o.status)) && (
          <button
            type="button"
            disabled={bulkRetrying}
            onClick={() => void bulkRetryFailed()}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-40"
          >
            {bulkRetrying ? 'Reintentando…' : `🔄 Reintentar todas las fallidas (${orders.filter(o=>['FAILED','NEEDS_MANUAL'].includes(o.status)).length})`}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Shopify Order</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Próximo paso / Error</th>
              <th className="px-3 py-2">CJ Order</th>
              <th className="px-3 py-2">Destino</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Tracking</th>
              <th className="px-3 py-2">Actualizado</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500 text-sm">
                  {orders.length === 0
                    ? 'Sin órdenes. Las órdenes de Shopify aparecen aquí cuando llegan por webhook o se sincronizan manualmente.'
                    : 'Sin órdenes con ese filtro.'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 cursor-pointer"
                  onClick={() => navigate(`/cj-shopify-usa/orders/${row.id}`)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.shopifyOrderId}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-700'}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.lastError ? (
                      <span className="text-red-600 dark:text-red-400 line-clamp-2" title={row.lastError}>
                        ⚠ {row.lastError.slice(0, 60)}{row.lastError.length > 60 ? '…' : ''}
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">{NEXT_STEP[row.status] ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {row.cjOrderId ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className={row.buyerPayload?.countryCodeV2 ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-400 font-semibold'}>
                      {shippingCountry(row)}
                    </div>
                    <div className="text-slate-400">{shippingCity(row)}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs">{usd(row.totalUsd)}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.tracking?.trackingNumber ? (
                      <a
                        href={trackingUrl(row.tracking.carrierCode, row.tracking.trackingNumber)}
                        target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline"
                        title={`Carrier: ${row.tracking.carrierCode ?? 'Unknown'}`}
                      >
                        {row.tracking.trackingNumber}
                      </a>
                    ) : (
                      <span className="text-slate-400">{trackingLabel(row)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(row.updatedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Manual CJ order trigger */}
                      {['DETECTED', 'VALIDATED', 'NEEDS_MANUAL', 'FAILED'].includes(row.status) && (
                        <button
                          type="button"
                          disabled={actionBusy === row.id + 'process'}
                          onClick={(e) => { e.stopPropagation(); void triggerOrderAction(row.id, 'process', 'Enviar a CJ'); }}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                          title="Enviar orden manualmente a CJ Dropshipping"
                        >
                          {actionBusy === row.id + 'process' ? '…' : '▶ Enviar CJ'}
                        </button>
                      )}
                      {/* Sync tracking for shipped orders */}
                      {['CJ_SHIPPED', 'CJ_FULFILLING', 'CJ_PAYMENT_COMPLETED'].includes(row.status) && (
                        <button
                          type="button"
                          disabled={actionBusy === row.id + 'sync-tracking'}
                          onClick={(e) => { e.stopPropagation(); void triggerOrderAction(row.id, 'sync-tracking', 'Sync tracking'); }}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
                          title="Sincronizar número de tracking con Shopify"
                        >
                          {actionBusy === row.id + 'sync-tracking' ? '…' : '📦 Tracking'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-primary-600 dark:text-primary-400 underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/cj-shopify-usa/orders/${row.id}`); }}
                      >
                        Ver detalle
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
