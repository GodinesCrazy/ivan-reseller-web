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

  const load = useCallback(async (f = from, t = to) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean } & ProfitData>('/api/cj-shopify-usa/profit', {
        params: { from: f, to: t },
      });
      if (res.data?.ok) {
        setData({ kpis: res.data.kpis, snapshots: res.data.snapshots, orders: res.data.orders, period: res.data.period });
      }
    } catch (e) {
      setError(axiosMsg(e, 'No se pudieron cargar los datos de profit.'));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

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
        tone={kpis.totalProfitUsd < 0 || kpis.failedOrders > 0 ? 'amber' : kpis.totalOrders > 0 ? 'emerald' : 'cyan'}
        title={kpis.totalProfitUsd < 0 ? 'El periodo muestra perdida estimada: revisa precio y shipping.' : kpis.failedOrders > 0 ? 'Hay ordenes fallidas que pueden esconder costo real.' : 'Margen operativo bajo control con los datos actuales.'}
        description="Los valores son estimaciones operativas para decidir subir precio, pausar, revisar shipping o mantener."
        primaryLabel="Aplicar periodo"
        onPrimary={() => void load(from, to)}
        secondaryLabel="Store Products"
        onSecondary={() => window.location.assign('/cj-shopify-usa/listings')}
        meta={[
          `profit ${usd(kpis.totalProfitUsd)}`,
          `${kpis.totalOrders} ordenes`,
          `${kpis.openOrders} abiertas`,
          `${kpis.failedOrders} fallidas`,
        ]}
      />

      <RiskActionQueue
        title="Cola de decisiones de margen"
        items={[
          ...(kpis.totalProfitUsd < 0 ? [{ id: 'raise-price', title: 'Subir precio o pausar productos con perdida', detail: 'El profit neto estimado del periodo esta bajo cero.', tone: 'rose' as const }] : []),
          ...(kpis.failedOrders > 0 ? [{ id: 'failed', title: 'Revisar ordenes fallidas', detail: 'Pueden indicar costo real, pago CJ o tracking incompleto.', tone: 'amber' as const }] : []),
          ...(kpis.openOrders > 0 ? [{ id: 'open', title: 'Verificar margen de ordenes abiertas', detail: 'No escalar productos hasta confirmar costo final.', tone: 'cyan' as const }] : []),
        ]}
        emptyLabel="Sin decisiones urgentes de margen en este periodo."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommercialMetricCard label="Revenue" value={usd(kpis.totalRevenueUsd)} detail="ingreso estimado" tone="cyan" />
        <CommercialMetricCard label="Costo CJ" value={usd(kpis.totalCjCostUsd)} detail="producto + envio" tone="amber" />
        <CommercialMetricCard label="Fees" value={usd(kpis.totalFeesUsd)} detail="Shopify/pagos estimados" tone="violet" />
        <CommercialMetricCard label="Profit neto" value={usd(kpis.totalProfitUsd)} detail="estimado operativo" tone={kpis.totalProfitUsd >= 0 ? 'emerald' : 'rose'} />
      </div>

      <CycleNarrativeStrip active="optimize" />

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
