/**
 * CJ → eBay USA — HTTP routes (FASE 3A → 3F).
 * No CJ HTTP, no eBay publish, no legacy Order/Product/Sale.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { cjEbayTraceService } from './services/cj-ebay-trace.service';
import { cjEbayConfigService } from './services/cj-ebay-config.service';
import {
  cjEbayUpdateConfigSchema,
  cjSearchBodySchema,
  cjShippingQuoteBodySchema,
  cjEbayEvaluateBodySchema,
  cjEbayListingDraftBodySchema,
  cjEbayListingPublishBodySchema,
  cjEbayOrderImportBodySchema,
  cjEbayOpportunityPipelineBodySchema,
  cjEbayResetOperationalDataSchema,
} from './schemas/cj-ebay.schemas';
import { cjEbayListingService } from './services/cj-ebay-listing.service';
import { cjEbayOrderIngestService } from './services/cj-ebay-order-ingest.service';
import { cjEbayFulfillmentService } from './services/cj-ebay-fulfillment.service';
import { cjEbayTrackingService } from './services/cj-ebay-tracking.service';
import { cjEbayOrderStatusService } from './services/cj-ebay-order-status.service';
import { cjEbayCjCheckoutService } from './services/cj-ebay-cj-checkout.service';
import { cjEbayOperationalValidationService } from './services/cj-ebay-operational-validation.service';
import { cjEbayOrderEvidenceService } from './services/cj-ebay-order-evidence.service';
import { cjEbaySystemReadinessService } from './services/cj-ebay-system-readiness.service';
import { logger } from '../../config/logger';
import { cjEbayQualificationService } from './services/cj-ebay-qualification.service';
import {
  CJ_EBAY_LISTING_STATUS,
  CJ_EBAY_ORDER_STATUS,
  CJ_EBAY_REFUND_STATUS,
  CJ_EBAY_TRACE_STEP,
} from './cj-ebay.constants';
import type { CjEbayHealthResponse, CjEbayOverviewResponse } from './cj-ebay.types';
import { createCjSupplierAdapter } from './adapters/cj-supplier.adapter';
import { CjSupplierError } from './adapters/cj-supplier.errors';
import type { CjProductDetail } from './adapters/cj-supplier.adapter.interface';
import { pricingBreakdownForResponse } from './services/cj-ebay-pricing.service';
import { cjEbayOpportunityPipelineService } from './services/cj-ebay-opportunity-pipeline.service';
import { cjEbayRefundService } from './services/cj-ebay-refund.service';
import { cjEbayAlertsService } from './services/cj-ebay-alerts.service';
import { cjEbayProfitService } from './services/cj-ebay-profit.service';
import { cjEbaySellingLimitsService } from './services/cj-ebay-selling-limits.service';
import { cjEbayAutopilotService } from './services/cj-ebay-autopilot.service';
import { cjEbayOrderPollingService } from './services/cj-ebay-order-polling.service';
import { cjEbayOperationalResetService } from './services/cj-ebay-operational-reset.service';

const router = Router();

function httpStatusForCj(err: CjSupplierError): number {
  switch (err.code) {
    case 'CJ_AUTH_INVALID':
    case 'CJ_AUTH_EXPIRED':
      return 401;
    case 'CJ_INVALID_SKU':
      return 404;
    case 'CJ_RATE_LIMIT':
      return 429;
    case 'CJ_SHIPPING_UNAVAILABLE':
      return 400;
    case 'CJ_NOT_IMPLEMENTED':
      return 501;
    default:
      return 502;
  }
}

/**
 * Operational ranking score for CJ search results (0–110).
 * Uses only signals available from product/listV2 — no extra CJ API calls.
 *
 * A  Stock presence      0–45 pts  Most predictive of pipeline success.
 *                                  Unknown stock is neutral (20pts), not penalized.
 *                                  Deep stock (≥50 units) gets +5 bonus.
 *
 * B  Price viability     0–30 pts  Sweet spot $1–$25: margin survives eBay fees (~16%)
 *                                  + typical CJ→US shipping ($3–$8).
 *                                  Unknown price: neutral (15pts).
 *
 * C  Image present       0–15 pts  eBay listings require at least one quality image.
 *
 * D  Title depth         0–10 pts  Longer title = more complete CJ catalog data.
 *
 * E  US warehouse        0–10 pts  US warehouse confirmed by freight probe → faster ETA,
 *                                  better eBay buyer experience, no overseas block risk.
 *                                  Only populated when CJ_EBAY_WAREHOUSE_AWARE=true.
 *
 * Products are NOT excluded — only sorted. Score 0 = weak candidate, not removed.
 */
function cjSearchRankScore(item: import('./adapters/cj-supplier.adapter.interface').CjProductSummary): number {
  let score = 0;

  // A — Stock
  if (item.inventoryTotal !== undefined && item.inventoryTotal > 0) {
    score += 40;
    if (item.inventoryTotal >= 50) score += 5; // deep stock = reliable supplier
  } else if (item.inventoryTotal === undefined) {
    score += 20; // missing field: neutral — many real products don't populate this
  }
  // inventoryTotal === 0 → 0 pts (likely dead stock)

  // B — Price viability for eBay USA dropship
  if (item.listPriceUsd != null && item.listPriceUsd > 0) {
    if (item.listPriceUsd >= 1 && item.listPriceUsd <= 25) {
      score += 30; // sweet spot: margin viable after fees + standard CJ→US shipping
    } else if (item.listPriceUsd < 1) {
      score += 8; // too cheap: shipping alone likely exceeds product cost
    } else if (item.listPriceUsd <= 50) {
      score += 20; // acceptable but tighter margin
    } else {
      score += 8; // >$50: capital-intensive, lower turnover on eBay
    }
  } else {
    score += 15; // unknown price: neutral
  }

  // C — Image (required for eBay listing)
  if (typeof item.mainImageUrl === 'string' && item.mainImageUrl.startsWith('http')) {
    score += 15;
  }

  // D — Title depth (longer = more complete product data from CJ catalog)
  const titleLen = item.title && item.title !== '(no title)' ? item.title.trim().length : 0;
  if (titleLen >= 40) score += 10;
  else if (titleLen >= 20) score += 6;
  else if (titleLen >= 10) score += 3;

  // E — US warehouse bonus (only when CJ_EBAY_WAREHOUSE_AWARE enrichment was performed)
  if (item.fulfillmentOrigin === 'US') {
    score += 10; // confirmed US warehouse = faster ETA, no overseas block risk
  }

  return score; // max 110 (45+30+15+10+10), min 0
}

type CjSearchOperabilityStatus = 'operable' | 'stock_unknown' | 'unavailable';

const CJ_SEARCH_OPERABILITY_ENRICH_LIMIT = 6;
const CJ_SEARCH_VARIANT_LIVE_PROBE_LIMIT = 1;
const CJ_PRODUCT_DETAIL_LIVE_STOCK_LIMIT = 100;

function cjSearchOperabilityStatus(
  item: import('./adapters/cj-supplier.adapter.interface').CjProductSummary
): CjSearchOperabilityStatus {
  if (item.inventoryTotal !== undefined && item.inventoryTotal > 0) {
    return 'operable';
  }
  if (item.inventoryTotal === 0) {
    return 'unavailable';
  }
  return 'stock_unknown';
}

/**
 * 4-tier ranking priority (lower = better):
 * 0 — operable + US warehouse confirmed
 * 1 — operable + CN warehouse (or origin not yet probed)
 * 2 — stock unknown
 * 3 — unavailable
 *
 * Within each tier, items are ranked by `cjSearchRankScore` (descending).
 */
function cjSearchOperabilityPriority(
  status: CjSearchOperabilityStatus,
  fulfillmentOrigin?: 'US' | 'CN' | 'UNKNOWN'
): number {
  switch (status) {
    case 'operable':
      return fulfillmentOrigin === 'US' ? 0 : 1;
    case 'stock_unknown':
      return 2;
    case 'unavailable':
      return 3;
    default:
      return 4;
  }
}

function liveStockVariantKeys(detail: CjProductDetail): string[] {
  return detail.variants
    .map((variant) => String(variant.cjVid || '').trim())
    .filter(Boolean);
}

