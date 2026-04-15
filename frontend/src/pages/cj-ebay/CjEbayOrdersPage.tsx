import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import CjEbayOperatorPathCallout from '@/components/cj-ebay/CjEbayOperatorPathCallout';

type OrderRow = {
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
};

// ── Status display ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DETECTED:              'Detectada',
  VALIDATED:             'Validada',
  CJ_ORDER_CREATED:      'Orden CJ creada',
  CJ_ORDER_CONFIRMING:   'Confirmando',
  CJ_PAYMENT_PENDING:    'Pago pendiente',
  CJ_PAYMENT_PROCESSING: 'Procesando pago',
  CJ_PAYMENT_COMPLETED:  'Pago completado',
  CJ_FULFILLING:         'En fulfillment',
  CJ_SHIPPED:            'Enviada por CJ',
  TRACKING_ON_EBAY:      'Tracking en eBay',
  COMPLETED:             'Completada',
  FAILED:                'Fallida',
  NEEDS_MANUAL:          'Intervención manual',
};

const STATUS_COLORS: Record<string, string> = {
  DETECTED:              'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  VALIDATED:             'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  CJ_ORDER_CREATED:      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  CJ_ORDER_CONFIRMING:   'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  CJ_PAYMENT_PENDING:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  CJ_PAYMENT_PROCESSING: 'bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  CJ_PAYMENT_COMPLETED:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CJ_FULFILLING:         'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  CJ_SHIPPED:            'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  TRACKING_ON_EBAY:      'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  COMPLETED:             'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  FAILED:                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  NEEDS_MANUAL:          'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

const NEXT_STEP: Record<string, string> = {
  DETECTED:              'Pendiente de validación',
  VALIDATED:             'Ordenar en CJ',
  CJ_ORDER_CREATED:      'Confirmar con CJ',
  CJ_ORDER_CONFIRMING:   'Esperando confirmación',
  CJ_PAYMENT_PENDING:    'Pagar balance CJ',
  CJ_PAYMENT_PROCESSING: 'Procesando pago',
  CJ_PAYMENT_COMPLETED:  'Esperando fulfillment',
  CJ_FULFILLING:         'CJ preparando envío',
  CJ_SHIPPED:            'Sincronizar tracking',
  TRACKING_ON_EBAY:      'Tracking subido a eBay',
  COMPLETED:             '—',
  FAILED:                'Revisar error',
  NEEDS_MANUAL:          'Intervención requerida',
};

const ALL_FILTER_STATUSES = [
  'DETECTED', 'VALIDATED', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMING',
  'CJ_PAYMENT_PENDING', 'CJ_PAYMENT_PROCESSING', 'CJ_PAYMENT_COMPLETED',
  'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_EBAY', 'COMPLETED',
  'FAILED', 'NEEDS_MANUAL',
];

function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_COLORS[status] ??
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      {label}
    </span>
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

const ATTENTION_STATUSES = new Set(['FAILED', 'NEEDS_MANUAL', 'DETECTED']);
const ACTIVE_STATUSES = new Set([
  'VALIDATED', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMING',
  'CJ_PAYMENT_PENDING', 'CJ_PAYMENT_PROCESSING', 'CJ_PAYMENT_COMPLETED',
  'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_EBAY',
]);

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjEbayOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ebayOrderId, setEbayOrderId] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingImport, setLoadingImport] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAttention, setFilterAttention] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');

  const loadList = useCallback(async () => {
    setError(null);
    setLoadingList(true);
    try {
      const res = await api.get<{ ok: boolean; orders: OrderRow[] }>('/api/cj-ebay/orders');
      if (res.data?.ok && Array.isArray(res.data.orders)) {
        setOrders(res.data.orders);
      }
    } catch (e: unknown) {
      setError(axiosMsg(e, 'No se pudieron cargar las órdenes.'));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => ({
    total:        orders.length,
    active:       orders.filter((o) => ACTIVE_STATUSES.has(o.status)).length,
    attention:    orders.filter((o) => ATTENTION_STATUSES.has(o.status)).length,
    completed:    orders.filter((o) => o.status === 'COMPLETED').length,
  }), [orders]);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = orders;
    if (filterStatus) {
      list = list.filter((o) => o.status === filterStatus);
    }
    if (filterAttention) {
      list = list.filter((o) => ATTENTION_STATUSES.has(o.status));
    }
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.ebayOrderId.toLowerCase().includes(q) ||
          (o.cjOrderId ?? '').toLowerCase().includes(q) ||
          (o.ebaySku ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filterStatus, filterAttention, filterSearch]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function runImport() {
    const id = ebayOrderId.trim();
    if (!id) return;
    setLoadingImport(true);
    setError(null);
    try {
      await api.post('/api/cj-ebay/orders/import', { ebayOrderId: id });
      setEbayOrderId('');
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al importar la orden.'));
    } finally {
      setLoadingImport(false);
    }
  }

  async function runPlace(orderId: string) {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; needsManual?: boolean; checkoutNote?: string }>(
        `/api/cj-ebay/orders/${orderId}/place`
      );
      if (res.data?.needsManual) {
        setError(
          res.data.checkoutNote ||
            'Orden enviada a CJ con aviso. Abre el detalle para revisar los eventos.'
        );
      }
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al colocar la orden en CJ.'));
      await loadList();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function runSyncStatus(orderId: string) {
    setBusyOrderId(orderId);
    setError(null);
    try {
      await api.get(`/api/cj-ebay/orders/${orderId}/status`);
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al actualizar el estado desde CJ.'));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function runConfirm(orderId: string) {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; skipped?: boolean }>(
        `/api/cj-ebay/orders/${orderId}/confirm`
      );
      if (res.data?.skipped) setError('La orden ya estaba confirmada.');
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al confirmar la orden en CJ.'));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function runPay(orderId: string) {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; skipped?: boolean }>(
        `/api/cj-ebay/orders/${orderId}/pay`
      );
      if (res.data?.skipped) setError('El pago ya fue registrado anteriormente.');
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al procesar el pago en CJ.'));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function runSyncTracking(orderId: string) {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; stub?: boolean; message?: string }>(
        `/api/cj-ebay/orders/${orderId}/sync-tracking`
      );
      if (res.data?.stub) {
        setError(res.data.message || 'Número de seguimiento no disponible aún desde CJ.');
      }
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al sincronizar el tracking.'));
    } finally {
      setBusyOrderId(null);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loadingList) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-primary-600 animate-spin" />
      </div>
    );
  }

  const hasActiveFilters = filterStatus || filterAttention || filterSearch.trim();

  return (
    <div className="space-y-5">
      <CjEbayOperatorPathCallout variant="orders" />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Órdenes CJ → eBay USA
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Gestión postventa — importa, opera y hace seguimiento del ciclo completo de cada venta.
        </p>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total órdenes',
            value: kpis.total,
            tone: 'slate' as const,
          },
          {
            label: 'En progreso',
            value: kpis.active,
            tone: kpis.active > 0 ? 'blue' as const : 'slate' as const,
          },
          {
            label: 'Requieren atención',
            value: kpis.attention,
            tone: kpis.attention > 0 ? 'amber' as const : 'slate' as const,
          },
          {
            label: 'Completadas',
            value: kpis.completed,
            tone: kpis.completed > 0 ? 'emerald' as const : 'slate' as const,
          },
        ].map(({ label, value, tone }) => (
          <div
            key={label}
            className={`rounded-xl border p-3 ${
              tone === 'blue'
                ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-900/10'
                : tone === 'amber'
                ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-900/10'
                : tone === 'emerald'
                ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40'
            }`}
          >
            <p
              className={`text-2xl font-bold tabular-nums ${
                tone === 'blue'
                  ? 'text-blue-700 dark:text-blue-300'
                  : tone === 'amber'
                  ? 'text-amber-700 dark:text-amber-300'
                  : tone === 'emerald'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {value}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Import ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Importar orden eBay
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ingresa el ID de la orden de eBay para iniciar el ciclo postventa con CJ.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 flex-1 min-w-[200px]">
            ID de orden eBay
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
              value={ebayOrderId}
              onChange={(ev) => setEbayOrderId(ev.target.value)}
              placeholder="Ej: 12-05678-90123"
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') void runImport();
              }}
            />
          </label>
          <button
            type="button"
            disabled={loadingImport || !ebayOrderId.trim()}
            className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium px-4 py-2 disabled:opacity-50"
            onClick={() => void runImport()}
          >
            {loadingImport ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {error}
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      {orders.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <select
            aria-label="Filtrar por estado"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setFilterAttention(false);
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
          >
            <option value="">Todos los estados</option>
            {ALL_FILTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setFilterAttention((v) => !v);
              setFilterStatus('');
            }}
            className={`rounded-lg border text-xs px-2.5 py-1.5 font-medium transition-colors ${
              filterAttention
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-amber-300'
            }`}
          >
            Requieren atención
          </button>

          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Buscar por ID eBay / ID CJ / SKU"
            className="flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterStatus('');
                setFilterAttention(false);
                setFilterSearch('');
              }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* ── Orders table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        {orders.length === 0 ? (
          <div className="px-6 py-14 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Esperando primera orden real
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Importa el ID de una orden eBay usando el formulario de arriba para iniciar el ciclo
              postventa CJ.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sin órdenes para los filtros seleccionados.
            </p>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2.5">eBay order</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Próximo paso</th>
                <th className="px-3 py-2.5">CJ order</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">Total</th>
                <th className="px-3 py-2.5">Actualizado</th>
                <th className="px-3 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const canPlace =
                  row.status === 'VALIDATED' ||
                  (row.listingId != null &&
                    (row.status === 'NEEDS_MANUAL' || row.status === 'FAILED'));
                const canConfirm = !!row.cjOrderId && row.status === 'CJ_ORDER_CREATED';
                const canPay = !!row.cjOrderId && row.status === 'CJ_PAYMENT_PENDING';
                const canSync = !!row.cjOrderId && row.status !== 'COMPLETED';

                return (
                  <tr
                    key={row.id}
                    className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                      row.status === 'FAILED' || row.status === 'NEEDS_MANUAL'
                        ? 'bg-red-50/30 dark:bg-red-950/10'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {row.ebayOrderId}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.status} />
                      {row.lastError && (
                        <p
                          className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 max-w-[160px] truncate"
                          title={row.lastError}
                        >
                          {row.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {NEXT_STEP[row.status] ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {row.cjOrderId || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {row.ebaySku || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                      {row.totalUsd != null ? `$${row.totalUsd.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {new Date(row.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-x-2 gap-y-1 items-center whitespace-nowrap">
                        {/* Ver detalle */}
                        <button
                          type="button"
                          className="text-xs text-primary-600 dark:text-primary-400 underline font-medium"
                          onClick={() => navigate(`/cj-ebay/orders/${row.id}`)}
                        >
                          Ver detalle
                        </button>

                        {/* Ordenar en CJ */}
                        {canPlace && (
                          <button
                            type="button"
                            disabled={busyOrderId === row.id}
                            className="text-xs font-medium text-emerald-700 dark:text-emerald-300 disabled:opacity-40"
                            onClick={() => void runPlace(row.id)}
                          >
                            Ordenar en CJ
                          </button>
                        )}

                        {/* Confirmar */}
                        {canConfirm && (
                          <button
                            type="button"
                            disabled={busyOrderId === row.id}
                            className="text-xs font-medium text-indigo-700 dark:text-indigo-300 disabled:opacity-40"
                            onClick={() => void runConfirm(row.id)}
                          >
                            Confirmar
                          </button>
                        )}

                        {/* Pagar */}
                        {canPay && (
                          <button
                            type="button"
                            disabled={busyOrderId === row.id}
                            className="text-xs font-medium text-violet-700 dark:text-violet-300 disabled:opacity-40"
                            onClick={() => void runPay(row.id)}
                          >
                            Pagar
                          </button>
                        )}

                        {/* Actualizar estado / Tracking */}
                        {canSync && (
                          <>
                            <button
                              type="button"
                              disabled={busyOrderId === row.id}
                              className="text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40"
                              onClick={() => void runSyncStatus(row.id)}
                            >
                              Actualizar estado
                            </button>
                            <button
                              type="button"
                              disabled={busyOrderId === row.id}
                              className="text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40"
                              onClick={() => void runSyncTracking(row.id)}
                            >
                              Tracking
                            </button>
                          </>
                        )}

                        {/* Busy indicator */}
                        {busyOrderId === row.id && (
                          <span className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
