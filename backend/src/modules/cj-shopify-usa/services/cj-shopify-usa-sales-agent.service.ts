import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_SOCIAL_POST_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';
import { cjShopifyUsaProfitGuardService } from './cj-shopify-usa-profit-guard.service';
import { cjShopifyUsaSocialService } from './cj-shopify-usa-social.service';
import { cjShopifyUsaAdminService } from './cj-shopify-usa-admin.service';
import { cjShopifyUsaPublishService } from './cj-shopify-usa-publish.service';
import { cjShopifyUsaOperationLockService } from './cj-shopify-usa-operation-lock.service';
import { buildDraftTitle, buildDraftDescription } from './cj-shopify-usa-title-builder.service';

type SalesAgentPriority = 'critical' | 'high' | 'medium' | 'low';
type SalesAgentActionType =
  | 'VERIFY_CHECKOUT'
  | 'RUN_PROFIT_GUARD'
  | 'PROMOTE_TOP_PRODUCTS'
  | 'CURATE_SIMILAR_PRODUCTS'
  | 'IMPROVE_PRODUCT_COPY'
  | 'DISCOVER_NEW_PRODUCTS'
  | 'PUBLISH_APPROVED_BACKLOG'
  | 'UNPUBLISH_UNSAFE_LISTINGS'
  | 'FIX_CATALOG_QUALITY'
  | 'BUILD_SALES_CAMPAIGN'
  | 'RUN_SALES_PIPELINE_REVIEW';

type SalesAgentAction = {
  id: string;
  type: SalesAgentActionType;
  priority: SalesAgentPriority;
  title: string;
  rationale: string;
  expectedImpact: string;
  risk: 'safe' | 'approval_required' | 'manual_required';
  canExecute: boolean;
  guardrails: string[];
  payload?: Record<string, unknown>;
  execution?: SalesAgentActionExecution;
};

type SalesAgentActionExecution = {
  status: 'pending' | 'applied' | 'needs_review' | 'manual' | 'blocked';
  lastRunAt: string | null;
  summary: string;
  affectedEstimate: number;
  verified: boolean;
  traceLabel: string;
  steps: string[];
};

type SalesAgentSchedulerState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR';

type SalesAgentCycleStage = 'diagnostic' | 'optimization' | 'marketing' | 'learning' | 'safe_mode';

type SalesAgentSchedulerConfig = {
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

type SalesAgentCycleEvent = {
  ts: string;
  stage: SalesAgentCycleStage;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
};

type SalesAgentCycleResult = {
  cycleId: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  diagnosisScore: number;
  published: number;
  unpublished: number;
  promoted: number;
  recommendations: number;
  errors: number;
  events: SalesAgentCycleEvent[];
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

type SalesCampaignPlan = {
  generatedAt: string;
  theme: string;
  objective: string;
  budgetMode: 'organic_only';
  channels: string[];
  promote: Array<Pick<CommercialScore, 'listingId' | 'title' | 'handle' | 'score' | 'marginPct'>>;
  fixBeforeTraffic: Array<Pick<CommercialScore, 'listingId' | 'title' | 'score' | 'issues'>>;
  protectMargin: Array<Pick<CommercialScore, 'listingId' | 'title' | 'score' | 'issues'>>;
  pauseOrMerge: Array<Pick<CommercialScore, 'listingId' | 'title' | 'score' | 'issues'>>;
  nextReviewAt: string;
};

type SalesPipelineStageKey =
  | 'discover'
  | 'publish_quality'
  | 'profit_protection'
  | 'trust_checkout'
  | 'traffic'
  | 'conversion_learning';

type SalesPipelineStage = {
  key: SalesPipelineStageKey;
  label: string;
  page: string;
  score: number;
  status: 'healthy' | 'watch' | 'blocked';
  objective: string;
  internalSignals: string[];
  externalSignals: string[];
  nextMove: string;
  automatedActions: SalesAgentActionType[];
};

type SalesPipeline = {
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

const DEFAULT_SALES_AGENT_CONFIG: SalesAgentSchedulerConfig = {
  enabled: false,
  intervalHours: 24,
  safeMode: true,
  autoPublishApprovedDrafts: true,
  autoUnpublishUnsafeListings: true,
  autoPromoteOrganic: true,
  maxPublishPerCycle: 2,
  maxUnpublishPerCycle: 3,
  maxPromotionsPerCycle: 5,
};

let schedulerState: SalesAgentSchedulerState = 'IDLE';
let schedulerConfig: SalesAgentSchedulerConfig = { ...DEFAULT_SALES_AGENT_CONFIG };
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let currentSalesCycle: SalesAgentCycleResult | null = null;
let salesCycleHistory: SalesAgentCycleResult[] = [];
let schedulerLastRunAt: Date | null = null;
let schedulerNextRunAt: Date | null = null;

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value: unknown): number {
  const parsed = n(value);
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
}

function normalizeTitle(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(cj[a-z0-9]+|\d{8,}[a-z0-9]*)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractImageCount(payload: unknown): number {
  const data = payload as Record<string, unknown> | null;
  const images = data?.images;
  if (Array.isArray(images)) return images.length;
  return 0;
}

function draftRecord(payload: unknown): Record<string, any> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...(payload as Record<string, any>) }
    : {};
}

function buyerTitle(listing: { draftPayload: unknown; product: { title: string } }): string {
  const draft = draftRecord(listing.draftPayload);
  return String(draft.title || listing.product.title || '').trim();
}

function titleCase(value: string): string {
  const minorWords = new Set(['and', 'or', 'for', 'the', 'with', 'of', 'a', 'an', 'to', 'in']);
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function trimTitle(title: string, maxLength = 58): string {
  const clean = String(title || '').trim();
  if (clean.length <= maxLength) return clean;
  const words = clean.split(' ');
  const kept: string[] = [];
  for (const word of words) {
    const candidate = [...kept, word].join(' ');
    if (candidate.length > maxLength) break;
    kept.push(word);
  }
  return kept.length ? kept.join(' ') : clean.slice(0, maxLength).trim();
}

function titleQuality(title: string): { score: number; issues: string[] } {
  const key = normalizeTitle(title);
  const words = key.split(' ').filter(Boolean);
  const issues: string[] = [];
  let score = 100;

  if (words.length < 4) {
    score -= 25;
    issues.push('titulo demasiado corto');
  }
  if (words.length > 13) {
    score -= 15;
    issues.push('titulo demasiado largo');
  }
  if (/\bpet supplies\b/i.test(title)) {
    score -= 10;
    issues.push('frase generica pet supplies');
  }
  if (/\b(out door|are removable|for dog cat|cat dog)\b/i.test(title)) {
    score -= 20;
    issues.push('ingles poco natural');
  }
  if (/\b(cj[a-z0-9]+|\d{10,})\b/i.test(title)) {
    score -= 25;
    issues.push('ruido de proveedor en titulo');
  }

  return { score: Math.max(0, score), issues };
}

function scoreGrade(score: number): CommercialScore['grade'] {
  if (score >= 85) return 'A';
  if (score >= 72) return 'B';
  if (score >= 58) return 'C';
  return 'D';
}

function buildCommercialScore(input: {
  listing: any;
  duplicateCount: number;
  profitIssue?: { action?: string; reason?: string } | null;
}): CommercialScore {
  const title = buyerTitle(input.listing);
  const quality = titleQuality(title);
  const imageCount = extractImageCount(input.listing.draftPayload);
  const marginPct = n(input.listing.evaluation?.estimatedMarginPct);
  const priceUsd = n(input.listing.listedPriceUsd);
  const shippingKnown = Boolean(input.listing.shippingQuote);
  const duplicateRisk = input.duplicateCount > 1;
  const profitRisk = Boolean(input.profitIssue);
  const socialPosts = Array.isArray(input.listing.socialPosts) ? input.listing.socialPosts.length : 0;
  const promoted = Boolean(
    input.listing.socialPosts?.some((post: any) => post.status === CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS),
  );
  const issues: string[] = [];
  const opportunities: string[] = [];
  let score = 45;

  score += Math.min(22, Math.max(-12, marginPct));
  score += Math.min(16, Math.max(0, quality.score / 6));
  score += Math.min(12, imageCount * 2);
  score += shippingKnown ? 8 : -10;
  score += priceUsd > 0 && priceUsd <= 35 ? 5 : priceUsd > 45 ? -4 : 0;
  score += promoted ? 3 : 0;
  score -= duplicateRisk ? 14 : 0;
  score -= profitRisk ? 22 : 0;

  if (marginPct < 10) issues.push('margen bajo o no demostrado');
  if (!shippingKnown) issues.push('shipping CJ no confirmado');
  if (imageCount === 0) issues.push('sin imagen local registrada');
  if (quality.score < 80) issues.push(...quality.issues);
  if (duplicateRisk) issues.push('posible duplicado activo');
  if (input.profitIssue?.reason) issues.push(input.profitIssue.reason);

  if (marginPct >= 15) opportunities.push('margen promocionable');
  if (imageCount >= 4) opportunities.push('buena base visual');
  if (!promoted && !profitRisk && !duplicateRisk && quality.score >= 80 && imageCount > 0) {
    opportunities.push('candidato a trafico organico');
  }
  if (quality.score < 80) opportunities.push('mejorar titulo/descripcion SEO');
  if (!shippingKnown) opportunities.push('enriquecer shipping antes de escalar');

  const roundedScore = Math.max(0, Math.min(100, Math.round(score)));
  let recommendedAction: CommercialScore['recommendedAction'] = 'WATCH';
  if (profitRisk || marginPct < 10 || !shippingKnown) recommendedAction = 'PROFIT_GUARD';
  else if (duplicateRisk) recommendedAction = 'CURATE_DUPLICATE';
  else if (quality.score < 80 || imageCount === 0) recommendedAction = 'FIX';
  else if (!promoted && roundedScore >= 72) recommendedAction = 'PROMOTE';

  return {
    listingId: input.listing.id,
    title,
    handle: input.listing.shopifyHandle,
    score: roundedScore,
    grade: scoreGrade(roundedScore),
    priceUsd,
    marginPct,
    imageCount,
    shippingKnown,
    duplicateRisk,
    profitRisk,
    titleQualityScore: quality.score,
    conversionSignals: {
      promoted,
      socialPosts,
      hasSalesSignal: false,
    },
    issues: Array.from(new Set(issues)).slice(0, 5),
    opportunities: Array.from(new Set(opportunities)).slice(0, 5),
    recommendedAction,
  };
}

function buildLearningMemory(input: {
  traces: Array<{ message: string; meta: unknown; createdAt: Date }>;
  visitors: number;
  addToCartRatePct: number;
  checkoutRatePct: number;
  purchaseRatePct: number;
  socialCounts: Record<string, number>;
}) {
  const actionOutcomes = input.traces
    .filter((trace) => trace.message.startsWith('sales_agent.action.'))
    .slice(0, 10)
    .map((trace) => {
      const meta = safeMeta(trace.meta);
      const fixed = n(meta.results && Array.isArray(meta.results) ? meta.results.filter((row: any) => row.ok).length : meta.fixed);
      return {
        createdAt: trace.createdAt,
        action: trace.message.replace('sales_agent.action.', ''),
        impact: [
          n(meta.queued) ? `${n(meta.queued)} promociones encoladas` : null,
          n(meta.published) ? `${n(meta.published)} publicados` : null,
          n(meta.unpublished) ? `${n(meta.unpublished)} despublicados` : null,
          n(meta.priceIncreases) ? `${n(meta.priceIncreases)} precios protegidos` : null,
          fixed ? `${fixed} fichas corregidas` : null,
        ].filter(Boolean).join(' · ') || 'accion registrada',
      };
    });

  const observations = [
    input.purchaseRatePct === 0 && input.checkoutRatePct > 0
      ? 'Hay visitas con intencion, pero aun no hay compra registrada; checkout y confianza siguen siendo prioridad.'
      : 'El embudo no muestra bloqueo critico de pago en la ultima muestra.',
    input.socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS]
      ? 'Ya existe historial de publicaciones organicas; conviene comparar productos promocionados contra carrito/checkout.'
      : 'No hay suficientes promociones exitosas para aprender canal ganador; empezar con lotes pequenos.',
    input.visitors >= 100 && input.addToCartRatePct < 3
      ? 'El trafico no esta agregando al carrito con fuerza; mejorar ficha, precio percibido y confianza.'
      : 'La senal de carrito permite seguir probando productos top.',
  ];

  return {
    windowDays: 30,
    confidence: input.purchaseRatePct > 0 ? 'media' : 'temprana',
    observations,
    actionOutcomes,
    bestSignals: [
      input.addToCartRatePct > 5 ? 'carrito saludable' : null,
      input.checkoutRatePct > 1 ? 'checkout con intencion' : null,
      input.socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS] ? 'publicaciones organicas activas' : null,
    ].filter(Boolean),
    weakSignals: [
      input.purchaseRatePct === 0 ? 'sin compras cerradas' : null,
      input.checkoutRatePct > 0 && input.purchaseRatePct === 0 ? 'posible friccion en pago/confianza' : null,
    ].filter(Boolean),
  };
}