function moneyFromUnknown(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function nestedMoneyFromDraft(draftPayload: unknown, path: string[]): number | null {
  let current: unknown = draftPayload;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return moneyFromUnknown(current);
}

function titleFromDraft(draftPayload: unknown, fallback: string): string {
  if (draftPayload && typeof draftPayload === 'object') {
    const title = (draftPayload as Record<string, unknown>).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return fallback;
}

function optimizerSeverity(priority: number): 'info' | 'warning' | 'critical' {
  if (priority >= 80) return 'critical';
  if (priority >= 40) return 'warning';
  return 'info';
}

async function probeProductOperabilityByLiveStock(
  adapter: ReturnType<typeof createCjSupplierAdapter>,
  cjProductId: string
): Promise<CjSearchOperabilityStatus> {
  const detail = await adapter.getProductById(cjProductId);
  const variantKeys = liveStockVariantKeys(detail);

  if (variantKeys.length === 0) {
    if (detail.variants.length === 0) {
      return 'unavailable';
    }
    return detail.variants.some((variant) => variant.stock > 0) ? 'operable' : 'stock_unknown';
  }

  const probeKeys = variantKeys.slice(0, Math.min(CJ_SEARCH_VARIANT_LIVE_PROBE_LIMIT, variantKeys.length));
  for (const key of probeKeys) {
    const liveStock = await adapter.getStockForSkus([key]);
    const stock = liveStock.get(key);
    if (stock === undefined) {
      return 'stock_unknown';
    }
    if (stock > 0) {
      return 'operable';
    }
  }

  return variantKeys.length > probeKeys.length ? 'stock_unknown' : 'unavailable';
}

async function enrichProductDetailWithLiveStock(
  adapter: ReturnType<typeof createCjSupplierAdapter>,
  detail: CjProductDetail
): Promise<{
  product: CjProductDetail;
  liveStockCoverage: { checked: number; total: number; complete: boolean };
}> {
  const probeKeys = liveStockVariantKeys(detail).slice(0, CJ_PRODUCT_DETAIL_LIVE_STOCK_LIMIT);
  if (probeKeys.length === 0) {
    return {
      product: detail,
      liveStockCoverage: { checked: 0, total: 0, complete: true },
    };
  }

  const liveStock = await adapter.getStockForSkus(probeKeys);
  const product: CjProductDetail = {
    ...detail,
    variants: detail.variants.map((variant) => {
      const key = String(variant.cjVid || '').trim();
      const stock = key ? liveStock.get(key) : undefined;
      return stock === undefined ? variant : { ...variant, stock };
    }),
  };

  return {
    product,
    liveStockCoverage: {
      checked: probeKeys.length,
      total: liveStockVariantKeys(detail).length,
      complete: probeKeys.length >= liveStockVariantKeys(detail).length,
    },
  };
}

function cjEbayEnabled(): boolean {
  return env.ENABLE_CJ_EBAY_MODULE === true;
}

function moduleGate(_req: Request, res: Response, next: NextFunction): void {
  if (!cjEbayEnabled()) {
    res.status(404).json({ ok: false, error: 'CJ_EBAY_MODULE_DISABLED' });
    return;
  }
  next();
}

async function traceComplete(
  req: Request,
  userId: number,
  message: string,
  meta?: Record<string, unknown>
): Promise<void> {
  const route = `${req.baseUrl}${req.path}`;
  await cjEbayTraceService.record({
    userId,
    correlationId: req.correlationId,
    route,
    step: CJ_EBAY_TRACE_STEP.REQUEST_COMPLETE,
    message,
    meta,
  });
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

const EBAY_ORDER_ATTENTION = [
  CJ_EBAY_ORDER_STATUS.FAILED,
  CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL,
  CJ_EBAY_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
] as string[];

const EBAY_ORDER_ACTIVE = [
  CJ_EBAY_ORDER_STATUS.DETECTED,
  CJ_EBAY_ORDER_STATUS.VALIDATED,
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_PLACING,
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_PLACED,
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED,
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMING,
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED,
  CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING,
  CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PROCESSING,
  CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
  CJ_EBAY_ORDER_STATUS.CJ_FULFILLING,
  CJ_EBAY_ORDER_STATUS.CJ_SHIPPED,
] as string[];

router.use(authenticate);

/**
 * FASE 3E.4 — Preparación: DB, migraciones CJ-eBay, flag, credenciales (sin CJ/eBay HTTP). Visible aunque el módulo esté desactivado.
 */
router.get('/system-readiness', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const out = await cjEbaySystemReadinessService.evaluateForUser(userId);
    res.json({ ready: out.ready, checks: out.checks });
  } catch (e) {
    next(e);
  }
});

router.use(moduleGate);

router.use((req: Request, _res: Response, next: NextFunction) => {
  const userId = req.user!.userId;
  const route = `${req.baseUrl}${req.path}`;
  void cjEbayTraceService.record({
    userId,
    correlationId: req.correlationId,
    route,
    step: CJ_EBAY_TRACE_STEP.REQUEST_START,
    message: `${req.method} ${req.path}`,
    meta: { method: req.method },
  });
  next();
});

router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const payload: CjEbayHealthResponse = {
      ok: true,
      module: 'cj-ebay',
      moduleEnabled: true,
      timestamp: new Date().toISOString(),
    };
    await traceComplete(req, userId, 'GET /health', { statusCode: 200 });
    res.json(payload);
  } catch (e) {
    next(e);
  }
});

router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      products,
      variants,
      evaluations,
      evaluationsApproved,
      evaluationsRejected,
      evaluationsPending,
      shippingQuotes,
      listings,
      listingsActive,
      orders,
      ordersOpen,
      ordersWithTracking,
      alertsOpen,
      profitSnapshots,
      tracesLast24h,
      sellingLimits,
    ] = await Promise.all([
      prisma.cjEbayProduct.count({ where: { userId } }),
      prisma.cjEbayProductVariant.count({
        where: { product: { userId } },
      }),
      prisma.cjEbayProductEvaluation.count({ where: { userId } }),
      prisma.cjEbayProductEvaluation.count({ where: { userId, decision: 'APPROVED' } }),
      prisma.cjEbayProductEvaluation.count({ where: { userId, decision: 'REJECTED' } }),
      prisma.cjEbayProductEvaluation.count({ where: { userId, decision: 'PENDING' } }),
      prisma.cjEbayShippingQuote.count({ where: { userId } }),
      prisma.cjEbayListing.count({ where: { userId } }),
      prisma.cjEbayListing.count({ where: { userId, status: 'ACTIVE' } }),
      prisma.cjEbayOrder.count({ where: { userId } }),
      prisma.cjEbayOrder.count({
        where: {
          userId,
          status: { notIn: ['COMPLETED', 'FAILED'] },
        },
      }),
      prisma.cjEbayTracking.count({
        where: {
          order: { userId },
          trackingNumber: { not: null },
        },
      }),
      prisma.cjEbayAlert.count({ where: { userId, status: 'OPEN' } }),
      prisma.cjEbayProfitSnapshot.count({ where: { userId } }),
      prisma.cjEbayExecutionTrace.count({
        where: { userId, createdAt: { gte: since } },
      }),
      cjEbaySellingLimitsService.getMonthlySnapshot(userId),
    ]);

    const body: CjEbayOverviewResponse = {
      ok: true,
      counts: {
        products,
        variants,
        evaluations,
        evaluationsApproved,
        evaluationsRejected,
        evaluationsPending,
        shippingQuotes,
        listings,
        listingsActive,
        orders,
        ordersOpen,
        ordersWithTracking,
        alertsOpen,
        profitSnapshots,
        tracesLast24h,
      },
      note:
        'FASE 3C–3E: aggregates on cj_ebay_* only (evaluations, quotes, listings, orders, traces).',
      sellingLimits,
    };
    await traceComplete(req, userId, 'GET /overview', { statusCode: 200 });
    res.json(body);
  } catch (e) {
    next(e);
  }
});

router.get('/selling-limits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const sellingLimits = await cjEbaySellingLimitsService.getMonthlySnapshot(userId);
    await traceComplete(req, userId, 'GET /selling-limits', { statusCode: 200 });
    res.json({ ok: true, sellingLimits });
  } catch (e) {
    next(e);
  }
});

router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const settings = await cjEbayConfigService.getOrCreateSettings(userId);
    await traceComplete(req, userId, 'GET /config', { statusCode: 200 });
    res.json({ ok: true, settings });
  } catch (e) {
    next(e);
  }
});

router.post('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const parsed = cjEbayUpdateConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid config body', 400);
    }
    const settings = await cjEbayConfigService.updateSettings(userId, parsed.data);
    await traceComplete(req, userId, 'POST /config', { statusCode: 200 });
    res.json({ ok: true, settings });
  } catch (e) {
    next(e);
  }
});

router.post('/config/reset-operational-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const parsed = cjEbayResetOperationalDataSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid reset body. Use confirm=RESET_CJ_EBAY_USA.', 400);
    }
    await cjEbayAutopilotService.stop(userId);
    const out = await cjEbayOperationalResetService.resetUserData(userId, {
      keepSettings: parsed.data.keepSettings,
    });
    await traceComplete(req, userId, 'POST /config/reset-operational-data', {
      statusCode: 200,
      deleted: out.deleted,
      marketNiche: out.marketNiche,
    });
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/config/preview-impact', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [settings, listings, evaluations, limits] = await Promise.all([
      cjEbayConfigService.getOrCreateSettings(userId),
      prisma.cjEbayListing.findMany({
        where: { userId },
        select: { id: true, status: true, listedPriceUsd: true, product: { select: { title: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 250,
      }),
      prisma.cjEbayProductEvaluation.findMany({
        where: { userId },
        select: { id: true, decision: true, estimatedMarginPct: true, product: { select: { title: true } } },
        orderBy: { evaluatedAt: 'desc' },
        take: 250,
      }),
      cjEbaySellingLimitsService.getMonthlySnapshot(userId),
    ]);
    const minMargin = settings.minMarginPct;
    const belowMargin = evaluations.filter(
      (e) => minMargin != null && e.estimatedMarginPct != null && Number(e.estimatedMarginPct) < minMargin
    );
    const activeExposure = listings
      .filter((l) => l.status === CJ_EBAY_LISTING_STATUS.ACTIVE)
      .reduce((sum, l) => sum + num(l.listedPriceUsd), 0);
    const policyBlocked = listings.filter((l) => l.status === CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK);
    const draftPublishable = listings.filter((l) => [CJ_EBAY_LISTING_STATUS.DRAFT, CJ_EBAY_LISTING_STATUS.FAILED].includes(l.status as never));
    await traceComplete(req, userId, 'GET /config/preview-impact', { statusCode: 200 });
    res.json({
      ok: true,
      summary: {
        activeExposureUsd: Number(activeExposure.toFixed(2)),
        belowMarginCount: belowMargin.length,
        policyBlockedCount: policyBlocked.length,
        draftPublishableCount: draftPublishable.length,
        quotaConfigured: limits.configured,
        remainingListings: limits.remainingListings,
        remainingAmountUsd: limits.remainingAmountUsd,
      },
      issues: [
        ...belowMargin.slice(0, 8).map((item) => ({
          type: 'MARGIN_BELOW_THRESHOLD',
          severity: 'warning',
          title: item.product.title,
          detail: `Margen estimado ${item.estimatedMarginPct == null ? 'sin dato' : `${(Number(item.estimatedMarginPct) * 100).toFixed(1)}%`} bajo el objetivo configurado.`,
        })),
        ...policyBlocked.slice(0, 8).map((item) => ({
          type: 'EBAY_POLICY_BLOCK',
          severity: 'critical',
          title: item.product.title,
          detail: 'Bloqueado por política de cuenta eBay / overseas warehouse.',
        })),
      ],
    });
  } catch (e) {
    next(e);
  }
});

