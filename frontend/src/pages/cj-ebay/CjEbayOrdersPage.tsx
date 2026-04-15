import { useCallback, useEffect, useState } from 'react';
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

// ── Status badge ──────────────────────────────────────────────────────────────

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

function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_COLORS[status] ??
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjEbayOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ebayOrderId, setEbayOrderId] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingImport, setLoadingImport] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setError(null);
    setLoadingList(true);
    try {
      const res = await api.get<{ ok: boolean; orders: OrderRow[] }>('/api/cj-ebay/orders');
      if (res.data?.ok && Array.isArray(res.data.orders)) {
        setOrders(res.data.orders);
      }
    } catch (e: unknown) {
      setError(axiosMsg(e, 'No se pudieron cargar órdenes.'));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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
      setError(axiosMsg(e, 'Error al importar.'));
    } finally {
      setLoadingImport(false);
    }
  }

  async function runPlace(orderId: string) {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const res = await api.post<{
        ok: boolean;
        needsManual?: boolean;
        checkoutNote?: string;
      }>(`/api/cj-ebay/orders/${orderId}/place`);
      if (res.data?.needsManual) {
        setError(
          res.data.checkoutNote ||
            'Place/checkout automático incompleto (needsManual). Abre el detalle para revisar eventos y lastError.'
        );
      }
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al colocar pedido CJ.'));
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
      setError(axiosMsg(e, 'Error al consultar estado CJ.'));
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
      if (res.data?.skipped) setError('Confirm omitido (ya confirmada).');
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al confirmar en CJ.'));
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
      if (res.data?.skipped) setError('Pago omitido (ya pagado en sistema).');
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al pagar con balance CJ.'));
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
        setError(res.data.message || 'Tracking no disponible (stub / no implementado).');
      }
      await loadList();
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al sincronizar tracking.'));
    } finally {
      setBusyOrderId(null);
    }
  }

  if (loadingList) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-primary-600 animate-spin" />
      </div>
    );
  }

  const openCount = orders.filter(
    (o) => o.status !== 'COMPLETED' && o.status !== 'FAILED'
  ).length;
  const failedCount = orders.filter((o) => o.status === 'FAILED' || o.status === 'NEEDS_MANUAL').length;

  return (
    <div className="space-y-6">
      <CjEbayOperatorPathCallout variant="orders" />

      {/* ── Readiness banner ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
          Estado del ciclo postventa CJ → eBay USA
        </p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><span className="text-emerald-700 dark:text-emerald-400 font-medium">✓ Import orden eBay</span> — listo en código</li>
          <li><span className="text-emerald-700 dark:text-emerald-400 font-medium">✓ Place CJ</span> — listo en código (<code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">createOrderV2</code> payType=3)</li>
          <li><span className="text-emerald-700 dark:text-emerald-400 font-medium">✓ Confirm / Pay</span> — listo en código (<code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">confirmOrder</code> / <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">payBalance</code>). Modo automático: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">cjPostCreateCheckoutMode=AUTO_CONFIRM_PAY</code></li>
          <li><span className="text-emerald-700 dark:text-emerald-400 font-medium">✓ Tracking</span> — listo en código</li>
          <li><span className="text-amber-700 dark:text-amber-400 font-medium">⏳ Validación viva</span> — pendiente hasta primera orden real con cuenta CJ activa</li>
        </ul>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      {orders.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total órdenes', count: orders.length, tone: 'slate' },
            { label: 'En progreso', count: openCount, tone: openCount > 0 ? 'amber' : 'slate' },
            { label: 'Fallo / manual', count: failedCount, tone: failedCount > 0 ? 'red' : 'slate' },
          ].map(({ label, count, tone }) => (
            <div
              key={label}
              className={`rounded-xl border p-3 ${
                tone === 'amber'
                  ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-900/10'
                  : tone === 'red'
                  ? 'border-red-200 dark:border-red-800/50 bg-red-50/40 dark:bg-red-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40'
              }`}
            >
              <p
                className={`text-xl font-bold tabular-nums ${
                  tone === 'amber'
                    ? 'text-amber-700 dark:text-amber-300'
                    : tone === 'red'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {count}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Import ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Importar orden eBay por ID
        </h2>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 flex-1 min-w-[200px]">
            ebayOrderId
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
              value={ebayOrderId}
              onChange={(ev) => setEbayOrderId(ev.target.value)}
              placeholder="Sell Fulfillment order id"
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

      {error && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {error}
        </div>
      )}

      {/* ── Orders table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2.5">eBay order</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5">CJ order</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Total</th>
              <th className="px-3 py-2.5">Actualizado</th>
              <th className="px-3 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  Sin órdenes importadas. Usa el formulario de arriba para importar la primera.
                </td>
              </tr>
            ) : (
              orders.map((row) => (
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
                      {/* Detalle (full page) */}
                      <button
                        type="button"
                        className="text-xs text-primary-600 dark:text-primary-400 underline font-medium"
                        onClick={() => navigate(`/cj-ebay/orders/${row.id}`)}
                      >
                        Detalle
                      </button>

                      {/* Place CJ */}
                      <button
                        type="button"
                        disabled={
                          busyOrderId === row.id ||
                          !(
                            row.status === 'VALIDATED' ||
                            (row.listingId != null &&
                              (row.status === 'NEEDS_MANUAL' || row.status === 'FAILED'))
                          )
                        }
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-300 disabled:opacity-40"
                        onClick={() => void runPlace(row.id)}
                      >
                        Place CJ
                      </button>

                      {/* CJ status */}
                      <button
                        type="button"
                        disabled={busyOrderId === row.id || !row.cjOrderId || row.status === 'COMPLETED'}
                        className="text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40"
                        onClick={() => void runSyncStatus(row.id)}
                      >
                        CJ status
                      </button>

                      {/* Sync tracking */}
                      <button
                        type="button"
                        disabled={busyOrderId === row.id || !row.cjOrderId || row.status === 'COMPLETED'}
                        className="text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40"
                        onClick={() => void runSyncTracking(row.id)}
                      >
                        Tracking
                      </button>

                      {/* Confirmar */}
                      <button
                        type="button"
                        disabled={
                          busyOrderId === row.id ||
                          !row.cjOrderId ||
                          row.status !== 'CJ_ORDER_CREATED'
                        }
                        className="text-xs font-medium text-indigo-700 dark:text-indigo-300 disabled:opacity-40"
                        onClick={() => void runConfirm(row.id)}
                      >
                        Confirmar
                      </button>

                      {/* Pagar */}
                      <button
                        type="button"
                        disabled={
                          busyOrderId === row.id ||
                          !row.cjOrderId ||
                          row.status !== 'CJ_PAYMENT_PENDING'
                        }
                        className="text-xs font-medium text-violet-700 dark:text-violet-300 disabled:opacity-40"
                        onClick={() => void runPay(row.id)}
                      >
                        Pagar
                      </button>

                      {/* Busy indicator */}
                      {busyOrderId === row.id && (
                        <span className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                      )}
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
