/**
 * CJ → ML Chile — HTTP routes (MVP).
 * Módulo completamente aislado de CJ→eBay USA y legacy ML.
 * Feature flag: ENABLE_CJ_ML_CHILE_MODULE
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';


import { cjMlChileTraceService } from './services/cj-ml-chile-trace.service';
import { cjMlChileConfigService } from './services/cj-ml-chile-config.service';
import { cjMlChileQualificationService } from './services/cj-ml-chile-qualification.service';
import { cjMlChileListingService } from './services/cj-ml-chile-listing.service';
import { cjMlChileAlertsService } from './services/cj-ml-chile-alerts.service';
import { cjMlChileProfitService } from './services/cj-ml-chile-profit.service';
import { cjMlChileSystemReadinessService } from './services/cj-ml-chile-system-readiness.service';
import { CJ_ML_CHILE_TRACE_STEP } from './cj-ml-chile.constants';
import { computeMlChilePricing, pricingBreakdownForResponse } from './services/cj-ml-chile-pricing.service';
import fxService from '../../services/fx.service';

import {
  cjMlChileUpdateConfigSchema,
  cjMlChileSearchBodySchema,
  cjMlChileShippingQuoteBodySchema,
  cjMlChileEvaluateBodySchema,
  cjMlChileListingDraftBodySchema,
  cjMlChileListingPublishBodySchema,
  cjMlChileOrderImportBodySchema,
} from './schemas/cj-ml-chile.schemas';
import { createCjMlChileSupplierAdapter, CJ_CHILE_PROBE_POSTAL } from './adapters/cj-ml-chile-supplier.adapter';
import { CjSupplierError } from '../cj-ebay/adapters/cj-supplier.errors';

const router = Router();

function httpStatusForCj(err: CjSupplierError): number {
  switch (err.code) {
    case 'CJ_AUTH_INVALID': case 'CJ_AUTH_EXPIRED': return 401;
    case 'CJ_INVALID_SKU': return 404;
    case 'CJ_RATE_LIMIT': return 429;
    case 'CJ_SHIPPING_UNAVAILABLE': return 400;
    case 'CJ_NOT_IMPLEMENTED': return 501;
    default: return 502;
  }
}

/** Inyecta correlationId por request para trazabilidad. */
function withTrace(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { correlationId: string }).correlationId = require('crypto').randomUUID().replace(/-/g, '').slice(0, 12);
  next();
}

// ─────────────────────────────────────────────
// System readiness — siempre visible (sin module gate)
// ─────────────────────────────────────────────
router.get('/system-readiness', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user?.id ?? 0;
    const result = await cjMlChileSystemReadinessService.check(userId);
    res.json(result);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Module gate (todas las rutas siguientes)
// ─────────────────────────────────────────────
router.use((req: Request, res: Response, next: NextFunction): void => {
  if (!env.ENABLE_CJ_ML_CHILE_MODULE) {
    res.status(403).json({ error: 'MODULE_DISABLED', message: 'Set ENABLE_CJ_ML_CHILE_MODULE=true to enable this vertical.' });
    return;
  }
  next();
});

router.use(authenticate);
router.use(withTrace);

// ─────────────────────────────────────────────
// Health + overview
// ─────────────────────────────────────────────
router.get('/health', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const readiness = await cjMlChileSystemReadinessService.check(userId);
    res.json({
      ok: readiness.ok,
      module: 'cj-ml-chile',
      timestamp: new Date().toISOString(),
      checks: {
        cjCredentials: readiness.checks.cjCredentials?.ok ?? false,
        mlCredentials: readiness.checks.mlCredentials?.ok ?? false,
        fxService: readiness.checks.fxService?.ok ?? false,
        dbMigrated: readiness.checks.dbMigrated?.ok ?? false,
      },
    });
  } catch (err) { next(err); }
});

