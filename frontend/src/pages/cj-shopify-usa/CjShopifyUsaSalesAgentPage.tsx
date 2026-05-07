import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  Megaphone,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/services/api';

type Priority = 'critical' | 'high' | 'medium' | 'low';

type SalesAction = {
  id: string;
  type: string;
  priority: Priority;
  title: string;
  rationale: string;
  expectedImpact: string;
  risk: 'safe' | 'approval_required' | 'manual_required';
  canExecute: boolean;
  guardrails: string[];
  payload?: Record<string, unknown>;
};

type ActionExecutionResult = {
  ok?: boolean;
  executed?: boolean;
  actionType?: string;
  message?: string;
  fixed?: number;
  failed?: number;
  published?: number;
  unpublished?: number;
  queued?: number;
  priceIncreases?: number;
  pausedUnsafe?: number;
  reviewRequired?: number;
  shippingEnriched?: number;
  shippingFailed?: number;
  rateLimited?: boolean;
};

type PromotionCandidate = {
  listingId: number;
  title: string;
  handle: string | null;
  priceUsd: number;
  marginPct: number;
  imageCount: number;
  score: number;
  url: string;
  caption: string;
};

type CommercialScore = {
  listingId: number;
  title: string;
  handle: string | null;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  priceUsd: number;
  marginPct: number;
  imageCount: number;
  shippingKnown: boolean;
  duplicateRisk: boolean;
  profitRisk: boolean;
  titleQualityScore: number;
  conversionSignals: {
    promoted: boolean;
    socialPosts: number;
    hasSalesSignal: boolean;
  };
  issues: string[];
  opportunities: string[];
  recommendedAction: 'PROMOTE' | 'FIX' | 'PROFIT_GUARD' | 'CURATE_DUPLICATE' | 'WATCH';
};

type SalesAgentScheduler = {
  state: 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR';
  config: {
    enabled: boolean;
    intervalHours: number;
    safeMode: boolean;
    autoPublishApprovedDrafts: boolean;
    autoUnpublishUnsafeListings: boolean;
    autoPromoteOrganic: boolean;
    maxPublishPerCycle: number;
    maxUnpublishPerCycle: number;
    maxPromotionsPerCycle: number;
  };
  currentCycle: null | {
    cycleId: string;
    startedAt: string;
    status: string;
    diagnosisScore: number;
    published: number;
    unpublished: number;
    promoted: number;
    errors: number;
    events: Array<{ ts: string; stage: string; level: string; message: string; meta?: Record<string, unknown> }>;
  };
  lastRunAt: string | null;
  nextRunAt: string | null;
  cycleHistory: Array<Record<string, unknown>>;
};

