import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
  ListChecks,
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell as RechartsCell,
  PieChart,
  Pie,
} from 'recharts';
import { api } from '@/services/api';
import {
  ActionPriorityBand,
  CommercialMetricCard,
  CommercialPageHeader,
  CycleNarrativeStrip,
  DecisionTabs,
  ProductSignalRow,
  RiskActionQueue,
} from './components/CommercialCockpit';
import { ProductLifecycleLine, type ProductLifecycleStep } from './components/ProductLifecycleLine';

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
  execution?: {
    status: 'pending' | 'applied' | 'needs_review' | 'manual' | 'blocked';
    lastRunAt: string | null;
    summary: string;
    affectedEstimate: number;
    verified: boolean;
    traceLabel: string;
    steps: string[];
  };
};

type ActionExecutionStatus = NonNullable<SalesAction['execution']>['status'] | 'running';

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
  orders30?: number;
  revenue30Usd?: number;
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
  orders30: number;
  revenue30Usd: number;
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
  morningBrief: {
    generatedAt: string;
    headline: string;
    confidence: 'early' | 'medium' | 'high';
    focus: 'protect_margin' | 'fix_checkout' | 'publish' | 'promote' | 'discover';
    tasks: Array<{
      id: string;
      priority: Priority;
      label: string;
      page: string;
      actionType?: SalesAction['type'];
      count: number;
      rationale: string;
      expectedOutcome: string;
      sampleTitles: string[];
    }>;
    watchlist: Array<{
      id: string;
      label: string;
      count: number;
      severity: 'info' | 'warning' | 'critical';
      page: string;
    }>;
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
  salesPipeline: {
    generatedAt: string;
    distinction: string;
    overallScore: number;
    bottleneck: SalesPipelineStage;
    stages: SalesPipelineStage[];
    productLifecycle: {
      scale: CommercialScore[];
      optimize: CommercialScore[];
      protect: CommercialScore[];
      retireOrMerge: CommercialScore[];
    };
    strategy: {
      positioning: string[];
      credibility: string[];
      traffic: string[];
      conversion: string[];
    };
    dataSources: {
      internal: string[];
      external: string[];
      missing: string[];
    };
  };
  salesIntelligence?: {
    generatedAt: string;
    days: number;
    totals: {
      products: number;
      scale: number;
      optimize: number;
      protect: number;
      rotate: number;
      learning: number;
    };
    topProducts: Array<{
      listingId: number | null;
      title: string;
      decision: 'SCALE' | 'OPTIMIZE' | 'PROTECT' | 'ROTATE' | 'LEARNING';
      score: number;
      signal: {
        views: number;
        addToCarts: number;
        checkoutStarted: number;
        purchases: number;
        socialClicks: number;
      };
      reasons: string[];
    }>;
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
  cleanup: {
    generatedAt: string;
    thresholdDays: number;
    failedDraftGraceDays: number;
    totals: {
      total: number;
      scale: number;
      optimize: number;
      protect: number;
      rotate: number;
      archiveCandidates: number;
      learning: number;
      actionable: number;
    };
    candidates: Array<{
      listingId: number | null;
      productId: number | null;
      title: string;
      action: string;
      commercialClass: 'SCALE' | 'OPTIMIZE' | 'PROTECT' | 'ROTATE' | 'ARCHIVE_CANDIDATE' | 'LEARNING';
      reason: string;
      ageDays: number | null;
      safeToApply: boolean;
    }>;
  };
  catalog: {
    duplicateExactGroups: Array<{ key: string; count: number; titles: string[] }>;
    crowdedFamilies: Array<{ family: string; count: number }>;
    copyIssues: Array<{ listingId: number; title: string; suggestedTitle: string; score: number; issues: string[]; imageCount: number }>;
    fixableCopyIssues: Array<{ listingId: number; title: string; suggestedTitle: string; score: number; issues: string[]; imageCount: number }>;
  };
};

type SalesPipelineStage = {
  key: string;
  label: string;
  page: string;
  score: number;
  status: 'healthy' | 'watch' | 'blocked';
  objective: string;
  internalSignals: string[];
  externalSignals: string[];
  nextMove: string;
  automatedActions: string[];
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

function commercialLifecycleSteps(item: CommercialScore): ProductLifecycleStep[] {
  const qualityBlocked = item.imageCount <= 0 || item.titleQualityScore < 55 || item.duplicateRisk;
  const marginBlocked = item.profitRisk || !item.shippingKnown || item.marginPct < 10;
  const actionBlocked = item.recommendedAction === 'FIX' || item.recommendedAction === 'PROFIT_GUARD' || item.recommendedAction === 'CURATE_DUPLICATE';

  return [
    {
      key: 'quality',
      label: 'Ficha',
      state: qualityBlocked ? 'blocked' : item.titleQualityScore >= 70 ? 'done' : 'active',
      title: 'Calidad de titulo, imagenes y duplicados',
    },
    {
      key: 'margin',
      label: 'Margen',
      state: marginBlocked ? 'blocked' : 'done',
      title: 'Margen, shipping y profit guard',
    },
    {
      key: 'store',
      label: 'Store',
      state: item.handle ? 'done' : 'pending',
      title: 'Producto activo y trazable en Shopify',
    },
    {
      key: 'action',
      label: 'Accion',
      state: actionBlocked ? 'active' : item.recommendedAction === 'PROMOTE' ? 'done' : 'pending',
      title: actionLabel(item.recommendedAction),
    },
  ];
}

function promotionLifecycleSteps(item: PromotionCandidate): ProductLifecycleStep[] {
  return [
    { key: 'active', label: 'Activo', state: item.url ? 'done' : 'pending', title: 'Producto activo en storefront' },
    { key: 'margin', label: 'Margen', state: item.marginPct >= 10 ? 'done' : 'blocked', title: 'Margen suficiente para trafico organico' },
    { key: 'media', label: 'Img', state: item.imageCount > 0 ? 'done' : 'blocked', title: 'Imagenes disponibles para promocion' },
    { key: 'promote', label: 'Promo', state: item.score >= 80 ? 'active' : 'pending', title: 'Candidato para promocion organica' },
  ];
}

function pipelineStatusClass(status: SalesPipelineStage['status']): string {
  if (status === 'healthy') return 'border-emerald-500/35 bg-emerald-950/15 text-emerald-100';
  if (status === 'watch') return 'border-amber-500/35 bg-amber-950/15 text-amber-100';
  return 'border-red-500/35 bg-red-950/15 text-red-100';
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

function executionLabel(status: ActionExecutionStatus): string {
  if (status === 'running') return 'Ejecutando';
  if (status === 'applied') return 'Aplicado y verificado';
  if (status === 'needs_review') return 'Ejecutado con pendientes';
  if (status === 'manual') return 'Manual';
  if (status === 'blocked') return 'Bloqueado';
  return 'Pendiente';
}

function executionTone(status: ActionExecutionStatus): string {
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100';
  if (status === 'applied') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100';
  if (status === 'needs_review') return 'border-amber-500/45 bg-amber-500/15 text-amber-100';
  if (status === 'manual') return 'border-violet-400/35 bg-violet-500/15 text-violet-100';
  if (status === 'blocked') return 'border-slate-500/35 bg-slate-800/60 text-slate-200';
  return 'border-slate-600/50 bg-slate-900/70 text-slate-200';
}

function actionResultMetrics(result: ActionExecutionResult | undefined): string {
  if (!result) return '';
  return [
    result.fixed !== undefined ? `corregidos ${result.fixed}` : null,
    result.published !== undefined ? `publicados ${result.published}` : null,
    result.unpublished !== undefined ? `despublicados ${result.unpublished}` : null,
    result.queued !== undefined ? `promociones ${result.queued}` : null,
    result.priceIncreases !== undefined ? `precios subidos ${result.priceIncreases}` : null,
    result.pausedUnsafe !== undefined ? `pausados ${result.pausedUnsafe}` : null,
    result.shippingEnriched !== undefined ? `shipping enriquecidos ${result.shippingEnriched}` : null,
    result.failed !== undefined ? `fallidos ${result.failed}` : null,
    result.reviewRequired !== undefined ? `revision ${result.reviewRequired}` : null,
  ].filter(Boolean).join(' · ');
}

function currentExecutionStatus(
  action: SalesAction,
  result: ActionExecutionResult | undefined,
  isRunning: boolean,
): ActionExecutionStatus {
  if (isRunning) return 'running';
  if (result) return actionResolved(result) ? 'applied' : 'needs_review';
  return action.execution?.status ?? (action.canExecute ? 'pending' : action.risk === 'manual_required' ? 'manual' : 'blocked');
}

function actionNeedsUserDecision(action: SalesAction): boolean {
  const status = action.execution?.status ?? (action.canExecute ? 'pending' : action.risk === 'manual_required' ? 'manual' : 'blocked');
  if (status === 'applied') return false;
  return status === 'manual' || status === 'needs_review' || action.canExecute;
}

function actionRoleLabel(action: SalesAction, status: ActionExecutionStatus): string {
  if (status === 'running') return 'El agente esta trabajando';
  if (status === 'applied') return 'Solo observar: ya fue aplicado';
  if (status === 'manual') return 'Requiere accion manual tuya';
  if (status === 'blocked') return 'Informativo: falta aprobacion granular';
  if (action.canExecute) return 'Puedes accionar este boton';
  return 'Solo informacion';
}

function trafficQualitySignal(data: SalesAgentDashboard): { label: string; detail: string; className: string } {
  if (data.kpis.visitors <= 0) {
    return {
      label: 'Sin trafico medible',
      detail: 'El agente no usara visitas como evidencia hasta tener sesiones reales.',
      className: 'border-slate-700 bg-slate-950/40 text-slate-300',
    };
  }
  if (data.kpis.paidOrders30 === 0 && data.kpis.purchaseRatePct === 0) {
    return {
      label: 'Trafico no validado',
      detail: 'Hay visitas, pero sin compra registrada. Tratar como posible bot o trafico frio hasta confirmar checkout real.',
      className: 'border-amber-500/45 bg-amber-950/25 text-amber-100',
    };
  }
  return {
    label: 'Trafico con senal comercial',
    detail: 'Existen ventas pagadas recientes; el agente puede aprender de productos y promociones ganadoras.',
    className: 'border-emerald-500/35 bg-emerald-950/20 text-emerald-100',
  };
}

export default function CjShopifyUsaSalesAgentPage() {
  const [data, setData] = useState<SalesAgentDashboard | null>(null);
  const [commandTab, setCommandTab] = useState<'ahora' | 'escalar' | 'corregir' | 'proteger' | 'aprendizaje'>('ahora');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, ActionExecutionResult>>({});
  const scheduler = data?.learning.scheduler;
  const trafficSignal = data ? trafficQualitySignal(data) : null;

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

  const actionGroups = useMemo(() => {
    const actions = data?.actions ?? [];
    const needsDecision = actions.filter(actionNeedsUserDecision);
    const automatic = actions.filter((action) => action.canExecute && action.execution?.status === 'applied');
    const observation = actions.filter((action) => !needsDecision.includes(action) && !automatic.includes(action));
    return { needsDecision, automatic, observation };
  }, [data]);

  const primaryAction = useMemo(
    () => actionGroups.needsDecision.find((action) => action.canExecute) ?? null,
    [actionGroups.needsDecision],
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
      if (result.ok === false) {
        setError(null);
        setMessage(String(result.message || 'La accion no se aplico porque requiere esperar o revisar guardrails.'));
      } else {
        setMessage(String(result.message || 'Accion ejecutada.'));
      }
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
      <CommercialPageHeader
        title="Centro de mando comercial"
        description="Decide que escalar, corregir, proteger o retirar usando ventas reales 30d, margen, trafico, Profit Guard y memoria del agente."
      />

      <ActionPriorityBand
        tone={(data?.actions ?? []).some((action) => action.priority === 'critical' || action.priority === 'high') ? 'amber' : (data?.commercialScores.top.length ?? 0) > 0 ? 'emerald' : 'cyan'}
        title={(data?.actions ?? [])[0]?.title ?? 'Siguiente accion: buscar el mejor producto rentable para escalar.'}
        description={(data?.actions ?? [])[0]?.rationale ?? data?.mission ?? 'El agente prioriza ventas rentables, calidad de producto, confianza de tienda y proteccion de margen.'}
        primaryLabel={(data?.actions ?? [])[0]?.canExecute ? 'Ejecutar accion' : 'Actualizar lectura'}
        onPrimary={() => {
          const first = (data?.actions ?? [])[0];
          if (first?.canExecute) void execute(first);
          else void load();
        }}
        secondaryLabel="Run agente"
        onSecondary={() => void schedulerCommand('run-now')}
        disabled={!!running}
        meta={[
          `${data?.salesIntelligence?.totals.scale ?? data?.commercialScores.top.length ?? 0} a escalar`,
          `${data?.salesIntelligence?.totals.optimize ?? data?.commercialScores.needsWork.length ?? 0} a corregir`,
          `${data?.salesIntelligence?.totals.rotate ?? data?.cleanup?.totals.rotate ?? 0} a rotar`,
          `${data?.promotionCandidates.length ?? 0} promocionables`,
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommercialMetricCard label="Productos a escalar" value={data?.salesIntelligence?.totals.scale ?? data?.commercialScores.top.length ?? 0} detail="ventas o senales fuertes" tone="emerald" />
        <CommercialMetricCard label="Optimizar" value={data?.salesIntelligence?.totals.optimize ?? ((data?.cleanup?.totals.optimize ?? 0) + (data?.commercialScores.needsWork.length ?? 0))} detail="visitas sin conversion" tone="amber" />
        <CommercialMetricCard label="Rotar sin traccion" value={data?.salesIntelligence?.totals.rotate ?? data?.cleanup?.totals.rotate ?? 0} detail={`${data?.cleanup?.thresholdDays ?? 14}+ dias sin venta/senal`} tone="rose" />
        <CommercialMetricCard label="Acciones ejecutables" value={(data?.actions ?? []).filter((action) => action.canExecute).length} detail="con guardrails" tone="cyan" />
      </div>

      <DecisionTabs
        value={commandTab}
        onChange={setCommandTab}
        tabs={[
          { value: 'ahora', label: 'Ahora', count: actionGroups.needsDecision.length, tone: 'cyan' },
          { value: 'escalar', label: 'Escalar', count: data?.salesIntelligence?.totals.scale ?? data?.commercialScores.top.length ?? 0, tone: 'emerald' },
          { value: 'corregir', label: 'Corregir', count: data?.salesIntelligence?.totals.optimize ?? data?.commercialScores.needsWork.length ?? 0, tone: 'amber' },
          { value: 'proteger', label: 'Proteger', count: (data?.salesIntelligence?.totals.protect ?? 0) + (data?.profitGuard.reviewRequired ?? 0), tone: 'rose' },
          { value: 'aprendizaje', label: 'Aprendizaje', count: data?.learning.recentActions.length ?? 0, tone: 'violet' },
        ]}
      />

      {commandTab !== 'ahora' && (
        <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
          <div className="mb-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Vista premium filtrada</p>
            <h2 className="mt-1 text-base font-bold text-white">
              {commandTab === 'escalar' ? 'Productos que merecen trafico y repetición'
                : commandTab === 'corregir' ? 'Productos con señal débil que pueden mejorar'
                  : commandTab === 'proteger' ? 'Riesgos de margen, ficha o operación'
                    : 'Memoria, trazas y aprendizaje del agente'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">El detalle operativo completo queda debajo; esta vista resume la decisión comercial sin saturar la primera pantalla.</p>
          </div>
          <div className="space-y-2">
            {(commandTab === 'escalar' ? data?.salesIntelligence?.topProducts.filter((item) => item.decision === 'SCALE')
              : commandTab === 'corregir' ? data?.salesIntelligence?.topProducts.filter((item) => item.decision === 'OPTIMIZE')
                : commandTab === 'proteger' ? data?.salesIntelligence?.topProducts.filter((item) => item.decision === 'PROTECT' || item.decision === 'ROTATE')
                  : [])?.slice(0, 6).map((item, idx) => (
                    <ProductSignalRow
                      key={`${item.listingId ?? 'signal'}-${idx}`}
                      title={item.title}
                      decision={item.decision}
                      tone={item.decision === 'SCALE' ? 'emerald' : item.decision === 'OPTIMIZE' ? 'amber' : item.decision === 'PROTECT' ? 'rose' : 'slate'}
                      reason={item.reasons[0] ?? 'Recolectando evidencia'}
                      metrics={[
                        { label: 'score', value: item.score },
                        { label: 'vistas', value: item.signal.views },
                        { label: 'carrito', value: item.signal.addToCarts },
                        { label: 'compras', value: item.signal.purchases },
                      ]}
                    />
                  ))}
            {commandTab === 'aprendizaje' && (data?.learning.recentActions ?? []).slice(0, 6).map((item) => (
              <ProductSignalRow
                key={item.id}
                title={item.message}
                decision="MEMORIA"
                tone="violet"
                reason={new Date(item.createdAt).toLocaleString()}
                metrics={[{ label: 'origen', value: 'trace' }]}
              />
            ))}
            {commandTab !== 'aprendizaje' && !(data?.salesIntelligence?.topProducts ?? []).some((item) => (
              commandTab === 'escalar' ? item.decision === 'SCALE'
                : commandTab === 'corregir' ? item.decision === 'OPTIMIZE'
                  : commandTab === 'proteger' ? item.decision === 'PROTECT' || item.decision === 'ROTATE'
                    : false
            )) && (
              <p className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">Sin productos en esta decisión por ahora.</p>
            )}
          </div>
        </section>
      )}

      <RiskActionQueue
        title="Que hago ahora"
        items={(data?.actions ?? []).slice(0, 4).map((action) => ({
          id: action.id,
          title: action.title,
          detail: action.expectedImpact,
          tone: action.priority === 'critical' ? 'rose' : action.priority === 'high' ? 'amber' : action.priority === 'medium' ? 'cyan' : 'slate',
          actionLabel: action.canExecute ? 'Ejecutar' : undefined,
          onAction: action.canExecute ? () => void execute(action) : undefined,
        }))}
        emptyLabel="Sin acciones comerciales urgentes."
      />

      {data?.cleanup && (
        <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Higiene comercial</p>
              <h3 className="mt-1 text-base font-bold text-white">Rotar, optimizar y proteger sin borrar aprendizaje</h3>
              <p className="mt-1 text-xs text-slate-400">
                Regla conservadora: {data.cleanup.thresholdDays}+ dias sin ventas ni senales pasa a rotacion; con senal social pasa a optimizacion.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded border border-rose-500/25 bg-rose-950/20 p-2 text-rose-100">Rotar <b>{data.cleanup.totals.rotate}</b></span>
              <span className="rounded border border-amber-500/25 bg-amber-950/20 p-2 text-amber-100">Optimizar <b>{data.cleanup.totals.optimize}</b></span>
              <span className="rounded border border-cyan-500/25 bg-cyan-950/20 p-2 text-cyan-100">Proteger <b>{data.cleanup.totals.protect}</b></span>
            </div>
          </div>
          {data.cleanup.candidates.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {data.cleanup.candidates.slice(0, 6).map((item, idx) => (
                <div key={`${item.listingId ?? item.productId}-${idx}`} className="rounded border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100" title={item.title}>{item.title}</p>
                    <span className="rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{item.commercialClass}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.reason}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {data?.salesIntelligence && (
        <section className="rounded-lg border border-cyan-500/25 bg-slate-950/70 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Sales Intelligence 30d</p>
              <h3 className="mt-1 text-base font-bold text-white">Decisión por producto basada en señales reales</h3>
              <p className="mt-1 text-xs text-slate-400">
                Usa vistas, carrito, checkout, compra, clicks sociales, margen y Profit Guard para decidir escala, optimización, protección o rotación.
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <span className="rounded border border-emerald-500/25 bg-emerald-950/20 p-2 text-emerald-100">Escalar <b>{data.salesIntelligence.totals.scale}</b></span>
              <span className="rounded border border-amber-500/25 bg-amber-950/20 p-2 text-amber-100">Optimizar <b>{data.salesIntelligence.totals.optimize}</b></span>
              <span className="rounded border border-cyan-500/25 bg-cyan-950/20 p-2 text-cyan-100">Proteger <b>{data.salesIntelligence.totals.protect}</b></span>
              <span className="rounded border border-rose-500/25 bg-rose-950/20 p-2 text-rose-100">Rotar <b>{data.salesIntelligence.totals.rotate}</b></span>
              <span className="rounded border border-slate-600 bg-slate-900 p-2 text-slate-200">Aprender <b>{data.salesIntelligence.totals.learning}</b></span>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded border border-slate-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Decisión</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Vistas</th>
                  <th className="px-3 py-2">Carrito</th>
                  <th className="px-3 py-2">Compra</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {data.salesIntelligence.topProducts.slice(0, 8).map((item, idx) => (
                  <tr key={`${item.listingId ?? 'p'}-${idx}`} className="border-t border-slate-800">
                    <td className="max-w-xs truncate px-3 py-2 text-slate-100" title={item.title}>{item.title}</td>
                    <td className="px-3 py-2 font-bold text-cyan-200">{item.decision}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-200">{item.score}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{item.signal.views}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{item.signal.addToCarts}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{item.signal.purchases}</td>
                    <td className="max-w-sm px-3 py-2 text-slate-400">{item.reasons[0] ?? 'Recolectando evidencia'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <CycleNarrativeStrip active="optimize" />

      {data?.morningBrief && (
        <section className="rounded-lg border border-emerald-500/25 bg-emerald-950/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">
                Manana operativa · confianza {data.morningBrief.confidence}
              </p>
              <h3 className="mt-1 text-lg font-bold text-white">{data.morningBrief.headline}</h3>
              <p className="mt-1 text-sm text-slate-300">
                Agenda priorizada por margen, checkout, publicaciones, promocion organica y aprendizaje real del ciclo.
              </p>
            </div>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
              foco: {data.morningBrief.focus.replace('_', ' ')}
            </span>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              {data.morningBrief.tasks.map((task, index) => (
                <div key={task.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-200">{index + 1}</span>
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${priorityClass(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs text-slate-500">{task.count} item(s)</span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-100">{task.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{task.rationale}</p>
                      <p className="mt-1 text-xs text-emerald-200">{task.expectedOutcome}</p>
                      {task.sampleTitles.length > 0 && (
                        <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">
                          Ejemplos: {task.sampleTitles.join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {task.actionType && (data.actions ?? []).some((action) => action.type === task.actionType && action.canExecute) && (
                        <button
                          type="button"
                          disabled={!!running}
                          onClick={() => {
                            const action = (data.actions ?? []).find((item) => item.type === task.actionType && item.canExecute);
                            if (action) void execute(action);
                          }}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Ejecutar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => window.location.assign(task.page)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-sm font-bold text-white">Watchlist</p>
              <div className="mt-3 space-y-2">
                {data.morningBrief.watchlist.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => window.location.assign(item.page)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-left hover:border-slate-600"
                  >
                    <span>
                      <span className="block text-xs font-semibold text-slate-200">{item.label}</span>
                      <span className={`mt-1 block text-[11px] ${
                        item.severity === 'critical' ? 'text-red-300' : item.severity === 'warning' ? 'text-amber-300' : 'text-cyan-300'
                      }`}>
                        {item.severity}
                      </span>
                    </span>
                    <span className="rounded bg-slate-950 px-2 py-1 text-xs font-bold text-white">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

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
          <section className="rounded-lg border border-cyan-500/30 bg-slate-950 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                  <Target className="h-4 w-4 text-cyan-300" />
                  Centro de mando: que debes hacer ahora
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Esta franja separa decisiones humanas, automatizacion activa e informacion de observacion. Los botones importantes viven en el bloque de accion.
                </p>
              </div>
              {primaryAction ? (
                <button
                  type="button"
                  disabled={running === primaryAction.id}
                  onClick={() => void execute(primaryAction)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  {running === primaryAction.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                  {running === primaryAction.id ? 'Ejecutando accion prioritaria' : 'Ejecutar accion prioritaria'}
                </button>
              ) : (
                <span className="rounded-lg border border-emerald-500/35 bg-emerald-950/25 px-4 py-2 text-sm font-bold text-emerald-100">
                  Sin acciones urgentes ejecutables
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 p-3">
                <p className="text-xs font-bold uppercase text-amber-200">Requiere tu decision</p>
                <p className="mt-2 text-3xl font-bold text-white">{actionGroups.needsDecision.length}</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  Acciones manuales, pendientes o con boton disponible. Aqui decides si ejecutar o revisar.
                </p>
                <div className="mt-3 space-y-1">
                  {actionGroups.needsDecision.slice(0, 3).map((action) => (
                    <p key={action.id} className="truncate rounded bg-black/25 px-2 py-1 text-xs text-amber-50">{action.title}</p>
                  ))}
                  {actionGroups.needsDecision.length === 0 && (
                    <p className="rounded bg-black/25 px-2 py-1 text-xs text-amber-50">No hay decisiones urgentes ahora.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 p-3">
                <p className="text-xs font-bold uppercase text-emerald-200">Automatico / ya aplicado</p>
                <p className="mt-2 text-3xl font-bold text-white">{actionGroups.automatic.length}</p>
                <p className="mt-1 text-xs text-emerald-100/80">
                  Trabajo que el agente ya ejecuto o puede sostener por ciclo con guardrails.
                </p>
                <div className="mt-3 space-y-1">
                  <p className="rounded bg-black/25 px-2 py-1 text-xs text-emerald-50">
                    Ciclo vendedor: {scheduler?.state ?? 'N/D'} · modo seguro {scheduler?.config.safeMode ? 'ON' : 'OFF'}
                  </p>
                  <p className="rounded bg-black/25 px-2 py-1 text-xs text-emerald-50">
                    Proximo ciclo: {dateTime(scheduler?.nextRunAt)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs font-bold uppercase text-slate-400">Solo observacion</p>
                <p className="mt-2 text-3xl font-bold text-white">{actionGroups.observation.length}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Pipeline, score, aprendizaje, verdad Shopify y listas de productos son evidencia para entender el estado.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span className="rounded bg-black/25 px-2 py-1 text-slate-300">Pipeline {data.salesPipeline.overallScore}/100</span>
                  <span className="rounded bg-black/25 px-2 py-1 text-slate-300">Salud {data.health.score}/100</span>
                </div>
              </div>
            </div>
          </section>

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
              <p className="text-xs text-slate-500" title="Total en dólares de ventas pagadas">{money(data.kpis.revenue30Usd)} ingresos</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Embudo de Conversión</p>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Visitantes', value: data.kpis.visitors, pct: 100, fill: '#3b82f6' },
                      { name: 'Carrito', value: Math.round(data.kpis.visitors * (data.kpis.addToCartRatePct / 100)), pct: data.kpis.addToCartRatePct, fill: '#f59e0b' },
                      { name: 'Checkout', value: Math.round(data.kpis.visitors * (data.kpis.checkoutRatePct / 100)), pct: data.kpis.checkoutRatePct, fill: '#8b5cf6' },
                      { name: 'Compra', value: data.kpis.paidOrders30, pct: data.kpis.purchaseRatePct, fill: '#10b981' },
                    ]}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: -20, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip
                      cursor={{ fill: '#1e293b' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs shadow-xl">
                              <p className="font-bold text-white">{d.name}</p>
                              <p className="text-slate-300">Volumen: {d.value}</p>
                              <p className="text-slate-400">Conversión: {Number(d.pct).toFixed(2)}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                      {
                        [0, 1, 2, 3].map((entry, index) => (
                          <RechartsCell key={`cell-${index}`} fill={['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981'][index]} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {trafficSignal && (
                <div className={`mt-3 rounded-md border px-2 py-1.5 text-xs ${trafficSignal.className}`}>
                  <p className="font-semibold">{trafficSignal.label}</p>
                  <p className="mt-1 leading-snug opacity-90">{trafficSignal.detail}</p>
                </div>
              )}
            </div>
          </section>

          {scheduler && (
            <section className="rounded-lg border border-cyan-500/25 bg-slate-950 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                    <Bot className="h-4 w-4 text-cyan-300" />
                      Automatizacion del agente vendedor
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
                    Esto corre por ciclos. Los botones Iniciar, Pausar, Detener y Ejecutar ahora controlan el piloto automatico;
                    no son recomendaciones, cambian el estado real del agente.
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

          <section className="rounded-lg border border-cyan-500/25 bg-slate-950 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                  <TrendingUp className="h-4 w-4 text-cyan-300" />
                  Pipeline comercial de ventas
                  <span className="rounded-full border border-slate-600 bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                    Solo observacion
                  </span>
                </h3>
                <p className="mt-1 max-w-4xl text-sm text-slate-400">{data.salesPipeline.distinction}</p>
              </div>
              <div className="grid min-w-[260px] grid-cols-2 gap-2 text-xs">
                <span className="rounded bg-cyan-500/10 p-2 text-cyan-100" title="Puntuación algorítmica de qué tan listo está el catálogo para vender">Salud del pipeline: <b>{data.salesPipeline.overallScore}/100</b></span>
                <span className={`rounded p-2 ${pipelineStatusClass(data.salesPipeline.bottleneck.status)}`}>
                  Cuello: <b>{data.salesPipeline.bottleneck.label}</b>
                </span>
              </div>
            </div>

            {data.salesPipeline.stages.length > 0 && (
              <div className="mt-4 h-[240px] w-full rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.salesPipeline.stages}
                    layout="vertical"
                    margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                  >
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={110}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    />
                    <Tooltip
                      cursor={{ fill: '#1e293b' }}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#f8fafc', fontWeight: 600 }}
                      formatter={(value: number) => [`${value}/100`, 'Score']}
                    />
                    <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={24} background={{ fill: '#1e293b', radius: 6 }}>
                      {data.salesPipeline.stages.map((entry, index) => (
                        <RechartsCell
                          key={`cell-${index}`}
                          fill={
                            entry.status === 'healthy'
                              ? '#10b981'
                              : entry.status === 'watch'
                                ? '#f59e0b'
                                : '#ef4444'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-6">
              {data.salesPipeline.stages.map((stage) => (
                <article key={stage.key} className={`rounded-lg border p-3 ${pipelineStatusClass(stage.status)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold uppercase leading-tight">{stage.label}</p>
                    <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold">{stage.score}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[11px] text-slate-300">{stage.objective}</p>
                  <p className="mt-2 text-[11px] font-semibold text-white">Siguiente: {stage.nextMove}</p>
                  <p className="mt-2 text-[10px] text-slate-500">{stage.page}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_1fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Lifecycle de productos</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <span className="rounded bg-black/20 p-2">Escalar: <b>{data.salesPipeline.productLifecycle.scale.length}</b></span>
                  <span className="rounded bg-black/20 p-2">Optimizar: <b>{data.salesPipeline.productLifecycle.optimize.length}</b></span>
                  <span className="rounded bg-black/20 p-2">Proteger: <b>{data.salesPipeline.productLifecycle.protect.length}</b></span>
                  <span className="rounded bg-black/20 p-2">Retirar/fusionar: <b>{data.salesPipeline.productLifecycle.retireOrMerge.length}</b></span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Datos que usa</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.salesPipeline.dataSources.internal.slice(0, 5).map((item) => (
                    <span key={item} className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">{item}</span>
                  ))}
                  {data.salesPipeline.dataSources.external.slice(0, 4).map((item) => (
                    <span key={item} className="rounded-full bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">{item}</span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Estrategia de exito</p>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  {[...data.salesPipeline.strategy.positioning, ...data.salesPipeline.strategy.credibility].slice(0, 3).map((item) => (
                    <p key={item} className="rounded bg-black/20 px-3 py-2">{item}</p>
                  ))}
                </div>
              </div>
            </div>
          </section>

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
              <div className="mt-4 flex flex-col md:flex-row md:items-center gap-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="h-[180px] w-full md:w-[220px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'A (Excelente)', value: data.commercialScores.distribution.excellent, fill: '#10b981' },
                          { name: 'B (Bueno)', value: data.commercialScores.distribution.good, fill: '#06b6d4' },
                          { name: 'C (Observación)', value: data.commercialScores.distribution.watch, fill: '#f59e0b' },
                          { name: 'D (Riesgo)', value: data.commercialScores.distribution.risk, fill: '#ef4444' },
                        ].filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        stroke="none"
                        paddingAngle={4}
                      >
                        {/* Se usa el color definido en el dataset (prop 'fill' automático en RechartsCell interno de Recharts) */}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#f8fafc', fontWeight: 600 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  <p className="text-sm font-semibold text-slate-300">Resumen de catálogo</p>
                  <p className="text-xs text-slate-400">
                    El agente asigna a cada listing un grado basado en su completitud y potencial de conversión. 
                    Un puntaje <b>A</b> indica que está listo para tráfico frío, mientras que <b>D</b> requiere intervención antes de promocionar.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="rounded bg-black/20 p-2 text-slate-300">Total evaluados: <b>{data.commercialScores.distribution.excellent + data.commercialScores.distribution.good + data.commercialScores.distribution.watch + data.commercialScores.distribution.risk}</b></span>
                    <span className="rounded bg-emerald-500/10 p-2 text-emerald-200">Alta calidad: <b>{data.commercialScores.distribution.excellent}</b></span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-slate-500">Mejores para empujar</p>
                  <div className="space-y-2">
                    {data.commercialScores.top.slice(0, 5).map((item) => (
                      <div key={item.listingId} className="rounded-lg border border-slate-800 bg-slate-900 p-3 transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-cyan-500/35">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</p>
                          <span className={`rounded-full border px-2 py-1 text-xs font-bold ${gradeClass(item.grade)}`}>{item.grade} {item.score}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {money(item.priceUsd)} · margen {pct(item.marginPct)} · {item.imageCount} img · {item.orders30} ventas 30d · {actionLabel(item.recommendedAction)}
                        </p>
                        {item.revenue30Usd > 0 && (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-200">
                            Señal real: {money(item.revenue30Usd)} vendido en 30 días
                          </p>
                        )}
                        <ProductLifecycleLine steps={commercialLifecycleSteps(item)} compact className="mt-2" />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-slate-500">Riesgo o trabajo pendiente</p>
                  <div className="space-y-2">
                    {data.commercialScores.needsWork.slice(0, 5).map((item) => (
                      <div key={item.listingId} className="rounded-lg border border-slate-800 bg-slate-900 p-3 transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-amber-500/35">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</p>
                          <span className={`rounded-full border px-2 py-1 text-xs font-bold ${gradeClass(item.grade)}`}>{item.grade} {item.score}</span>
                        </div>
                        <p className="mt-1 text-xs text-amber-200">{item.issues.slice(0, 2).join(' · ') || actionLabel(item.recommendedAction)}</p>
                        {item.orders30 > 0 && (
                          <p className="mt-1 text-[11px] text-emerald-200">
                            Tiene ventas recientes: revisar antes de pausar o fusionar.
                          </p>
                        )}
                        <ProductLifecycleLine steps={commercialLifecycleSteps(item)} compact className="mt-2" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-orange-500/30 bg-orange-950/10 p-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-orange-100">
                  <ShieldCheck className="h-4 w-4" />
                  Profit Guard
                </h3>
                <p className="mt-1 text-sm text-slate-300">Protección de márgenes y auditoría de precios.</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <span className="rounded bg-black/20 p-2">Auditados: <b>{data.profitGuard.scanned}</b></span>
                  <span className="rounded bg-black/20 p-2 text-emerald-200">Sanos: <b>{data.profitGuard.okCount}</b></span>
                  <span className="rounded bg-black/20 p-2 text-cyan-200">Ajustes precio: <b>{data.profitGuard.priceIncreases}</b></span>
                  <span className="rounded bg-black/20 p-2 text-amber-200">Requieren revisión: <b>{data.profitGuard.reviewRequired}</b></span>
                  <span className="col-span-2 rounded bg-black/20 p-2 text-red-200">Pausados por seguridad: <b>{data.profitGuard.pausedUnsafe}</b></span>
                </div>
                {data.profitGuard.sampleIssues.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold uppercase text-slate-500">Alertas de Margen / Costo</p>
                    {data.profitGuard.sampleIssues.map((issue, idx) => (
                      <div key={idx} className="rounded border border-orange-500/20 bg-black/20 px-3 py-2 text-xs">
                        <p className="font-semibold text-orange-50 line-clamp-1">{issue.title}</p>
                        <p className="mt-1 text-orange-200/80">{issue.reason}</p>
                        <p className="mt-1 font-mono text-[10px] text-orange-300/60 uppercase">Acción: {issue.action}</p>
                      </div>
                    ))}
                  </div>
                )}
                {data.profitGuard.sampleIssues.length === 0 && data.profitGuard.reviewRequired === 0 && (
                  <p className="mt-4 rounded border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">
                    Todos los productos auditados cumplen con las reglas de margen.
                  </p>
                )}
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
                    Acciones que puedes tomar
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aqui estan los items accionables. Lo aplicado queda como evidencia y no muestra boton principal.
                  </p>
                </div>
                {primaryAction && (
                  <button
                    type="button"
                    disabled={running === primaryAction.id}
                    onClick={() => void execute(primaryAction)}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {running === primaryAction.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                    {running === primaryAction.id ? 'Ejecutando...' : 'Ejecutar accion prioritaria'}
                  </button>
                )}
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                <span className="rounded border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-amber-100">
                  Decision usuario: revisar o presionar ejecutar
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-emerald-100">
                  Aplicado: solo evidencia, no requiere accion
                </span>
                <span className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300">
                  Manual/bloqueado: debes resolver fuera del boton automatico
                </span>
              </div>

              <div className="space-y-3">
                {[...actionGroups.needsDecision, ...actionGroups.automatic, ...actionGroups.observation].map((action) => {
                  const result = actionResults[action.id];
                  const isRunning = running === action.id;
                  const executionStatus = currentExecutionStatus(action, result, isRunning);
                  const metrics = actionResultMetrics(result);
                  const steps = action.execution?.steps?.length
                    ? action.execution.steps
                    : ['Validar guardrails', 'Ejecutar accion', 'Registrar trazabilidad', 'Verificar resultado'];
                  return (
                  <article
                    key={action.id}
                    className={`rounded-lg border p-4 transition duration-200 motion-safe:hover:-translate-y-0.5 ${
                      executionStatus === 'applied'
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
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${executionTone(executionStatus)}`}>
                            {executionStatus === 'running' ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : executionStatus === 'applied' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : executionStatus === 'needs_review' ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <Clock3 className="h-3 w-3" />
                            )}
                            {executionLabel(executionStatus)}
                          </span>
                          <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold text-slate-200">
                            {actionRoleLabel(action, executionStatus)}
                          </span>
                          {action.execution?.lastRunAt && !result && (
                            <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] text-slate-300">
                              Ultima: {dateTime(action.execution.lastRunAt)}
                            </span>
                          )}
                        </div>
                        <h4 className="mt-2 text-sm font-bold text-white">{action.title}</h4>
                        <p className="mt-1 text-sm text-slate-300">{action.rationale}</p>
                        <p className="mt-1 text-xs text-slate-400">{action.expectedImpact}</p>
                        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${executionTone(executionStatus)}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold">
                              {isRunning
                                ? 'El agente esta ejecutando la accion con limites seguros.'
                                : result?.message || action.execution?.summary || 'Lista para ejecutar con trazabilidad.'}
                            </p>
                            <span className="rounded-full bg-black/25 px-2 py-0.5">
                              Afecta aprox. {action.execution?.affectedEstimate ?? 0}
                            </span>
                          </div>
                          {(metrics || action.execution?.traceLabel) && (
                            <p className="mt-1 opacity-85">
                              {metrics || `Traza: sales_agent.action.${action.execution?.traceLabel}`}
                            </p>
                          )}
                        </div>
                      </div>
                      {action.canExecute && executionStatus !== 'applied' && (
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => void execute(action)}
                          className="shrink-0 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                        >
                          <span className="inline-flex items-center gap-2">
                            {isRunning && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                            {isRunning ? 'Ejecutando...' : executionStatus === 'needs_review' ? 'Reintentar / corregir' : 'Ejecutar'}
                          </span>
                        </button>
                      )}
                      {executionStatus === 'applied' && (
                        <span className="shrink-0 rounded-lg border border-emerald-500/35 bg-emerald-950/25 px-3 py-2 text-xs font-bold text-emerald-100">
                          Ya aplicado
                        </span>
                      )}
                    </div>
                    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        <ListChecks className="h-3.5 w-3.5" />
                        Proceso visible
                      </div>
                      <div className="grid gap-2 md:grid-cols-4">
                        {steps.map((step, index) => {
                          const done = executionStatus === 'applied' || executionStatus === 'needs_review' || (isRunning && index === 0);
                          const active = isRunning && index === 1;
                          return (
                            <div key={`${action.id}-${step}`} className={`rounded border px-2 py-2 text-[11px] ${
                              done
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                : active
                                  ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100'
                                  : 'border-slate-700 bg-slate-950/60 text-slate-400'
                            }`}>
                              <span className="font-bold">{index + 1}. </span>{step}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {action.guardrails.map((guardrail) => (
                        <span key={guardrail} className="rounded-full bg-black/25 px-2 py-1 text-[11px] text-slate-300">
                          {guardrail}
                        </span>
                      ))}
                    </div>
                  </article>
                  );
                })}
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
                  <div key={item.listingId} className="rounded-lg border border-slate-800 bg-slate-900 p-3 transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-cyan-500/35">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{money(item.priceUsd)} · margen {pct(item.marginPct)} · score {item.score}</p>
                        <ProductLifecycleLine steps={promotionLifecycleSteps(item)} compact className="mt-2" />
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
                  <div key={item.listingId} className="rounded-lg border border-red-500/20 bg-black/20 p-3 transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-red-400/50">
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