router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const rawLimit = Number(req.query.limit ?? 100);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 20), 300);
    const step = String(req.query.step ?? '').trim();
    const where = {
      userId,
      ...(step
        ? step === 'error'
          ? { step: { contains: 'error', mode: 'insensitive' as const } }
          : { step: { contains: step, mode: 'insensitive' as const } }
        : {}),
    };
    const [traces, count] = await Promise.all([
      prisma.cjEbayExecutionTrace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.cjEbayExecutionTrace.count({ where }),
    ]);
    await traceComplete(req, userId, 'GET /logs', { statusCode: 200, count: traces.length });
    res.json({
      ok: true,
      count,
      traces: traces.map((t) => ({
        id: t.id,
        step: t.step,
        route: t.route,
        message: t.message,
        correlationId: t.correlationId,
        meta: t.meta,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/post-sale/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [orders, refunds, alerts, trackingMissing] = await Promise.all([
      prisma.cjEbayOrder.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 80,
        include: { tracking: true, listing: { select: { ebayListingId: true, ebaySku: true, product: { select: { title: true } } } } },
      }),
      prisma.cjEbayOrderRefund.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 50 }),
      prisma.cjEbayAlert.findMany({ where: { userId, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.cjEbayOrder.count({
        where: {
          userId,
          status: { in: [CJ_EBAY_ORDER_STATUS.CJ_SHIPPED, CJ_EBAY_ORDER_STATUS.CJ_FULFILLING] },
          tracking: { is: { trackingNumber: null } },
        },
      }),
    ]);
    const safeQueue = orders
      .filter((o) => [CJ_EBAY_ORDER_STATUS.VALIDATED, CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED, CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED, CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING].includes(o.status as never))
      .slice(0, 12)
      .map((o) => ({
        orderId: o.id,
        ebayOrderId: o.ebayOrderId,
        status: o.status,
        nextAction:
          o.status === CJ_EBAY_ORDER_STATUS.VALIDATED
            ? 'place'
            : o.status === CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED
              ? 'confirm'
              : 'pay',
        title: o.listing?.product.title ?? o.ebaySku ?? o.ebayOrderId,
        totalUsd: o.totalUsd == null ? null : Number(o.totalUsd),
      }));
    await traceComplete(req, userId, 'GET /post-sale/dashboard', { statusCode: 200 });
    res.json({
      ok: true,
      kpis: {
        totalOrders: orders.length,
        activeOrders: orders.filter((o) => EBAY_ORDER_ACTIVE.includes(o.status)).length,
        attentionOrders: orders.filter((o) => EBAY_ORDER_ATTENTION.includes(o.status)).length,
        completedOrders: orders.filter((o) => o.status === CJ_EBAY_ORDER_STATUS.COMPLETED).length,
        trackingMissing,
        openAlerts: alerts.length,
        activeRefunds: refunds.filter((r) => ![CJ_EBAY_REFUND_STATUS.REFUND_COMPLETED, CJ_EBAY_REFUND_STATUS.RETURN_REJECTED].includes(r.status as never)).length,
      },
      safeQueue,
      recentOrders: orders.slice(0, 12).map((o) => ({
        orderId: o.id,
        ebayOrderId: o.ebayOrderId,
        status: o.status,
        title: o.listing?.product.title ?? o.ebaySku ?? o.ebayOrderId,
        totalUsd: o.totalUsd == null ? null : Number(o.totalUsd),
        trackingNumber: o.tracking?.trackingNumber ?? null,
        updatedAt: o.updatedAt.toISOString(),
      })),
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        payload: a.payload,
        createdAt: a.createdAt.toISOString(),
      })),
      refunds: refunds.slice(0, 12).map((r) => ({
        id: r.id,
        orderId: r.orderId,
        status: r.status,
        amountUsd: r.amountUsd == null ? null : Number(r.amountUsd),
        reason: r.reason,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/post-sale/run-safe-queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidates = await prisma.cjEbayOrder.findMany({
      where: {
        userId,
        status: { in: [CJ_EBAY_ORDER_STATUS.VALIDATED, CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED, CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED, CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING] },
      },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });
    await traceComplete(req, userId, 'POST /post-sale/run-safe-queue', { statusCode: 200, checked: candidates.length });
    res.json({
      ok: true,
      checked: candidates.length,
      processed: [],
      stoppedForBalance: candidates.some((o) => o.paymentBlockReason === 'CJ_BALANCE_INSUFFICIENT'),
      note: 'Cola segura auditada. Las acciones destructivas quedan en los controles individuales place/confirm/pay.',
      candidates: candidates.map((o) => ({
        orderId: o.id,
        ebayOrderId: o.ebayOrderId,
        status: o.status,
        suggestedAction:
          o.status === CJ_EBAY_ORDER_STATUS.VALIDATED
            ? 'place'
            : o.status === CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED
              ? 'confirm'
              : 'pay',
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/analytics/funnel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [products, evaluations, approved, drafts, activeListings, orders, completed] = await Promise.all([
      prisma.cjEbayProduct.count({ where: { userId } }),
      prisma.cjEbayProductEvaluation.count({ where: { userId } }),
      prisma.cjEbayProductEvaluation.count({ where: { userId, decision: 'APPROVED' } }),
      prisma.cjEbayListing.count({ where: { userId } }),
      prisma.cjEbayListing.count({ where: { userId, status: CJ_EBAY_LISTING_STATUS.ACTIVE } }),
      prisma.cjEbayOrder.count({ where: { userId } }),
      prisma.cjEbayOrder.count({ where: { userId, status: CJ_EBAY_ORDER_STATUS.COMPLETED } }),
    ]);
    const stages = [
      { key: 'products', label: 'Catalogo CJ', value: products, conversionPct: 100 },
      { key: 'evaluations', label: 'Evaluados', value: evaluations, conversionPct: pct(evaluations, products) },
      { key: 'approved', label: 'Aprobados', value: approved, conversionPct: pct(approved, evaluations) },
      { key: 'drafts', label: 'Drafts eBay', value: drafts, conversionPct: pct(drafts, approved) },
      { key: 'activeListings', label: 'Activos eBay', value: activeListings, conversionPct: pct(activeListings, drafts) },
      { key: 'orders', label: 'Ordenes', value: orders, conversionPct: pct(orders, activeListings) },
      { key: 'completed', label: 'Completadas', value: completed, conversionPct: pct(completed, orders) },
    ];
    await traceComplete(req, userId, 'GET /analytics/funnel', { statusCode: 200 });
    res.json({ ok: true, stages, bottleneck: stages.slice(1).sort((a, b) => (a.conversionPct ?? 0) - (b.conversionPct ?? 0))[0] ?? null });
  } catch (e) {
    next(e);
  }
});

router.get('/analytics/profit-guard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [profit, limits, listings] = await Promise.all([
      cjEbayProfitService.getFinancials(userId),
      cjEbaySellingLimitsService.getMonthlySnapshot(userId),
      prisma.cjEbayListing.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 80,
        include: { product: { select: { title: true } }, evaluation: { select: { estimatedMarginPct: true } } },
      }),
    ]);
    const issues = listings
      .filter((l) => l.status === CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK || l.status === CJ_EBAY_LISTING_STATUS.FAILED || (l.evaluation?.estimatedMarginPct != null && Number(l.evaluation.estimatedMarginPct) < 0.12))
      .slice(0, 25)
      .map((l) => ({
        listingId: l.id,
        title: l.product.title,
        status: l.status,
        priceUsd: l.listedPriceUsd == null ? null : Number(l.listedPriceUsd),
        estimatedMarginPct: l.evaluation?.estimatedMarginPct == null ? null : Number(l.evaluation.estimatedMarginPct) * 100,
        issue:
          l.status === CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK
            ? 'Bloqueo de política eBay'
            : l.status === CJ_EBAY_LISTING_STATUS.FAILED
              ? 'Publicación fallida'
              : 'Margen bajo',
      }));
    await traceComplete(req, userId, 'GET /analytics/profit-guard', { statusCode: 200 });
    res.json({
      ok: true,
      kpis: profit.kpis,
      sellingLimits: limits,
      issues,
      checkedListings: listings.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/analytics/profit-guard/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const profit = await cjEbayProfitService.getFinancials(userId);
    await traceComplete(req, userId, 'POST /analytics/profit-guard/run', { statusCode: 200 });
    res.json({ ok: true, ...profit, generatedAt: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

router.get('/automation/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const status = await cjEbayAutopilotService.getStatus(userId);
    await traceComplete(req, userId, 'GET /automation/status', { statusCode: 200 });
    res.json({ ok: true, ...status });
  } catch (e) {
    next(e);
  }
});

for (const command of ['start', 'pause', 'resume', 'stop', 'run-now'] as const) {
  router.post(`/automation/${command}`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      let out: unknown;
      if (command === 'start' || command === 'resume') out = await cjEbayAutopilotService.start(userId);
      else if (command === 'pause') out = await cjEbayAutopilotService.pause(userId);
      else if (command === 'stop') out = await cjEbayAutopilotService.stop(userId);
      else out = await cjEbayAutopilotService.runNow(userId, 'MANUAL', { dryRun: req.body?.dryRun === true });
      await traceComplete(req, userId, `POST /automation/${command}`, { statusCode: 200 });
      res.json({ ok: true, command, message: `Automation ${command} ejecutado para CJ-eBay autopilot.`, result: out });
    } catch (e) {
      next(e);
    }
  });
}

router.post('/automation/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const config = await cjEbayAutopilotService.configure(userId, req.body ?? {});
    await traceComplete(req, userId, 'POST /automation/config', { statusCode: 200, body: req.body ?? {} });
    res.json({ ok: true, config, message: 'Configuración de autopilot CJ-eBay guardada.' });
  } catch (e) {
    next(e);
  }
});

router.get('/sales-agent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [overviewCounts, limits, recommendations, optimizer, profit, autopilot] = await Promise.all([
      Promise.all([
        prisma.cjEbayProduct.count({ where: { userId } }),
        prisma.cjEbayProductEvaluation.count({ where: { userId, decision: 'APPROVED' } }),
        prisma.cjEbayListing.count({ where: { userId } }),
        prisma.cjEbayListing.count({ where: { userId, status: CJ_EBAY_LISTING_STATUS.ACTIVE } }),
        prisma.cjEbayOrder.count({ where: { userId } }),
      ]),
      cjEbaySellingLimitsService.getMonthlySnapshot(userId),
      prisma.cjEbayOpportunityCandidate.findMany({ where: { userId }, orderBy: [{ totalScore: 'desc' }, { updatedAt: 'desc' }], take: 12 }),
      prisma.cjEbayListing.findMany({ where: { userId, status: { in: [CJ_EBAY_LISTING_STATUS.FAILED, CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK, CJ_EBAY_LISTING_STATUS.RECONCILE_PENDING] } }, include: { product: { select: { title: true } } }, take: 12 }),
      cjEbayProfitService.getFinancials(userId),
      cjEbayAutopilotService.getStatus(userId),
    ]);
    const [products, approved, listings, activeListings, orders] = overviewCounts;
    const overallScore = Math.round(
      Math.min(100, (pct(approved, Math.max(products, 1)) ?? 0) * 0.25 + (pct(activeListings, Math.max(listings, 1)) ?? 0) * 0.45 + (limits.configured ? 20 : 0) + Math.min(10, orders))
    );
    await traceComplete(req, userId, 'GET /sales-agent', { statusCode: 200 });
    res.json({
      ok: true,
      scheduler: {
        status: autopilot.status,
        config: {
          intervalMinutes: autopilot.config.intervalMinutes,
          maxPublishesPerRun: autopilot.config.maxPublishPerRun,
          respectMonthlyQuota: true,
          blockPolicyRisks: true,
          requireUsWarehouseOnly: autopilot.config.requireUsWarehouseOnly,
          autoPayCjOrders: autopilot.config.autoPayCjOrders,
        },
      },
      pipeline: {
        overallScore,
        stages: [
          { key: 'products', label: 'Productos CJ', value: products, status: products > 0 ? 'ok' : 'warning' },
          { key: 'approved', label: 'Aprobados', value: approved, status: approved > 0 ? 'ok' : 'warning' },
          { key: 'listings', label: 'Listings', value: listings, status: listings > 0 ? 'ok' : 'warning' },
          { key: 'active', label: 'Activos eBay', value: activeListings, status: activeListings > 0 ? 'ok' : 'critical' },
          { key: 'orders', label: 'Ordenes', value: orders, status: orders > 0 ? 'ok' : 'warning' },
        ],
        bottleneck: activeListings === 0 ? 'Listings activos eBay' : limits.configured ? 'Escala controlada por cuota mensual' : 'Configurar cuotas mensuales',
      },
      quotas: limits,
      kpis: profit.kpis,
      recommendations: recommendations.map((r) => ({
        id: r.id,
        title: r.cjProductTitle,
        seedKeyword: r.seedKeyword,
        score: Number(r.totalScore),
        status: r.status,
        reason: r.recommendationReason,
        suggestedPriceUsd: r.marketObservedPriceUsd == null ? null : Number(r.marketObservedPriceUsd),
        netProfitUsd: null,
        netMarginPct: null,
      })),
      actions: [
        {
          id: 'dry-run-autopilot',
          listingId: 0,
          title: 'CJ USA → eBay USA',
          severity: 'info',
          recommendation: 'Probar ciclo completo en dry-run',
          reason: 'Valida discovery, evaluación, draft, polling de ventas y postventa sin publicar en eBay ni pagar CJ.',
        },
        {
          id: 'run-autopilot',
          listingId: 0,
          title: 'CJ USA → eBay USA',
          severity: 'info',
          recommendation: 'Ejecutar ciclo autopilot completo',
          reason: 'Descubre, filtra warehouse USA, publica, importa órdenes y procesa postventa según guardrails.',
        },
        {
          id: 'poll-orders',
          listingId: 0,
          title: 'eBay Fulfillment API',
          severity: 'info',
          recommendation: 'Buscar ventas nuevas en eBay',
          reason: 'Polling seguro de órdenes recientes para alimentar el ciclo postventa.',
        },
        ...optimizer.map((l) => ({
          id: `listing-${l.id}`,
          listingId: l.id,
          title: l.product.title,
          severity: l.status === CJ_EBAY_LISTING_STATUS.ACCOUNT_POLICY_BLOCK ? 'critical' : 'warning',
          recommendation: l.status === CJ_EBAY_LISTING_STATUS.RECONCILE_PENDING ? 'Reconciliar offer/listing eBay' : 'Resolver bloqueo de publicación',
          reason: l.lastError ?? l.status,
        })),
      ],
    });
  } catch (e) {
    next(e);
  }
});

