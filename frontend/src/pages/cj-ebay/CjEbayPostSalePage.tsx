import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Loader2, PackageCheck, RefreshCw } from 'lucide-react';

type OrderRow = {
  id: string;
  ebayOrderId: string;
  status: string;
  cjOrderId: string | null;
  ebaySku: string | null;
  totalUsd: number | null;
  lastError: string | null;
  cjConfirmedAt: string | null;
  cjPaidAt: string | null;
  updatedAt: string;
};

const POST_SALE_STATUSES = new Set([
  'CJ_ORDER_CREATED',
  'CJ_ORDER_CONFIRMING',
  'CJ_PAYMENT_PENDING',
  'CJ_PAYMENT_PROCESSING',
  'CJ_PAYMENT_COMPLETED',
  'CJ_FULFILLING',
  'CJ_SHIPPED',
  'TRACKING_ON_EBAY',
  'SUPPLIER_PAYMENT_BLOCKED',
  'NEEDS_MANUAL',
]);

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

function nextStep(status: string): string {
  const map: Record<string, string> = {
    CJ_ORDER_CREATED: 'Confirmar orden CJ',
    CJ_ORDER_CONFIRMING: 'Esperar confirmacion CJ',
    CJ_PAYMENT_PENDING: 'Pagar balance CJ',
    CJ_PAYMENT_PROCESSING: 'Esperar pago CJ',
    CJ_PAYMENT_COMPLETED: 'Monitorear fulfillment',
    CJ_FULFILLING: 'Esperar despacho CJ',
    CJ_SHIPPED: 'Sincronizar tracking a eBay',
    TRACKING_ON_EBAY: 'Monitorear entrega',
    SUPPLIER_PAYMENT_BLOCKED: 'Resolver balance CJ',
    NEEDS_MANUAL: 'Intervencion operador',
  };
  return map[status] ?? 'Revisar estado';
}

export default function CjEbayPostSalePage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; orders: OrderRow[] }>('/api/cj-ebay/orders');
      setOrders(res.data.orders ?? []);
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar post venta CJ-eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postSaleOrders = useMemo(() => orders.filter((order) => POST_SALE_STATUSES.has(order.status)), [orders]);
  const blocked = postSaleOrders.filter((order) => order.status === 'SUPPLIER_PAYMENT_BLOCKED' || order.status === 'NEEDS_MANUAL');
  const trackingPending = postSaleOrders.filter((order) => order.status === 'CJ_SHIPPED');

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando post venta eBay...
      </div>
    );
  }

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{error}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-slate-500" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Post Venta CJ → eBay USA</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Seguimiento de pago CJ, fulfillment, tracking e incidencias posteriores a la venta.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refrescar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500">Ordenes post venta</p>
          <p className="mt-1 text-2xl font-semibold">{postSaleOrders.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500">Tracking pendiente</p>
          <p className="mt-1 text-2xl font-semibold">{trackingPending.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500">Bloqueos</p>
          <p className="mt-1 text-2xl font-semibold">{blocked.length}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/70">
            <tr>
              <th className="px-4 py-3 text-left">Orden eBay</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Siguiente paso</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-left">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {postSaleOrders.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{order.ebayOrderId}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{order.status}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{nextStep(order.status)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{usd(order.totalUsd)}</td>
                <td className="max-w-sm truncate px-4 py-3 text-xs text-red-600 dark:text-red-300">{order.lastError ?? '-'}</td>
              </tr>
            ))}
            {postSaleOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">Sin ordenes en post venta.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
