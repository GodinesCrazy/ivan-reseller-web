import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';

type Order = {
  id: number;
  ebayOrderId: string;
  cjOrderId?: string;
  status: string;
  totalGbp?: number;
  updatedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  VALIDATED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  CJ_ORDER_CREATED: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  CJ_PAYMENT_COMPLETED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  COMPLETED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  SUPPLIER_PAYMENT_BLOCKED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  NEEDS_MANUAL: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

export default function CjEbayUkOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);

  function fetchOrders() {
    api.get<{ ok: boolean; orders: Order[] }>('/api/cj-ebay-uk/orders')
      .then((r) => { if (r.data?.ok) setOrders(r.data.orders); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchOrders(); }, []);

  async function importOrder() {
    if (!importId.trim()) return;
    setImporting(true);
    try {
      await api.post('/api/cj-ebay-uk/orders/import', { ebayOrderId: importId.trim() });
      setImportId('');
      fetchOrders();
    } catch (e) {
      alert(`Import error: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando órdenes UK…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={importId}
          onChange={(e) => setImportId(e.target.value)}
          placeholder="eBay UK order ID…"
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={importOrder}
          disabled={importing || !importId.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import UK Order'}
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-slate-500">No orders yet. Import a UK eBay order ID above.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link
              key={o.id}
              to={`/cj-ebay-uk/orders/${o.id}`}
              className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-blue-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{o.ebayOrderId}</p>
                  {o.cjOrderId && <p className="text-xs text-slate-400">CJ: {o.cjOrderId}</p>}
                  {o.totalGbp != null && (
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">£{Number(o.totalGbp).toFixed(2)}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[o.status] || STATUS_COLORS.DETECTED}`}>
                    {o.status}
                  </span>
                  <span className="text-xs text-slate-400">{new Date(o.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
