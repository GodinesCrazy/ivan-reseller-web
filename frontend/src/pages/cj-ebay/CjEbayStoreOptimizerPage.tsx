import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react';

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-slate-500" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Store Optimizer eBay</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Prioriza acciones para proteger cuota mensual, margen y salud de listings eBay.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className="h-4 w-4" />
          Recalcular
        </button>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500">Listings activos</p>
            <p className="mt-1 text-2xl font-semibold">{summary.activeListings}</p>
            <p className="text-xs text-slate-500">{summary.totalListings} totales · {summary.draftListings} drafts</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500">Bloqueados</p>
            <p className="mt-1 text-2xl font-semibold">{summary.blockedListings}</p>
            <p className="text-xs text-slate-500">Policy/account/reconcile</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500">Cuota publicaciones</p>
            <p className="mt-1 text-2xl font-semibold">
              {summary.listingLimit ? `${summary.usedListings}/${summary.listingLimit}` : summary.usedListings}
            </p>
            <p className="text-xs text-slate-500">{summary.remainingListings == null ? 'Sin limite' : `${summary.remainingListings} libres`}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500">Monto eBay usado</p>
            <p className="mt-1 text-2xl font-semibold">{usd(summary.usedAmountUsd)}</p>
            <p className="text-xs text-slate-500">{summary.amountLimitUsd ? `${usd(summary.remainingAmountUsd)} libres` : 'Sin limite'}</p>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Acciones recomendadas</h2>
        </div>
        {actions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No hay acciones urgentes con los datos actuales.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
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
