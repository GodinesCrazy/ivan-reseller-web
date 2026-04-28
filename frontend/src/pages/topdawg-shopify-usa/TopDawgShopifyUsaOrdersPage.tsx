import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

type TrackingInfo = { id: number; trackingNumber: string | null; carrierCode: string | null };
type OrderRow = { id: number; shopifyOrderId: string; status: string; tdOrderId: string | null; totalUsd: number | null; lastError: string | null; updatedAt: string; tracking: TrackingInfo[] };

const STATUS_LABEL: Record<string, string> = {
  DETECTED: 'Detectada', VALIDATED: 'Validada',
  TD_ORDER_PLACING: 'Enviando a TopDawg', TD_ORDER_PLACED: 'Enviada',
  TD_ORDER_CONFIRMED: 'Confirmada', TD_PAYMENT_PENDING: 'Pago pendiente',
  TD_PAYMENT_COMPLETED: 'Pago OK', TD_FULFILLING: 'En fulfillment',
  TD_SHIPPED: 'Enviada por TopDawg', TRACKING_ON_SHOPIFY: 'Tracking en Shopify',
  COMPLETED: 'Completada', FAILED: 'Fallida', NEEDS_MANUAL: 'Intervención manual',
};

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'bg-slate-100 text-slate-700', VALIDATED: 'bg-blue-100 text-blue-700',
  TD_ORDER_PLACING: 'bg-indigo-100 text-indigo-700', TD_ORDER_PLACED: 'bg-indigo-100 text-indigo-700',
  TD_ORDER_CONFIRMED: 'bg-violet-100 text-violet-700', TD_PAYMENT_PENDING: 'bg-amber-100 text-amber-700',
  TD_PAYMENT_COMPLETED: 'bg-emerald-100 text-emerald-700', TD_FULFILLING: 'bg-teal-100 text-teal-700',
  TD_SHIPPED: 'bg-cyan-100 text-cyan-700', TRACKING_ON_SHOPIFY: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-emerald-200 text-emerald-800', FAILED: 'bg-red-100 text-red-700',
  NEEDS_MANUAL: 'bg-orange-100 text-orange-700',
};

export default function TopDawgShopifyUsaOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders]   = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/api/topdawg-shopify-usa/orders');
    setOrders(res.data.orders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function sync() {
    setSyncing(true);
    try { await api.post('/api/topdawg-shopify-usa/orders/sync', { sinceHours: 24, first: 50 }); await load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Sync error'); }
    finally { setSyncing(false); }
  }

  async function orderAction(id: number, endpoint: string) {
    setBusyId(`${id}-${endpoint}`);
    try { await api.post(`/api/topdawg-shopify-usa/orders/${id}/${endpoint}`); await load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusyId(null); }
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando órdenes…</p>;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm text-red-800 dark:text-red-200">{error}</div>}
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{orders.length} órdenes</p>
        <button onClick={() => void sync()} disabled={syncing}
          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40">
          {syncing ? 'Sincronizando…' : 'Sincronizar últimas 24h'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Shopify Order</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">TD Order</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Tracking</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500 text-sm">Sin órdenes. Las órdenes aparecen aquí al sincronizar o llegar por webhook.</td></tr>
            ) : orders.map(row => (
              <tr key={row.id} onClick={() => navigate(`/topdawg-shopify-usa/orders/${row.id}`)}
                className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 cursor-pointer">
                <td className="px-3 py-2 font-mono text-xs">{row.shopifyOrderId}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-700'}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.tdOrderId ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums text-xs">{row.totalUsd != null ? `$${Number(row.totalUsd).toFixed(2)}` : '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {row.tracking?.[0]?.trackingNumber
                    ? <span className="font-mono text-emerald-600 dark:text-emerald-400">{row.tracking[0].trackingNumber}</span>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    {['DETECTED','VALIDATED','NEEDS_MANUAL','FAILED'].includes(row.status) && (
                      <button onClick={() => void orderAction(row.id, 'process')} disabled={busyId === `${row.id}-process`}
                        className="rounded px-2 py-1 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                        {busyId === `${row.id}-process` ? '…' : '▶ Enviar TD'}
                      </button>
                    )}
                    {['TD_SHIPPED','TD_FULFILLING'].includes(row.status) && (
                      <button onClick={() => void orderAction(row.id, 'sync-tracking')} disabled={busyId === `${row.id}-sync-tracking`}
                        className="rounded px-2 py-1 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50">
                        {busyId === `${row.id}-sync-tracking` ? '…' : '📦 Tracking'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