router.post('/sales-agent/actions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const rawId = String((req.body ?? {}).id || '').trim();
    let result: unknown;
    if (rawId === 'dry-run-autopilot') {
      result = await cjEbayAutopilotService.runNow(userId, 'DRY_RUN', { dryRun: true });
    } else if (rawId === 'run-discovery' || rawId === 'publish-next' || rawId === 'run-autopilot') {
      result = await cjEbayAutopilotService.runNow(userId, 'SALES_AGENT', { dryRun: req.body?.dryRun === true });
    } else if (rawId === 'poll-orders') {
      const settings = await cjEbayConfigService.getOrCreateSettings(userId);
      result = await cjEbayOrderPollingService.pollRecentOrders({
        userId,
        lookbackHours: settings.orderPollingLookbackHours,
        limit: settings.maxOrdersPerRun,
        route: 'cj-ebay.sales-agent',
      });
    } else if (rawId.startsWith('listing-')) {
      const listingId = Number(rawId.replace('listing-', ''));
      const listing = await prisma.cjEbayListing.findFirst({ where: { id: listingId, userId } });
      if (listing?.status === CJ_EBAY_LISTING_STATUS.RECONCILE_PENDING || listing?.status === CJ_EBAY_LISTING_STATUS.OFFER_ALREADY_EXISTS) {
        result = await cjEbayListingService.reconcile({ userId, listingDbId: listingId, route: 'cj-ebay.sales-agent' });
      } else if (listing?.status === CJ_EBAY_LISTING_STATUS.ACTIVE) {
        await cjEbayListingService.pause({ userId, listingDbId: listingId, route: 'cj-ebay.sales-agent' });
        result = { status: 'PAUSED', listingId };
      } else {
        result = { status: 'NO_ACTION', message: 'Listing action is not executable in current status.' };
      }
    } else {
      result = { status: 'NO_ACTION', message: 'Unknown sales-agent action.' };
    }
    await traceComplete(req, userId, 'POST /sales-agent/actions', { statusCode: 200, body: req.body ?? {} });
    res.json({ ok: true, accepted: true, result });
  } catch (e) {
    next(e);
  }
});

router.get('/sales-agent/scheduler', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const status = await cjEbayAutopilotService.getStatus(userId);
    res.json({ ok: true, scheduler: { status: status.status, config: status.config } });
  } catch (e) {
    next(e);
  }
});

router.patch('/sales-agent/scheduler/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const config = await cjEbayAutopilotService.configure(userId, req.body ?? {});
    await traceComplete(req, userId, 'PATCH /sales-agent/scheduler/config', { statusCode: 200, body: req.body ?? {} });
    res.json({ ok: true, scheduler: { status: config.autopilotState, config } });
  } catch (e) {
    next(e);
  }
});

for (const command of ['start', 'pause', 'stop', 'run-now'] as const) {
  router.post(`/sales-agent/scheduler/${command}`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const result =
        command === 'start'
          ? await cjEbayAutopilotService.start(userId)
          : command === 'pause'
            ? await cjEbayAutopilotService.pause(userId)
            : command === 'stop'
              ? await cjEbayAutopilotService.stop(userId)
              : await cjEbayAutopilotService.runNow(userId, 'SALES_AGENT', { dryRun: req.body?.dryRun === true });
      await traceComplete(req, userId, `POST /sales-agent/scheduler/${command}`, { statusCode: 200 });
      res.json({ ok: true, command, scheduler: result });
    } catch (e) {
      next(e);
    }
  });
}