function buildDecisionTimeline(input: {
  traces: Array<{ id: string | number; message: string; meta: unknown; createdAt: Date }>;
  currentCycle: SalesAgentCycleResult | null;
}) {
  const traceItems = input.traces.slice(0, 12).map((trace) => {
    const meta = safeMeta(trace.meta);
    const status = trace.message.includes('failed') || n(meta.failed) > 0 ? 'needs_review' : 'done';
    return {
      id: `trace-${trace.id}`,
      ts: trace.createdAt,
      stage: trace.message.includes('profit') ? 'proteger margen' : trace.message.includes('promote') ? 'promocionar' : trace.message.includes('fix') ? 'corregir catalogo' : 'aprender',
      title: trace.message.replace(/^sales_agent\./, '').replace(/_/g, ' '),
      detail: [
        n(meta.queued) ? `${n(meta.queued)} promociones` : null,
        n(meta.published) ? `${n(meta.published)} publicados` : null,
        n(meta.unpublished) ? `${n(meta.unpublished)} despublicados` : null,
        n(meta.priceIncreases) ? `${n(meta.priceIncreases)} precios protegidos` : null,
        n(meta.failed) ? `${n(meta.failed)} fallidos` : null,
      ].filter(Boolean).join(' · ') || 'decision registrada',
      status,
    };
  });
  const cycleItems = (input.currentCycle?.events ?? []).slice(-8).map((event, index) => ({
    id: `cycle-${input.currentCycle?.cycleId}-${index}`,
    ts: new Date(event.ts),
    stage: event.stage,
    title: event.message,
    detail: event.meta ? JSON.stringify(event.meta).slice(0, 120) : 'ciclo activo',
    status: event.level === 'error' ? 'needs_review' : event.level === 'warn' ? 'watch' : 'done',
  }));
  return [...cycleItems, ...traceItems]
    .sort((a, b) => Number(new Date(b.ts)) - Number(new Date(a.ts)))
    .slice(0, 14);
}

const ACTION_TRACE_MAP: Partial<Record<SalesAgentActionType, string>> = {
  RUN_PROFIT_GUARD: 'run_profit_guard',
  PROMOTE_TOP_PRODUCTS: 'promote_top_products',
  CURATE_SIMILAR_PRODUCTS: 'curate_similar_products',
  PUBLISH_APPROVED_BACKLOG: 'publish_approved_backlog',
  UNPUBLISH_UNSAFE_LISTINGS: 'unpublish_unsafe_listings',
  FIX_CATALOG_QUALITY: 'fix_catalog_quality',
  BUILD_SALES_CAMPAIGN: 'build_sales_campaign',
  RUN_SALES_PIPELINE_REVIEW: 'run_sales_pipeline_review',
};

function actionTraceLabel(type: SalesAgentActionType): string {
  return ACTION_TRACE_MAP[type] ?? type.toLowerCase();
}

function actionAffectedEstimate(action: SalesAgentAction): number {
  const payload = action.payload ?? {};
  const candidates = payload.candidates;
  const issues = payload.issues;
  const publishableDrafts = payload.publishableDrafts;
  const duplicateGroups = payload.duplicateExactGroups;
  if (Array.isArray(candidates)) return candidates.length;
  if (Array.isArray(issues)) return issues.length;
  if (Array.isArray(publishableDrafts)) return publishableDrafts.length;
  if (Array.isArray(duplicateGroups)) return duplicateGroups.length;
  if (typeof payload.limit === 'number') return payload.limit;
  if (typeof payload.draftCount === 'number') return payload.draftCount;
  if (typeof payload.overallScore === 'number') return 1;
  return action.canExecute ? 1 : 0;
}

function actionExecutionSteps(action: SalesAgentAction): string[] {
  if (action.type === 'RUN_PROFIT_GUARD') {
    return ['Enriquecer shipping CJ faltante', 'Recalcular margen neto', 'Subir precio o pausar riesgo', 'Registrar auditoria'];
  }
  if (action.type === 'CURATE_SIMILAR_PRODUCTS') {
    return ['Agrupar duplicados exactos', 'Elegir ganador por margen/imagen', 'Despublicar perdedores limitados', 'Registrar antes/despues'];
  }
  if (action.type === 'FIX_CATALOG_QUALITY') {
    return ['Seleccionar fichas buyer-ready corregibles', 'Reescribir titulo/descripcion sin inventar atributos', 'Actualizar Shopify', 'Guardar evidencia'];
  }
  if (action.type === 'PUBLISH_APPROVED_BACKLOG') {
    return ['Seleccionar drafts aprobados', 'Validar margen/stock/calidad', 'Publicar con guardrails', 'Registrar resultado'];
  }
  if (action.type === 'UNPUBLISH_UNSAFE_LISTINGS') {
    return ['Seleccionar solo PAUSE_UNSAFE', 'Archivar en Shopify', 'Conservar trazabilidad local', 'Verificar conteo'];
  }
  if (action.type === 'PROMOTE_TOP_PRODUCTS') {
    return ['Elegir productos activos rentables', 'Generar post organico', 'Encolar publicacion', 'Aprender de respuesta'];
  }
  if (action.type === 'BUILD_SALES_CAMPAIGN') {
    return ['Leer scores comerciales', 'Separar promover/corregir/proteger', 'Registrar campana semanal', 'Programar revision'];
  }
  if (action.type === 'RUN_SALES_PIPELINE_REVIEW') {
    return ['Leer catalogo y embudo', 'Detectar cuello de botella', 'Actualizar score por etapa', 'Priorizar siguiente accion'];
  }
  if (action.type === 'VERIFY_CHECKOUT') {
    return ['Crear compra de prueba', 'Confirmar PayPal en checkout', 'Verificar captura de pago', 'Registrar evidencia'];
  }
  return ['Revisar recomendacion', 'Validar guardrails', 'Ejecutar con limite', 'Verificar resultado'];
}

function actionResultSummary(meta: Record<string, any>): string {
  return [
    n(meta.queued) ? `${n(meta.queued)} promociones` : null,
    n(meta.published) ? `${n(meta.published)} publicados` : null,
    n(meta.unpublished) ? `${n(meta.unpublished)} despublicados` : null,
    n(meta.priceIncreases) ? `${n(meta.priceIncreases)} precios protegidos` : null,
    n(meta.pausedUnsafe) ? `${n(meta.pausedUnsafe)} pausados` : null,
    n(meta.shipping?.enriched ?? meta.shippingEnriched) ? `${n(meta.shipping?.enriched ?? meta.shippingEnriched)} shipping enriquecidos` : null,
    n(meta.results && Array.isArray(meta.results) ? meta.results.filter((row: any) => row.ok).length : meta.fixed) ? `${n(meta.results && Array.isArray(meta.results) ? meta.results.filter((row: any) => row.ok).length : meta.fixed)} corregidos` : null,
    n(meta.failed) ? `${n(meta.failed)} fallidos` : null,
    n(meta.reviewRequired) ? `${n(meta.reviewRequired)} en revision` : null,
  ].filter(Boolean).join(' · ') || 'accion registrada y sin cambios materiales';
}

function hydrateActionExecutions(input: {
  actions: SalesAgentAction[];
  traces: Array<{ message: string; meta: unknown; createdAt: Date }>;
}): SalesAgentAction[] {
  return input.actions.map((action) => {
    const traceLabel = actionTraceLabel(action.type);
    const trace = input.traces.find((item) => item.message === `sales_agent.action.${traceLabel}`);
    const meta = trace ? safeMeta(trace.meta) : {};
    const failed = n(meta.failed) + n(meta.results && Array.isArray(meta.results) ? meta.results.filter((row: any) => !row.ok).length : 0);
    const reviewRequired = n(meta.reviewRequired);
    const executedOk = Boolean(trace) && failed === 0 && reviewRequired === 0 && meta.rateLimited !== true;
    const execution: SalesAgentActionExecution = {
      status: !action.canExecute ? (action.risk === 'manual_required' ? 'manual' : 'blocked') : trace ? (executedOk ? 'applied' : 'needs_review') : 'pending',
      lastRunAt: trace ? trace.createdAt.toISOString() : null,
      summary: trace ? actionResultSummary(meta) : action.canExecute ? 'Lista para ejecutar con limites y trazabilidad.' : 'Requiere intervencion manual o aprobacion granular.',
      affectedEstimate: actionAffectedEstimate(action),
      verified: executedOk,
      traceLabel,
      steps: actionExecutionSteps(action),
    };
    return { ...action, execution };
  });
}

