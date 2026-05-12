import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { BarChart3, Loader2 } from 'lucide-react';

type OverviewCounts = {
  products: number;
  variants: number;
  evaluations: number;
  evaluationsApproved: number;
  evaluationsRejected: number;
  evaluationsPending: number;
  shippingQuotes: number;
  listings: number;
  listingsActive: number;
  orders: number;
  ordersOpen: number;
  ordersWithTracking: number;
  alertsOpen: number;
  profitSnapshots: number;
  tracesLast24h: number;
};

type SellingLimits = {
  listingLimit: number | null;
  amountLimitUsd: number | null;
  usedListings: number;
  usedAmountUsd: number;
  remainingListings: number | null;
  remainingAmountUsd: number | null;
  configured: boolean;
};

type ProfitKpis = {
  grossRevenueUsd: number;
  estimatedGrossProfitUsd: number;
  estimatedAvgMarginPct: number | null;
  totalOrders: number;
  attentionOrders: number;
  activeRefunds: number;
};

function apiError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const data = e.response.data as { message?: string; error?: string };
    return data.message || data.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export default function CjEbayAnalyticsPage() {
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [limits, setLimits] = useState<SellingLimits | null>(null);
  const [profit, setProfit] = useState<ProfitKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [overviewRes, profitRes] = await Promise.all([
          api.get<{ ok: boolean; counts: OverviewCounts; sellingLimits: SellingLimits }>('/api/cj-ebay/overview'),
          api.get<{ ok: boolean; kpis: ProfitKpis }>('/api/cj-ebay/profit'),
        ]);
        if (!cancelled) {
          setCounts(overviewRes.data.counts);
          setLimits(overviewRes.data.sellingLimits);
          setProfit(profitRes.data.kpis);
        }
      } catch (e) {
        if (!cancelled) setError(apiError(e, 'No se pudo cargar analitica CJ-eBay.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando analitica CJ-eBay...
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{error}</div>;
  }

  if (!counts || !limits || !profit) return <p className="text-sm text-slate-500">Sin datos.</p>;

  const approvalRate = counts.evaluations > 0 ? (counts.evaluationsApproved / counts.evaluations) * 100 : null;
  const activeListingRate = counts.listings > 0 ? (counts.listingsActive / counts.listings) * 100 : null;
  const quotaUsedPct = limits.listingLimit ? (limits.usedListings / limits.listingLimit) * 100 : null;
  const amountUsedPct = limits.amountLimitUsd ? (limits.usedAmountUsd / limits.amountLimitUsd) * 100 : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-slate-500" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Analitica CJ → eBay USA</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Conversion del pipeline, cuotas de cuenta y salud financiera.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Aprobacion evaluaciones" value={pct(approvalRate)} hint={`${counts.evaluationsApproved}/${counts.evaluations} aprobadas`} />
        <Metric label="Listings activos" value={pct(activeListingRate)} hint={`${counts.listingsActive}/${counts.listings} activos`} />
        <Metric label="Margen promedio" value={pct(profit.estimatedAvgMarginPct)} hint={`${usd(profit.estimatedGrossProfitUsd)} utilidad estimada`} />
        <Metric label="Ordenes atencion" value={String(profit.attentionOrders)} hint={`${profit.totalOrders} ordenes totales`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cuota mensual eBay</h2>
          <div className="mt-4 space-y-3">
            <Metric
              label="Publicaciones usadas"
              value={limits.listingLimit ? `${limits.usedListings}/${limits.listingLimit}` : String(limits.usedListings)}
              hint={limits.remainingListings == null ? 'Sin limite configurado' : `${limits.remainingListings} disponibles`}
            />
            <Metric
              label="Monto usado"
              value={limits.amountLimitUsd ? `${usd(limits.usedAmountUsd)} / ${usd(limits.amountLimitUsd)}` : usd(limits.usedAmountUsd)}
              hint={limits.remainingAmountUsd == null ? 'Sin limite configurado' : `${usd(limits.remainingAmountUsd)} disponibles`}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label="Uso publicaciones" value={pct(quotaUsedPct)} />
              <Metric label="Uso monto" value={pct(amountUsedPct)} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Salud operativa</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="Alertas abiertas" value={String(counts.alertsOpen)} />
            <Metric label="Trazas 24h" value={String(counts.tracesLast24h)} />
            <Metric label="Cotizaciones guardadas" value={String(counts.shippingQuotes)} />
            <Metric label="Refunds activos" value={String(profit.activeRefunds)} />
          </div>
        </section>
      </div>
    </div>
  );
}
