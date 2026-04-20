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

type OrderRow = {
  id: string;
  shopifyOrderId: string;
  status: string;
  cjOrderId: string | null;
  totalUsd: number | null;
  lastError: string | null;
  updatedAt: string;
  tracking: TrackingInfo | null;
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

  const filtered = orders.filter((o) => filterStatus === 'ALL' || o.status === filterStatus);

  const attention = orders.filter((o) =>
    ['FAILED', 'NEEDS_MANUAL', 'SUPPLIER_PAYMENT_BLOCKED'].includes(o.status)
  ).length;

  if (loading) return <p className="text-sm text-slate-500">Cargando órdenes…</p>;

  return (
    <div className="space-y-4">
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
              <th className="px-3 py-2">Próximo paso</th>
              <th className="px-3 py-2">CJ Order</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Tracking</th>
              <th className="px-3 py-2">Actualizado</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500 text-sm">
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
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {NEXT_STEP[row.status] ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {row.cjOrderId ?? '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs">{usd(row.totalUsd)}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.tracking?.trackingNumber ? (
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {row.tracking.trackingNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(row.updatedAt)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-primary-600 dark:text-primary-400 underline"
                      onClick={(e) => { e.stopPropagation(); navigate(`/cj-shopify-usa/orders/${row.id}`); }}
                    >
                      Ver detalle
                    </button>
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
