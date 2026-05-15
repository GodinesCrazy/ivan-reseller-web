import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import {
  ActionPriorityBand,
  CommercialMetricCard,
  CommercialPageHeader,
  CycleNarrativeStrip,
  RiskActionQueue,
} from './components/CommercialCockpit';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfitKpis = {
  totalRevenueUsd: number;
  totalCjCostUsd: number;
  totalFeesUsd: number;
  totalProfitUsd: number;
  snapshotCount: number;
  totalOrders: number;
  completedOrders: number;
  openOrders: number;
  failedOrders: number;
  dataNote: string;
};

type Snapshot = {
  id: number;
  snapshotDate: string;
  estimatedRevenueUsd: number;
  estimatedCjCostUsd: number;
  estimatedFeesUsd: number;
  estimatedProfitUsd: number;
  orderCount: number;
};

type OrderSummary = {
  id: string;
  shopifyOrderId: string;
  status: string;
  totalUsd: number | null;
  lastError: string | null;
  updatedAt: string;
};

type ProfitData = {
  kpis: ProfitKpis;
  snapshots: Snapshot[];
  orders: OrderSummary[];
  period: { from: string | null; to: string | null };
};

type PriceRisk = {
  ok: boolean;
  generatedAt: string;
  totals: {
    listings: number;
    protect: number;
    reprice: number;
    pause: number;
    review: number;
    keep: number;
  };
  items: Array<{
    listingId: number;
    title: string;
    action: 'KEEP' | 'REVIEW' | 'REPRICE' | 'PAUSE';
    reason: string;
    listedPriceUsd: number;
    currentSupplierCostUsd: number | null;
    currentShippingUsd: number | null;
    currentNetMarginPct: number | null;
    publishedNetMarginPct: number | null;
  }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function axiosMsg(e: unknown, fb: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Default date range: last 30 days
function defaultFrom() { return new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10); }
function defaultTo()   { return new Date().toISOString().slice(0, 10); }

export default function CjShopifyUsaProfitPage() {
  const [data, setData]     = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [from, setFrom]     = useState(defaultFrom());
  const [to, setTo]         = useState(defaultTo());
  const [priceRisk, setPriceRisk] = useState<PriceRisk | null>(null);
  const [refreshingCosts, setRefreshingCosts] = useState(false);

  const load = useCallback(async (f = from, t = to) => {
    setError(null);
    setLoading(true);
    try {
      const [res, riskRes] = await Promise.all([
        api.get<{ ok: boolean } & ProfitData>('/api/cj-shopify-usa/profit', {
          params: { from: f, to: t },
        }),
        api.get<PriceRisk>('/api/cj-shopify-usa/profit/price-risk'),
      ]);
      if (res.data?.ok) {
        setData({ kpis: res.data.kpis, snapshots: res.data.snapshots, orders: res.data.orders, period: res.data.period });
      }
      if (riskRes.data?.ok) setPriceRisk(riskRes.data);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar los datos de profit.'));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  async function refreshCosts() {
    setRefreshingCosts(true);
    setError(null);
    try {
      await api.post('/api/cj-shopify-usa/profit/refresh-costs');
      await load(from, to);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo refrescar costos CJ y Profit Guard.'));
    } finally {
      setRefreshingCosts(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando datos financieros…</p>;

  if (error) return (
    <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
      {error}
    </div>
  );

  if (!data) return null;

  const { kpis, snapshots, orders } = data;

  const profitColor = kpis.totalProfitUsd >= 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-6">
      <CommercialPageHeader
        title="Profit Guard comercial"
        description="Lee margen operativo, costos CJ, fees Shopify/pago y cola de acciones para no vender con perdida."
      />

      <ActionPriorityBand
        tone={(priceRisk?.totals.pause ?? 0) > 0 ? 'rose' : kpis.totalProfitUsd < 0 || kpis.failedOrders > 0 || (priceRisk?.totals.protect ?? 0) > 0 ? 'amber' : kpis.totalOrders > 0 ? 'emerald' : 'cyan'}
        title={(priceRisk?.totals.pause ?? 0) > 0 ? 'Hay productos con riesgo de precio publicado: pausar o repricing antes de escalar.' : kpis.totalProfitUsd < 0 ? 'El periodo muestra perdida estimada: revisa precio y shipping.' : kpis.failedOrders > 0 ? 'Hay ordenes fallidas que pueden esconder costo real.' : 'Margen operativo bajo control con los datos actuales.'}
        description="Compara precio publicado contra costo CJ/shipping actual y evita vender con perdida por alzas de proveedor."
        primaryLabel="Aplicar periodo"
        onPrimary={() => void load(from, to)}
        secondaryLabel={refreshingCosts ? 'Refrescando...' : 'Refrescar costos'}
        onSecondary={() => void refreshCosts()}
        disabled={refreshingCosts}
        meta={[
          `profit ${usd(kpis.totalProfitUsd)}`,
          `${kpis.totalOrders} ordenes`,
          `${priceRisk?.totals.protect ?? 0} proteger`,
          `${priceRisk?.totals.pause ?? 0} pausar`,
        ]}
      />

      <RiskActionQueue
        title="Cola de decisiones de margen"
        items={[
          ...(kpis.totalProfitUsd < 0 ? [{ id: 'raise-price', title: 'Subir precio o pausar productos con perdida', detail: 'El profit neto estimado del periodo esta bajo cero.', tone: 'rose' as const }] : []),
          ...((priceRisk?.totals.reprice ?? 0) > 0 ? [{ id: 'reprice', title: 'Recalcular precios publicados', detail: 'Costo CJ o shipping actual cambiaron respecto a la publicacion.', tone: 'amber' as const, actionLabel: 'Refrescar costos', onAction: () => void refreshCosts() }] : []),
          ...((priceRisk?.totals.pause ?? 0) > 0 ? [{ id: 'pause-risk', title: 'Pausar productos con margen inseguro', detail: 'Profit Guard detecta riesgo real si se vende al precio publicado.', tone: 'rose' as const }] : []),
          ...(kpis.failedOrders > 0 ? [{ id: 'failed', title: 'Revisar ordenes fallidas', detail: 'Pueden indicar costo real, pago CJ o tracking incompleto.', tone: 'amber' as const }] : []),
          ...(kpis.openOrders > 0 ? [{ id: 'open', title: 'Verificar margen de ordenes abiertas', detail: 'No escalar productos hasta confirmar costo final.', tone: 'cyan' as const }] : []),
        ]}
        emptyLabel="Sin decisiones urgentes de margen en este periodo."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommercialMetricCard label="Revenue" value={usd(kpis.totalRevenueUsd)} detail="ingreso estimado" tone="cyan" />
        <CommercialMetricCard label="Costo CJ" value={usd(kpis.totalCjCostUsd)} detail="producto + envio" tone="amber" />
        <CommercialMetricCard label="Fees" value={usd(kpis.totalFeesUsd)} detail="Shopify/pagos estimados" tone="violet" />
        <CommercialMetricCard label="Riesgo precio" value={priceRisk?.totals.protect ?? 0} detail={`${priceRisk?.totals.reprice ?? 0} repricing · ${priceRisk?.totals.pause ?? 0} pausar`} tone={(priceRisk?.totals.protect ?? 0) > 0 ? 'amber' : 'emerald'} />
      </div>

      <CycleNarrativeStrip active="optimize" />

      {priceRisk && (
        <section className="rounded-lg border border-amber-500/25 bg-slate-950/70 p-4 text-slate-100">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">Precio publicado vs costo actual</p>
              <h3 className="mt-1 text-base font-bold text-white">Cola de protección de margen por producto</h3>
              <p className="mt-1 text-xs text-slate-400">Compara margen al publicar contra costo CJ y shipping actual; no promete fee liquidado, es estimación operativa.</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <span className="rounded border border-emerald-500/25 bg-emerald-950/20 p-2 text-emerald-100">Mantener <b>{priceRisk.totals.keep}</b></span>
              <span className="rounded border border-amber-500/25 bg-amber-950/20 p-2 text-amber-100">Reprice <b>{priceRisk.totals.reprice}</b></span>
              <span className="rounded border border-rose-500/25 bg-rose-950/20 p-2 text-rose-100">Pausar <b>{priceRisk.totals.pause}</b></span>
              <span className="rounded border border-cyan-500/25 bg-cyan-950/20 p-2 text-cyan-100">Revisar <b>{priceRisk.totals.review}</b></span>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded border border-slate-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Acción</th>
                  <th className="px-3 py-2">Precio</th>
                  <th className="px-3 py-2">Costo actual</th>
                  <th className="px-3 py-2">Shipping</th>
                  <th className="px-3 py-2">Margen actual</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {priceRisk.items.slice(0, 10).map((item) => (
                  <tr key={item.listingId} className="border-t border-slate-800">
                    <td className="max-w-xs truncate px-3 py-2 text-slate-100" title={item.title}>{item.title}</td>
                    <td className="px-3 py-2 font-bold text-cyan-200">{item.action}</td>
                    <td className="px-3 py-2 tabular-nums">{usd(item.listedPriceUsd)}</td>
                    <td className="px-3 py-2 tabular-nums">{usd(item.currentSupplierCostUsd)}</td>
                    <td className="px-3 py-2 tabular-nums">{usd(item.currentShippingUsd)}</td>
                    <td className="px-3 py-2 tabular-nums">{item.currentNetMarginPct == null ? 'N/D' : `${item.currentNetMarginPct.toFixed(1)}%`}</td>
                    <td className="max-w-sm px-3 py-2 text-slate-400">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500 dark:text-slate-400 font-medium">Desde</label>
          <input type="date" value={from} max={to} title="Fecha inicio" placeholder="Fecha inicio"
            onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500 dark:text-slate-400 font-medium">Hasta</label>
          <input type="date" value={to} min={from} max={defaultTo()} title="Fecha fin" placeholder="Fecha fin"
            onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm" />
        </div>
        <button type="button" onClick={() => void load(from, to)} disabled={loading}
          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50">
          {loading ? 'Cargando…' : 'Aplicar'}
        </button>
        <button type="button" onClick={() => { setFrom(defaultFrom()); setTo(defaultTo()); void load(defaultFrom(), defaultTo()); }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
          Últimos 30 días
        </button>
      </div>

      {/* Data note */}
      {kpis.dataNote && (
        <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20 px-4 py-3 text-sm text-sky-800 dark:text-sky-200">
          {kpis.dataNote}
        </div>
      )}

      {/* KPI grid */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Resumen financiero</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Ingresos estimados', value: usd(kpis.totalRevenueUsd), cls: 'text-slate-900 dark:text-slate-100' },
            { label: 'Costo CJ estimado',  value: usd(kpis.totalCjCostUsd),  cls: 'text-red-700 dark:text-red-400' },
            { label: 'Fees estimados',     value: usd(kpis.totalFeesUsd),    cls: 'text-amber-700 dark:text-amber-400' },
            { label: 'Profit neto estimado', value: usd(kpis.totalProfitUsd), cls: profitColor },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              <p className={`text-xl font-semibold tabular-nums mt-1 ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Orders summary */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Órdenes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',       val: kpis.totalOrders,     cls: 'text-slate-900 dark:text-slate-100' },
            { label: 'Completadas', val: kpis.completedOrders,  cls: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Abiertas',    val: kpis.openOrders,       cls: 'text-amber-600 dark:text-amber-400' },
            { label: 'Fallidas',    val: kpis.failedOrders,     cls: 'text-red-600 dark:text-red-400' },
          ].map(({ label, val, cls }) => (
            <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              <p className={`text-2xl font-semibold tabular-nums mt-1 ${cls}`}>{val}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Daily snapshots table */}
      {snapshots.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Snapshots diarios ({snapshots.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Órdenes</th>
                  <th className="px-3 py-2">Ingresos</th>
                  <th className="px-3 py-2">Costo CJ</th>
                  <th className="px-3 py-2">Fees</th>
                  <th className="px-3 py-2">Profit</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 text-xs">{fmtDate(s.snapshotDate)}</td>
                    <td className="px-3 py-2 tabular-nums text-xs">{s.orderCount ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums text-xs">{usd(s.estimatedRevenueUsd)}</td>
                    <td className="px-3 py-2 tabular-nums text-xs text-red-600 dark:text-red-400">{usd(s.estimatedCjCostUsd)}</td>
                    <td className="px-3 py-2 tabular-nums text-xs text-amber-600 dark:text-amber-400">{usd(s.estimatedFeesUsd)}</td>
                    <td className={`px-3 py-2 tabular-nums text-xs font-semibold ${s.estimatedProfitUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {usd(s.estimatedProfitUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent orders */}
      {orders.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Órdenes ({orders.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-left text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Shopify Order ID</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs">{o.shopifyOrderId}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`rounded px-2 py-0.5 font-medium ${
                        o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : o.status === 'FAILED' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs">{usd(o.totalUsd)}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {new Date(o.updatedAt).toLocaleString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {snapshots.length === 0 && orders.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-6 py-10 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Sin datos de profit aún. Los snapshots se generan al procesar órdenes completadas.
          </p>
        </div>
      )}
    </div>
  );
}
