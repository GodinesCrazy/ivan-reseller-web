import { useEffect, useState } from 'react';
import { api } from '@/services/api';

interface Order {
  id: string;
  mlOrderId: string;
  status: string;
  totalCLP: string | null;
  totalUsd: string | null;
  currency: string;
  createdAt: string;
  listing: { mlListingId: string | null; product: { title: string } } | null;
}

function clpFormat(n: string | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n));
}

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  VALIDATED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  CJ_ORDER_CREATED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  CJ_PAYMENT_COMPLETED: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  CJ_FULFILLING: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  CJ_SHIPPED: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  TRACKING_ON_ML: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  COMPLETED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  NEEDS_MANUAL: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  SUPPLIER_PAYMENT_BLOCKED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

export default function CjMlChileOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const load = () => {
    api.get('/api/cj-ml-chile/orders')
      .then((r) => setOrders(r.data.orders ?? []))
      .catch((e) => setError(e?.response?.data?.message ?? e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function importOrder() {
    if (!importId.trim()) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await api.post('/api/cj-ml-chile/orders/import', { mlOrderId: importId.trim() });
      setImportMsg(r.data.alreadyImported ? 'Orden ya importada' : 'Orden importada');
      setImportId('');
      load();
    } catch (e: unknown) {
      setImportMsg((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setImporting(false); }
  }

  if (loading) return <div className="text-sm text-slate-500">Cargando órdenes…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Import */}
      <div className="flex gap-2">
        <input
          type="text"
          value={importId}
          onChange={(e) => setImportId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && importOrder()}
          placeholder="ID orden ML Chile (ej: 1234567890)"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <button
          onClick={importOrder}
          disabled={importing}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {importing ? 'Importando…' : 'Importar orden'}
        </button>
      </div>
      {importMsg && <p className="text-sm text-slate-600 dark:text-slate-400">{importMsg}</p>}

      <p className="text-sm text-slate-500">{orders.length} orden{orders.length !== 1 ? 'es' : ''}</p>

      {orders.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">Sin órdenes. Importa una orden ML Chile para comenzar el fulfillment.</div>
      )}

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Orden ML: {o.mlOrderId}</p>
                {o.listing && <p className="text-xs text-slate-500 line-clamp-1">{o.listing.product.title}</p>}
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[o.status] ?? STATUS_COLORS.DETECTED}`}>{o.status}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span>Total: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{clpFormat(o.totalCLP)}</span></span>
              {o.totalUsd && <span>≈ ${Number(o.totalUsd).toFixed(2)} USD</span>}
              <span>{new Date(o.createdAt).toLocaleDateString('es-CL')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
