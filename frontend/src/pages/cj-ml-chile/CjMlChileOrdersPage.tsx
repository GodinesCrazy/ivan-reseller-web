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
  lastError: string | null;
  listing: { mlListingId: string | null; product: { title: string } } | null;
  events: Array<{ id: string; step: string; message: string | null; createdAt: string }>;
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

const STATUS_NEXT_STEP: Record<string, string> = {
  DETECTED: 'Usa "Fetch de ML" para traer datos reales de la orden',
  VALIDATED: 'Listo para iniciar fulfillment CJ',
  CJ_ORDER_CREATING: 'Creando orden en CJ…',
  CJ_ORDER_CREATED: 'Orden CJ creada. Confirmar y pagar.',
  CJ_PAYMENT_COMPLETED: 'Pago CJ procesado. Esperando fulfillment.',
  CJ_FULFILLING: 'CJ preparando envío.',
  CJ_SHIPPED: 'En tránsito. Sincronizar tracking.',
  TRACKING_ON_ML: 'Tracking publicado en ML. Esperando entrega.',
  COMPLETED: 'Orden completada.',
  FAILED: 'Error. Revisar y resolver manualmente.',
  NEEDS_MANUAL: 'Requiere intervención manual.',
  SUPPLIER_PAYMENT_BLOCKED: 'Pago a proveedor bloqueado. Revisar saldo CJ.',
};

export default function CjMlChileOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [fetchingMl, setFetchingMl] = useState<string | null>(null);
  const [fetchMsg, setFetchMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
      setImportMsg(r.data.alreadyImported ? 'Orden ya importada' : 'Orden importada — usa "Fetch de ML" para traer datos.');
      setImportId('');
      load();
    } catch (e: unknown) {
      setImportMsg((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e));
    } finally { setImporting(false); }
  }

  async function fetchFromMl(orderId: string) {
    setFetchingMl(orderId);
    setFetchMsg(null);
    try {
      const r = await api.post(`/api/cj-ml-chile/orders/${orderId}/fetch-ml`);
      const msg = `Datos ML: estado=${r.data.mlStatus ?? '?'}, total=${r.data.totalAmount ?? '?'} ${r.data.currencyId ?? 'CLP'}`;
      setFetchMsg({ id: orderId, msg, ok: true });
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e);
      setFetchMsg({ id: orderId, msg, ok: false });
    } finally { setFetchingMl(null); }
  }

  if (loading) return <div className="text-sm text-slate-500">Cargando órdenes…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Import */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Importar orden por ID</p>
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
            type="button"
            onClick={importOrder}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {importing ? 'Importando…' : 'Importar'}
          </button>
        </div>
        {importMsg && <p className="text-sm text-slate-600 dark:text-slate-400">{importMsg}</p>}
        <p className="text-xs text-slate-400">Webhook URL (para configurar en portal ML): <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">/api/cj-ml-chile/webhooks/ml</code></p>
      </div>

      <p className="text-sm text-slate-500">{orders.length} orden{orders.length !== 1 ? 'es' : ''}</p>

      {orders.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">Sin órdenes. Importa un ID de orden ML Chile o configura el webhook.</div>
      )}

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">ML Order: {o.mlOrderId}</p>
                {o.listing && <p className="text-xs text-slate-500 line-clamp-1">{o.listing.product.title}</p>}
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[o.status] ?? STATUS_COLORS.DETECTED}`}>{o.status}</span>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
              {o.totalCLP && <span>Total: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{clpFormat(o.totalCLP)}</span></span>}
              {o.totalUsd && <span>≈ ${Number(o.totalUsd).toFixed(2)} USD</span>}
              <span>{new Date(o.createdAt).toLocaleDateString('es-CL')}</span>
            </div>

            {STATUS_NEXT_STEP[o.status] && (
              <p className="text-xs text-slate-500 italic">{STATUS_NEXT_STEP[o.status]}</p>
            )}

            {o.lastError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{o.lastError}</p>
            )}

            {fetchMsg?.id === o.id && (
              <p className={`text-xs ${fetchMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{fetchMsg.msg}</p>
            )}

            {/* Timeline (últimos 3 eventos) */}
            {expanded === o.id && o.events.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Timeline</p>
                {o.events.map((ev) => (
                  <div key={ev.id} className="text-xs text-slate-500 flex gap-2">
                    <span className="text-slate-400">{new Date(ev.createdAt).toLocaleTimeString('es-CL')}</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">{ev.step}</span>
                    {ev.message && <span>{ev.message}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 flex-wrap pt-1">
              <button
                type="button"
                onClick={() => fetchFromMl(o.id)}
                disabled={fetchingMl === o.id}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {fetchingMl === o.id ? 'Cargando…' : 'Fetch de ML'}
              </button>
              {o.events.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {expanded === o.id ? 'Ocultar timeline' : `Timeline (${o.events.length})`}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