// --- FASE 3C: qualification + pricing (no eBay publish) ---

router.post('/pricing/preview', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const parsed = cjEbayEvaluateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid body', 400);
    }
    const b = parsed.data;
    const out = await cjEbayQualificationService.preview({
      userId,
      body: {
        productId: b.productId,
        variantId: b.variantId,
        quantity: b.quantity,
        destPostalCode: b.destPostalCode,
      },
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /pricing/preview', { statusCode: 200 });
    const { breakdown, ...rest } = out;
    res.json({ ok: true, breakdown: pricingBreakdownForResponse(breakdown), ...rest });
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_UNIT_COST') {
      await traceComplete(req, req.user!.userId, 'POST /pricing/preview', {
        statusCode: 400,
        error: 'NO_UNIT_COST',
      });
      res.status(400).json({
        ok: false,
        error: 'NO_UNIT_COST',
        message: 'CJ variant has no usable unit cost for pricing preview.',
      });
      return;
    }
    if (e instanceof CjSupplierError) {
      const status = httpStatusForCj(e);
      await traceComplete(req, req.user!.userId, 'POST /pricing/preview', {
        statusCode: status,
        error: e.code,
      });
      res.status(status).json({
        ok: false,
        error: e.code,
        message: e.message,
        cjMessage: e.cjMessage,
      });
      return;
    }
    next(e);
  }
});

router.post('/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const routePath = `${req.baseUrl}${req.path}`;
    const parsed = cjEbayEvaluateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid body', 400);
    }
    const b = parsed.data;
    const out = await cjEbayQualificationService.evaluate({
      userId,
      body: {
        productId: b.productId,
        variantId: b.variantId,
        quantity: b.quantity,
        destPostalCode: b.destPostalCode,
      },
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /evaluate', { statusCode: 200, decision: out.decision });
    const { breakdown, ...rest } = out;
    res.json({ ok: true, breakdown: pricingBreakdownForResponse(breakdown), ...rest });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Variant not found')) {
      await traceComplete(req, req.user!.userId, 'POST /evaluate', {
        statusCode: 400,
        error: 'VARIANT_NOT_FOUND',
      });
      res.status(400).json({ ok: false, error: 'VARIANT_NOT_FOUND', message: e.message });
      return;
    }
    if (e instanceof CjSupplierError) {
      const status = httpStatusForCj(e);
      await traceComplete(req, req.user!.userId, 'POST /evaluate', {
        statusCode: status,
        error: e.code,
      });
      res.status(status).json({
        ok: false,
        error: e.code,
        message: e.message,
        cjMessage: e.cjMessage,
      });
      return;
    }
    next(e);
  }
});

/**
 * FASE 3D+ — Desde Opportunities / Product Research: evaluate → draft eBay → publicar (opcional).
 * No expone secretos; registra supplier CJ y listing local en trazas existentes.
 */
router.post('/opportunities/ebay-pipeline', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const parsed = cjEbayOpportunityPipelineBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid body', 400);
    }
    const b = parsed.data;
    const out = await cjEbayOpportunityPipelineService.run({
      userId,
      body: {
        productId: b.productId,
        variantId: b.variantId,
        quantity: b.quantity,
        destPostalCode: b.destPostalCode,
        draftOnly: b.draftOnly,
        publish: b.publish,
      },
      correlationId: req.correlationId,
      route: routePath,
    });
    const evalBreakdown = out.evaluate.breakdown;
    await traceComplete(req, userId, 'POST /opportunities/ebay-pipeline', {
      statusCode: 200,
      listingId: out.listing?.id,
      decision: out.evaluate.decision,
    });
    res.json({
      ok: out.ok,
      resolvedVariantId: out.resolvedVariantId,
      variantResolution: out.variantResolution,
      evaluate: {
        ...out.evaluate,
        breakdown:
          evalBreakdown && typeof evalBreakdown === 'object'
            ? pricingBreakdownForResponse(evalBreakdown as any)
            : evalBreakdown,
      },
      listing: out.listing,
      breakdown: out.breakdown,
      draftPayload: out.draftPayload,
      policyNote: out.policyNote,
      publish: out.publish,
      publishSkippedReason: out.publishSkippedReason,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Multiple CJ variants')) {
      await traceComplete(req, req.user!.userId, 'POST /opportunities/ebay-pipeline', {
        statusCode: 400,
        error: 'MULTIPLE_CJ_VARIANTS',
      });
      res.status(400).json({
        ok: false,
        error: 'MULTIPLE_CJ_VARIANTS',
        message: e.message,
      });
      return;
    }
    if (e instanceof CjSupplierError) {
      const status = httpStatusForCj(e);
      await traceComplete(req, req.user!.userId, 'POST /opportunities/ebay-pipeline', {
        statusCode: status,
        error: e.code,
      });
      res.status(status).json({
        ok: false,
        error: e.code,
        message: e.message,
        cjMessage: e.cjMessage,
      });
      return;
    }
    next(e);
  }
});

// --- FASE 3E: orders (manual import, CJ place, tracking) — no marketplace-order-sync / legacy webhooks ---

router.post('/orders/import', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const parsed = cjEbayOrderImportBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid body', 400);
    }
    const out = await cjEbayOrderIngestService.importByEbayOrderId({
      userId,
      ebayOrderId: parsed.data.ebayOrderId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /orders/import', { statusCode: 200, orderId: out.orderId });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const rows = await cjEbayOrderIngestService.listOrders(userId);
    await traceComplete(req, userId, 'GET /orders', { statusCode: 200 });
    res.json({
      ok: true,
      orders: rows.map((r) => ({
        ...r,
        totalUsd: r.totalUsd != null ? Number(r.totalUsd) : null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * FASE 3E.4 — Solo DB: gates del flujo, secuencia sugerida, últimas trazas con meta.orderId (sin llamar CJ/eBay).
 */
router.get('/orders/:orderId/operational-flow', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    const snapshot = await cjEbayOperationalValidationService.getFlowSnapshot(userId, orderId);
    await traceComplete(req, userId, 'GET /orders/:orderId/operational-flow', { statusCode: 200 });
    res.json({ ok: true, snapshot });
  } catch (e) {
    if (e instanceof Error && e.message === 'Order not found') {
      next(new AppError('Order not found', 404));
      return;
    }
    next(e);
  }
});

/**
 * FASE 3E.4 — JSON para constancia: orden mínima, timeline de eventos, trazas (sanitizadas). Sin CJ/eBay HTTP.
 */
router.get('/orders/:orderId/evidence-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    const summary = await cjEbayOrderEvidenceService.buildEvidenceSummary(userId, orderId);
    await traceComplete(req, userId, 'GET /orders/:orderId/evidence-summary', { statusCode: 200 });
    res.json({ ok: true, summary });
  } catch (e) {
    if (e instanceof Error && e.message === 'Order not found') {
      next(new AppError('Order not found', 404));
      return;
    }
    next(e);
  }
});

router.get('/orders/:orderId/status', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    const out = await cjEbayOrderStatusService.fetchFromCj({
      userId,
      orderId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'GET /orders/:orderId/status', { statusCode: 200 });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      next(new AppError(e.message, httpStatusForCj(e)));
      return;
    }
    next(e);
  }
});

router.get('/orders/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    const row = await cjEbayOrderIngestService.getOrderDetail(userId, orderId);
    if (!row) {
      throw new AppError('Order not found', 404);
    }
    await traceComplete(req, userId, 'GET /orders/:orderId', { statusCode: 200 });
    res.json({
      ok: true,
      order: {
        ...row,
        totalUsd: row.totalUsd != null ? Number(row.totalUsd) : null,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/:orderId/place', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    const out = await cjEbayFulfillmentService.placeCjOrder({
      userId,
      orderId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /orders/:orderId/place', {
      statusCode: 200,
      needsManual: out.needsManual,
    });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      next(new AppError(e.message, httpStatusForCj(e)));
      return;
    }
    next(e);
  }
});

router.post('/orders/:orderId/confirm', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    logger.info('[cj-ebay] checkout confirm requested', { userId, orderId });
    const out = await cjEbayCjCheckoutService.confirmCjOrder({
      userId,
      orderId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /orders/:orderId/confirm', { statusCode: 200 });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      next(new AppError(e.message, httpStatusForCj(e)));
      return;
    }
    next(e);
  }
});

router.post('/orders/:orderId/pay', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    logger.info('[cj-ebay] checkout pay requested', { userId, orderId });
    const out = await cjEbayCjCheckoutService.payCjOrder({
      userId,
      orderId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /orders/:orderId/pay', { statusCode: 200 });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      next(new AppError(e.message, httpStatusForCj(e)));
      return;
    }
    next(e);
  }
});

router.post('/orders/:orderId/sync-tracking', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      throw new AppError('Invalid orderId', 400);
    }
    const out = await cjEbayTrackingService.syncFromCj({
      userId,
      orderId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /orders/:orderId/sync-tracking', {
      statusCode: 200,
      stub: out.stub,
    });
    res.json({ ok: out.ok, ...out });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      next(new AppError(e.message, httpStatusForCj(e)));
      return;
    }
    next(e);
  }
});

// --- FASE 3D: listings (draft → eBay via facade; no MarketplaceService.publishToEbay) ---

