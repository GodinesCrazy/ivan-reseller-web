import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Loader2, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react';

type OptimizerAction = {
  listingId: number;
  title: string;
  status: string;
  currentPriceUsd: number | null;
  projectedMarginPct: number | null;
  projectedProfitUsd: number | null;
  monthlyAmountExposureUsd: number;
  severity: 'info' | 'warning' | 'critical';
  recommendation: string;
  reason: string;
};

type OptimizerSummary = {
  totalListings: number;
  activeListings: number;
  draftListings: number;
  blockedListings: number;
  quotaConfigured: boolean;
  usedListings: number;
  listingLimit: number | null;
  usedAmountUsd: number;
  amountLimitUsd: number | null;
  remainingListings: number | null;
  remainingAmountUsd: number | null;
};

type OptimizerResponse = {
  ok: boolean;
  summary: OptimizerSummary;
  actions: OptimizerAction[];
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

function severityClass(severity: OptimizerAction['severity']): string {
  if (severity === 'critical') return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200';
  return 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
}

export default function CjEbayStoreOptimizerPage() {
  const [data, setData] = useState<OptimizerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<OptimizerResponse>('/api/cj-ebay/store-optimizer');
      setData(res.data);
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar el optimizador eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analizando tienda eBay...
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{error}</div>;
  }

  const summary = data?.summary;
  const actions = data?.actions ?? [];

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-500/10 p-3 text-amber-200">
                <SlidersHorizontal className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Store Optimizer eBay</h1>
                <p className="text-sm text-slate-400">
                  Control de cuota, margen, policy blockers y riesgo de precio publicado para listings eBay.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Recalcular
            </button>
          </div>

          {summary && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroMetric label="Listings activos" value={String(summary.activeListings)} detail={`${summary.totalListings} totales · ${summary.draftListings} drafts`} />
              <HeroMetric label="Bloqueados" value={String(summary.blockedListings)} detail="Policy/account/reconcile" />
              <HeroMetric
                label="Stock publicado"
                value={summary.listingLimit ? `${summary.usedListings}/${summary.listingLimit}` : String(summary.usedListings)}
                detail={summary.remainingListings == null ? 'Sin limite' : `${summary.remainingListings} libres`}
              />
              <HeroMetric
                label="Monto eBay usado"
                value={usd(summary.usedAmountUsd)}
                detail={summary.amountLimitUsd ? `${usd(summary.remainingAmountUsd)} libres` : 'Sin limite'}
              />
            </div>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-slate-100">Acciones recomendadas</h2>
        </div>
        {actions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No hay acciones urgentes con los datos actuales.
          </div>
        ) : (
          <div className="divide-y divide-slate-900">
            {actions.map((action) => (
              <div key={`${action.listingId}-${action.recommendation}`} className={`m-3 rounded-lg border p-3 ${severityClass(action.severity)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{action.title}</p>
                    <p className="mt-1 text-xs opacity-80">Listing #{action.listingId} · {action.status}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-right text-xs">
                    <span>Precio<br /><b>{usd(action.currentPriceUsd)}</b></span>
                    <span>Margen<br /><b>{pct(action.projectedMarginPct)}</b></span>
                    <span>Exposicion<br /><b>{usd(action.monthlyAmountExposureUsd)}</b></span>
                  </div>
                </div>
                <p className="mt-3 text-sm font-medium">{action.recommendation}</p>
                <p className="mt-1 text-xs opacity-80">{action.reason}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}