type SalesAgentDashboard = {
  ok: boolean;
  generatedAt: string;
  mode: string;
  mission: string;
  constraints: {
    minMarginPct: number;
    minProfitUsd: number;
    maxShippingUsd: number;
    maxSellPriceUsd: number;
    autoSpendAds: boolean;
    autoPublishSocial: boolean;
    autoChangePrices: boolean;
    canPublishWithGuards: boolean;
    canUnpublishUnsafeWithGuards: boolean;
    canFixCatalogQuality: boolean;
  };
  kpis: {
    activeListings: number;
    draftListings: number;
    failedListings: number;
    orders30: number;
    paidOrders30: number;
    revenue30Usd: number;
    visitors: number;
    addToCartRatePct: number;
    checkoutRatePct: number;
    purchaseRatePct: number;
    socialPublished: number;
    socialFailed: number;
  };
  health: {
    score: number;
    checkoutRisk: boolean;
    marginRisk: boolean;
    catalogTrustRisk: boolean;
    trafficOpportunity: boolean;
  };
  shopifyTruth: {
    ok: boolean;
    error: string | null;
    activeProducts: number;
    localActiveListings: number;
    localUniqueActiveShopifyProducts: number;
    activeDelta: number;
    noMedia: number;
    duplicateExactGroups: number;
    missingLocalActiveInShopify: number;
    samples: {
      noMedia: Array<{ id: string; title: string; handle: string }>;
      duplicates: Array<{ key: string; count: number; titles: string[] }>;
      missingLocalActiveInShopify: Array<{ listingId: number; title: string; shopifyProductId: string | null; status: string }>;
    };
  };
  learning: {
    scheduler: SalesAgentScheduler;
    lastCycle: null | {
      id: string;
      status: string;
      published: number;
      draftsCreated: number;
      approved: number;
      errors: number;
      startedAt: string;
    };
    recentActions: Array<{ id: string; createdAt: string; message: string; meta: unknown }>;
    memory: {
      windowDays: number;
      confidence: string;
      observations: string[];
      actionOutcomes: Array<{ createdAt: string; action: string; impact: string }>;
      bestSignals: string[];
      weakSignals: string[];
    };
    summary: string[];
  };
  commercialScores: {
    distribution: { excellent: number; good: number; watch: number; risk: number };
    top: CommercialScore[];
    needsWork: CommercialScore[];
  };
  campaign: {
    generatedAt: string;
    theme: string;
    objective: string;
    budgetMode: 'organic_only';
    channels: string[];
    promote: Array<{ listingId: number; title: string; handle: string | null; score: number; marginPct: number }>;
    fixBeforeTraffic: Array<{ listingId: number; title: string; score: number; issues: string[] }>;
    protectMargin: Array<{ listingId: number; title: string; score: number; issues: string[] }>;
    pauseOrMerge: Array<{ listingId: number; title: string; score: number; issues: string[] }>;
    nextReviewAt: string;
  };
  decisionTimeline: Array<{
    id: string;
    ts: string;
    stage: string;
    title: string;
    detail: string;
    status: 'done' | 'watch' | 'needs_review';
  }>;
  promotionCandidates: PromotionCandidate[];
  publishableDrafts: Array<{ listingId: number; title: string; priceUsd: number; marginPct: number }>;
  unsafeUnpublishCandidates: Array<{
    listingId: number;
    title: string;
    reason: string;
    currentPriceUsd: number | null;
    projectedNetProfitUsd: number | null;
    projectedNetMarginPct: number | null;
  }>;
  actions: SalesAction[];
  profitGuard: {
    scanned: number;
    okCount: number;
    priceIncreases: number;
    pausedUnsafe: number;
    reviewRequired: number;
    sampleIssues: Array<{ listingId: number; title: string; reason: string; action: string }>;
  };
  catalog: {
    duplicateExactGroups: Array<{ key: string; count: number; titles: string[] }>;
    crowdedFamilies: Array<{ family: string; count: number }>;
    copyIssues: Array<{ listingId: number; title: string; suggestedTitle: string; score: number; issues: string[]; imageCount: number }>;
    fixableCopyIssues: Array<{ listingId: number; title: string; suggestedTitle: string; score: number; issues: string[]; imageCount: number }>;
  };
};

function axiosMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function money(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function pct(value: number): string {
  return `${Number(value || 0).toFixed(2)}%`;
}

function priorityClass(priority: Priority): string {
  if (priority === 'critical') return 'border-red-500/50 bg-red-950/25 text-red-100';
  if (priority === 'high') return 'border-amber-500/50 bg-amber-950/25 text-amber-100';
  if (priority === 'medium') return 'border-blue-500/40 bg-blue-950/20 text-blue-100';
  return 'border-slate-600 bg-slate-900 text-slate-200';
}

function riskLabel(risk: SalesAction['risk']): string {
  if (risk === 'safe') return 'Seguro';
  if (risk === 'approval_required') return 'Requiere aprobacion';
  return 'Manual';
}

function statusTone(ok: boolean): string {
  return ok
    ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
    : 'border-red-500/40 bg-red-950/25 text-red-100';
}

function gradeClass(grade: CommercialScore['grade']): string {
  if (grade === 'A') return 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40';
  if (grade === 'B') return 'bg-cyan-500/20 text-cyan-100 border-cyan-400/40';
  if (grade === 'C') return 'bg-amber-500/20 text-amber-100 border-amber-400/40';
  return 'bg-red-500/20 text-red-100 border-red-400/40';
}

function actionLabel(action: CommercialScore['recommendedAction']): string {
  if (action === 'PROMOTE') return 'Promover';
  if (action === 'FIX') return 'Corregir ficha';
  if (action === 'PROFIT_GUARD') return 'Profit Guard';
  if (action === 'CURATE_DUPLICATE') return 'Curar duplicado';
  return 'Observar';
}

function dateTime(value: string | null | undefined): string {
  if (!value) return 'N/D';
  return new Date(value).toLocaleString();
}

function actionResolved(result: ActionExecutionResult | undefined): boolean {
  if (!result?.ok) return false;
  return Number(result.failed ?? 0) === 0
    && Number(result.shippingFailed ?? 0) === 0
    && Number(result.reviewRequired ?? 0) === 0
    && result.rateLimited !== true;
}

export default function CjShopifyUsaSalesAgentPage() {
  const [data, setData] = useState<SalesAgentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, ActionExecutionResult>>({});
  const scheduler = data?.learning.scheduler;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SalesAgentDashboard>('/api/cj-shopify-usa/sales-agent');
      setData(res.data);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo cargar el Agente Vendedor.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!running && scheduler?.state !== 'RUNNING' && scheduler?.currentCycle?.status !== 'RUNNING') return undefined;
    const timer = window.setInterval(() => {
      void load();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [load, running, scheduler?.currentCycle?.status, scheduler?.state]);

  const primaryAction = useMemo(
    () => data?.actions.find((action) => action.canExecute) ?? null,
    [data],
  );

  const execute = async (action: SalesAction) => {
    setRunning(action.id);
    setError(null);
    setMessage(null);
    try {
      const res = await api.post('/api/cj-shopify-usa/sales-agent/actions', {
        actionType: action.type,
        limit: 5,
      });
      const result = (res.data ?? {}) as ActionExecutionResult;
      setActionResults((prev) => ({ ...prev, [action.id]: result }));
      setMessage(String(result.message || 'Accion ejecutada.'));
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo ejecutar la accion del agente.'));
    } finally {
      setRunning(null);
    }
  };

  const schedulerCommand = async (command: 'start' | 'pause' | 'stop' | 'run-now') => {
    setRunning(`scheduler-${command}`);
    setError(null);
    setMessage(null);
    try {
      const res = await api.post(`/api/cj-shopify-usa/sales-agent/scheduler/${command}`);
      if (command === 'run-now') {
        setActionResults((prev) => ({
          ...prev,
          scheduler: {
            ok: true,
            executed: true,
            message: String(res.data?.message || 'Ciclo manual del agente ejecutado.'),
          },
        }));
      }
      setMessage(command === 'run-now' ? 'Ciclo del agente vendedor ejecutado.' : 'Estado del agente vendedor actualizado.');
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo controlar el ciclo del agente vendedor.'));
    } finally {
      setRunning(null);
    }
  };

  const updateSchedulerConfig = async (patch: Partial<SalesAgentScheduler['config']>) => {
    setRunning('scheduler-config');
    setError(null);
    setMessage(null);
    try {
      await api.patch('/api/cj-shopify-usa/sales-agent/scheduler/config', patch);
      setMessage('Configuracion del ciclo vendedor guardada.');
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo guardar la configuracion del agente vendedor.'));
    } finally {
      setRunning(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-8 text-center text-slate-300">
        <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-cyan-300" />
        Cargando Agente Vendedor...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-cyan-300" />
            <h2 className="text-xl font-semibold text-slate-100">Agente Vendedor PawVault</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            {data?.mission || 'Maximizar ventas rentables con controles de margen, calidad y confianza.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      )}
      {running && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-100">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Procesando {running.startsWith('scheduler') ? 'ciclo del agente' : 'accion del agente'}... se actualizara automaticamente.
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-200">Salud comercial</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-bold text-white">{data.health.score}</span>
                <span className="pb-1 text-sm text-slate-400">/100</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Listings activos</p>
              <p className="mt-2 text-3xl font-bold text-white">{data.kpis.activeListings}</p>
              <p className="text-xs text-slate-500">{data.kpis.draftListings} drafts · {data.kpis.failedListings} fallidos</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Ventas 30 dias</p>
              <p className="mt-2 text-3xl font-bold text-white">{data.kpis.paidOrders30}</p>
              <p className="text-xs text-slate-500">{money(data.kpis.revenue30Usd)} revenue detectado</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Embudo</p>
              <p className="mt-2 text-sm text-slate-200">
                Carrito {pct(data.kpis.addToCartRatePct)} · Checkout {pct(data.kpis.checkoutRatePct)}
              </p>
              <p className="text-xs text-slate-500">Compra {pct(data.kpis.purchaseRatePct)} · {data.kpis.visitors} visitantes</p>
            </div>
          </section>

          {scheduler && (
            <section className="rounded-lg border border-cyan-500/25 bg-slate-950 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                      <Bot className="h-4 w-4 text-cyan-300" />
                      Ciclo autonomo vendedor
                    </h3>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                      scheduler.state === 'RUNNING'
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : scheduler.state === 'ERROR'
                          ? 'bg-red-500/15 text-red-200'
                          : 'bg-slate-800 text-slate-300'
                    }`}>
                      {scheduler.state}
                    </span>
                    <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200">
                      cada {scheduler.config.intervalHours}h
                    </span>
                    {scheduler.config.safeMode && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                        modo seguro
                      </span>
                    )}
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-slate-400">
                    Diagnostica tienda, optimiza catalogo con limites, publica/despublica solo bajo guardrails,
                    encola marketing organico y aprende de conversiones, trazas y resultados sociales.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-300 md:grid-cols-3">
                    <span className="rounded bg-slate-900 p-2">Ultimo ciclo: <b>{dateTime(scheduler.lastRunAt)}</b></span>
                    <span className="rounded bg-slate-900 p-2">Proximo ciclo: <b>{dateTime(scheduler.nextRunAt)}</b></span>
                    <span className="rounded bg-slate-900 p-2">Historial: <b>{scheduler.cycleHistory.length}</b> ciclos</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={running === 'scheduler-start'}
                    onClick={() => void schedulerCommand('start')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    Iniciar
                  </button>
                  <button
                    type="button"
                    disabled={running === 'scheduler-pause'}
                    onClick={() => void schedulerCommand('pause')}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    <Pause className="h-4 w-4" />
                    Pausar
                  </button>
                  <button
                    type="button"
                    disabled={running === 'scheduler-stop'}
                    onClick={() => void schedulerCommand('stop')}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Square className="h-4 w-4" />
                    Detener
                  </button>
                  <button
                    type="button"
                    disabled={running === 'scheduler-run-now'}
                    onClick={() => void schedulerCommand('run-now')}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {running === 'scheduler-run-now' ? 'Ejecutando...' : 'Ejecutar ahora'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1fr]">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Limites seguros por ciclo</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ['Publicar', 'maxPublishPerCycle'],
                      ['Despublicar', 'maxUnpublishPerCycle'],
                      ['Promover', 'maxPromotionsPerCycle'],
                    ].map(([label, key]) => (
                      <label key={key} className="text-[11px] text-slate-400">
                        {label}
                        <input
                          type="number"
                          min="0"
                          max={key === 'maxPromotionsPerCycle' ? 20 : 10}
                          value={Number(scheduler.config[key as keyof SalesAgentScheduler['config']])}
                          onChange={(event) => void updateSchedulerConfig({ [key]: Number(event.target.value) })}
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Automatizaciones permitidas</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-300">
                    {[
                      ['autoPublishApprovedDrafts', 'Publicar drafts aprobados'],
                      ['autoUnpublishUnsafeListings', 'Despublicar PAUSE_UNSAFE'],
                      ['autoPromoteOrganic', 'Marketing organico'],
                      ['safeMode', 'Modo seguro'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between gap-3 rounded bg-black/20 px-3 py-2">
                        {label}
                        <input
                          type="checkbox"
                          checked={Boolean(scheduler.config[key as keyof SalesAgentScheduler['config']])}
                          onChange={(event) => void updateSchedulerConfig({ [key]: event.target.checked })}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Ultima ejecucion</p>
                  <div className="mt-3 space-y-2">
                    {(scheduler.currentCycle?.events ?? []).slice(-4).map((event) => (
                      <div key={`${event.ts}-${event.message}`} className="rounded bg-black/20 px-3 py-2 text-xs">
                        <p className="font-semibold text-slate-200">{event.stage} · {event.level}</p>
                        <p className="text-slate-400">{event.message}</p>
                      </div>
                    ))}
                    {!scheduler.currentCycle?.events?.length && (
                      <p className="text-xs text-slate-500">Sin ciclo en ejecucion ahora.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_1fr]">
            <div className={`rounded-lg border p-4 ${statusTone(data.shopifyTruth.ok)}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <ShieldCheck className="h-4 w-4" />
                  Verdad Shopify
                </h3>
                <span className="rounded-full bg-black/25 px-2 py-1 text-[11px] font-bold">
                  {data.shopifyTruth.ok ? 'API OK' : 'API ERROR'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded bg-black/20 p-2">Activos Shopify: <b>{data.shopifyTruth.activeProducts}</b></span>
                <span className="rounded bg-black/20 p-2">Productos locales: <b>{data.shopifyTruth.localUniqueActiveShopifyProducts}</b></span>
                <span className="rounded bg-black/20 p-2">Sin media: <b>{data.shopifyTruth.noMedia}</b></span>
                <span className="rounded bg-black/20 p-2">Duplicados exactos: <b>{data.shopifyTruth.duplicateExactGroups}</b></span>
              </div>
              <p className="mt-2 text-[11px] opacity-80">
                Listings activos locales: {data.shopifyTruth.localActiveListings}; se separan porque un producto puede tener varias variantes.
              </p>
              {data.shopifyTruth.activeDelta !== 0 && (
                <p className="mt-3 text-xs">
                  Brecha detectada: {data.shopifyTruth.activeDelta > 0 ? '+' : ''}{data.shopifyTruth.activeDelta} listings locales vs Shopify.
                </p>
              )}
              {data.shopifyTruth.error && <p className="mt-2 text-xs">{data.shopifyTruth.error}</p>}
            </div>

            <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-4 text-violet-100">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Brain className="h-4 w-4" />
                Mejora continua
              </h3>
              <div className="mt-3 space-y-2 text-xs">
                <p className="rounded bg-black/20 p-2">Aprende de trazas: {data.learning.recentActions.length} acciones recientes.</p>
                <p className="rounded bg-black/20 p-2">Usa embudo: carrito {pct(data.kpis.addToCartRatePct)}, checkout {pct(data.kpis.checkoutRatePct)}, compra {pct(data.kpis.purchaseRatePct)}.</p>
                <p className="rounded bg-black/20 p-2">Prioriza por margen, calidad, riesgo y oportunidad de trafico.</p>
              </div>
            </div>

            <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 text-cyan-100">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="h-4 w-4" />
                Capacidades activas
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                <span className="rounded bg-black/20 p-2">Publicar con guardrails: <b>{data.constraints.canPublishWithGuards ? 'ON' : 'OFF'}</b></span>
                <span className="rounded bg-black/20 p-2">Despublicar riesgo perdida: <b>{data.constraints.canUnpublishUnsafeWithGuards ? 'ON' : 'OFF'}</b></span>
                <span className="rounded bg-black/20 p-2">Corregir fichas debiles: <b>{data.constraints.canFixCatalogQuality ? 'ON' : 'OFF'}</b></span>
                <span className="rounded bg-black/20 p-2">Promocion organica Pinterest: <b>{data.constraints.autoPublishSocial ? 'ON' : 'OFF'}</b></span>
                <span className="rounded bg-black/20 p-2">Gasto ads automatico: <b>{data.constraints.autoSpendAds ? 'ON' : 'OFF'}</b></span>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-cyan-500/25 bg-slate-950 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                    <CircleDollarSign className="h-4 w-4 text-cyan-300" />
                    Score comercial por producto
                  </h3>
                  <p className="text-xs text-slate-500">Combina margen, shipping, imagenes, calidad, duplicados y senales sociales.</p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-200">A {data.commercialScores.distribution.excellent}</span>
                  <span className="rounded bg-cyan-500/10 px-2 py-1 text-cyan-200">B {data.commercialScores.distribution.good}</span>
                  <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-200">C {data.commercialScores.distribution.watch}</span>
                  <span className="rounded bg-red-500/10 px-2 py-1 text-red-200">D {data.commercialScores.distribution.risk}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-slate-500">Mejores para empujar</p>
                  <div className="space-y-2">
                    {data.commercialScores.top.slice(0, 5).map((item) => (
                      <div key={item.listingId} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</p>
                          <span className={`rounded-full border px-2 py-1 text-xs font-bold ${gradeClass(item.grade)}`}>{item.grade} {item.score}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {money(item.priceUsd)} · margen {pct(item.marginPct)} · {item.imageCount} img · {actionLabel(item.recommendedAction)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-slate-500">Riesgo o trabajo pendiente</p>
                  <div className="space-y-2">
                    {data.commercialScores.needsWork.slice(0, 5).map((item) => (
                      <div key={item.listingId} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</p>
                          <span className={`rounded-full border px-2 py-1 text-xs font-bold ${gradeClass(item.grade)}`}>{item.grade} {item.score}</span>
                        </div>
                        <p className="mt-1 text-xs text-amber-200">{item.issues.slice(0, 2).join(' · ') || actionLabel(item.recommendedAction)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/10 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-100">
                <Megaphone className="h-4 w-4" />
                Modo campana semanal
              </h3>
              <p className="mt-1 text-sm text-slate-300">{data.campaign.objective}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.campaign.channels.map((channel) => (
                  <span key={channel} className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">{channel}</span>
                ))}
                <span className="rounded-full bg-black/25 px-2 py-1 text-xs text-slate-300">sin ads pagados</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded bg-black/20 p-2">Promover: <b>{data.campaign.promote.length}</b></span>
                <span className="rounded bg-black/20 p-2">Corregir: <b>{data.campaign.fixBeforeTraffic.length}</b></span>
                <span className="rounded bg-black/20 p-2">Proteger margen: <b>{data.campaign.protectMargin.length}</b></span>
                <span className="rounded bg-black/20 p-2">Pausar/fusionar: <b>{data.campaign.pauseOrMerge.length}</b></span>
              </div>
              <div className="mt-4 space-y-2">
                {data.campaign.promote.slice(0, 4).map((item) => (
                  <div key={item.listingId} className="rounded border border-emerald-500/20 bg-black/20 px-3 py-2">
                    <p className="line-clamp-1 text-xs font-semibold text-emerald-50">{item.title}</p>
                    <p className="text-[11px] text-emerald-200/80">score {item.score} · margen {pct(item.marginPct)}</p>
                  </div>
                ))}
                {data.campaign.promote.length === 0 && (
                  <p className="rounded border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                    Primero resolver margen/catalogo; el agente no empujara productos dudosos.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-violet-500/25 bg-violet-950/10 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-violet-100">
                <Brain className="h-4 w-4" />
                Memoria de aprendizaje real
              </h3>
              <p className="mt-1 text-xs text-slate-500">Confianza {data.learning.memory.confidence} · ventana {data.learning.memory.windowDays} dias.</p>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {data.learning.memory.observations.map((item) => (
                  <p key={item} className="rounded bg-black/20 p-2 text-xs text-slate-300">{item}</p>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {data.learning.memory.actionOutcomes.slice(0, 4).map((item) => (
                  <div key={`${item.createdAt}-${item.action}`} className="rounded border border-violet-500/20 bg-black/20 px-3 py-2 text-xs">
                    <p className="font-semibold text-violet-100">{item.action}</p>
                    <p className="text-slate-400">{item.impact}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <Target className="h-4 w-4 text-cyan-300" />
                Linea de decisiones
              </h3>
              <div className="mt-3 space-y-2">
                {data.decisionTimeline.slice(0, 7).map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-100">{item.stage}</p>
                        <p className="text-xs text-slate-400">{item.title}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                        item.status === 'done'
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : item.status === 'watch'
                            ? 'bg-amber-500/15 text-amber-200'
                            : 'bg-red-500/15 text-red-200'
                      }`}>
                        {item.status === 'done' ? 'hecho' : item.status === 'watch' ? 'vigilar' : 'revisar'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
                  </div>
                ))}
                {data.decisionTimeline.length === 0 && (
                  <p className="text-sm text-slate-500">Aun no hay decisiones registradas por el agente.</p>
                )}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                    <Target className="h-4 w-4 text-amber-300" />
                    Plan de ataque
                  </h3>
                  <p className="text-xs text-slate-500">Acciones ordenadas por impacto y riesgo.</p>
                </div>
                {primaryAction && (
                  <button
                    type="button"
                    disabled={running === primaryAction.id}
                    onClick={() => void execute(primaryAction)}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {running === primaryAction.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                    {running === primaryAction.id ? 'Ejecutando...' : 'Ejecutar con guardrails'}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {data.actions.map((action) => (
                  <article
                    key={action.id}
                    className={`rounded-lg border p-4 ${
                      actionResolved(actionResults[action.id])
                        ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-50'
                        : priorityClass(action.priority)
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold uppercase">
                            {action.priority}
                          </span>
                          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px]">
                            {riskLabel(action.risk)}
                          </span>
                          {actionResults[action.id] && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              actionResolved(actionResults[action.id])
                                ? 'bg-emerald-500/20 text-emerald-100'
                                : 'bg-amber-500/20 text-amber-100'
                            }`}>
                              {actionResolved(actionResults[action.id]) ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              {actionResolved(actionResults[action.id]) ? 'Solucionado' : 'Ejecutado con pendientes'}
                            </span>
                          )}
                        </div>
                        <h4 className="mt-2 text-sm font-bold text-white">{action.title}</h4>
                        <p className="mt-1 text-sm text-slate-300">{action.rationale}</p>
                        <p className="mt-1 text-xs text-slate-400">{action.expectedImpact}</p>
                        {actionResults[action.id] && (
                          <div className="mt-3 rounded border border-emerald-500/30 bg-black/25 px-3 py-2 text-xs text-emerald-100">
                            <p className="font-semibold">{actionResults[action.id].message || 'Accion ejecutada.'}</p>
                            <p className="mt-1 text-emerald-200/80">
                              {[
                                actionResults[action.id].fixed !== undefined ? `corregidos ${actionResults[action.id].fixed}` : null,
                                actionResults[action.id].published !== undefined ? `publicados ${actionResults[action.id].published}` : null,
                                actionResults[action.id].unpublished !== undefined ? `despublicados ${actionResults[action.id].unpublished}` : null,
                                actionResults[action.id].queued !== undefined ? `promociones ${actionResults[action.id].queued}` : null,
                                actionResults[action.id].priceIncreases !== undefined ? `precios subidos ${actionResults[action.id].priceIncreases}` : null,
                                actionResults[action.id].pausedUnsafe !== undefined ? `pausados ${actionResults[action.id].pausedUnsafe}` : null,
                                actionResults[action.id].shippingEnriched !== undefined ? `shipping enriquecidos ${actionResults[action.id].shippingEnriched}` : null,
                                actionResults[action.id].failed !== undefined ? `fallidos ${actionResults[action.id].failed}` : null,
                                actionResults[action.id].reviewRequired !== undefined ? `revision ${actionResults[action.id].reviewRequired}` : null,
                              ].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                      {action.canExecute && (
                        <button
                          type="button"
                          disabled={running === action.id}
                          onClick={() => void execute(action)}
                          className="shrink-0 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                        >
                          <span className="inline-flex items-center gap-2">
                            {running === action.id && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                            {running === action.id ? 'Ejecutando...' : actionResults[action.id]?.ok ? 'Ejecutar otra vez' : 'Ejecutar'}
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {action.guardrails.map((guardrail) => (
                        <span key={guardrail} className="rounded-full bg-black/25 px-2 py-1 text-[11px] text-slate-300">
                          {guardrail}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-100">
                  <ShieldCheck className="h-4 w-4" />
                  Reglas duras
                </h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span className="rounded bg-black/20 p-2">Margen min: {pct(data.constraints.minMarginPct)}</span>
                  <span className="rounded bg-black/20 p-2">Profit min: {money(data.constraints.minProfitUsd)}</span>
                  <span className="rounded bg-black/20 p-2">Shipping max: {money(data.constraints.maxShippingUsd)}</span>
                  <span className="rounded bg-black/20 p-2">Precio max: {money(data.constraints.maxSellPriceUsd)}</span>
                </div>
                <p className="mt-3 text-xs text-emerald-200">
                  Ads automaticos: {data.constraints.autoSpendAds ? 'ON' : 'OFF'} · Cambios de precio: {data.constraints.autoChangePrices ? 'ON' : 'OFF'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                  <Brain className="h-4 w-4 text-violet-300" />
                  Aprendizaje
                </h3>
                <div className="mt-3 space-y-2">
                  {data.learning.summary.map((item) => (
                    <p key={item} className="rounded bg-slate-900 px-3 py-2 text-xs text-slate-300">{item}</p>
                  ))}
                </div>
                {data.learning.lastCycle && (
                  <p className="mt-3 text-xs text-slate-500">
                    Ultimo ciclo: {data.learning.lastCycle.published} publicados · {data.learning.lastCycle.draftsCreated} drafts · {data.learning.lastCycle.errors} errores
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                  <CircleDollarSign className="h-4 w-4 text-amber-300" />
                  Profit Guard
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <span className="rounded bg-slate-900 p-2">Escaneados: {data.profitGuard.scanned}</span>
                  <span className="rounded bg-slate-900 p-2">OK: {data.profitGuard.okCount}</span>
                  <span className="rounded bg-slate-900 p-2">Subir precio: {data.profitGuard.priceIncreases}</span>
                  <span className="rounded bg-slate-900 p-2">Revisar: {data.profitGuard.reviewRequired}</span>
                </div>
              </div>
            </aside>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <TrendingUp className="h-4 w-4 text-cyan-300" />
                Productos para promocionar
              </h3>
              <div className="mt-3 space-y-2">
                {data.promotionCandidates.slice(0, 6).map((item) => (
                  <div key={item.listingId} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{money(item.priceUsd)} · margen {pct(item.marginPct)} · score {item.score}</p>
                      </div>
                      <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs font-bold text-cyan-200">
                        {item.imageCount} img
                      </span>
                    </div>
                  </div>
                ))}
                {data.promotionCandidates.length === 0 && (
                  <p className="text-sm text-slate-500">No hay candidatos seguros para promocion organica ahora.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-red-500/30 bg-red-950/15 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-red-100">
                <AlertTriangle className="h-4 w-4" />
                Despublicar para proteger margen
              </h3>
              <div className="mt-3 space-y-2">
                {data.unsafeUnpublishCandidates.slice(0, 6).map((item) => (
                  <div key={item.listingId} className="rounded-lg border border-red-500/20 bg-black/20 p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-red-50">{item.title}</p>
                    <p className="mt-1 text-xs text-red-200">{item.reason}</p>
                    <p className="mt-1 text-[11px] text-red-300">
                      Profit {item.projectedNetProfitUsd == null ? 'N/D' : money(item.projectedNetProfitUsd)} · margen {item.projectedNetMarginPct == null ? 'N/D' : pct(item.projectedNetMarginPct)}
                    </p>
                  </div>
                ))}
                {data.unsafeUnpublishCandidates.length === 0 && (
                  <p className="text-sm text-slate-500">No hay candidatos PAUSE_UNSAFE ahora.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <Sparkles className="h-4 w-4 text-amber-300" />
                Calidad de catalogo
              </h3>
              <div className="mt-3 space-y-3">
                {data.catalog.crowdedFamilies.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Familias saturadas</p>
                    <div className="flex flex-wrap gap-2">
                      {data.catalog.crowdedFamilies.map((family) => (
                        <span key={family.family} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
                          {family.family} · {family.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {data.catalog.copyIssues.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Fichas a mejorar</p>
                    <div className="space-y-2">
                      {data.catalog.copyIssues.slice(0, 6).map((issue) => (
                        <div key={issue.listingId} className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                          <p className="line-clamp-1 text-xs font-semibold text-slate-200">{issue.title}</p>
                          <p className="mt-1 text-[11px] text-slate-500">Score {issue.score} · {issue.issues.join(', ') || 'revisar ficha'}</p>
                          {issue.suggestedTitle && issue.suggestedTitle !== issue.title && (
                            <p className="mt-1 text-[11px] text-cyan-300">Sugerido: {issue.suggestedTitle}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!data.catalog.crowdedFamilies.length && !data.catalog.copyIssues.length && (
                  <p className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Sin problemas graves de confianza detectados.
                  </p>
                )}
              </div>
            </div>
          </section>

          {(data.health.checkoutRisk || data.health.marginRisk || data.health.catalogTrustRisk) && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-4 text-sm text-amber-100">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  El agente esta en modo controlado porque aun hay riesgos comerciales. Puede promocionar organico sin gasto,
                  corregir fichas debiles, publicar drafts aprobados y despublicar PAUSE_UNSAFE con limites. No tocara pagos,
                  no hara ads pagados ni cambios agresivos de precio sin aprobacion granular.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