router.post('/listings/draft', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const parsed = cjEbayListingDraftBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid body', 400);
    }
    const b = parsed.data;
    const out = await cjEbayListingService.createOrUpdateDraft({
      userId,
      body: {
        productId: b.productId,
        variantId: b.variantId,
        quantity: b.quantity,
        destPostalCode: b.destPostalCode,
      },
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /listings/draft', { statusCode: 200, listingId: out.listing.id });
    res.json({
      ok: true,
      listingId: out.listing.id,
      listing: {
        id: out.listing.id,
        status: out.listing.status,
        ebaySku: out.listing.ebaySku,
        handlingTimeDays: out.listing.handlingTimeDays,
      },
      breakdown: out.breakdown,
      draftPayload: out.draftPayload,
      policyNote: out.policyNote,
      qualityWarnings: out.qualityWarnings,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/listings/publish', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const parsed = cjEbayListingPublishBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid body', 400);
    }
    const listingDbId = parsed.data.listingId;
    const out = await cjEbayListingService.publish({
      userId,
      listingDbId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /listings/publish', {
      statusCode: 200,
      ebayListingId: out.listingId,
    });
    res.json({
      ok: true,
      localListingId: listingDbId,
      ebayListingId: out.listingId,
      listingUrl: out.listingUrl,
      offerId: out.offerId,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/listings/:listingId/pause', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const listingDbId = parseInt(String(req.params.listingId || ''), 10);
    if (!Number.isFinite(listingDbId) || listingDbId < 1) {
      throw new AppError('Invalid listingId', 400);
    }
    const out = await cjEbayListingService.pause({
      userId,
      listingDbId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /listings/:listingId/pause', { statusCode: 200 });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /listings/:listingId/ebay-snapshot
 * Queries eBay directly for offer state (offerId + SKU). Diagnoses RECONCILE_FAILED / RECONCILE_PENDING.
 * If listingId is found in eBay, auto-promotes listing to ACTIVE.
 */
router.get('/listings/:listingId/ebay-snapshot', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const listingDbId = parseInt(String(req.params.listingId || ''), 10);
    if (!Number.isFinite(listingDbId) || listingDbId < 1) {
      throw new AppError('Invalid listingId', 400);
    }
    const out = await cjEbayListingService.getEbaySnapshot({
      userId,
      listingDbId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'GET /listings/:listingId/ebay-snapshot', {
      statusCode: 200,
      resolvedListingId: out.offerByOfferId?.listingId ?? out.offerBySku?.listingId ?? null,
    });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /listings/:listingId/force-reset
 * Force-reset a RECONCILE_FAILED / RECONCILE_PENDING listing to DRAFT for re-publication.
 * Clears all eBay IDs and reconcile counters. Draft payload is preserved.
 */
router.post('/listings/:listingId/force-reset', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const listingDbId = parseInt(String(req.params.listingId || ''), 10);
    if (!Number.isFinite(listingDbId) || listingDbId < 1) {
      throw new AppError('Invalid listingId', 400);
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'operator_manual';
    const out = await cjEbayListingService.forceResetToDraft({
      userId,
      listingDbId,
      correlationId: req.correlationId,
      route: routePath,
      reason,
    });
    await traceComplete(req, userId, 'POST /listings/:listingId/force-reset', {
      statusCode: 200,
      previousStatus: out.previousStatus,
    });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

// OFFER_ALREADY_EXISTS reconcile: try to recover listingId from eBay getOffers by SKU.
router.post('/listings/:listingId/reconcile', async (req: Request, res: Response, next: NextFunction) => {
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const userId = req.user!.userId;
    const listingDbId = parseInt(String(req.params.listingId || ''), 10);
    if (!Number.isFinite(listingDbId) || listingDbId < 1) {
      throw new AppError('Invalid listingId', 400);
    }
    const out = await cjEbayListingService.reconcile({
      userId,
      listingDbId,
      correlationId: req.correlationId,
      route: routePath,
    });
    await traceComplete(req, userId, 'POST /listings/:listingId/reconcile', { statusCode: 200, reconciled: out.reconciled });
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

router.get('/listings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const rows = await cjEbayListingService.listForUser(userId);
    await traceComplete(req, userId, 'GET /listings', { statusCode: 200 });
    res.json({ ok: true, listings: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/listings/:listingId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const listingDbId = parseInt(String(req.params.listingId || ''), 10);
    if (!Number.isFinite(listingDbId) || listingDbId < 1) {
      throw new AppError('Invalid listingId', 400);
    }
    const row = await cjEbayListingService.getById(userId, listingDbId);
    if (!row) {
      throw new AppError('Listing not found', 404);
    }
    await traceComplete(req, userId, 'GET /listings/:listingId', { statusCode: 200 });
    res.json({ ok: true, listing: row });
  } catch (e) {
    next(e);
  }
});

router.get('/store-optimizer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [listings, sellingLimits] = await Promise.all([
      prisma.cjEbayListing.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 250,
        include: {
          product: { select: { title: true, cjProductId: true } },
        },
      }),
      cjEbaySellingLimitsService.getMonthlySnapshot(userId),
    ]);

    const blockedStatuses = new Set([
      'ACCOUNT_POLICY_BLOCK',
      'OFFER_ALREADY_EXISTS',
      'RECONCILE_PENDING',
      'RECONCILE_FAILED',
      'FAILED',
    ]);

    const actions = listings.flatMap((listing) => {
      const draft = listing.draftPayload;
      const title = titleFromDraft(draft, listing.product.title);
      const currentPriceUsd = moneyFromUnknown(listing.listedPriceUsd);
      const projectedMarginPct =
        nestedMoneyFromDraft(draft, ['pricing', 'netMarginPct']) ??
        nestedMoneyFromDraft(draft, ['breakdown', 'netMarginPct']) ??
        nestedMoneyFromDraft(draft, ['pricingBreakdown', 'netMarginPct']);
      const projectedProfitUsd =
        nestedMoneyFromDraft(draft, ['pricing', 'netProfitUsd']) ??
        nestedMoneyFromDraft(draft, ['breakdown', 'netProfitUsd']) ??
        nestedMoneyFromDraft(draft, ['pricingBreakdown', 'netProfitUsd']);
      const quantity = Math.max(1, Number(listing.quantity ?? 1));
      const monthlyAmountExposureUsd = Math.round((currentPriceUsd ?? 0) * quantity * 100) / 100;
      const rows: Array<{
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
      }> = [];

      if (blockedStatuses.has(listing.status)) {
        rows.push({
          listingId: listing.id,
          title,
          status: listing.status,
          currentPriceUsd,
          projectedMarginPct,
          projectedProfitUsd,
          monthlyAmountExposureUsd,
          severity: 'critical',
          recommendation: 'Resolver bloqueo antes de intentar republicar.',
          reason: listing.lastError || 'El listing esta en estado de bloqueo, duplicado o reconciliacion pendiente.',
        });
      }

      if (listing.status === 'ACTIVE' && projectedMarginPct != null && projectedMarginPct < 10) {
        const priority = projectedMarginPct < 3 ? 90 : 55;
        rows.push({
          listingId: listing.id,
          title,
          status: listing.status,
          currentPriceUsd,
          projectedMarginPct,
          projectedProfitUsd,
          monthlyAmountExposureUsd,
          severity: optimizerSeverity(priority),
          recommendation: projectedMarginPct < 3 ? 'Pausar o subir precio: margen critico.' : 'Revisar precio: margen bajo para eBay.',
          reason: `Margen estimado ${projectedMarginPct.toFixed(1)}%. Debe proteger fees eBay, pago, incidentes y flete CJ.`,
        });
      }

      if (
        listing.status === 'ACTIVE' &&
        sellingLimits.amountLimitUsd != null &&
        monthlyAmountExposureUsd > 0 &&
        monthlyAmountExposureUsd >= sellingLimits.amountLimitUsd * 0.15
      ) {
        rows.push({
          listingId: listing.id,
          title,
          status: listing.status,
          currentPriceUsd,
          projectedMarginPct,
          projectedProfitUsd,
          monthlyAmountExposureUsd,
          severity: 'warning',
          recommendation: 'Verificar si este listing merece consumir cuota de monto.',
          reason: `Consume ${monthlyAmountExposureUsd.toFixed(2)} USD de exposicion mensual potencial contra un limite de ${sellingLimits.amountLimitUsd.toFixed(2)} USD.`,
        });
      }

      if (listing.status === 'DRAFT' && sellingLimits.remainingListings === 0) {
        rows.push({
          listingId: listing.id,
          title,
          status: listing.status,
          currentPriceUsd,
          projectedMarginPct,
          projectedProfitUsd,
          monthlyAmountExposureUsd,
          severity: 'warning',
          recommendation: 'Mantener en cola hasta liberar cuota mensual.',
          reason: 'La cuota mensual de publicaciones eBay ya esta agotada.',
        });
      }

      return rows;
    });

    const body = {
      ok: true,
      summary: {
        totalListings: listings.length,
        activeListings: listings.filter((l) => l.status === 'ACTIVE').length,
        draftListings: listings.filter((l) => l.status === 'DRAFT').length,
        blockedListings: listings.filter((l) => blockedStatuses.has(l.status)).length,
        quotaConfigured: sellingLimits.configured,
        usedListings: sellingLimits.usedListings,
        listingLimit: sellingLimits.listingLimit,
        usedAmountUsd: sellingLimits.usedAmountUsd,
        amountLimitUsd: sellingLimits.amountLimitUsd,
        remainingListings: sellingLimits.remainingListings,
        remainingAmountUsd: sellingLimits.remainingAmountUsd,
      },
      actions: actions.slice(0, 100),
    };

    await traceComplete(req, userId, 'GET /store-optimizer', { statusCode: 200, actions: body.actions.length });
    res.json(body);
  } catch (e) {
    next(e);
  }
});

// --- FASE 3F: Refunds (devoluciones semi-manuales) ---

/**
 * Crear registro de devolución para una orden.
 * Body: { reason?, amountUsd?, refundType?, ebayReturnId?, notes? }
 */
router.post('/orders/:orderId/refunds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) throw new AppError('Invalid orderId', 400);
    const { reason, amountUsd, refundType, ebayReturnId, notes } = req.body ?? {};
    const record = await cjEbayRefundService.createRefund({
      userId,
      orderId,
      reason: typeof reason === 'string' ? reason : undefined,
      amountUsd: typeof amountUsd === 'number' ? amountUsd : undefined,
      refundType: refundType === 'PARTIAL' ? 'PARTIAL' : 'FULL',
      ebayReturnId: typeof ebayReturnId === 'string' ? ebayReturnId : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    });
    await traceComplete(req, userId, 'POST /orders/:orderId/refunds', { refundId: record.id });
    res.status(201).json({ ok: true, refund: record });
  } catch (e) { next(e); }
});

/** Listar refunds de una orden. */
router.get('/orders/:orderId/refunds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) throw new AppError('Invalid orderId', 400);
    const refunds = await cjEbayRefundService.getRefundsForOrder(userId, orderId);
    res.json({ ok: true, refunds });
  } catch (e) { next(e); }
});

/**
 * Avanzar estado de un refund.
 * Body: { newStatus, note?, amountUsd?, cjRefundRef?, ebayReturnId? }
 */
router.patch('/orders/:orderId/refunds/:refundId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { refundId } = req.params;
    const { newStatus, note, amountUsd, cjRefundRef, ebayReturnId } = req.body ?? {};
    if (!newStatus || typeof newStatus !== 'string') {
      throw new AppError('newStatus requerido', 400);
    }
    const record = await cjEbayRefundService.updateStatus({
      userId,
      refundId: String(refundId),
      newStatus,
      note: typeof note === 'string' ? note : undefined,
      amountUsd: typeof amountUsd === 'number' ? amountUsd : undefined,
      cjRefundRef: typeof cjRefundRef === 'string' ? cjRefundRef : undefined,
      ebayReturnId: typeof ebayReturnId === 'string' ? ebayReturnId : undefined,
    });
    await traceComplete(req, userId, 'PATCH /orders/:orderId/refunds/:refundId', {
      refundId: record.id,
      newStatus: record.status,
    });
    res.json({ ok: true, refund: record });
  } catch (e) { next(e); }
});

