/**
 * CJ → eBay USA — HTTP routes (FASE 3A).
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
import { CJ_EBAY_TRACE_STEP } from './cj-ebay.constants';
import type { CjEbayHealthResponse, CjEbayOverviewResponse } from './cj-ebay.types';
import { createCjSupplierAdapter } from './adapters/cj-supplier.adapter';
import { CjSupplierError } from './adapters/cj-supplier.errors';
import type { CjProductDetail } from './adapters/cj-supplier.adapter.interface';
import { pricingBreakdownForResponse } from './services/cj-ebay-pricing.service';
import { cjEbayOpportunityPipelineService } from './services/cj-ebay-opportunity-pipeline.service';

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
 * Operational ranking score for CJ search results (0–100).
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

  return score; // max 100 (45+30+15+10), min 0
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

function cjSearchOperabilityPriority(status: CjSearchOperabilityStatus): number {
  switch (status) {
    case 'operable':
      return 0;
    case 'stock_unknown':
      return 1;
    case 'unavailable':
      return 2;
    default:
      return 3;
  }
}

function liveStockVariantKeys(detail: CjProductDetail): string[] {
  return detail.variants
    .map((variant) => String(variant.cjVid || '').trim())
    .filter(Boolean);
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
    };
    await traceComplete(req, userId, 'GET /overview', { statusCode: 200 });
    res.json(body);
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

    const items = ranked
      .map((item) => ({
        ...item,
        operabilityStatus:
          liveOperability.get(item.cjProductId) ?? cjSearchOperabilityStatus(item),
      }))
      .sort((a, b) => {
        const operabilityDelta =
          cjSearchOperabilityPriority(a.operabilityStatus) -
          cjSearchOperabilityPriority(b.operabilityStatus);
        if (operabilityDelta !== 0) {
          return operabilityDelta;
        }
        return cjSearchRankScore(b) - cjSearchRankScore(a);
      });

    // Diagnostics for stock coverage (helps tune field mapping)
    const withStock = items.filter((x) => (x.inventoryTotal ?? 0) > 0).length;
    const unknownStock = items.filter((x) => x.inventoryTotal === undefined).length;
    const zeroStock = items.filter((x) => x.inventoryTotal === 0).length;

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
      liveProbeSummary: {
        enrichedTopResults: Math.min(ranked.length, CJ_SEARCH_OPERABILITY_ENRICH_LIMIT),
        variantProbeLimitPerProduct: CJ_SEARCH_VARIANT_LIVE_PROBE_LIMIT,
      },
      note:
        'Results are segmented by live stock evidence first (operable > stock_unknown > unavailable) and ranked by operational score within each segment.',
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

export default router;
