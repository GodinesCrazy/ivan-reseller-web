import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const ATTENTION_STATUSES = new Set(['FAILED', 'NEEDS_MANUAL', 'DETECTED', 'SUPPLIER_PAYMENT_BLOCKED']);
const ACTIVE_STATUSES = new Set([
  'VALIDATED', 'CJ_ORDER_PLACING', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMED',
  'CJ_PAYMENT_PENDING', 'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_ML',
]);

const NEXT_STEP: Record<string, string> = {
  DETECTED:                  'Validar datos ML',
  VALIDATED:                 'Ordenar en CJ',
  CJ_ORDER_PLACING:          'Esperando CJ',
  CJ_ORDER_CREATED:          'Confirmar con CJ',
  CJ_ORDER_CONFIRMED:        'Pagar balance CJ',
  CJ_PAYMENT_PENDING:        'Procesando pago',
  CJ_PAYMENT_COMPLETED:      'Esperando fulfillment',
  CJ_FULFILLING:             'CJ preparando envío',
  CJ_SHIPPED:                'Sincronizar tracking',
  TRACKING_ON_ML:             'Tracking en ML',
  COMPLETED:                 '—',
  FAILED:                    'Revisar error',
  NEEDS_MANUAL:              'Intervención requerida',
  SUPPLIER_PAYMENT_BLOCKED:  'Recargar balance CJ',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Order {
  id: string;
  mlOrderId: string;
  status: string;
  totalCLP: string | null;
  totalUsd: string | null;
  currency: string;
  cjOrderId: string | null;
  createdAt: string;
  lastError: string | null;
  listing: { mlListingId: string | null; product: { title: string } } | null;
  events: Array<{ id: string; step: string; message: string | null; createdAt: string }>;
  tracking: { trackingNumber: string | null; carrier: string | null; status: string | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clpFormat(n: string | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n));
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

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  VALIDATED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  CJ_ORDER_PLACING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  CJ_ORDER_CREATED: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  CJ_ORDER_CONFIRMED: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  CJ_PAYMENT_PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  CJ_PAYMENT_COMPLETED: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  CJ_FULFILLING: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  CJ_SHIPPED: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  TRACKING_ON_ML: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  COMPLETED: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  NEEDS_MANUAL: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  SUPPLIER_PAYMENT_BLOCKED: 'bg-red-200 dark:bg-red-900/40 text-red-800 dark:text-red-200',
};

const STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Detectada', VALIDATED: 'Validada',
  CJ_ORDER_PLACING: 'Creando...', CJ_ORDER_CREATED: 'Orden CJ',
  CJ_ORDER_CONFIRMED: 'Confirmada', CJ_PAYMENT_PENDING: 'Pago pendiente',
  CJ_PAYMENT_COMPLETED: 'Pago OK', CJ_FULFILLING: 'Fulfillment',
  CJ_SHIPPED: 'Enviada', TRACKING_ON_ML: 'Tracking ML',
  COMPLETED: 'Completada', FAILED: 'Fallida',
  NEEDS_MANUAL: 'Manual', SUPPLIER_PAYMENT_BLOCKED: 'Pago bloqueado',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjMlChileOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAttention, setFilterAttention] = useState(false);
  const [importId, setImportId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; orders: Order[] }>('/api/cj-ml-chile/orders');
      setOrders(res.data.orders ?? []);
    } catch (e) {
      setError(axiosMsg(e, 'Error cargando órdenes'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function importOrder() {
    if (!importId.trim()) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await api.post('/api/cj-ml-chile/orders/import', { mlOrderId: importId.trim() });
      setImportMsg(r.data.alreadyImported ? 'Orden ya importada' : 'Orden importada ✓');
      setImportId('');
      void load();
    } catch (e) {
      setImportMsg(axiosMsg(e, 'Error importando'));
    } finally {
      setImporting(false);
    }
  }

  async function doAction(orderId: string, action: string, label: string) {
    setBusyId(orderId);
    setActionMsg(null);
    try {
      await api.post(`/api/cj-ml-chile/orders/${orderId}/${action}`);
      setActionMsg({ id: orderId, text: `${label} ✓`, ok: true });
      void load();
    } catch (e) {
      setActionMsg({ id: orderId, text: axiosMsg(e, `Error: ${label}`), ok: false });
    } finally {
      setBusyId(null);
    }
  }

  const filtered = orders.filter((o) => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    if (filterAttention && !ATTENTION_STATUSES.has(o.status)) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.mlOrderId.toLowerCase().includes(q) || (o.listing?.product.title ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const kpis = {
    total: orders.length,
    active: orders.filter((o) => ACTIVE_STATUSES.has(o.status)).length,
    attention: orders.filter((o) => ATTENTION_STATUSES.has(o.status)).length,
    completed: orders.filter((o) => o.status === 'COMPLETED').length,
  };

  const statusCounts: Record<string, number> = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-500 text-sm">Cargando órdenes…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-5 text-red-700 dark:text-red-300 text-sm">
        {error}
        <button onClick={() => void load()} className="ml-3 underline text-xs">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Órdenes CJ → ML Chile</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Gestión postventa — importa, opera y hace seguimiento del ciclo completo de cada venta.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total órdenes', value: kpis.total, tone: 'slate' as const },
          { label: 'En progreso', value: kpis.active, tone: kpis.active > 0 ? 'blue' as const : 'slate' as const },
          { label: 'Requieren atención', value: kpis.attention, tone: kpis.attention > 0 ? 'amber' as const : 'slate' as const },
          { label: 'Completadas', value: kpis.completed, tone: kpis.completed > 0 ? 'emerald' as const : 'slate' as const },
        ].map(({ label, value, tone }) => (
          <div
            key={label}
            className={`rounded-xl border p-3 ${
              tone === 'blue' ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-900/10'
              : tone === 'amber' ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-900/10'
              : tone === 'emerald' ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40'
            }`}
          >
            <p className={`text-2xl font-bold tabular-nums ${
              tone === 'blue' ? 'text-blue-700 dark:text-blue-300'
              : tone === 'amber' ? 'text-amber-700 dark:text-amber-300'
              : tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-900 dark:text-white'
            }`}>{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Import */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 space-y-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Importar orden por ID</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={importId}
            onChange={(e) => setImportId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && importOrder()}
            placeholder="ID orden ML Chile (ej: 1234567890)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <button
            type="button"
            onClick={importOrder}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importando…' : 'Importar'}
          </button>
        </div>
        {importMsg && <p className="text-sm text-slate-600 dark:text-slate-400">{importMsg}</p>}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Webhook URL: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">/api/cj-ml-chile/webhooks/ml</code>
        </p>
      </div>

      {/* Filters (with attention toggle) */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setFilterAttention(false); }}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
        >
          <option value="ALL">Todos los estados ({orders.length})</option>
          {['DETECTED', 'VALIDATED', 'CJ_ORDER_CREATED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_ML', 'COMPLETED', 'FAILED', 'NEEDS_MANUAL', 'SUPPLIER_PAYMENT_BLOCKED'].map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}{statusCounts[s] ? ` (${statusCounts[s]})` : ''}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => { setFilterAttention((v) => !v); setStatusFilter('ALL'); }}
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por ID ML o producto…"
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
        />

        {(statusFilter !== 'ALL' || filterAttention || search.trim()) && (
          <button
            type="button"
            onClick={() => { setStatusFilter('ALL'); setFilterAttention(false); setSearch(''); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Orders table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/30 px-5 py-10 text-center">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {orders.length === 0
              ? 'Sin órdenes. Importa un ID de orden ML Chile o configura el webhook.'
              : 'Sin resultados para los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">ML Order</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Estado</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Producto</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Total</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">CJ Order</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Tracking</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Próximo paso</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Fecha</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((o) => (
                  <tr key={o.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                    o.status === 'FAILED' || o.status === 'NEEDS_MANUAL' ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                  }`}>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/cj-ml-chile/orders/${o.id}`)}
                        className="font-mono text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        {o.mlOrderId}
                      </button>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <span className="text-slate-700 dark:text-slate-300 line-clamp-1">
                        {o.listing?.product.title ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{clpFormat(o.totalCLP)}</span>
                      {o.totalUsd && <span className="text-slate-400 ml-1">(${Number(o.totalUsd).toFixed(2)})</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400">
                      {o.cjOrderId ? o.cjOrderId.slice(0, 12) + '…' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {o.tracking?.trackingNumber ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {NEXT_STEP[o.status] ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {fmtDate(o.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => doAction(o.id, 'fetch-ml', 'Fetch')}
                          disabled={busyId === o.id}
                          className="text-[10px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                        >
                          {busyId === o.id ? '…' : 'Fetch ML'}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/cj-ml-chile/orders/${o.id}`)}
                          className="text-[10px] px-2 py-1 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        >
                          Detalle
                        </button>
                      </div>
                      {actionMsg?.id === o.id && (
                        <p className={`text-[10px] mt-1 ${actionMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                          {actionMsg.text}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
