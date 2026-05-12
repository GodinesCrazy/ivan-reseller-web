import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Bot, Loader2, Play, RefreshCw } from 'lucide-react';

type Recommendation = {
  id: string;
  cjProductTitle: string;
  seedKeyword: string;
  status: string;
  recommendationReason: string;
  score: { totalScore: number; reasons: string[] };
  pricing: {
    suggestedPriceUsd: number;
    netProfitUsd: number;
    netMarginPct: number | null;
    marketObservedPriceUsd: number | null;
  };
  recommendationConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  starterSuitability?: 'GOOD_FOR_STARTER' | 'CAUTION_FOR_STARTER' | 'NOT_RECOMMENDED_FOR_STARTER';
};

type OptimizerAction = {
  listingId: number;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  recommendation: string;
  reason: string;
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

function scoreClass(score: number): string {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export default function CjEbaySalesAgentPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [actions, setActions] = useState<OptimizerAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, optimizerRes] = await Promise.all([
        api.get<{ ok: boolean; recommendations: Recommendation[] }>('/api/cj-ebay/opportunities/recommendations'),
        api.get<{ ok: boolean; actions: OptimizerAction[] }>('/api/cj-ebay/store-optimizer'),
      ]);
      setRecommendations(recRes.data.recommendations ?? []);
      setActions(optimizerRes.data.actions ?? []);
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar el agente eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runCycle() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; runId?: string }>('/api/cj-ebay/opportunities/discover', {
        mode: 'QUICK_SCAN',
        maxSeeds: 8,
        maxCandidatesPerSeed: 2,
      });
      setMessage(res.data.runId ? `Ciclo iniciado: ${res.data.runId}` : 'Ciclo de descubrimiento iniciado.');
      await load();
    } catch (e) {
      setError(apiError(e, 'No se pudo iniciar el ciclo de agente eBay.'));
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando agente eBay...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-slate-500" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Agente vendedor eBay</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Usa oportunidades CJ, fees eBay y cuotas mensuales para priorizar publicaciones y acciones de tienda.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <RefreshCw className="h-4 w-4" />
            Refrescar
          </button>
          <button
            type="button"
            onClick={() => void runCycle()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Ejecutar ciclo
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Recomendaciones de oportunidad</h2>
          </div>
          {recommendations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Sin recomendaciones listas. Ejecuta un ciclo de descubrimiento.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {recommendations.slice(0, 12).map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.cjProductTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">Seed: {item.seedKeyword} · {item.status}</p>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${scoreClass(item.score.totalScore)}`}>{item.score.totalScore}</p>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-4">
                    <span>Precio: <b>{usd(item.pricing.suggestedPriceUsd)}</b></span>
                    <span>Utilidad: <b>{usd(item.pricing.netProfitUsd)}</b></span>
                    <span>Mercado: <b>{usd(item.pricing.marketObservedPriceUsd)}</b></span>
                    <span>Confianza: <b>{item.recommendationConfidence ?? 'LOW'}</b></span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.recommendationReason}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Acciones del agente</h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {actions.slice(0, 8).map((action) => (
              <div key={`${action.listingId}-${action.recommendation}`} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{action.recommendation}</p>
                <p className="mt-1 text-xs text-slate-500">{action.title}</p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{action.reason}</p>
              </div>
            ))}
            {actions.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">Sin acciones urgentes.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