// --- FASE 3F: Alerts ---

/** Listar alertas del módulo. Query: ?status=OPEN|ACKNOWLEDGED|RESOLVED */
router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const status = String(req.query.status || '').trim() || undefined;
    const alerts = await cjEbayAlertsService.list(userId, {
      status: (status as 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED') || undefined,
    });
    const withMeta = alerts.map((a) => ({
      ...a,
      meta: cjEbayAlertsService.getMeta(a.type),
    }));
    res.json({ ok: true, alerts: withMeta });
  } catch (e) { next(e); }
});

/** Reconocer una alerta (marcarla como vista). */
router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const alertId = parseInt(String(req.params.alertId), 10);
    if (!Number.isFinite(alertId)) throw new AppError('Invalid alertId', 400);
    const alert = await cjEbayAlertsService.acknowledge(userId, alertId);
    res.json({ ok: true, alert });
  } catch (e) { next(e); }
});

/** Resolver (cerrar) una alerta. */
router.post('/alerts/:alertId/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const alertId = parseInt(String(req.params.alertId), 10);
    if (!Number.isFinite(alertId)) throw new AppError('Invalid alertId', 400);
    const alert = await cjEbayAlertsService.resolve(userId, alertId);
    res.json({ ok: true, alert });
  } catch (e) { next(e); }
});

// --- FASE 3F: Profit / Finance ---

/**
 * Datos financieros del módulo CJ → eBay USA.
 * Query: ?from=ISO_DATE&to=ISO_DATE (opcionales — sin filtro devuelve todo)
 */
router.get('/profit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const data = await cjEbayProfitService.getFinancials(userId, from, to);
    await traceComplete(req, userId, 'GET /profit', { statusCode: 200 });
    res.json({ ok: true, ...data });
  } catch (e) { next(e); }
});

// --- FASE 3B: CJ Open API probes (requires ApiCredential cj-dropshipping or CJ_DROPSHIPPING_API_KEY) ---

router.post('/cj/test-connection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const adapter = createCjSupplierAdapter(userId);
    const r = await adapter.verifyAuth();
    if (r.ok === false) {
      const cjErr = r.error;
      const status = httpStatusForCj(cjErr);
      await traceComplete(req, userId, 'POST /cj/test-connection', {
        statusCode: status,
        error: cjErr.code,
      });
      res.status(status).json({
        ok: false,
        error: cjErr.code,
        message: cjErr.message,
        cjMessage: cjErr.cjMessage,
      });
      return;
    }
    await traceComplete(req, userId, 'POST /cj/test-connection', { statusCode: 200 });
    res.json({
      ok: true,
      message: 'CJ token OK; setting/get succeeded (official health-style call).',
    });
  } catch (e) {
    next(e);
  }
});

router.get('/cj/product/:cjProductId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const cjProductId = String(req.params.cjProductId || '').trim();
    if (!cjProductId) {
      throw new AppError('Invalid cjProductId', 400);
    }
    const adapter = createCjSupplierAdapter(userId);
    const productDetail = await adapter.getProductById(cjProductId);
    const { product, liveStockCoverage } = await enrichProductDetailWithLiveStock(adapter, productDetail);
    await traceComplete(req, userId, 'GET /cj/product/:cjProductId', { statusCode: 200 });
    res.json({
      ok: true,
      product,
      liveStockCoverage,
      note:
        'Uses official GET product/query + product/variant/query plus live stock probes via product/stock/queryByVid for the returned variants.',
    });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      const status = httpStatusForCj(e);
      await traceComplete(req, req.user!.userId, 'GET /cj/product/:cjProductId', {
        statusCode: status,
        error: e.code,
      });
      res.status(status).json({
        ok: false,
        error: e.code,
        message: e.message,
        cjMessage: e.cjMessage,
      });
      return;
    }
    next(e);
  }
});

router.post('/cj/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const parsed = cjSearchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid search body', 400);
    }
    const adapter = createCjSupplierAdapter(userId);
    const raw = await adapter.searchProducts({
      keyword: parsed.data.keyword,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      productQueryBody: parsed.data.productQueryBody,
    });

    const ranked = [...raw].sort((a, b) => cjSearchRankScore(b) - cjSearchRankScore(a));
    const liveOperability = new Map<string, CjSearchOperabilityStatus>();

    for (const item of ranked.slice(0, Math.min(ranked.length, CJ_SEARCH_OPERABILITY_ENRICH_LIMIT))) {
      if (item.inventoryTotal !== undefined) {
        liveOperability.set(item.cjProductId, cjSearchOperabilityStatus(item));
        continue;
      }
      try {
        const status = await probeProductOperabilityByLiveStock(adapter, item.cjProductId);
        liveOperability.set(item.cjProductId, status);
      } catch {
        liveOperability.set(item.cjProductId, 'stock_unknown');
      }
    }

    // WAREHOUSE-AWARE: probe US freight for top operable results when flag is on.
    // Limit: CJ_EBAY_WAREHOUSE_PROBE_LIMIT items max (default 3) to contain QPS.
    // Uses the first variant vid from product detail; skip if no vid available.
    const fulfillmentOriginMap = new Map<string, 'US' | 'CN' | 'UNKNOWN'>();

    if (env.CJ_EBAY_WAREHOUSE_AWARE) {
      const probeLimit = env.CJ_EBAY_WAREHOUSE_PROBE_LIMIT;
      const operableCandidates = ranked.filter(
        (item) => (liveOperability.get(item.cjProductId) ?? cjSearchOperabilityStatus(item)) === 'operable'
      );
      for (const item of operableCandidates.slice(0, probeLimit)) {
        try {
          // Resolve first variant vid for this product
          const detail = await adapter.getProductById(item.cjProductId);
          const firstVid = detail.variants.find((v) => String(v.cjVid || '').trim())?.cjVid;
          if (!firstVid) {
            fulfillmentOriginMap.set(item.cjProductId, 'UNKNOWN');
            continue;
          }
          const waResult = await adapter.quoteShippingToUsWarehouseAware({
            variantId: firstVid,
            quantity: 1,
          });
          fulfillmentOriginMap.set(item.cjProductId, waResult.fulfillmentOrigin);
        } catch {
          // Probe failure (auth/network) → mark as UNKNOWN, don't fail the whole search
          fulfillmentOriginMap.set(item.cjProductId, 'UNKNOWN');
        }
      }
    }

    const items = ranked
      .map((item) => {
        const operabilityStatus =
          liveOperability.get(item.cjProductId) ?? cjSearchOperabilityStatus(item);
        const fulfillmentOrigin: 'US' | 'CN' | 'UNKNOWN' =
          fulfillmentOriginMap.get(item.cjProductId) ??
          (env.CJ_EBAY_WAREHOUSE_AWARE ? 'UNKNOWN' : 'CN');
        return { ...item, operabilityStatus, fulfillmentOrigin };
      })
      .sort((a, b) => {
        const operabilityDelta =
          cjSearchOperabilityPriority(a.operabilityStatus, a.fulfillmentOrigin) -
          cjSearchOperabilityPriority(b.operabilityStatus, b.fulfillmentOrigin);
        if (operabilityDelta !== 0) {
          return operabilityDelta;
        }
        return cjSearchRankScore(b) - cjSearchRankScore(a);
      });

    // Diagnostics for stock coverage (helps tune field mapping)
    const withStock = items.filter((x) => (x.inventoryTotal ?? 0) > 0).length;
    const unknownStock = items.filter((x) => x.inventoryTotal === undefined).length;
    const zeroStock = items.filter((x) => x.inventoryTotal === 0).length;

    // Warehouse summary (only meaningful when CJ_EBAY_WAREHOUSE_AWARE=true)
    const warehouseSummary = env.CJ_EBAY_WAREHOUSE_AWARE ? {
      usWarehouseConfirmed: items.filter((x) => x.fulfillmentOrigin === 'US').length,
      cnWarehouse: items.filter((x) => x.fulfillmentOrigin === 'CN').length,
      originUnknown: items.filter((x) => x.fulfillmentOrigin === 'UNKNOWN').length,
      probeLimit: env.CJ_EBAY_WAREHOUSE_PROBE_LIMIT,
    } : null;

    await traceComplete(req, userId, 'POST /cj/search', { statusCode: 200 });
    res.json({
      ok: true,
      items,
      stockCoverage: { withStock, unknownStock, zeroStock },
      operabilitySummary: {
        operable: items.filter((x) => x.operabilityStatus === 'operable').length,
        stockUnknown: items.filter((x) => x.operabilityStatus === 'stock_unknown').length,
        unavailable: items.filter((x) => x.operabilityStatus === 'unavailable').length,
      },
      warehouseSummary,
      warehouseAwareEnabled: env.CJ_EBAY_WAREHOUSE_AWARE,
      liveProbeSummary: {
        enrichedTopResults: Math.min(ranked.length, CJ_SEARCH_OPERABILITY_ENRICH_LIMIT),
        variantProbeLimitPerProduct: CJ_SEARCH_VARIANT_LIVE_PROBE_LIMIT,
      },
      note:
        env.CJ_EBAY_WAREHOUSE_AWARE
          ? 'Results ranked by 4-tier: operable+US > operable+CN > stock_unknown > unavailable. US warehouse confirmed via freightCalculate probe.'
          : 'Results segmented by live stock evidence (operable > stock_unknown > unavailable) and ranked by operational score. Set CJ_EBAY_WAREHOUSE_AWARE=true to enable US warehouse detection.',
    });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      const status = httpStatusForCj(e);
      await traceComplete(req, req.user!.userId, 'POST /cj/search', {
        statusCode: status,
        error: e.code,
      });
      res.status(status).json({
        ok: false,
        error: e.code,
        message: e.message,
        cjMessage: e.cjMessage,
      });
      return;
    }
    next(e);
  }
});

