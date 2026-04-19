import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/services/api';

type Order = {
  id: number;
  ebayOrderId: string;
  cjOrderId?: string;
  status: string;
  totalGbp?: number;
  paymentBlockReason?: string;
  events?: Array<{ at: string; step: string; [k: string]: unknown }>;
  refunds?: Array<{ id: number; status: string; amountGbp?: number; type: string }>;
  tracking?: Array<{ trackingNumber?: string; carrierCode?: string; trackingUrl?: string }>;
  updatedAt: string;
};

export default function CjEbayUkOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    api.get<{ ok: boolean; order: Order }>(`/api/cj-ebay-uk/orders/${orderId}`)
      .then((r) => { if (r.data?.ok) setOrder(r.data.order); })
      .finally(() => setLoading(false));
  }, [orderId]);

  async function doAction(action: string) {
    try {
      await api.post(`/api/cj-ebay-uk/orders/${orderId}/${action}`);
      const r = await api.get<{ ok: boolean; order: Order }>(`/api/cj-ebay-uk/orders/${orderId}`);
      if (r.data?.ok) setOrder(r.data.order);
    } catch (e) {
      alert(`${action} error: ${(e as Error).message}`);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading UK order…</p>;
  if (!order) return <p className="text-sm text-red-600">Order not found.</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">eBay UK Order: {order.ebayOrderId}</p>
            {order.cjOrderId && <p className="text-xs text-slate-400 mt-0.5">CJ Order: {order.cjOrderId}</p>}
            {order.totalGbp != null && <p className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-1">£{Number(order.totalGbp).toFixed(2)}</p>}
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            {order.status}
          </span>
        </div>

        {order.paymentBlockReason && (
          <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <p className="text-sm text-amber-800 dark:text-amber-200">Payment blocked: {order.paymentBlockReason}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {['VALIDATED', 'CJ_ORDER_CREATED'].includes(order.status) && (
            <button onClick={() => doAction('place')} className="px-3 py-1.5 rounded border border-indigo-400 text-indigo-700 dark:text-indigo-300 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20">Place CJ Order</button>
          )}
          {order.status === 'CJ_ORDER_CREATED' && (
            <button onClick={() => doAction('confirm')} className="px-3 py-1.5 rounded border border-blue-400 text-blue-700 dark:text-blue-300 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20">Confirm</button>
          )}
          {order.status === 'CJ_ORDER_CONFIRMED' && (
            <button onClick={() => doAction('pay')} className="px-3 py-1.5 rounded border border-green-400 text-green-700 dark:text-green-300 text-sm hover:bg-green-50 dark:hover:bg-green-900/20">Pay CJ</button>
          )}
          {['CJ_PAYMENT_COMPLETED', 'CJ_SHIPPED'].includes(order.status) && (
            <button onClick={() => doAction('sync-tracking')} className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">Sync Tracking</button>
          )}
        </div>
      </div>

      {order.tracking && order.tracking.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tracking</p>
          {order.tracking.map((t, i) => (
            <div key={i} className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-mono">{t.trackingNumber}</span>
              {t.carrierCode && <span className="ml-2 text-slate-400">{t.carrierCode}</span>}
              {t.trackingUrl && <a href={t.trackingUrl} target="_blank" rel="noreferrer" className="ml-2 text-blue-600 hover:underline">Track →</a>}
            </div>
          ))}
        </div>
      )}

      {order.events && order.events.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Timeline</p>
          <div className="space-y-1">
            {order.events.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono text-slate-400">{new Date(ev.at).toLocaleString()}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{ev.step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
