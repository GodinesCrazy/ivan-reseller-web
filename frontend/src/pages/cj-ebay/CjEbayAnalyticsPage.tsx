import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { AlertTriangle, BarChart3, Loader2, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';

type FunnelStage = { key: string; label: string; value: number; conversionPct: number | null };
type ProfitGuard = {
  kpis: { grossRevenueUsd: number; estimatedGrossProfitUsd: number; estimatedAvgMarginPct: number | null; attentionOrders: number; activeRefunds: number };
  sellingLimits: { configured: boolean; usedListings: number; listingLimit: number | null; usedAmountUsd: number; amountLimitUsd: number | null; remainingListings: number | null; remainingAmountUsd: number | null };
  issues: Array<{ listingId: number; title: string; status: string; priceUsd: number | null; estimatedMarginPct: number | null; issue: string }>;
  checkedListings: number;
  generatedAt: string;
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

export default function CjEbayAnalyticsPage() {
  const [funnel, setFunnel] = useState<{ stages: FunnelStage[]; bottleneck: FunnelStage | null } | null>(null);
  const [guard, setGuard] = useState<ProfitGuard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [funnelRes, guardRes] = await Promise.all([
        api.get<{ ok: boolean; stages: FunnelStage[]; bottleneck: FunnelStage | null }>('/api/cj-ebay/analytics/funnel'),
        api.get<{ ok: boolean } & ProfitGuard>('/api/cj-ebay/analytics/profit-guard'),
      ]);
      setFunnel({ stages: funnelRes.data.stages, bottleneck: funnelRes.data.bottleneck });
      setGuard(guardRes.data);
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar analítica CJ-eBay.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runProfitGuard() {
    setRunning(true);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean } & ProfitGuard>('/api/cj-ebay/analytics/profit-guard/run');
      setGuard(res.data);
    } catch (e) {
      setError(apiError(e, 'No se pudo ejecutar Profit Guard.'));
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando analítica CJ-eBay...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-200"><BarChart3 className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-semibold text-white">Analítica CJ → eBay USA</h1>
              <p className="text-sm text-slate-400">Funnel, cuota mensual, profit guard y riesgos de publicación eBay.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"><RefreshCw className="h-4 w-4" />Refrescar</button>
            <button type="button" onClick={() => void runProfitGuard()} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Profit Guard</button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-semibold text-slate-100">Funnel del ciclo eBay</h2></div>
          <div className="space-y-3">
            {funnel?.stages.map((stage, index) => {
              const max = Math.max(...(funnel?.stages.map((s) => s.value) ?? [1]), 1);
              return (
                <div key={stage.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">{index + 1}. {stage.label}</span>
                    <span className="text-slate-500">{stage.value} · {pct(stage.conversionPct)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-900"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(4, (stage.value / max) * 100)}%` }} /></div>
                </div>
              );
            })}
          </div>
          {funnel?.bottleneck && <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">Cuello detectado: <b>{funnel.bottleneck.label}</b> ({pct(funnel.bottleneck.conversionPct)}).</div>}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Quota readiness</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="Stock publicado" value={guard?.sellingLimits.listingLimit ? `${guard.sellingLimits.usedListings}/${guard.sellingLimits.listingLimit}` : String(guard?.sellingLimits.usedListings ?? 0)} />
            <Metric label="Monto usado" value={guard?.sellingLimits.amountLimitUsd ? `${usd(guard.sellingLimits.usedAmountUsd)} / ${usd(guard.sellingLimits.amountLimitUsd)}` : usd(guard?.sellingLimits.usedAmountUsd)} />
            <Metric label="Utilidad estimada" value={usd(guard?.kpis.estimatedGrossProfitUsd)} />
            <Metric label="Margen prom." value={pct(guard?.kpis.estimatedAvgMarginPct)} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-semibold text-slate-100">Issues Profit Guard</h2></div>
          <span className="text-xs text-slate-500">{guard?.checkedListings ?? 0} listings revisados</span>
        </div>
        <div className="divide-y divide-slate-900">
          {guard?.issues.map((issue) => (
            <div key={`${issue.listingId}-${issue.issue}`} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_130px_120px_120px]">
              <span className="font-medium text-slate-200">{issue.title}</span>
              <span className="text-slate-400">{issue.issue}</span>
              <span className="text-slate-400">{usd(issue.priceUsd)}</span>
              <span className="text-slate-400">{pct(issue.estimatedMarginPct)}</span>
            </div>
          ))}
          {guard?.issues.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">Sin issues críticos de margen o política.</div>}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>
    </div>
  );
}
