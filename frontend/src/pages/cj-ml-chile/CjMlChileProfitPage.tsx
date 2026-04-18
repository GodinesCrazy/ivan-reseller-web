import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfitKpis = {
  grossRevenueCLP: number;
  grossRevenueUsd: number;
  estimatedCjCostUsd: number;
  estimatedGrossProfitUsd: number;
  estimatedGrossProfitCLP: number;
  estimatedAvgMarginPct: number | null;
  fxRateCLPperUSD: number | null;
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  attentionOrders: number;
  paymentBlockedOrders: number;
  totalClaims: number;
  activeClaims: number;
  refundedAmountCLP: number;
  listingsActive: number;
  dataNote: string;
};

type OrderRow = {
  orderId: string;
  mlOrderId: string;
  status: string;
  totalCLP: number | null;
  totalUsd: number | null;
  estimatedMarginPct: number | null;
  estimatedProfitUsd: number | null;
  estimatedProfitCLP: number | null;
  estimatedCjCostUsd: number | null;
  hasClaim: boolean;
  claimStatus: string | null;
  refundAmountCLP: number | null;
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
  CJ_ORDER_CREATED: 'Orden CJ', CJ_ORDER_CONFIRMED: 'Confirmada',
  CJ_PAYMENT_PENDING: 'Pago pendiente', CJ_PAYMENT_COMPLETED: 'Pago OK',
  CJ_FULFILLING: 'Fulfillment', CJ_SHIPPED: 'Enviada',
  TRACKING_ON_ML: 'Tracking ML', COMPLETED: 'Completada',
  FAILED: 'Fallida', NEEDS_MANUAL: 'Manual',
  SUPPLIER_PAYMENT_BLOCKED: 'Pago bloqueado',
};

function clp(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

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
  return new Date(iso).toLocaleDateString('es-CL', { month: 'short', day: 'numeric', year: 'numeric' });
}

function axiosMsg(e: unknown, fb: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
    TRACKING_ON_ML: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    CJ_FULFILLING: 'bg-teal-100 text-teal-700',
    CJ_SHIPPED: 'bg-violet-100 text-violet-700',
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

export default function CjMlChileProfitPage() {
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [fxRate, setFxRate] = useState<{ rate: number; timestamp: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('mode', 'full');
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = `?${params.toString()}`;
      const [profitRes, fxRes] = await Promise.all([
        api.get<{ ok: boolean } & ProfitData>(`/api/cj-ml-chile/profit${qs}`),
        api.get<{ rate: number; timestamp: string }>('/api/cj-ml-chile/fx/rate').catch(() => null),
      ]);
      setData({ kpis: profitRes.data.kpis, orders: profitRes.data.orders, period: profitRes.data.period });
      if (fxRes) setFxRate({ rate: fxRes.data.rate, timestamp: fxRes.data.timestamp });
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
    return o.mlOrderId.toLowerCase().includes(q) || o.status.toLowerCase().includes(q);
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
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Finanzas CJ → ML Chile</h1>
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

      {/* FX rate banner */}
      {fxRate && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Tasa FX actual:</span>
          <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">1 USD = {fxRate.rate.toFixed(0)} CLP</span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto">{new Date(fxRate.timestamp).toLocaleTimeString('es-CL')}</span>
        </div>
      )}

      {/* Nota de honestidad */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
        <span className="font-medium">Datos estimados — </span>{kpis.dataNote}
      </div>

      {/* KPIs financieros principales - dual currency */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Ingresos brutos (CLP)" value={clp(kpis.grossRevenueCLP)} color="text-emerald-600 dark:text-emerald-400" />
        <KpiCard label="Ingresos brutos (USD)" value={usd(kpis.grossRevenueUsd)} sub="Convertido con FX" />
        <KpiCard label="Costo CJ (est.)" value={usd(kpis.estimatedCjCostUsd)} color="text-slate-700 dark:text-slate-200" />
        <KpiCard label="Utilidad bruta (CLP)" value={clp(kpis.estimatedGrossProfitCLP)} color={kpis.estimatedGrossProfitUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
        <KpiCard label="Margen promedio" value={pct(kpis.estimatedAvgMarginPct)} />
      </div>

      {/* KPIs operativos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total órdenes" value={String(kpis.totalOrders)} />
        <KpiCard label="Completadas" value={String(kpis.completedOrders)} color="text-emerald-600 dark:text-emerald-400" />
        <KpiCard label="Activas" value={String(kpis.activeOrders)} color="text-blue-600 dark:text-blue-400" />
        <KpiCard label="Requieren atención" value={String(kpis.attentionOrders)} color={kpis.attentionOrders > 0 ? 'text-orange-600 dark:text-orange-400' : undefined} />
        <KpiCard label="Pago bloqueado" value={String(kpis.paymentBlockedOrders)} color={kpis.paymentBlockedOrders > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
        <KpiCard label="Listings activos" value={String(kpis.listingsActive)} color="text-sky-600 dark:text-sky-400" />
      </div>

      {/* Nota modelo financiero Chile */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-700 dark:text-slate-300">Modelo financiero ML Chile</p>
        <p>• IVA 19%: incluido en el costo aterrizado (producto + envío).</p>
        <p>• Fee ML: 12% estándar sobre precio venta (variable por categoría).</p>
        <p>• Fee Mercado Pago: 5.18% sobre precio venta.</p>
        <p>• FX: tasa obtenida de servicio externo con TTL 1h. Se persiste con cada evaluación.</p>
        <p>• Montos CLP calculados con tasa FX actual. Montos USD basados en evaluación original.</p>
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
            placeholder="Buscar por ML ID o estado…"
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
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">ML Order</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Estado</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Total CLP</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Total USD</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Costo CJ (est.)</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Utilidad (est.)</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Margen</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Reclamo</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Actualizada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.map((o) => {
                  const isLoss = o.estimatedProfitUsd != null && o.estimatedProfitUsd < 0;
                  return (
                    <tr key={o.orderId} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${isLoss ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {o.mlOrderId}
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-2.5 text-right font-medium text-emerald-700 dark:text-emerald-300">{clp(o.totalCLP)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{usd(o.totalUsd)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{usd(o.estimatedCjCostUsd)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${isLoss ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {usd(o.estimatedProfitUsd)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">
                        {o.estimatedMarginPct != null ? `${(o.estimatedMarginPct * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {o.hasClaim ? (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            {o.claimStatus ?? 'RECLAMO'}
                            {o.refundAmountCLP != null && ` · ${clp(o.refundAmountCLP)}`}
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
