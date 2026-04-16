import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfitKpis = {
  grossRevenueUsd: number;
  estimatedCjCostUsd: number;
  estimatedGrossProfitUsd: number;
  estimatedAvgMarginPct: number | null;
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  attentionOrders: number;
  paymentBlockedOrders: number;
  totalRefunds: number;
  activeRefunds: number;
  refundedAmountUsd: number;
  dataNote: string;
};

type OrderRow = {
  orderId: string;
  ebayOrderId: string;
  status: string;
  totalUsd: number | null;
  estimatedMarginPct: number | null;
  estimatedProfitUsd: number | null;
  estimatedCjCostUsd: number | null;
  hasRefund: boolean;
  refundStatus: string | null;
  refundAmountUsd: number | null;
  updatedAt: string;
};

type ProfitData = {
  kpis: ProfitKpis;
  orders: OrderRow[];
  period: { from: string | null; to: string | null };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Detectada', VALIDATED: 'Validada',
  CJ_ORDER_CREATED: 'Orden CJ', CJ_ORDER_CONFIRMING: 'Confirmando',
  CJ_PAYMENT_PENDING: 'Pago pendiente', CJ_PAYMENT_PROCESSING: 'Procesando pago',
  CJ_PAYMENT_COMPLETED: 'Pago OK', CJ_FULFILLING: 'En fulfillment',
  CJ_SHIPPED: 'Enviada', TRACKING_ON_EBAY: 'Tracking eBay',
  COMPLETED: 'Completada', FAILED: 'Fallida',
  NEEDS_MANUAL: 'Manual', SUPPLIER_PAYMENT_BLOCKED: 'Pago bloqueado',
};

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function axiosMsg(e: unknown, fb: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</span>
      {sub && <span className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    TRACKING_ON_EBAY: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    CJ_FULFILLING: 'bg-teal-100 text-teal-700',
    CJ_SHIPPED: 'bg-cyan-100 text-cyan-700',
    FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    NEEDS_MANUAL: 'bg-orange-100 text-orange-700',
    SUPPLIER_PAYMENT_BLOCKED: 'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200',
  };
  const cls = colors[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjEbayProfitPage() {
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await api.get<{ ok: boolean } & ProfitData>(`/api/cj-ebay/profit${qs}`);
      setData({ kpis: res.data.kpis, orders: res.data.orders, period: res.data.period });
    } catch (e) {
      setError(axiosMsg(e, 'Error cargando datos financieros'));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const filteredOrders = (data?.orders ?? []).filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.ebayOrderId.toLowerCase().includes(q) || o.status.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400 text-sm">
        Cargando datos financieros…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-5 text-red-700 dark:text-red-300 text-sm">
        {error}
        <button onClick={() => void load()} className="ml-3 underline text-xs">Reintentar</button>
      </div>
    );
  }

  const { kpis } = data!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Finanzas CJ → eBay USA</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {data!.period.from
              ? `${fmtDate(data!.period.from)} — ${fmtDate(data!.period.to)}`
              : 'Sin órdenes en el período'}
          </p>
        </div>
        {/* Filtros de fecha */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-3 py-1.5"
            placeholder="Desde"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-3 py-1.5"
            placeholder="Hasta"
          />
          {(from || to) && (
            <button
              onClick={() => { setFrom(''); setTo(''); }}
              className="text-xs text-slate-500 dark:text-slate-400 underline"
            >Limpiar</button>
          )}
        </div>
      </div>

      {/* Nota de honestidad */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
        <span className="font-medium">Datos estimados — </span>{kpis.dataNote}
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard label="Ingresos brutos eBay" value={usd(kpis.grossRevenueUsd)} sub="Estimado (totalUsd órdenes activas)" color="text-emerald-600 dark:text-emerald-400" />
        <KpiCard label="Costo proveedor CJ (est.)" value={usd(kpis.estimatedCjCostUsd)} color="text-slate-700 dark:text-slate-200" />
        <KpiCard label="Utilidad bruta (est.)" value={usd(kpis.estimatedGrossProfitUsd)} color={kpis.estimatedGrossProfitUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
        <KpiCard label="Margen promedio (est.)" value={pct(kpis.estimatedAvgMarginPct)} />
      </div>

      {/* KPIs operativos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total órdenes" value={String(kpis.totalOrders)} />
        <KpiCard label="Completadas" value={String(kpis.completedOrders)} color="text-emerald-600 dark:text-emerald-400" />
        <KpiCard label="Activas" value={String(kpis.activeOrders)} color="text-blue-600 dark:text-blue-400" />
        <KpiCard label="Requieren atención" value={String(kpis.attentionOrders)} color={kpis.attentionOrders > 0 ? 'text-orange-600 dark:text-orange-400' : undefined} />
        <KpiCard label="Pago bloqueado" value={String(kpis.paymentBlockedOrders)} color={kpis.paymentBlockedOrders > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
        <KpiCard label="Refunds activos" value={String(kpis.activeRefunds)} sub={`Total: ${kpis.totalRefunds} | Devuelto: ${usd(kpis.refundedAmountUsd)}`} color={kpis.activeRefunds > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
      </div>

      {/* Tabla de órdenes */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Desglose por orden ({filteredOrders.length})
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por eBay ID o estado…"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-3 py-1.5 w-56"
          />
        </div>

        {filteredOrders.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {data!.orders.length === 0
              ? 'Sin órdenes en el período seleccionado.'
              : 'Sin resultados para la búsqueda.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">eBay Order</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Estado</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Total eBay</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Costo CJ (est.)</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Utilidad (est.)</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Margen</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Refund</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Actualizada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.map((o) => {
                  const isLoss = o.estimatedProfitUsd != null && o.estimatedProfitUsd < 0;
                  return (
                    <tr key={o.orderId} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${isLoss ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {o.ebayOrderId}
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-700 dark:text-slate-300">{usd(o.totalUsd)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{usd(o.estimatedCjCostUsd)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${isLoss ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {usd(o.estimatedProfitUsd)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">
                        {o.estimatedMarginPct != null ? `${(o.estimatedMarginPct * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {o.hasRefund ? (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            {o.refundStatus ?? 'REFUND'}
                            {o.refundAmountUsd != null && ` · ${usd(o.refundAmountUsd)}`}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {fmtDate(o.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
