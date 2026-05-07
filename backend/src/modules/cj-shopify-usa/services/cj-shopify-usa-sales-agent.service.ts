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
  | 'FIX_CATALOG_QUALITY';

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

function trimTitle(value: string, maxLength = 62): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const words = clean.split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    const candidate = [...kept, word].join(' ');
    if (candidate.length > maxLength) break;
    kept.push(word);
  }
  return kept.length ? kept.join(' ') : clean.slice(0, maxLength).trim();
}

function buildBuyerReadyTitle(rawTitle: string): string {
  const cleaned = String(rawTitle || '')
    .replace(/&/g, ' and ')
    .replace(/\b(cj[a-z0-9]+|\d{8,}[a-z0-9]*)\b/gi, ' ')
    .replace(/\bpet supplies\b/gi, '')
    .replace(/\bwholesale\b/gi, '')
    .replace(/\bnew\b/gi, '')
    .replace(/\b(for dog cat|cat dog)\b/gi, 'for Dogs and Cats')
    .replace(/\bout door\b/gi, 'Outdoor')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = cleaned.toLowerCase();
  let family = 'Pet Accessory';
  if (/water|fountain|feeder|bowl|food|snack|treat/.test(lower)) family = 'Pet Feeding Accessory';
  if (/groom|brush|comb|scissor|clipper|nail|trimmer|shampoo|bath/.test(lower)) family = 'Pet Grooming Tool';
  if (/toy|ball|disc|chew|training|interactive|puzzle/.test(lower)) family = 'Pet Training Toy';
  if (/collar|leash|harness|strap/.test(lower)) family = 'Dog Walking Accessory';
  if (/carrier|backpack|bag|travel|seat/.test(lower)) family = 'Pet Travel Carrier';
  if (/litter|mat|tray/.test(lower)) family = 'Cat Litter Accessory';
  if (/bed|mat|blanket|cushion|house/.test(lower)) family = 'Pet Comfort Bed';

  const detailWords = cleaned
    .split(/\s+/)
    .filter((word) => !/^(pet|dog|cat|dogs|cats|supplies|accessories|with|for|and|the|new)$/i.test(word))
    .slice(0, 4)
    .join(' ');
  const candidate = detailWords ? `${detailWords} ${family}` : family;
  return trimTitle(titleCase(candidate));
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
        take: 12,
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
      .map((listing) => ({
        listingId: listing.id,
        title: buyerTitle(listing),
        suggestedTitle: buildBuyerReadyTitle(buyerTitle(listing)),
        handle: listing.shopifyHandle,
        shopifyProductId: listing.shopifyProductId,
        imageCount: extractImageCount(listing.draftPayload),
        ...titleQuality(buyerTitle(listing)),
      }))
      .filter((row) => row.score < 80 || row.imageCount === 0)
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
        scheduler: await this.getSchedulerStatus(userId, false),
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
        summary: [
          purchaseRatePct === 0
            ? 'No hay aprendizaje de ventas cerradas aun; priorizar checkout y trafico medible.'
            : 'Ya existe conversion; priorizar productos/canales con ventas reales.',
          socialCounts[CJ_SHOPIFY_USA_SOCIAL_POST_STATUS.SUCCESS]
            ? 'Pinterest ya tiene publicaciones exitosas; conviene ampliar solo con productos de mejor score.'
            : 'Aun no hay publicaciones sociales exitosas registradas; empezar con lote pequeno controlado.',
        ],
      },
      promotionCandidates,
      publishableDrafts,
      unsafeUnpublishCandidates,
      actions: sortedActions,
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
    if (!['RUN_PROFIT_GUARD', 'PROMOTE_TOP_PRODUCTS', 'CURATE_SIMILAR_PRODUCTS', 'PUBLISH_APPROVED_BACKLOG', 'UNPUBLISH_UNSAFE_LISTINGS', 'FIX_CATALOG_QUALITY'].includes(input.actionType)) {
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

    if (input.actionType === 'RUN_PROFIT_GUARD') {
      const shipping = await cjShopifyUsaProfitGuardService.enrichMissingShipping(userId, {
        dryRun: false,
        limit: 25,
      });
      const result = await cjShopifyUsaProfitGuardService.run(userId, {
        dryRun: false,
        pauseUnsafe: true,
        limit: 500,
      });
      await recordSalesAgentTrace(userId, 'sales_agent.action.run_profit_guard', {
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
      await recordSalesAgentTrace(userId, 'sales_agent.action.curate_similar_products', {
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
      const results: Array<{ listingId: number; ok: boolean; beforeTitle: string; afterTitle: string; error?: string }> = [];
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
          const afterTitle = buildBuyerReadyTitle(beforeTitle);
          if (!afterTitle || normalizeTitle(beforeTitle) === normalizeTitle(afterTitle)) {
            results.push({ listingId: candidate.listingId, ok: true, beforeTitle, afterTitle: beforeTitle });
            continue;
          }
          await cjShopifyUsaAdminService.updateProductDetails({
            userId,
            productId: listing.shopifyProductId,
            title: afterTitle,
          });
          const draft = draftRecord(listing.draftPayload);
          await prisma.cjShopifyUsaListing.update({
            where: { id: listing.id },
            data: {
              draftPayload: {
                ...draft,
                title: afterTitle,
                salesAgentQualityFix: {
                  fixedAt: new Date().toISOString(),
                  beforeTitle,
                  afterTitle,
                },
              } as Prisma.InputJsonValue,
            },
          });
          results.push({ listingId: candidate.listingId, ok: true, beforeTitle, afterTitle });
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
      await recordSalesAgentTrace(userId, 'sales_agent.action.fix_catalog_quality', {
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
      await recordSalesAgentTrace(userId, 'sales_agent.action.publish_approved_backlog', {
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
      await recordSalesAgentTrace(userId, 'sales_agent.action.unpublish_unsafe_listings', {
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
      const dashboard = await this.dashboard(userId);
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

      if (schedulerConfig.safeMode) {
        log('safe_mode', 'info', 'Modo seguro activo: sin pagos, ads, cambios agresivos de precio ni lotes masivos', {
          maxPublishPerCycle: schedulerConfig.maxPublishPerCycle,
          maxUnpublishPerCycle: schedulerConfig.maxUnpublishPerCycle,
          maxPromotionsPerCycle: schedulerConfig.maxPromotionsPerCycle,
        });
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
      };
      log('learning', 'info', 'Aprendizaje actualizado con resultados del ciclo', learningSignals);

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