router.post('/cj/shipping-quote', async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user!.userId;
  const routePath = `${req.baseUrl}${req.path}`;
  try {
    const parsed = cjShippingQuoteBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('Invalid shipping-quote body', 400);
    }
    const adapter = createCjSupplierAdapter(userId);
    const prePayloadMeta = {
      variantId: parsed.data.variantId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      destPostalCode: parsed.data.destPostalCode,
      startCountryCode: parsed.data.startCountryCode,
      endCountryCode: 'US',
    };
    await cjEbayTraceService.record({
      userId,
      correlationId: req.correlationId,
      route: routePath,
      step: CJ_EBAY_TRACE_STEP.CJ_FREIGHT_REQUEST,
      message: 'shipping-quote: inputs before freightCalculate',
      meta: prePayloadMeta,
    });

    const t0 = Date.now();
    let freightResult: Awaited<ReturnType<typeof adapter.quoteShippingToUsReal>>;
    try {
      freightResult = await adapter.quoteShippingToUsReal({
        variantId: parsed.data.variantId,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        destPostalCode: parsed.data.destPostalCode,
        startCountryCode: parsed.data.startCountryCode,
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      await cjEbayTraceService.record({
        userId,
        correlationId: req.correlationId,
        route: routePath,
        step: CJ_EBAY_TRACE_STEP.CJ_FREIGHT_ERROR,
        message: e instanceof CjSupplierError ? e.message : String(e),
        meta: {
          durationMs,
          errorCode: e instanceof CjSupplierError ? e.code : 'UNKNOWN',
          requestInputs: prePayloadMeta,
        },
      });
      throw e;
    }

    const durationMs = Date.now() - t0;
    await cjEbayTraceService.record({
      userId,
      correlationId: req.correlationId,
      route: routePath,
      step: CJ_EBAY_TRACE_STEP.CJ_FREIGHT_RESPONSE,
      message: 'shipping-quote: freightCalculate response',
      meta: {
        durationMs,
        requestPayload: freightResult.requestPayload,
        responseRaw: freightResult.responseRaw,
        normalized: freightResult.quote,
      },
    });

    await traceComplete(req, userId, 'POST /cj/shipping-quote', { statusCode: 200, durationMs });
    res.json({
      ok: true,
      shipping: freightResult.quote,
      doc: 'https://developers.cjdropshipping.com/en/api/api2/api/logistic.html#_1-1-freight-calculation-post',
    });
  } catch (e) {
    if (e instanceof CjSupplierError) {
      const status = httpStatusForCj(e);
      await traceComplete(req, userId, 'POST /cj/shipping-quote', {
        statusCode: status,
        error: e.code,
      });
      res.status(status).json({
        ok: false,
        error: e.code,
        message: e.message,
        cjMessage: e.cjMessage,
      });
      return;
    }
    next(e);
  }
});

// ====================================
// FASE 3G — AI Opportunity Discovery
// POST /opportunities/discover
// GET  /opportunities/runs
// GET  /opportunities/runs/:runId
// GET  /opportunities/runs/:runId/candidates
// GET  /opportunities/recommendations
// POST /opportunities/candidates/:id/approve
// POST /opportunities/candidates/:id/reject
// POST /opportunities/candidates/:id/defer
// GET  /opportunities/candidates/:id
// ====================================

import { cjEbayOpportunityShortlistService } from './services/cj-ebay-opportunity-shortlist.service';

router.post('/opportunities/discover', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = req.body ?? {};
    const result = await cjEbayOpportunityShortlistService.startDiscoveryRun(userId, {
      mode: body.mode,
      settings: body.settings,
    });
    res.status(202).json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

router.get('/opportunities/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Number(req.query.limit ?? 10), 50);
    const runs = await cjEbayOpportunityShortlistService.listRuns(userId, limit);
    res.json({ ok: true, runs });
  } catch (e) {
    next(e);
  }
});

router.get('/opportunities/runs/:runId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const run = await cjEbayOpportunityShortlistService.getRunSummary(req.params.runId, userId);
    if (!run) throw new AppError('Run not found', 404);
    res.json({ ok: true, run });
  } catch (e) {
    next(e);
  }
});

router.get('/opportunities/runs/:runId/candidates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidates = await cjEbayOpportunityShortlistService.getRunCandidates(req.params.runId, userId);
    res.json({ ok: true, candidates });
  } catch (e) {
    next(e);
  }
});

router.get('/opportunities/recommendations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidates = await cjEbayOpportunityShortlistService.getActiveRecommendations(userId);
    const latestRun = await cjEbayOpportunityShortlistService.getLatestRunSummary(userId);
    res.json({ ok: true, run: latestRun, candidates });
  } catch (e) {
    next(e);
  }
});

router.get('/opportunities/candidates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidate = await cjEbayOpportunityShortlistService.getCandidate(req.params.id, userId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    res.json({ ok: true, candidate });
  } catch (e) {
    next(e);
  }
});

router.post('/opportunities/candidates/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidate = await cjEbayOpportunityShortlistService.approveCandidate(
      req.params.id,
      userId,
      req.body?.notes
    );
    res.json({ ok: true, candidate });
  } catch (e) {
    next(e);
  }
});

router.post('/opportunities/candidates/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidate = await cjEbayOpportunityShortlistService.rejectCandidate(
      req.params.id,
      userId,
      req.body?.notes
    );
    res.json({ ok: true, candidate });
  } catch (e) {
    next(e);
  }
});

router.post('/opportunities/candidates/:id/defer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidate = await cjEbayOpportunityShortlistService.deferCandidate(
      req.params.id,
      userId,
      req.body?.notes
    );
    res.json({ ok: true, candidate });
  } catch (e) {
    next(e);
  }
});

// GET /opportunities/candidates/:id/evidence
// Returns the data quality breakdown + market price detail for a candidate.
// Useful for the UI evidence panel and for programmatic auditing.
router.get('/opportunities/candidates/:id/evidence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const candidate = await cjEbayOpportunityShortlistService.getCandidate(req.params.id, userId);
    if (!candidate) throw new AppError('Candidate not found', 404);

    res.json({
      ok: true,
      candidateId: candidate.id,
      seedKeyword: candidate.seedKeyword,
      trendSourceType: candidate.trendSourceType,
      marketPriceSourceType: candidate.marketPriceSourceType,
      dataConfidenceScore: candidate.dataConfidenceScore,
      recommendationConfidence: candidate.recommendationConfidence,
      starterSuitability: candidate.starterSuitability,
      evidenceSummary: candidate.evidenceSummary,
      marketPriceDetail: candidate.marketPriceDetail ?? null,
      pricingBreakdown: candidate.pricing,
      scoreBreakdown: candidate.score,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