function buildSalesCampaignPlan(input: {
  scores: CommercialScore[];
  publishableDrafts: Array<{ listingId: number; title: string; priceUsd: number; marginPct: number }>;
}): SalesCampaignPlan {
  const promote = input.scores
    .filter((item) => item.recommendedAction === 'PROMOTE')
    .slice(0, 6)
    .map((item) => ({ listingId: item.listingId, title: item.title, handle: item.handle, score: item.score, marginPct: item.marginPct }));
  const fixBeforeTraffic = input.scores
    .filter((item) => item.recommendedAction === 'FIX')
    .slice(0, 6)
    .map((item) => ({ listingId: item.listingId, title: item.title, score: item.score, issues: item.issues }));
  const protectMargin = input.scores
    .filter((item) => item.recommendedAction === 'PROFIT_GUARD')
    .slice(0, 6)
    .map((item) => ({ listingId: item.listingId, title: item.title, score: item.score, issues: item.issues }));
  const pauseOrMerge = input.scores
    .filter((item) => item.recommendedAction === 'CURATE_DUPLICATE')
    .slice(0, 6)
    .map((item) => ({ listingId: item.listingId, title: item.title, score: item.score, issues: item.issues }));

  return {
    generatedAt: new Date().toISOString(),
    theme: promote[0]?.title ? `PawVault weekly push: ${promote[0].title}` : 'PawVault trust and catalog cleanup sprint',
    objective: promote.length > 0
      ? 'Llevar trafico organico solo a productos con margen, imagen y ficha confiable.'
      : 'Primero limpiar margen/catalogo; luego activar promocion organica.',
    budgetMode: 'organic_only',
    channels: ['Pinterest', 'Instagram draft', 'TikTok script'],
    promote,
    fixBeforeTraffic,
    protectMargin,
    pauseOrMerge,
    nextReviewAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function pipelineStatus(score: number): SalesPipelineStage['status'] {
  if (score >= 75) return 'healthy';
  if (score >= 55) return 'watch';
  return 'blocked';
}

function buildSalesPipeline(input: {
  healthScore: number;
  activeListings: number;
  draftListings: number;
  publishableDrafts: number;
  profitGuard: { reviewRequired: number; priceIncreases: number; pausedUnsafe: number };
  copyIssues: number;
  duplicateGroups: number;
  noMedia: number;
  visitors: number;
  addToCartRatePct: number;
  checkoutRatePct: number;
  purchaseRatePct: number;
  socialPublished: number;
  socialFailed: number;
  promotionCandidates: number;
  commercialScores: CommercialScore[];
  campaign: SalesCampaignPlan;
}): SalesPipeline {
  const catalogQualityScore = Math.max(
    0,
    Math.min(100, 88 - input.copyIssues * 4 - input.duplicateGroups * 8 - input.noMedia * 3),
  );
  const profitScore = Math.max(
    0,
    Math.min(100, 92 - input.profitGuard.reviewRequired * 2 - input.profitGuard.pausedUnsafe * 8),
  );
  const checkoutScore = Math.max(
    0,
    Math.min(
      100,
      78 +
        (input.checkoutRatePct > 0 ? 8 : -4) +
        (input.purchaseRatePct > 0 ? 14 : -12) +
        (input.addToCartRatePct >= 5 ? 8 : -4),
    ),
  );
  const trafficScore = Math.max(
    0,
    Math.min(100, 45 + input.promotionCandidates * 5 + Math.min(20, input.socialPublished * 2) - Math.min(18, input.socialFailed * 2)),
  );
  const discoveryScore = Math.max(0, Math.min(100, 55 + Math.min(25, input.publishableDrafts * 4) + Math.min(20, input.draftListings)));
  const learningScore = Math.max(
    0,
    Math.min(100, 45 + (input.visitors > 0 ? 15 : 0) + (input.addToCartRatePct > 0 ? 10 : 0) + (input.purchaseRatePct > 0 ? 25 : 0)),
  );

  const stages: SalesPipelineStage[] = [
    {
      key: 'discover',
      label: 'Descubrir y validar demanda',
      page: '/cj-shopify-usa/discover',
      score: discoveryScore,
      status: pipelineStatus(discoveryScore),
      objective: 'Alimentar el catalogo con productos pet vendibles, no duplicados y con potencial comercial.',
      internalSignals: [`${input.publishableDrafts} drafts publicables`, `${input.draftListings} drafts totales`, `${input.activeListings} activos`],
      externalSignals: ['Nicho pet evergreen USA', 'Priorizar problemas frecuentes: paseo, grooming, viaje, limpieza y enriquecimiento'],
      nextMove: input.publishableDrafts > 0 ? 'Publicar solo drafts aprobados con margen e imagenes.' : 'Ejecutar discovery controlado y evaluar backlog.',
      automatedActions: ['PUBLISH_APPROVED_BACKLOG'],
    },
    {
      key: 'publish_quality',
      label: 'Publicacion y calidad de ficha',
      page: '/cj-shopify-usa/listings',
      score: catalogQualityScore,
      status: pipelineStatus(catalogQualityScore),
      objective: 'Evitar productos sin imagen, titulos genericos, duplicados o descripciones debiles.',
      internalSignals: [`${input.copyIssues} fichas debiles`, `${input.duplicateGroups} grupos duplicados`, `${input.noMedia} productos Shopify sin media`],
      externalSignals: ['Comprador USA espera titulos naturales en ingles, fotos claras y confianza inmediata'],
      nextMove: input.copyIssues > 0 || input.duplicateGroups > 0 ? 'Corregir fichas y curar duplicados antes de llevar trafico.' : 'Catalogo listo para empuje moderado.',
      automatedActions: ['FIX_CATALOG_QUALITY', 'CURATE_SIMILAR_PRODUCTS'],
    },
    {
      key: 'profit_protection',
      label: 'Margen, shipping y precio seguro',
      page: '/cj-shopify-usa/profit',
      score: profitScore,
      status: pipelineStatus(profitScore),
      objective: 'Confirmar que cada venta cubre costo CJ, shipping real, fees y margen minimo.',
      internalSignals: [`${input.profitGuard.reviewRequired} en revision`, `${input.profitGuard.priceIncreases} subidas potenciales`, `${input.profitGuard.pausedUnsafe} PAUSE_UNSAFE`],
      externalSignals: ['Shipping CJ y fees PayPal/Shopify pueden cambiar; el precio minimo debe ser inviolable'],
      nextMove: input.profitGuard.reviewRequired > 0 ? 'Ejecutar Profit Guard y pausar lo que no demuestre margen.' : 'Margen suficientemente protegido para promocion organica.',
      automatedActions: ['RUN_PROFIT_GUARD', 'UNPUBLISH_UNSAFE_LISTINGS'],
    },
    {
      key: 'trust_checkout',
      label: 'Credibilidad y checkout',
      page: '/cj-shopify-usa/analytics',
      score: checkoutScore,
      status: pipelineStatus(checkoutScore),
      objective: 'Asegurar que el cliente confia, entiende shipping/pagos y puede comprar sin friccion.',
      internalSignals: [`carrito ${pct(input.addToCartRatePct)}`, `checkout ${pct(input.checkoutRatePct)}`, `compra ${pct(input.purchaseRatePct)}`],
      externalSignals: ['PayPal activo ayuda, pero la prueba real es una orden de bajo valor capturada correctamente'],
      nextMove: input.checkoutRatePct > 0 && input.purchaseRatePct === 0 ? 'No escalar ads; probar checkout real y reforzar politicas/contacto.' : 'Mantener monitoreo del embudo.',
      automatedActions: ['VERIFY_CHECKOUT'],
    },
    {
      key: 'traffic',
      label: 'Trafico organico y posicionamiento',
      page: '/cj-shopify-usa/sales-agent',
      score: trafficScore,
      status: pipelineStatus(trafficScore),
      objective: 'Promover productos con score comercial alto y mensaje consistente PawVault.',
      internalSignals: [`${input.promotionCandidates} candidatos para promover`, `${input.socialPublished} posts exitosos`, `${input.socialFailed} posts fallidos`],
      externalSignals: ['Pinterest favorece busqueda visual evergreen; Instagram/TikTok requieren OAuth y formatos nativos'],
      nextMove: input.promotionCandidates > 0 ? 'Ejecutar campana organica semanal con productos A/B.' : 'Resolver calidad/margen antes de publicar contenido.',
      automatedActions: ['PROMOTE_TOP_PRODUCTS', 'BUILD_SALES_CAMPAIGN'],
    },
    {
      key: 'conversion_learning',
      label: 'Conversion, aprendizaje y escalado',
      page: '/cj-shopify-usa/analytics',
      score: learningScore,
      status: pipelineStatus(learningScore),
      objective: 'Comparar acciones vs visitas, carrito, checkout y venta para escalar ganadores.',
      internalSignals: [`${input.visitors} visitantes medidos`, `campana: ${input.campaign.promote.length} productos`, `${input.commercialScores.filter((item) => item.grade === 'A').length} productos grado A`],
      externalSignals: ['Escalar solo despues de evidencia: clicks, carritos o ventas; no solo catalogo publicado'],
      nextMove: input.purchaseRatePct > 0 ? 'Escalar productos ganadores y retirar perdedores.' : 'Recolectar datos con campanas pequenas y trazables.',
      automatedActions: ['RUN_SALES_PIPELINE_REVIEW'],
    },
  ];

  const bottleneck = [...stages].sort((a, b) => a.score - b.score)[0];
  const overallScore = Math.round(stages.reduce((sum, stage) => sum + stage.score, 0) / Math.max(1, stages.length));

  return {
    generatedAt: new Date().toISOString(),
    distinction: 'Automatizacion de publicacion abastece el catalogo; pipeline comercial gestiona performance: confianza, trafico, conversion, aprendizaje y escalado.',
    overallScore,
    bottleneck,
    stages,
    productLifecycle: {
      scale: input.commercialScores.filter((item) => item.recommendedAction === 'PROMOTE').slice(0, 8),
      optimize: input.commercialScores.filter((item) => item.recommendedAction === 'FIX').slice(0, 8),
      protect: input.commercialScores.filter((item) => item.recommendedAction === 'PROFIT_GUARD').slice(0, 8),
      retireOrMerge: input.commercialScores.filter((item) => item.recommendedAction === 'CURATE_DUPLICATE').slice(0, 8),
    },
    strategy: {
      positioning: [
        'PawVault debe posicionarse como tienda practica y confiable para rutinas reales de pet parents en USA.',
        'Priorizar titulos especificos por problema/uso, no nombres genericos de proveedor.',
      ],
      credibility: [
        'No promover productos con margen no demostrado, sin imagen o ficha debil.',
        'Mantener checkout, politicas, contacto y shipping visibles antes de escalar trafico.',
      ],
      traffic: [
        'Pinterest primero para productos evergreen visuales; Instagram/TikTok cuando OAuth y formatos esten listos.',
        'Publicar lotes pequenos, medir senal y repetir solo lo que mejora carrito o checkout.',
      ],
      conversion: [
        'Usar precio seguro con margen minimo inviolable y ajustar solo con Profit Guard.',
        'Promocionar productos grado A/B; corregir o pausar C/D antes de exponerlos.',
      ],
    },
    dataSources: {
      internal: [
        'Shopify Admin API',
        'listings locales CJ Shopify USA',
        'Profit Guard',
        'checkout funnel',
        'ordenes 30 dias',
        'trazas del agente',
        'posts sociales',
      ],
      external: [
        'senales de plataforma Pinterest/Instagram/TikTok',
        'reglas comerciales mercado USA',
        'shipping real CJ cuando existe',
        'patrones evergreen del nicho pet',
      ],
      missing: [
        input.purchaseRatePct === 0 ? 'ventas reales suficientes para aprendizaje de conversion' : null,
        input.socialPublished === 0 ? 'historial de posts exitosos por producto/canal' : null,
        'conectores OAuth directos para Instagram y TikTok',
      ].filter(Boolean) as string[],
    },
  };
}

function safeMeta(meta: unknown): Record<string, any> {
  return (meta && typeof meta === 'object' ? meta : {}) as Record<string, any>;
}

async function recordSalesAgentTrace(userId: number, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION,
      message,
      meta,
    },
  });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function clampConfig(input: Partial<SalesAgentSchedulerConfig>): SalesAgentSchedulerConfig {
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : schedulerConfig.enabled,
    intervalHours: clampNumber(input.intervalHours, 1, 168, schedulerConfig.intervalHours),
    safeMode: typeof input.safeMode === 'boolean' ? input.safeMode : schedulerConfig.safeMode,
    autoPublishApprovedDrafts:
      typeof input.autoPublishApprovedDrafts === 'boolean'
        ? input.autoPublishApprovedDrafts
        : schedulerConfig.autoPublishApprovedDrafts,
    autoUnpublishUnsafeListings:
      typeof input.autoUnpublishUnsafeListings === 'boolean'
        ? input.autoUnpublishUnsafeListings
        : schedulerConfig.autoUnpublishUnsafeListings,
    autoPromoteOrganic:
      typeof input.autoPromoteOrganic === 'boolean'
        ? input.autoPromoteOrganic
        : schedulerConfig.autoPromoteOrganic,
    maxPublishPerCycle: clampNumber(input.maxPublishPerCycle, 0, 5, schedulerConfig.maxPublishPerCycle),
    maxUnpublishPerCycle: clampNumber(input.maxUnpublishPerCycle, 0, 10, schedulerConfig.maxUnpublishPerCycle),
    maxPromotionsPerCycle: clampNumber(input.maxPromotionsPerCycle, 0, 20, schedulerConfig.maxPromotionsPerCycle),
  };
}