router.get('/overview', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const [products, listings, orders, alerts, profit] = await Promise.all([
      prisma.cjMlChileProduct.count({ where: { userId } }),
      prisma.cjMlChileListing.groupBy({ by: ['status'], where: { userId }, _count: true }),
      prisma.cjMlChileOrder.groupBy({ by: ['status'], where: { userId }, _count: true }),
      prisma.cjMlChileAlert.count({ where: { userId, status: 'OPEN' } }),
      cjMlChileProfitService.getSummary(userId),
    ]);

    const evaluatedCount = await prisma.cjMlChileProductEvaluation.count({ where: { userId } });
    const approvedCount = await prisma.cjMlChileProductEvaluation.count({ where: { userId, decision: 'APPROVED' } });

    const listingByStatus = Object.fromEntries(listings.map((l) => [l.status, l._count]));
    const orderByStatus = Object.fromEntries(orders.map((o) => [o.status, o._count]));

    res.json({
      products: { total: products, evaluated: evaluatedCount, approved: approvedCount },
      listings: {
        total: listings.reduce((s, l) => s + l._count, 0),
        active: listingByStatus['ACTIVE'] ?? 0,
        draft: listingByStatus['DRAFT'] ?? 0,
        failed: listingByStatus['FAILED'] ?? 0,
      },
      orders: {
        total: orders.reduce((s, o) => s + o._count, 0),
        active: (orderByStatus['CJ_FULFILLING'] ?? 0) + (orderByStatus['CJ_SHIPPED'] ?? 0),
        completed: orderByStatus['COMPLETED'] ?? 0,
      },
      alerts: { open: alerts, critical: 0 },
      profit: {
        totalRevenueCLP: profit.totalRevenueCLP,
        totalRevenueUsd: profit.totalRevenueUsd,
        totalProfitUsd: profit.totalProfitUsd,
        listingsActive: profit.listingsActive,
      },
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
router.get('/config', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const settings = await cjMlChileConfigService.getOrCreate(userId);
    const readiness = await cjMlChileSystemReadinessService.check(userId);
    res.json({
      settings: cjMlChileConfigService.toApiShape(settings),
      systemReadiness: {
        cjConnected: readiness.checks.cjCredentials?.ok ?? false,
        mlConnected: readiness.checks.mlCredentials?.ok ?? false,
        fxAvailable: readiness.checks.fxService?.ok ?? false,
      },
    });
  } catch (err) { next(err); }
});

router.post('/config', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const parsed = cjMlChileUpdateConfigSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    const updated = await cjMlChileConfigService.update(userId, parsed.data);
    res.json({ ok: true, settings: cjMlChileConfigService.toApiShape(updated) });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Pricing preview (sin persistir)
// ─────────────────────────────────────────────
router.post('/pricing/preview', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const { supplierCostUsd, shippingUsd, listPriceUsdOverride } = req.body as Record<string, number | undefined>;
    if (!supplierCostUsd || !shippingUsd) { res.status(400).json({ error: 'supplierCostUsd and shippingUsd required' }); return; }
    const settings = await cjMlChileConfigService.getOrCreate(userId);
    const result = await computeMlChilePricing({
      supplierCostUsd: Number(supplierCostUsd),
      shippingUsd: Number(shippingUsd),
      feesInput: {
        mlcFeePct: Number(settings.mlcFeePct),
        mpPaymentFeePct: Number(settings.mpPaymentFeePct),
        incidentBufferPct: Number(settings.incidentBufferPct),
      },
      minMarginPct: settings.minMarginPct != null ? Number(settings.minMarginPct) : null,
      minProfitUsd: settings.minProfitUsd != null ? Number(settings.minProfitUsd) : null,
      listPriceUsdOverride: listPriceUsdOverride != null ? Number(listPriceUsdOverride) : undefined,
    });
    if (!result.ok) { res.status(400).json({ error: result.error }); return; }
    res.json({ ok: true, breakdown: pricingBreakdownForResponse(result.breakdown!) });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// CJ — test connection, search, product, shipping quote
// ─────────────────────────────────────────────
router.post('/cj/test-connection', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const adapter = createCjMlChileSupplierAdapter(userId);
    const results = await adapter.searchProducts({ keyword: 'test', page: 1, pageSize: 1 });
    res.json({ ok: true, itemsReturned: results.length });
  } catch (err) {
    if (err instanceof CjSupplierError) { res.status(httpStatusForCj(err)).json({ ok: false, error: err.message, code: err.code }); return; }
    next(err);
  }
});

router.post('/cj/search', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const parsed = cjMlChileSearchBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    const adapter = createCjMlChileSupplierAdapter(userId);
    const results = await adapter.searchProducts({ keyword: parsed.data.query, page: parsed.data.page, pageSize: parsed.data.pageSize });
    res.json({ ok: true, items: results, note: 'MVP: warehouse Chile se verifica en evaluate/preview, no en search.' });
  } catch (err) {
    if (err instanceof CjSupplierError) { res.status(httpStatusForCj(err)).json({ ok: false, error: err.message, code: err.code }); return; }
    next(err);
  }
});

