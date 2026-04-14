import { Fragment, useCallback, useEffect, useState } from 'react';
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

type OrderEvent = {
  id: string;
  step: string;
  message: string | null;
  meta: unknown;
  createdAt: string;
};

type OrderDetail = OrderRow & {
  buyerPayload: unknown;
  rawEbaySummary: unknown;
  events: OrderEvent[];
  tracking: { status: string; trackingNumber: string | null; carrierCode: string | null } | null;
  listing: { id: number; ebaySku: string | null; status: string; ebayListingId: string | null } | null;
};

export default function CjEbayOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ebayOrderId, setEbayOrderId] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingImport, setLoadingImport] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);

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

  async function loadDetail(id: string) {
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; order: OrderDetail }>(`/api/cj-ebay/orders/${id}`);
      if (res.data?.ok && res.data.order) {
        setDetail(res.data.order);
      }
    } catch (e: unknown) {
      setError(axiosMsg(e, 'No se pudo cargar el detalle.'));
    }
  }

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
        status?: string;
        checkoutNote?: string;
      }>(`/api/cj-ebay/orders/${orderId}/place`);
      if (res.data?.needsManual) {
        setError(
          res.data.checkoutNote ||
            'Place/checkout automático incompleto (needsManual). Revisa eventos y lastError.'
        );
      }
      await loadList();
      if (detail?.id === orderId) await loadDetail(orderId);
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
      if (detail?.id === orderId) await loadDetail(orderId);
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
      if (res.data?.skipped) {
        setError('Confirm omitido (ya confirmada).');
      }
      await loadList();
      if (detail?.id === orderId) await loadDetail(orderId);
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
      if (res.data?.skipped) {
        setError('Pago omitido (ya pagado en sistema).');
      }
      await loadList();
      if (detail?.id === orderId) await loadDetail(orderId);
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
      if (detail?.id === orderId) await loadDetail(orderId);
    } catch (e: unknown) {
      setError(axiosMsg(e, 'Error al sincronizar tracking.'));
    } finally {
      setBusyOrderId(null);
    }
  }

  if (loadingList) {
    return <p className="text-sm text-slate-500">Cargando órdenes…</p>;
  }

  return (
    <div className="space-y-6">
      <CjEbayOperatorPathCallout variant="orders" />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        FASE 3E.3: tras <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">createOrderV2</code> con payType=3 la orden queda en{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">CJ_ORDER_CREATED</code>; luego{' '}
        <strong>Confirmar</strong> (<code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">confirmOrder</code>) y{' '}
        <strong>Pagar</strong> (<code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">payBalance</code>) según doc CJ. Modo automático:{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">cjPostCreateCheckoutMode=AUTO_CONFIRM_PAY</code> en{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">POST /api/cj-ebay/config</code>.
      </p>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Importar orden eBay</h2>
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">eBay order</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">CJ order</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Sin órdenes importadas.
                </td>
              </tr>
            ) : (
              orders.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs">{row.ebayOrderId}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.cjOrderId || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.ebaySku || '—'}</td>
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-xs text-primary-600 dark:text-primary-400 underline"
                        onClick={() => void loadDetail(row.id)}
                      >
                        {detail?.id === row.id ? 'Refrescar' : 'Detalle'}
                      </button>
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
                      <button
                        type="button"
                        disabled={busyOrderId === row.id || !row.cjOrderId || row.status === 'COMPLETED'}
                        className="text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40"
                        onClick={() => void runSyncStatus(row.id)}
                      >
                        CJ status
                      </button>
                      <button
                        type="button"
                        disabled={busyOrderId === row.id || !row.cjOrderId || row.status === 'COMPLETED'}
                        className="text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40"
                        onClick={() => void runSyncTracking(row.id)}
                      >
                        Sync tracking
                      </button>
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
                    </td>
                  </tr>
                  {detail?.id === row.id && (
                    <tr className="bg-slate-50/90 dark:bg-slate-950/50">
                      <td colSpan={5} className="px-3 py-4 text-xs text-slate-600 dark:text-slate-400">
                        <p className="font-medium text-slate-800 dark:text-slate-200 mb-2">Timeline</p>
                        <p className="mb-2 text-slate-700 dark:text-slate-200">
                          Confirm CJ: {detail.cjConfirmedAt || '—'} · Pago balance: {detail.cjPaidAt || '—'}
                        </p>
                        {detail.lastError && (
                          <pre className="mb-2 whitespace-pre-wrap text-rose-700 dark:text-rose-300 text-xs">
                            {detail.lastError}
                          </pre>
                        )}
                        <ul className="space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3 mb-3">
                          {detail.events.map((ev) => (
                            <li key={ev.id}>
                              <span className="font-mono text-slate-500">{ev.createdAt}</span>{' '}
                              <strong>{ev.step}</strong>
                              {ev.message ? ` — ${ev.message}` : ''}
                            </li>
                          ))}
                        </ul>
                        {detail.tracking && (
                          <p className="text-xs mb-2">
                            Tracking: {detail.tracking.status}{' '}
                            {detail.tracking.trackingNumber || detail.tracking.carrierCode || ''}
                          </p>
                        )}
                        <details>
                          <summary className="cursor-pointer text-slate-500">rawEbaySummary</summary>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-100 dark:bg-slate-900 p-2">
                            {JSON.stringify(detail.rawEbaySummary, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function axiosMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}