function safeCycleMeta(cycle: SalesAgentCycleResult): Prisma.InputJsonValue {
  return {
    cycleId: cycle.cycleId,
    startedAt: cycle.startedAt,
    finishedAt: cycle.finishedAt ?? null,
    durationMs: cycle.durationMs ?? null,
    status: cycle.status,
    diagnosisScore: cycle.diagnosisScore,
    published: cycle.published,
    unpublished: cycle.unpublished,
    promoted: cycle.promoted,
    recommendations: cycle.recommendations,
    errors: cycle.errors,
    events: cycle.events,
  } as Prisma.InputJsonValue;
}

async function loadSchedulerConfig(userId: number) {
  const latest = await prisma.cjShopifyUsaExecutionTrace.findFirst({
    where: {
      userId,
      step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION,
      message: 'sales_agent.scheduler.config',
    },
    orderBy: { createdAt: 'desc' },
  });
  const meta = safeMeta(latest?.meta);
  schedulerConfig = clampConfig({
    ...DEFAULT_SALES_AGENT_CONFIG,
    ...meta,
  });
  if (schedulerState !== 'RUNNING' && schedulerState !== 'PAUSED') {
    schedulerState = schedulerConfig.enabled ? 'RUNNING' : 'IDLE';
  }
}

async function persistSchedulerConfig(userId: number) {
  await recordSalesAgentTrace(userId, 'sales_agent.scheduler.config', schedulerConfig as Prisma.InputJsonValue);
}

function pushSalesCycleHistory(cycle: SalesAgentCycleResult) {
  salesCycleHistory.unshift(cycle);
  salesCycleHistory = salesCycleHistory.slice(0, 12);
}

function scheduleSalesAgent(userId: number, runCycle: (userId: number) => Promise<SalesAgentCycleResult | null>) {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (schedulerState !== 'RUNNING' || !schedulerConfig.enabled) {
    schedulerTimer = null;
    schedulerNextRunAt = null;
    return;
  }
  const ms = schedulerConfig.intervalHours * 60 * 60 * 1000;
  schedulerTimer = setInterval(() => {
    runCycle(userId).catch(() => {});
  }, ms);
  schedulerNextRunAt = new Date(Date.now() + ms);
}