router.get('/cj/product/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const adapter = createCjMlChileSupplierAdapter(userId);
    const detail = await adapter.getProductById(req.params.id);
    res.json({ ok: true, product: detail });
  } catch (err) {
    if (err instanceof CjSupplierError) { res.status(httpStatusForCj(err)).json({ ok: false, error: err.message, code: err.code }); return; }
    next(err);
  }
});

router.post('/cj/shipping-quote', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const parsed = cjMlChileShippingQuoteBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    const adapter = createCjMlChileSupplierAdapter(userId);
    const freight = await adapter.quoteShippingToUsReal({
      variantId: parsed.data.variantId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      destPostalCode: CJ_CHILE_PROBE_POSTAL,
    });
    const warehouseChileConfirmed = freight.quote.startCountryCode === 'CL' || freight.quote.cost > 0;
    res.json({ ok: true, quote: freight.quote, warehouseChileConfirmed, mvpViable: warehouseChileConfirmed });
  } catch (err) {
    if (err instanceof CjSupplierError) { res.status(httpStatusForCj(err)).json({ ok: false, error: err.message, code: err.code }); return; }
    next(err);
  }
});

// ─────────────────────────────────────────────
// Evaluate + preview (persist en DB)
// ─────────────────────────────────────────────
router.post('/preview', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const parsed = cjMlChileEvaluateBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    await cjMlChileTraceService.record({ userId, correlationId, route: 'POST /preview', step: CJ_ML_CHILE_TRACE_STEP.REQUEST_START, message: 'preview request' });
    const result = await cjMlChileQualificationService.preview({ productId: parsed.data.productId, variantId: parsed.data.variantId, quantity: parsed.data.quantity, userId, correlationId, route: 'POST /preview' });
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CjSupplierError) { res.status(httpStatusForCj(err)).json({ ok: false, error: err.message, code: err.code }); return; }
    next(err);
  }
});

router.post('/evaluate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const parsed = cjMlChileEvaluateBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    await cjMlChileTraceService.record({ userId, correlationId, route: 'POST /evaluate', step: CJ_ML_CHILE_TRACE_STEP.REQUEST_START, message: 'evaluate request' });
    const result = await cjMlChileQualificationService.evaluate({ productId: parsed.data.productId, variantId: parsed.data.variantId, quantity: parsed.data.quantity, userId, correlationId, route: 'POST /evaluate' });
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CjSupplierError) { res.status(httpStatusForCj(err)).json({ ok: false, error: err.message, code: err.code }); return; }
    next(err);
  }
});

// ─────────────────────────────────────────────
// Listings
// ─────────────────────────────────────────────
router.post('/listings/draft', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const parsed = cjMlChileListingDraftBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    await cjMlChileTraceService.record({ userId, correlationId, route: 'POST /listings/draft', step: CJ_ML_CHILE_TRACE_STEP.LISTING_DRAFT_START, message: 'draft request' });
    const listing = await cjMlChileListingService.draft(userId, parsed.data, correlationId);
    res.status(201).json({ ok: true, listing });
  } catch (err) { next(err); }
});