export const cjShopifyUsaSalesAgentService = {
  async dashboard(userId: number) {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      settings,
      listings,
      orders30,
      socialStats,
      latestFunnel,
      recentAgentTraces,
      latestCycle,
      shopifyActiveProductsResult,
    ] = await Promise.all([
      prisma.cjShopifyUsaAccountSettings.findUnique({ where: { userId } }),
      prisma.cjShopifyUsaListing.findMany({
        where: { userId },
        include: {
          product: true,
          evaluation: true,
          shippingQuote: true,
          socialPosts: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 700,
      }),
      prisma.cjShopifyUsaOrder.findMany({
        where: { userId, createdAt: { gte: since30 } },
        select: { totalUsd: true, status: true, createdAt: true },
      }),
      prisma.cjShopifyUsaSocialPost.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.cjShopifyUsaExecutionTrace.findFirst({
        where: {
          userId,
          step: 'analytics.checkout_funnel',
          message: 'analytics.checkout_funnel.snapshot',
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cjShopifyUsaExecutionTrace.findMany({
        where: { userId, step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.cjShopifyUsaAutomationCycle.findFirst({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      }),
      cjShopifyUsaAdminService
        .listProducts({ userId, first: 250, maxPages: 20, status: 'ACTIVE' })
        .then((products) => ({ ok: true as const, products }))
        .catch((error) => ({
          ok: false as const,
          products: [],
          error: error instanceof Error ? error.message : String(error),
        })),
    ]);

    const activeListings = listings.filter((listing) => listing.status === CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE);
    const draftListings = listings.filter((listing) => listing.status === CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT);
    const failedStatuses = [
      CJ_SHOPIFY_USA_LISTING_STATUS.FAILED,
      CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_FAILED,
    ] as string[];
    const failedListings = listings.filter((listing) =>
      failedStatuses.includes(listing.status),
    );

    const titleGroups = new Map<string, typeof activeListings>();
    for (const listing of activeListings) {
      const key = normalizeTitle(listing.product.title);
      if (!key) continue;
      titleGroups.set(key, [...(titleGroups.get(key) ?? []), listing]);
    }
    const duplicateExactGroups = Array.from(titleGroups.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length, titles: rows.map((row) => row.product.title).slice(0, 5) }));

    const shopifyActiveProducts = shopifyActiveProductsResult.products;
    const shopifyTitleGroups = new Map<string, typeof shopifyActiveProducts>();
    for (const product of shopifyActiveProducts) {
      const key = normalizeTitle(product.title);
      if (!key) continue;
      shopifyTitleGroups.set(key, [...(shopifyTitleGroups.get(key) ?? []), product]);
    }
    const shopifyDuplicateExactGroups = Array.from(shopifyTitleGroups.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length, titles: rows.map((row) => row.title).slice(0, 5) }));
    const shopifyNoMedia = shopifyActiveProducts.filter((product) => (product.media?.nodes?.length ?? 0) === 0);
    const shopifyProductIds = new Set(shopifyActiveProducts.map((product) => String(product.id)));
    const localUniqueActiveShopifyProductIds = new Set(
      activeListings
        .map((listing) => String(listing.shopifyProductId ?? '').trim())
        .filter(Boolean),
    );
    const activeListingsMissingInShopify = activeListings
      .filter((listing) => listing.shopifyProductId && !shopifyProductIds.has(String(listing.shopifyProductId)))
      .slice(0, 20)
      .map((listing) => ({
        listingId: listing.id,
        title: listing.product.title,
        shopifyProductId: listing.shopifyProductId,
        status: listing.status,
      }));

    const similarFamilies = new Map<string, number>();
    for (const listing of activeListings) {
      const words = normalizeTitle(listing.product.title).split(' ').filter(Boolean);
      const family = words.slice(0, Math.min(3, words.length)).join(' ');
      if (family.length >= 8) similarFamilies.set(family, (similarFamilies.get(family) ?? 0) + 1);
    }
    const crowdedFamilies = Array.from(similarFamilies.entries())
      .filter(([, count]) => count >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([family, count]) => ({ family, count }));

    const copyIssues = activeListings
      .map((listing) => {
        const draft = draftRecord(listing.draftPayload);
        const description = String(draft.descriptionHtml || draft.description || listing.product.description || '').replace(/<[^>]+>/g, ' ').trim();
        const quality = titleQuality(buyerTitle(listing));
        const issues = [...quality.issues];
        if (description.length < 120) issues.push('descripcion demasiado debil');
        return {
          listingId: listing.id,
          title: buyerTitle(listing),
          suggestedTitle: buildDraftTitle({ title: buyerTitle(listing), variantAttributes: draftRecord(listing.draftPayload).variantAttributes }),
          suggestedDescriptionHtml: buildDraftDescription({ title: buyerTitle(listing), description, variantAttributes: draftRecord(listing.draftPayload).variantAttributes }),
          handle: listing.shopifyHandle,
          shopifyProductId: listing.shopifyProductId,
          imageCount: extractImageCount(listing.draftPayload),
          descriptionLength: description.length,
          score: description.length < 120 ? Math.max(0, quality.score - 12) : quality.score,
          issues,
        };
      })
      .filter((row) => row.score < 80 || row.imageCount === 0 || row.descriptionLength < 120)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12);

    const fixableCopyIssues = copyIssues
      .filter((issue) => issue.shopifyProductId)
      .filter((issue) => issue.imageCount > 0)
      .filter((issue) => normalizeTitle(issue.title) !== normalizeTitle(issue.suggestedTitle))
      .slice(0, 8);

    const profitGuard = await cjShopifyUsaProfitGuardService.run(userId, {
      dryRun: true,
      limit: 350,
    });

    const profitGuardIssueByListing = new Map(profitGuard.issues.map((issue) => [issue.listingId, issue]));
    const commercialScores = activeListings
      .map((listing) =>
        buildCommercialScore({
          listing,
          duplicateCount: titleGroups.get(normalizeTitle(buyerTitle(listing)))?.length ?? 0,
          profitIssue: profitGuardIssueByListing.get(listing.id) ?? null,
        }),
      )
      .sort((a, b) => b.score - a.score);
    const scoreDistribution = {
      excellent: commercialScores.filter((item) => item.grade === 'A').length,
      good: commercialScores.filter((item) => item.grade === 'B').length,
      watch: commercialScores.filter((item) => item.grade === 'C').length,
      risk: commercialScores.filter((item) => item.grade === 'D').length,
    };
    const publishableDrafts = draftListings
      .filter((listing) => listing.evaluation?.decision === 'APPROVED')
      .filter((listing) => extractImageCount(listing.draftPayload) > 0)
      .filter((listing) => !profitGuardIssueByListing.has(listing.id))
      .slice(0, 12)
      .map((listing) => ({
        listingId: listing.id,
        title: listing.product.title,
        priceUsd: n(listing.listedPriceUsd),
        marginPct: n(listing.evaluation?.estimatedMarginPct),
      }));

    const unsafeUnpublishCandidates = profitGuard.issues
      .filter((issue) => issue.action === 'PAUSE_UNSAFE')
      .slice(0, 12)
      .map((issue) => ({
        listingId: issue.listingId,
        title: issue.title,
        reason: issue.reason,
        currentPriceUsd: issue.currentPriceUsd,
        projectedNetProfitUsd: issue.projectedNetProfitUsd,
        projectedNetMarginPct: issue.projectedNetMarginPct,
      }));

    const socialCounts = Object.fromEntries(
      socialStats.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    const promotionCandidates = activeListings
      .filter((listing) => listing.shopifyHandle && n(listing.listedPriceUsd) > 0)
      .filter((listing) => !listing.socialPosts.some((post) => post.status === CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS))
      .map((listing) => {
        const quality = titleQuality(listing.product.title);
        const marginPct = n(listing.evaluation?.estimatedMarginPct);
        const imageCount = extractImageCount(listing.draftPayload);
        const score =
          40 +
          Math.min(25, Math.max(0, marginPct)) +
          Math.min(20, quality.score / 5) +
          Math.min(10, imageCount * 2) -
          (listing.shippingQuote ? 0 : 8);
        return {
          listingId: listing.id,
          title: listing.product.title,
          handle: listing.shopifyHandle,
          priceUsd: n(listing.listedPriceUsd),
          marginPct,
          imageCount,
          score: Math.round(score),
          url: `https://shop.ivanreseller.com/products/${listing.shopifyHandle}`,
          caption: [
            `PawVault pick: ${listing.product.title}`,
            'A practical upgrade for everyday pet-parent routines.',
            '#PawVault #PetSupplies #PetParents #DogProducts #CatProducts',
          ].join('\n'),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const funnelMeta = safeMeta(latestFunnel?.meta);
    const visitors = n(funnelMeta.visitors);
    const addToCartRatePct = pct(funnelMeta.addToCartRatePct);
    const checkoutRatePct = pct(funnelMeta.checkoutRatePct);
    const purchaseRatePct = pct(funnelMeta.purchaseRatePct);
    const revenue30 = orders30.reduce((sum, order) => sum + n(order.totalUsd), 0);
    const paidOrders30 = orders30.filter((order) =>
      ['CJ_ORDER_CREATED', 'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_SHOPIFY', 'COMPLETED'].includes(order.status),
    ).length;
    const learningMemory = buildLearningMemory({
      traces: recentAgentTraces,
      visitors,
      addToCartRatePct,
      checkoutRatePct,
      purchaseRatePct,
      socialCounts,
    });
    const campaign = buildSalesCampaignPlan({ scores: commercialScores, publishableDrafts });
    const salesPipeline = buildSalesPipeline({
      healthScore: 0,
      activeListings: activeListings.length,
      draftListings: draftListings.length,
      publishableDrafts: publishableDrafts.length,
      profitGuard: {
        reviewRequired: profitGuard.reviewRequired,
        priceIncreases: profitGuard.priceIncreases,
        pausedUnsafe: profitGuard.pausedUnsafe,
      },
      copyIssues: copyIssues.length,
      duplicateGroups: duplicateExactGroups.length,
      noMedia: shopifyNoMedia.length,
      visitors,
      addToCartRatePct,
      checkoutRatePct,
      purchaseRatePct,
      socialPublished: socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS] ?? 0,
      socialFailed: socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED] ?? 0,
      promotionCandidates: promotionCandidates.length,
      commercialScores,
      campaign,
    });

    const actions: SalesAgentAction[] = [];

    if (checkoutRatePct > 0 && purchaseRatePct === 0) {
      actions.push({
        id: 'verify-checkout-paypal',
        type: 'VERIFY_CHECKOUT',
        priority: 'critical',
        title: 'Confirmar checkout real con PayPal',
        rationale: `${checkoutRatePct.toFixed(2)}% llega al checkout y 0% compra; antes de invertir en trafico hay que probar pago real.`,
        expectedImpact: 'Eliminar el bloqueo mas caro: trafico con intencion que no puede pagar.',
        risk: 'manual_required',
        canExecute: false,
        guardrails: ['No gastar en ads hasta completar una compra de prueba', 'Mantener PayPal activo y visible', 'Registrar gateway usado en una orden real'],
      });
    }

    if (profitGuard.reviewRequired > 0 || profitGuard.priceIncreases > 0 || profitGuard.pausedUnsafe > 0) {
      actions.push({
        id: 'run-profit-guard',
        type: 'RUN_PROFIT_GUARD',
        priority: profitGuard.pausedUnsafe > 0 ? 'critical' : 'high',
        title: 'Ejecutar Profit Guard antes de promocionar',
        rationale: `${profitGuard.reviewRequired + profitGuard.priceIncreases + profitGuard.pausedUnsafe} listings requieren revision de margen/precio.`,
        expectedImpact: 'Evita ventas con perdida y protege el margen minimo configurado.',
        risk: 'approval_required',
        canExecute: true,
        guardrails: ['Usar shipping real CJ cuando exista', 'Subir precio si falta margen', 'Pausar si no se demuestra margen', 'No bajar precios bajo margen minimo'],
        payload: { issues: profitGuard.issues.slice(0, 8) },
      });
    }

    if (unsafeUnpublishCandidates.length > 0) {
      actions.push({
        id: 'unpublish-unsafe-listings',
        type: 'UNPUBLISH_UNSAFE_LISTINGS',
        priority: 'critical',
        title: 'Despublicar listings con riesgo de perdida',
        rationale: `${unsafeUnpublishCandidates.length} listings tienen senal PAUSE_UNSAFE segun Profit Guard.`,
        expectedImpact: 'Evita ventas no rentables mientras se corrige shipping, precio o costo.',
        risk: 'approval_required',
        canExecute: true,
        guardrails: ['Solo PAUSE_UNSAFE', 'Archiva en Shopify', 'Registra trazabilidad', 'No elimina datos locales'],
        payload: { limit: Math.min(5, unsafeUnpublishCandidates.length), candidates: unsafeUnpublishCandidates.slice(0, 5) },
      });
    }

    if (promotionCandidates.length > 0) {
      actions.push({
        id: 'promote-top-products',
        type: 'PROMOTE_TOP_PRODUCTS',
        priority: 'high',
        title: 'Promocionar productos top en Pinterest',
        rationale: `${promotionCandidates.length} productos activos cumplen criterios para promocion organica segura.`,
        expectedImpact: 'Aumentar visitas reales hacia productos con margen y ficha publicable.',
        risk: 'safe',
        canExecute: true,
        guardrails: ['Solo productos activos', 'Sin post exitoso previo', 'Sin gasto publicitario', 'No modifica precio ni inventario'],
        payload: { limit: Math.min(5, promotionCandidates.length), candidates: promotionCandidates.slice(0, 5) },
      });
    }

    if (
      campaign.promote.length > 0 ||
      campaign.fixBeforeTraffic.length > 0 ||
      campaign.protectMargin.length > 0 ||
      campaign.pauseOrMerge.length > 0
    ) {
      actions.push({
        id: 'build-sales-campaign',
        type: 'BUILD_SALES_CAMPAIGN',
        priority: campaign.protectMargin.length > 0 ? 'high' : 'medium',
        title: 'Construir campana semanal con aprendizaje',
        rationale: `${campaign.promote.length} productos para empujar, ${campaign.fixBeforeTraffic.length} fichas a corregir y ${campaign.protectMargin.length} riesgos de margen antes de escalar.`,
        expectedImpact: 'Convertir diagnostico en una agenda semanal medible: corregir, promover, revisar y aprender.',
        risk: 'safe',
        canExecute: true,
        guardrails: ['Organico sin gasto', 'No toca pagos', 'Usa score comercial', 'Registra plan y siguiente revision'],
        payload: { campaign },
      });
    }

    actions.push({
      id: 'run-sales-pipeline-review',
      type: 'RUN_SALES_PIPELINE_REVIEW',
      priority: salesPipeline.bottleneck.status === 'blocked' ? 'high' : 'medium',
      title: 'Revisar pipeline comercial completo',
      rationale: `Cuello de botella actual: ${salesPipeline.bottleneck.label} (${salesPipeline.bottleneck.score}/100).`,
      expectedImpact: 'Alinear discovery, publicacion, profit, confianza, trafico y aprendizaje para vender, no solo publicar.',
      risk: 'safe',
      canExecute: true,
      guardrails: ['No gasta en ads', 'No toca pagos', 'No cambia precios agresivamente', 'Usa acciones seguras ya integradas'],
      payload: { bottleneck: salesPipeline.bottleneck, overallScore: salesPipeline.overallScore },
    });

    if (crowdedFamilies.length > 0 || duplicateExactGroups.length > 0) {
      actions.push({
        id: 'curate-similar-products',
        type: 'CURATE_SIMILAR_PRODUCTS',
        priority: duplicateExactGroups.length > 0 ? 'high' : 'medium',
        title: 'Curar familias de productos similares',
        rationale: `${duplicateExactGroups.length} duplicados exactos y ${crowdedFamilies.length} familias saturadas detectadas.`,
        expectedImpact: 'Menos confusion, mejor confianza y catalogo mas facil de comprar.',
        risk: 'approval_required',
        canExecute: duplicateExactGroups.length > 0,
        guardrails: ['No despublicar ganadores sin evidencia', 'Conservar el producto con mejor margen/imagen', 'Agrupar variantes cuando corresponda'],
        payload: { duplicateExactGroups, crowdedFamilies },
      });
    }

    if (copyIssues.length > 0) {
      actions.push({
        id: 'improve-product-copy',
        type: 'IMPROVE_PRODUCT_COPY',
        priority: 'medium',
        title: 'Mejorar titulos y fichas de baja confianza',
        rationale: `${copyIssues.length} fichas activas tienen senales de titulo debil o media local incompleta.`,
        expectedImpact: 'Mejorar CTR, confianza y conversion antes de llevar trafico.',
        risk: 'approval_required',
        canExecute: false,
        guardrails: ['Titulo natural en ingles', 'Sin codigos CJ', 'Promesa clara y especifica', 'No inventar atributos'],
        payload: { copyIssues },
      });
    }

    if (fixableCopyIssues.length > 0) {
      actions.push({
        id: 'fix-catalog-quality',
        type: 'FIX_CATALOG_QUALITY',
        priority: 'high',
        title: 'Corregir fichas debiles automaticamente',
        rationale: `${fixableCopyIssues.length} fichas activas tienen titulo buyer-ready corregible sin tocar precio, pagos ni inventario.`,
        expectedImpact: 'Mejorar confianza, SEO y claridad antes de llevar trafico real.',
        risk: 'safe',
        canExecute: true,
        guardrails: ['Solo productos activos con Shopify ID', 'No inventa atributos', 'No toca precio ni stock', 'Registra antes/despues'],
        payload: { candidates: fixableCopyIssues.slice(0, 5) },
      });
    }

    if (draftListings.length > 0) {
      actions.push({
        id: 'publish-approved-backlog',
        type: 'PUBLISH_APPROVED_BACKLOG',
        priority: publishableDrafts.length > 0 ? 'high' : 'medium',
        title: 'Revisar backlog de drafts',
        rationale: `${draftListings.length} drafts existen en el flujo; ${publishableDrafts.length} parecen publicables con evaluacion aprobada.`,
        expectedImpact: 'Aumentar catalogo util sin bajar calidad.',
        risk: publishableDrafts.length > 0 ? 'safe' : 'approval_required',
        canExecute: publishableDrafts.length > 0,
        guardrails: ['Validar shipping y stock antes de publicar', 'Evitar duplicados', 'No publicar sin imagen'],
        payload: { draftCount: draftListings.length, publishableDrafts: publishableDrafts.slice(0, 5) },
      });
    }

    if (actions.length === 0) {
      actions.push({
        id: 'discover-new-products',
        type: 'DISCOVER_NEW_PRODUCTS',
        priority: 'medium',
        title: 'Buscar nuevos productos ganadores',
        rationale: 'No hay bloqueos comerciales urgentes; el siguiente paso es ampliar catalogo con discovery controlado.',
        expectedImpact: 'Crear nuevo inventario vendible manteniendo margen y calidad.',
        risk: 'safe',
        canExecute: false,
        guardrails: ['Usar Descubrir IA', 'Exigir imagen/stock/margen', 'No duplicar activos'],
      });
    }

    const sortedActions = actions.sort((a, b) => {
      const weight: Record<SalesAgentPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return weight[b.priority] - weight[a.priority];
    });
    const schedulerStatus = await this.getSchedulerStatus(userId, false);
    const decisionTimeline = buildDecisionTimeline({
      traces: recentAgentTraces.map((trace) => ({
        id: trace.id,
        message: trace.message,
        meta: trace.meta,
        createdAt: trace.createdAt,
      })),
      currentCycle: schedulerStatus.currentCycle,
    });
    const actionsWithExecution = hydrateActionExecutions({
      actions: sortedActions,
      traces: recentAgentTraces.map((trace) => ({
        message: trace.message,
        meta: trace.meta,
        createdAt: trace.createdAt,
      })),
    });

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      mode: 'COPILOT_CONTROLLED',
      mission: 'Maximizar ventas rentables de PawVault sin sacrificar margen, calidad ni confianza del comprador.',
      constraints: {
        minMarginPct: n(settings?.minMarginPct ?? settings?.automationMinMarginPct ?? 10),
        minProfitUsd: n(settings?.minProfitUsd ?? 1.5),
        maxShippingUsd: n(settings?.maxShippingUsd ?? 15),
        maxSellPriceUsd: n(settings?.maxSellPriceUsd ?? 45),
        autoSpendAds: false,
        autoPublishSocial: true,
        autoChangePrices: false,
        canPublishWithGuards: true,
        canUnpublishUnsafeWithGuards: true,
        canFixCatalogQuality: true,
      },
      kpis: {
        activeListings: activeListings.length,
        draftListings: draftListings.length,
        failedListings: failedListings.length,
        orders30: orders30.length,
        paidOrders30,
        revenue30Usd: Math.round(revenue30 * 100) / 100,
        visitors,
        addToCartRatePct,
        checkoutRatePct,
        purchaseRatePct,
        socialPublished: socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS] ?? 0,
        socialFailed: socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.FAILED] ?? 0,
      },
      health: {
        score: Math.max(
          0,
          Math.min(
            100,
            78 +
              (purchaseRatePct > 0 ? 8 : -8) +
              (profitGuard.reviewRequired === 0 ? 8 : -10) +
              (duplicateExactGroups.length === 0 ? 4 : -10) +
              (promotionCandidates.length > 0 ? 4 : -4),
          ),
        ),
        checkoutRisk: checkoutRatePct > 0 && purchaseRatePct === 0,
        marginRisk: profitGuard.reviewRequired > 0 || profitGuard.pausedUnsafe > 0,
        catalogTrustRisk: copyIssues.length > 0 || duplicateExactGroups.length > 0,
        trafficOpportunity: promotionCandidates.length > 0,
      },
      shopifyTruth: {
        ok: shopifyActiveProductsResult.ok,
        error: 'error' in shopifyActiveProductsResult ? shopifyActiveProductsResult.error : null,
        activeProducts: shopifyActiveProducts.length,
        localActiveListings: activeListings.length,
        localUniqueActiveShopifyProducts: localUniqueActiveShopifyProductIds.size,
        activeDelta: localUniqueActiveShopifyProductIds.size - shopifyActiveProducts.length,
        noMedia: shopifyNoMedia.length,
        duplicateExactGroups: shopifyDuplicateExactGroups.length,
        missingLocalActiveInShopify: activeListingsMissingInShopify.length,
        samples: {
          noMedia: shopifyNoMedia.slice(0, 8).map((product) => ({ id: product.id, title: product.title, handle: product.handle })),
          duplicates: shopifyDuplicateExactGroups.slice(0, 5),
          missingLocalActiveInShopify: activeListingsMissingInShopify,
        },
      },
      learning: {
        scheduler: schedulerStatus,
        lastCycle: latestCycle
          ? {
              id: latestCycle.id,
              status: latestCycle.status,
              published: latestCycle.published,
              draftsCreated: latestCycle.draftsCreated,
              approved: latestCycle.productsApproved,
              errors: latestCycle.errors,
              startedAt: latestCycle.startedAt,
            }
          : null,
        recentActions: recentAgentTraces.map((trace) => ({
          id: trace.id,
          createdAt: trace.createdAt,
          message: trace.message,
          meta: trace.meta,
        })),
        memory: learningMemory,
        summary: [
          purchaseRatePct === 0
            ? 'No hay aprendizaje de ventas cerradas aun; priorizar checkout y trafico medible.'
            : 'Ya existe conversion; priorizar productos/canales con ventas reales.',
          socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS]
            ? 'Pinterest ya tiene publicaciones exitosas; conviene ampliar solo con productos de mejor score.'
            : 'Aun no hay publicaciones sociales exitosas registradas; empezar con lote pequeno controlado.',
        ],
      },
      commercialScores: {
        distribution: scoreDistribution,
        top: commercialScores.slice(0, 10),
        needsWork: [...commercialScores]
          .filter((item) => item.score < 72 || item.recommendedAction !== 'WATCH')
          .sort((a, b) => a.score - b.score)
          .slice(0, 12),
      },
      campaign,
      salesPipeline,
      decisionTimeline,
      promotionCandidates,
      publishableDrafts,
      unsafeUnpublishCandidates,
      actions: actionsWithExecution,
      profitGuard: {
        scanned: profitGuard.scanned,
        okCount: profitGuard.okCount,
        priceIncreases: profitGuard.priceIncreases,
        pausedUnsafe: profitGuard.pausedUnsafe,
        reviewRequired: profitGuard.reviewRequired,
        sampleIssues: profitGuard.issues.slice(0, 8),
      },
      catalog: {
        duplicateExactGroups,
        crowdedFamilies,
        copyIssues,
        fixableCopyIssues,
      },
    };
  },

  async executeAction(userId: number, input: { actionType: SalesAgentActionType; limit?: number }) {
    if (!['RUN_PROFIT_GUARD', 'PROMOTE_TOP_PRODUCTS', 'CURATE_SIMILAR_PRODUCTS', 'PUBLISH_APPROVED_BACKLOG', 'UNPUBLISH_UNSAFE_LISTINGS', 'FIX_CATALOG_QUALITY', 'BUILD_SALES_CAMPAIGN', 'RUN_SALES_PIPELINE_REVIEW'].includes(input.actionType)) {
      await recordSalesAgentTrace(userId, 'sales_agent.action.blocked', {
        actionType: input.actionType,
        reason: 'This action requires explicit per-item approval in the current controlled mode.',
      } as Prisma.InputJsonValue);
      return {
        ok: false,
        executed: false,
        requiresApproval: true,
        message: 'Esta accion queda como recomendacion hasta implementar aprobacion granular por item.',
      };
    }

    const dashboard = await this.dashboard(userId);
    const limit = Math.max(1, Math.min(10, Number(input.limit ?? 5)));
    const withCatalogLock = <T>(fn: () => Promise<T>) =>
      cjShopifyUsaOperationLockService.withCatalogMutationLock(userId, 'sales_agent', fn);

    if (input.actionType === 'RUN_SALES_PIPELINE_REVIEW') {
      await recordSalesAgentTrace(userId, 'sales_agent.action.run_sales_pipeline_review', {
        ok: true,
        overallScore: dashboard.salesPipeline.overallScore,
        bottleneck: dashboard.salesPipeline.bottleneck,
        lifecycle: {
          scale: dashboard.salesPipeline.productLifecycle.scale.length,
          optimize: dashboard.salesPipeline.productLifecycle.optimize.length,
          protect: dashboard.salesPipeline.productLifecycle.protect.length,
          retireOrMerge: dashboard.salesPipeline.productLifecycle.retireOrMerge.length,
        },
        dataSources: dashboard.salesPipeline.dataSources,
      } as unknown as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        reviewRequired: dashboard.salesPipeline.bottleneck.status === 'healthy' ? 0 : 1,
        fixed: dashboard.salesPipeline.productLifecycle.optimize.length,
        queued: dashboard.salesPipeline.productLifecycle.scale.length,
        pipeline: dashboard.salesPipeline,
        message: `Pipeline revisado: score ${dashboard.salesPipeline.overallScore}/100; cuello de botella: ${dashboard.salesPipeline.bottleneck.label}.`,
      };
    }

    if (input.actionType === 'BUILD_SALES_CAMPAIGN') {
      await recordSalesAgentTrace(userId, 'sales_agent.action.build_sales_campaign', {
        ok: true,
        campaign: dashboard.campaign,
        commercialScoreDistribution: dashboard.commercialScores.distribution,
        learningConfidence: dashboard.learning.memory.confidence,
      } as unknown as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        queued: dashboard.campaign.promote.length,
        fixed: dashboard.campaign.fixBeforeTraffic.length,
        reviewRequired: dashboard.campaign.protectMargin.length + dashboard.campaign.pauseOrMerge.length,
        campaign: dashboard.campaign,
        message: `Campana semanal registrada: ${dashboard.campaign.promote.length} para promover, ${dashboard.campaign.fixBeforeTraffic.length} a corregir y ${dashboard.campaign.protectMargin.length + dashboard.campaign.pauseOrMerge.length} riesgos a resolver.`,
      };
    }

    if (input.actionType === 'RUN_PROFIT_GUARD') {
      const { shipping, result } = await withCatalogLock(async () => {
        const shippingResult = await cjShopifyUsaProfitGuardService.enrichMissingShipping(userId, {
          dryRun: false,
          limit: 25,
        });
        const guardResult = await cjShopifyUsaProfitGuardService.run(userId, {
          dryRun: false,
          pauseUnsafe: true,
          limit: 500,
        });
        return { shipping: shippingResult, result: guardResult };
      });
      await recordSalesAgentTrace(userId, 'sales_agent.action.run_profit_guard', {
        ok: true,
        shipping,
        scanned: result.scanned,
        okCount: result.okCount,
        priceIncreases: result.priceIncreases,
        pausedUnsafe: result.pausedUnsafe,
        reviewRequired: result.reviewRequired,
        appliedIssues: result.issues.filter((issue) => issue.applied).slice(0, 20),
      } as unknown as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        shippingEnriched: shipping.enriched,
        shippingFailed: shipping.failed,
        rateLimited: shipping.rateLimited,
        scanned: result.scanned,
        priceIncreases: result.priceIncreases,
        pausedUnsafe: result.pausedUnsafe,
        reviewRequired: result.reviewRequired,
        message: `Profit Guard aplicado: ${result.priceIncreases} precios subidos, ${result.pausedUnsafe} pausados, ${shipping.enriched} shipping enriquecidos, ${result.reviewRequired} en revision.`,
      };
    }

    if (input.actionType === 'CURATE_SIMILAR_PRODUCTS') {
      const active = await prisma.cjShopifyUsaListing.findMany({
        where: { userId, status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE },
        include: { product: true, evaluation: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 1000,
      });
      const groups = new Map<string, typeof active>();
      for (const listing of active) {
        const key = normalizeTitle(buyerTitle(listing));
        if (!key) continue;
        groups.set(key, [...(groups.get(key) ?? []), listing]);
      }
      const duplicateGroups = Array.from(groups.values()).filter((rows) => rows.length > 1);
      const results: Array<{ listingId: number; title: string; ok: boolean; keptListingId: number; error?: string }> = [];
      let processedGroups = 0;
      await withCatalogLock(async () => {
        for (const rows of duplicateGroups) {
          if (processedGroups >= limit) break;
          const ranked = [...rows].sort((a, b) => {
            const aScore = extractImageCount(a.draftPayload) * 5 + n(a.evaluation?.estimatedMarginPct) + n(a.listedPriceUsd) / 10;
            const bScore = extractImageCount(b.draftPayload) * 5 + n(b.evaluation?.estimatedMarginPct) + n(b.listedPriceUsd) / 10;
            return bScore - aScore;
          });
          const keeper = ranked[0];
          const losers = ranked.slice(1).slice(0, Math.max(0, limit - results.length));
          for (const loser of losers) {
            try {
              await cjShopifyUsaPublishService.unpublishListing({ userId, listingId: loser.id });
              results.push({ listingId: loser.id, title: buyerTitle(loser), ok: true, keptListingId: keeper.id });
            } catch (error) {
              results.push({
                listingId: loser.id,
                title: buyerTitle(loser),
                ok: false,
                keptListingId: keeper.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          processedGroups++;
          if (results.length >= limit) break;
        }
      });
      await recordSalesAgentTrace(userId, 'sales_agent.action.curate_similar_products', {
        ok: true,
        processedGroups,
        results,
      } as unknown as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        unpublished: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        reviewedGroups: processedGroups,
        results,
        message: `Curacion de duplicados: ${results.filter((result) => result.ok).length} duplicados despublicados, ${results.filter((result) => !result.ok).length} fallidos; se conservaron los mejores por grupo.`,
      };
    }

    if (input.actionType === 'FIX_CATALOG_QUALITY') {
      const selected = dashboard.catalog.fixableCopyIssues.slice(0, limit);
      const results: Array<{ listingId: number; ok: boolean; beforeTitle: string; afterTitle: string; descriptionUpdated?: boolean; error?: string }> = [];
      await withCatalogLock(async () => {
        for (const candidate of selected) {
          try {
            const listing = await prisma.cjShopifyUsaListing.findFirst({
              where: { userId, id: candidate.listingId },
              include: { product: true },
            });
            if (!listing?.shopifyProductId) {
              throw new Error('Listing has no Shopify product id.');
            }
            const beforeTitle = buyerTitle(listing);
            const draft = draftRecord(listing.draftPayload);
            const afterTitle = buildDraftTitle({ title: beforeTitle, variantAttributes: draft.variantAttributes });
            const description = String(draft.descriptionHtml || draft.description || listing.product.description || '').replace(/<[^>]+>/g, ' ').trim();
            const descriptionHtml = description.length < 120 ? buildDraftDescription({ title: afterTitle || beforeTitle, description, variantAttributes: draft.variantAttributes, shippingSnapshot: null }) : undefined;
            const titleChanged = Boolean(afterTitle) && normalizeTitle(beforeTitle) !== normalizeTitle(afterTitle);
            if (!titleChanged && !descriptionHtml) {
              results.push({ listingId: candidate.listingId, ok: true, beforeTitle, afterTitle: beforeTitle, descriptionUpdated: false });
              continue;
            }
            await cjShopifyUsaAdminService.updateProductDetails({
              userId,
              productId: listing.shopifyProductId,
              title: titleChanged ? afterTitle : undefined,
              descriptionHtml,
            });
            await prisma.cjShopifyUsaListing.update({
              where: { id: listing.id },
              data: {
                draftPayload: {
                  ...draft,
                  title: titleChanged ? afterTitle : beforeTitle,
                  descriptionHtml: descriptionHtml ?? draft.descriptionHtml,
                  salesAgentQualityFix: {
                    fixedAt: new Date().toISOString(),
                    beforeTitle,
                    afterTitle,
                    descriptionUpdated: Boolean(descriptionHtml),
                  },
                } as Prisma.InputJsonValue,
              },
            });
            results.push({ listingId: candidate.listingId, ok: true, beforeTitle, afterTitle, descriptionUpdated: Boolean(descriptionHtml) });
          } catch (error) {
            results.push({
              listingId: candidate.listingId,
              ok: false,
              beforeTitle: candidate.title,
              afterTitle: candidate.suggestedTitle,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
      await recordSalesAgentTrace(userId, 'sales_agent.action.fix_catalog_quality', {
        ok: true,
        requested: selected.length,
        results,
      } as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        fixed: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
        message: `Calidad de catalogo: ${results.filter((result) => result.ok).length} fichas corregidas, ${results.filter((result) => !result.ok).length} fallidas.`,
      };
    }

    if (input.actionType === 'PUBLISH_APPROVED_BACKLOG') {
      const selected = dashboard.publishableDrafts.slice(0, limit);
      const results: Array<{ listingId: number; title: string; ok: boolean; error?: string }> = [];
      await withCatalogLock(async () => {
        for (const candidate of selected) {
          try {
            await cjShopifyUsaPublishService.publishListing({ userId, listingId: candidate.listingId });
            results.push({ listingId: candidate.listingId, title: candidate.title, ok: true });
          } catch (error) {
            results.push({
              listingId: candidate.listingId,
              title: candidate.title,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
      await recordSalesAgentTrace(userId, 'sales_agent.action.publish_approved_backlog', {
        ok: true,
        requested: selected.length,
        results,
      } as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        published: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
        message: `Publicacion controlada: ${results.filter((result) => result.ok).length} OK, ${results.filter((result) => !result.ok).length} fallidos.`,
      };
    }

    if (input.actionType === 'UNPUBLISH_UNSAFE_LISTINGS') {
      const selected = dashboard.unsafeUnpublishCandidates.slice(0, limit);
      const results: Array<{ listingId: number; title: string; ok: boolean; error?: string }> = [];
      await withCatalogLock(async () => {
        for (const candidate of selected) {
          try {
            await cjShopifyUsaPublishService.unpublishListing({ userId, listingId: candidate.listingId });
            results.push({ listingId: candidate.listingId, title: candidate.title, ok: true });
          } catch (error) {
            results.push({
              listingId: candidate.listingId,
              title: candidate.title,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
      await recordSalesAgentTrace(userId, 'sales_agent.action.unpublish_unsafe_listings', {
        ok: true,
        requested: selected.length,
        results,
      } as Prisma.InputJsonValue);
      return {
        ok: true,
        executed: true,
        actionType: input.actionType,
        unpublished: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
        message: `Despublicacion controlada: ${results.filter((result) => result.ok).length} OK, ${results.filter((result) => !result.ok).length} fallidos.`,
      };
    }

    const selected = dashboard.promotionCandidates.slice(0, limit);

    for (const candidate of selected) {
      cjShopifyUsaSocialService.schedulePost({
        userId,
        listingId: candidate.listingId,
        title: candidate.title,
      });
    }

    await recordSalesAgentTrace(userId, 'sales_agent.action.promote_top_products', {
      ok: true,
      queued: selected.length,
      listingIds: selected.map((item) => item.listingId),
      titles: selected.map((item) => item.title),
    } as Prisma.InputJsonValue);

    return {
      ok: true,
      executed: true,
      actionType: input.actionType,
      queued: selected.length,
      candidates: selected,
      message: selected.length
        ? `Se encolaron ${selected.length} publicaciones organicas en Pinterest.`
        : 'No hay productos elegibles para promocion segura en este momento.',
    };
  },

  async getSchedulerStatus(userId: number, hydrate = true) {
    if (hydrate) {
      await loadSchedulerConfig(userId);
      scheduleSalesAgent(userId, (id) => this.runSalesCycle(id));
    }
    const recentCycles = await prisma.cjShopifyUsaExecutionTrace.findMany({
      where: {
        userId,
        step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION,
        message: { in: ['sales_agent.cycle.completed', 'sales_agent.cycle.failed', 'sales_agent.cycle.aborted'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    return {
      state: schedulerState,
      config: schedulerConfig,
      currentCycle: currentSalesCycle,
      lastRunAt: schedulerLastRunAt?.toISOString() ?? null,
      nextRunAt: schedulerNextRunAt?.toISOString() ?? null,
      cycleHistory: salesCycleHistory.length
        ? salesCycleHistory
        : recentCycles.map((trace) => safeMeta(trace.meta)),
    };
  },

  async updateSchedulerConfig(userId: number, patch: Partial<SalesAgentSchedulerConfig>) {
    await loadSchedulerConfig(userId);
    const previousInterval = schedulerConfig.intervalHours;
    schedulerConfig = clampConfig({
      ...schedulerConfig,
      ...patch,
      enabled: schedulerConfig.enabled,
    });
    if (schedulerState === 'RUNNING' && previousInterval !== schedulerConfig.intervalHours) {
      scheduleSalesAgent(userId, (id) => this.runSalesCycle(id));
    }
    await persistSchedulerConfig(userId);
    return this.getSchedulerStatus(userId);
  },

  async startScheduler(userId: number) {
    await loadSchedulerConfig(userId);
    schedulerConfig.enabled = true;
    schedulerState = 'RUNNING';
    await persistSchedulerConfig(userId);
    scheduleSalesAgent(userId, (id) => this.runSalesCycle(id));
    void this.runSalesCycle(userId);
    return this.getSchedulerStatus(userId, false);
  },

  async pauseScheduler(userId: number) {
    await loadSchedulerConfig(userId);
    schedulerState = 'PAUSED';
    schedulerConfig.enabled = true;
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
    schedulerNextRunAt = null;
    await persistSchedulerConfig(userId);
    return this.getSchedulerStatus(userId, false);
  },

  async stopScheduler(userId: number) {
    schedulerState = 'IDLE';
    schedulerConfig.enabled = false;
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
    schedulerNextRunAt = null;
    if (currentSalesCycle?.status === 'RUNNING') {
      currentSalesCycle.status = 'ABORTED';
      currentSalesCycle.finishedAt = new Date().toISOString();
      currentSalesCycle.durationMs = Date.now() - new Date(currentSalesCycle.startedAt).getTime();
      pushSalesCycleHistory(currentSalesCycle);
      await recordSalesAgentTrace(userId, 'sales_agent.cycle.aborted', safeCycleMeta(currentSalesCycle));
      currentSalesCycle = null;
    }
    await persistSchedulerConfig(userId);
    return this.getSchedulerStatus(userId, false);
  },

  async startIfEnabled(userId: number) {
    await loadSchedulerConfig(userId);
    if (!schedulerConfig.enabled || schedulerState === 'PAUSED') return this.getSchedulerStatus(userId, false);
    schedulerState = 'RUNNING';
    scheduleSalesAgent(userId, (id) => this.runSalesCycle(id));
    return this.getSchedulerStatus(userId, false);
  },

  async runSalesCycle(userId: number) {
    if (currentSalesCycle?.status === 'RUNNING') return currentSalesCycle;
    await loadSchedulerConfig(userId);
    if (schedulerState !== 'RUNNING') schedulerState = 'RUNNING';

    const cycle: SalesAgentCycleResult = {
      cycleId: `sales-cycle-${Date.now()}`,
      startedAt: new Date().toISOString(),
      status: 'RUNNING',
      diagnosisScore: 0,
      published: 0,
      unpublished: 0,
      promoted: 0,
      recommendations: 0,
      errors: 0,
      events: [],
    };
    currentSalesCycle = cycle;
    schedulerLastRunAt = new Date();

    const log = (
      stage: SalesAgentCycleStage,
      level: SalesAgentCycleEvent['level'],
      message: string,
      meta?: Record<string, unknown>,
    ) => {
      cycle.events.push({ ts: new Date().toISOString(), stage, level, message, meta });
    };

    await recordSalesAgentTrace(userId, 'sales_agent.cycle.started', safeCycleMeta(cycle));

    try {
      let dashboard = await this.dashboard(userId);
      cycle.diagnosisScore = dashboard.health.score;
      cycle.recommendations = dashboard.actions.length;
      log('diagnostic', 'info', 'Diagnostico comercial completado', {
        healthScore: dashboard.health.score,
        activeListings: dashboard.kpis.activeListings,
        shopifyProducts: dashboard.shopifyTruth.activeProducts,
        purchaseRatePct: dashboard.kpis.purchaseRatePct,
        marginRisk: dashboard.health.marginRisk,
        catalogTrustRisk: dashboard.health.catalogTrustRisk,
      });
      log('diagnostic', dashboard.salesPipeline.bottleneck.status === 'blocked' ? 'warn' : 'info', 'Pipeline comercial evaluado', {
        pipelineScore: dashboard.salesPipeline.overallScore,
        bottleneck: dashboard.salesPipeline.bottleneck.label,
        bottleneckScore: dashboard.salesPipeline.bottleneck.score,
        distinction: dashboard.salesPipeline.distinction,
      });

      if (schedulerConfig.safeMode) {
        log('safe_mode', 'info', 'Modo seguro activo: sin pagos, ads, cambios agresivos de precio ni lotes masivos', {
          maxPublishPerCycle: schedulerConfig.maxPublishPerCycle,
          maxUnpublishPerCycle: schedulerConfig.maxUnpublishPerCycle,
          maxPromotionsPerCycle: schedulerConfig.maxPromotionsPerCycle,
        });
      }

      if (dashboard.health.marginRisk || dashboard.profitGuard.reviewRequired > 0) {
        const result = await this.executeAction(userId, { actionType: 'RUN_PROFIT_GUARD', limit: 5 });
        cycle.errors += n((result as any).failed);
        log((result as any).ok ? 'optimization' : 'safe_mode', (result as any).ok ? 'success' : 'warn', 'Profit Guard ejecutado antes de publicar o promocionar', {
          ok: Boolean((result as any).ok),
          priceIncreases: n((result as any).priceIncreases),
          pausedUnsafe: n((result as any).pausedUnsafe),
          reviewRequired: n((result as any).reviewRequired),
          shippingEnriched: n((result as any).shippingEnriched),
          message: String((result as any).message || ''),
        });
        dashboard = await this.dashboard(userId);
      } else {
        log('optimization', 'info', 'Profit Guard sin riesgos urgentes antes de publicar/promocionar');
      }

      if (schedulerConfig.autoUnpublishUnsafeListings && dashboard.unsafeUnpublishCandidates.length > 0) {
        const limit = schedulerConfig.safeMode
          ? Math.min(schedulerConfig.maxUnpublishPerCycle, 3)
          : schedulerConfig.maxUnpublishPerCycle;
        if (limit > 0) {
          const result = await this.executeAction(userId, { actionType: 'UNPUBLISH_UNSAFE_LISTINGS', limit });
          cycle.unpublished = n((result as any).unpublished);
          cycle.errors += n((result as any).failed);
          log('optimization', cycle.unpublished > 0 ? 'success' : 'warn', 'Despublicacion segura ejecutada', {
            requested: Math.min(limit, dashboard.unsafeUnpublishCandidates.length),
            unpublished: cycle.unpublished,
            failed: n((result as any).failed),
          });
        }
      } else {
        log('optimization', 'info', 'Sin candidatos PAUSE_UNSAFE para despublicar');
      }

      const fixCatalogAction = dashboard.actions.find((action) => action.type === 'FIX_CATALOG_QUALITY' && action.canExecute);
      if (fixCatalogAction) {
        const result = await this.executeAction(userId, { actionType: 'FIX_CATALOG_QUALITY', limit: 5 });
        log('optimization', n((result as any).fixed) > 0 ? 'success' : 'warn', 'Correccion automatica de calidad ejecutada', {
          fixed: n((result as any).fixed),
          failed: n((result as any).failed),
        });
        cycle.errors += n((result as any).failed);
      } else {
        log('optimization', 'info', 'Sin fichas corregibles automaticamente');
      }

      if (schedulerConfig.autoPublishApprovedDrafts && dashboard.publishableDrafts.length > 0) {
        const limit = schedulerConfig.safeMode
          ? Math.min(schedulerConfig.maxPublishPerCycle, 2)
          : schedulerConfig.maxPublishPerCycle;
        if (limit > 0) {
          const result = await this.executeAction(userId, { actionType: 'PUBLISH_APPROVED_BACKLOG', limit });
          cycle.published = n((result as any).published);
          cycle.errors += n((result as any).failed);
          log('optimization', cycle.published > 0 ? 'success' : 'warn', 'Publicacion segura de drafts ejecutada', {
            requested: Math.min(limit, dashboard.publishableDrafts.length),
            published: cycle.published,
            failed: n((result as any).failed),
          });
        }
      } else {
        log('optimization', 'info', 'Sin drafts aprobados y seguros para publicar');
      }

      if (schedulerConfig.autoPromoteOrganic && dashboard.promotionCandidates.length > 0) {
        if (dashboard.health.checkoutRisk) {
          log('marketing', 'warn', 'Promocion organica pausada por riesgo de checkout: hay llegada a checkout sin compras');
        } else {
          const limit = schedulerConfig.safeMode
            ? Math.min(schedulerConfig.maxPromotionsPerCycle, 5)
            : schedulerConfig.maxPromotionsPerCycle;
          if (limit > 0) {
            const result = await this.executeAction(userId, { actionType: 'PROMOTE_TOP_PRODUCTS', limit });
            cycle.promoted = n((result as any).queued);
            log('marketing', cycle.promoted > 0 ? 'success' : 'warn', 'Marketing organico encolado', {
              platform: 'Pinterest',
              queued: cycle.promoted,
              instagram: 'manual_until_oauth',
              tiktok: 'manual_until_oauth',
            });
          }
        }
      } else {
        log('marketing', 'info', 'Sin candidatos elegibles para marketing organico');
      }

      const learningSignals = {
        salesLearningReady: dashboard.kpis.paidOrders30 > 0,
        socialLearningReady: dashboard.kpis.socialPublished > 0,
        funnelLearningReady: dashboard.kpis.visitors > 0,
        topAction: dashboard.actions[0]?.type ?? null,
        pipelineBottleneck: dashboard.salesPipeline.bottleneck.key,
      };
      log('learning', 'info', 'Aprendizaje actualizado con resultados del ciclo', learningSignals);
      await recordSalesAgentTrace(userId, 'sales_agent.pipeline.snapshot', {
        overallScore: dashboard.salesPipeline.overallScore,
        bottleneck: dashboard.salesPipeline.bottleneck,
        stages: dashboard.salesPipeline.stages.map((stage) => ({
          key: stage.key,
          score: stage.score,
          status: stage.status,
          nextMove: stage.nextMove,
        })),
      } as unknown as Prisma.InputJsonValue);

      cycle.status = 'COMPLETED';
      cycle.finishedAt = new Date().toISOString();
      cycle.durationMs = Date.now() - new Date(cycle.startedAt).getTime();
      pushSalesCycleHistory(cycle);
      currentSalesCycle = null;
      if (!schedulerConfig.enabled) schedulerState = 'IDLE';
      schedulerNextRunAt = schedulerConfig.enabled
        ? new Date(Date.now() + schedulerConfig.intervalHours * 60 * 60 * 1000)
        : null;
      await recordSalesAgentTrace(userId, 'sales_agent.cycle.completed', safeCycleMeta(cycle));
      return cycle;
    } catch (error) {
      cycle.status = 'FAILED';
      cycle.finishedAt = new Date().toISOString();
      cycle.durationMs = Date.now() - new Date(cycle.startedAt).getTime();
      cycle.errors += 1;
      log('safe_mode', 'error', error instanceof Error ? error.message : String(error));
      schedulerState = schedulerConfig.enabled ? 'ERROR' : 'IDLE';
      pushSalesCycleHistory(cycle);
      currentSalesCycle = null;
      await recordSalesAgentTrace(userId, 'sales_agent.cycle.failed', safeCycleMeta(cycle));
      return cycle;
    }
  },
};