router.post('/listings/:id/publish', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const result = await cjMlChileListingService.publish(userId, listingId, correlationId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.get('/listings', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const status = req.query.status as string | undefined;
    const listings = await cjMlChileListingService.list(userId, status);
    res.json({ ok: true, listings });
  } catch (err) { next(err); }
});

router.get('/listings/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const listing = await cjMlChileListingService.getById(userId, listingId);
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    res.json({ ok: true, listing });
  } catch (err) { next(err); }
});

router.post('/listings/:id/pause', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const result = await cjMlChileListingService.pause(userId, listingId, correlationId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/listings/:id/force-reset', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const result = await cjMlChileListingService.forceReset(userId, listingId, correlationId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────
router.get('/orders', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const orders = await prisma.cjMlChileOrder.findMany({
      where: { userId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 5 }, tracking: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ ok: true, orders });
  } catch (err) { next(err); }
});

router.get('/orders/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const order = await prisma.cjMlChileOrder.findFirst({
      where: { id: req.params.id, userId },
      include: { events: { orderBy: { createdAt: 'desc' } }, tracking: true, listing: true },
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json({ ok: true, order });
  } catch (err) { next(err); }
});

router.post('/orders/import', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const parsed = cjMlChileOrderImportBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }

    const existing = await prisma.cjMlChileOrder.findFirst({ where: { userId, mlOrderId: parsed.data.mlOrderId } });
    if (existing) { res.json({ ok: true, order: existing, alreadyImported: true }); return; }

    const { createId } = await import('@paralleldrive/cuid2');
    const order = await prisma.cjMlChileOrder.create({
      data: {
        id: createId(),
        userId,
        mlOrderId: parsed.data.mlOrderId,
        status: 'DETECTED',
        currency: 'CLP',
      },
    });
    await cjMlChileTraceService.record({ userId, correlationId, step: CJ_ML_CHILE_TRACE_STEP.ORDER_IMPORT_SUCCESS, message: `Order imported: ${order.mlOrderId}`, meta: { orderId: order.id } });
    res.status(201).json({ ok: true, order });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────
router.get('/alerts', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const status = req.query.status as string | undefined;
    const alerts = await cjMlChileAlertsService.list(userId, status);
    res.json({ ok: true, alerts });
  } catch (err) { next(err); }
});

router.post('/alerts/:id/acknowledge', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const alertId = parseInt(req.params.id, 10);
    if (isNaN(alertId)) { res.status(400).json({ error: 'Invalid alert id' }); return; }
    const alert = await cjMlChileAlertsService.acknowledge(userId, alertId);
    res.json({ ok: true, alert });
  } catch (err) { next(err); }
});

router.post('/alerts/:id/resolve', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const alertId = parseInt(req.params.id, 10);
    if (isNaN(alertId)) { res.status(400).json({ error: 'Invalid alert id' }); return; }
    const alert = await cjMlChileAlertsService.resolve(userId, alertId);
    res.json({ ok: true, alert });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Profit + FX
// ─────────────────────────────────────────────
router.get('/profit', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const summary = await cjMlChileProfitService.getSummary(userId);
    res.json({ ok: true, ...summary });
  } catch (err) { next(err); }
});

router.get('/fx/rate', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rate = fxService.convert(1, 'USD', 'CLP');
    res.json({ ok: true, currency: 'CLP', base: 'USD', rate, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Logs (execution traces)
// ─────────────────────────────────────────────
router.get('/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { id: number } }).user!.id;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
    const correlationId = req.query.correlationId as string | undefined;
    const traces = await prisma.cjMlChileExecutionTrace.findMany({
      where: { userId, ...(correlationId ? { correlationId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ ok: true, traces });
  } catch (err) { next(err); }
});

export default router;
