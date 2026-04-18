/**
 * CJ → ML Chile — HTTP routes (MVP).
 * Módulo completamente aislado de CJ→eBay USA y legacy ML.
 * Feature flag: ENABLE_CJ_ML_CHILE_MODULE
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { env } from '../../config/env';
import { prisma } from '../../config/database';


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
    const userId = req.user?.userId ?? 0;
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

// ─────────────────────────────────────────────
// Webhooks ML Chile — sin autenticación JWT (ML llama a esta URL)
// notification_url a configurar en portal ML: {BASE_URL}/api/cj-ml-chile/webhooks/ml
// ─────────────────────────────────────────────
router.post('/webhooks/ml', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const topic = String(body.topic ?? '');
    const resource = String(body.resource ?? '');

    if (topic !== 'orders_v2' && topic !== 'orders') {
      res.status(200).json({ ok: true, ignored: true, topic });
      return;
    }

    // Extraer orderId de resource: "/orders/1234567890"
    const match = resource.match(/\/orders\/(\d+)/);
    if (!match) { res.status(200).json({ ok: true, ignored: true, reason: 'no order id in resource' }); return; }
    const mlOrderId = match[1];

    // Resolver userId del seller (webhook global: buscar credencial ML por user_id)
    const mlSellerId = body.user_id != null ? String(body.user_id) : null;
    let userId: number | null = null;
    if (mlSellerId) {
      const cred = await prisma.apiCredential.findFirst({ where: { apiName: 'mercadolibre' } });
      if (cred) userId = cred.userId;
    }
    if (!userId) {
      const cred = await prisma.apiCredential.findFirst({ where: { apiName: 'mercadolibre' } });
      userId = cred?.userId ?? null;
    }
    if (!userId) { res.status(200).json({ ok: true, ignored: true, reason: 'no ml credential found' }); return; }

    // Auto-import orden si no existe
    const existing = await prisma.cjMlChileOrder.findFirst({ where: { userId, mlOrderId } });
    if (!existing) {
      const { createId } = await import('@paralleldrive/cuid2');
      await prisma.cjMlChileOrder.create({
        data: { id: createId(), userId, mlOrderId, status: 'DETECTED', currency: 'CLP' },
      });
    }

    await cjMlChileTraceService.record({
      userId,
      step: CJ_ML_CHILE_TRACE_STEP.ORDER_IMPORT_SUCCESS,
      message: `ML webhook: order ${mlOrderId} auto-imported`,
      meta: { topic, resource, alreadyExisted: Boolean(existing) },
    });

    res.status(200).json({ ok: true, mlOrderId, alreadyExisted: Boolean(existing) });
  } catch (err) {
    console.error('[CJ_ML_CHILE_WEBHOOK]', err);
    res.status(200).json({ ok: false, error: String(err) }); // Siempre 200 para ML
  }
});

router.use(authenticate);
router.use(withTrace);

// ─────────────────────────────────────────────
// Health + overview
// ─────────────────────────────────────────────
router.get('/health', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
    const parsed = cjMlChileUpdateConfigSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    const updated = await cjMlChileConfigService.update(userId, parsed.data);
    res.json({ ok: true, settings: cjMlChileConfigService.toApiShape(updated) });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// ML Chile — categorías (usa API pública ML, sin auth ML)
// ─────────────────────────────────────────────
router.get('/ml/categories/suggest', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) { res.status(400).json({ error: 'q param required (product title or keyword)' }); return; }
    const url = `https://api.mercadolibre.com/sites/MLC/category_predictor/predict?title=${encodeURIComponent(q)}&limit=5`;
    const mlResp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!mlResp.ok) { res.status(mlResp.status).json({ error: `ML API error ${mlResp.status}` }); return; }
    const predictions = await mlResp.json() as Array<{ id: string; name: string; probability: number }>;
    const candidates = Array.isArray(predictions)
      ? predictions.slice(0, 5).map((p) => ({ id: p.id, name: p.name, probability: p.probability }))
      : [];
    res.json({ ok: true, candidates, query: q });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Pricing preview (sin persistir)
// ─────────────────────────────────────────────
router.post('/pricing/preview', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
    const parsed = cjMlChileShippingQuoteBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    const adapter = createCjMlChileSupplierAdapter(userId);
    const freight = await adapter.quoteShippingToUsReal({
      variantId: parsed.data.variantId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      destPostalCode: CJ_CHILE_PROBE_POSTAL,
    });
    const warehouseChileConfirmed = freight.quote.startCountryCode === 'CL';
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const result = await cjMlChileListingService.publish(userId, listingId, correlationId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

const FX_STALE_HOURS = 24;
function computeFxAge(fxRateAt: Date | string | null | undefined): { fxStale: boolean; fxAgeHours: number | null } {
  if (!fxRateAt) return { fxStale: false, fxAgeHours: null };
  const ageMs = Date.now() - new Date(fxRateAt).getTime();
  const fxAgeHours = Math.round(ageMs / 3_600_000);
  return { fxStale: fxAgeHours > FX_STALE_HOURS, fxAgeHours };
}

router.get('/listings', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const status = req.query.status as string | undefined;
    const listings = await cjMlChileListingService.list(userId, status);
    const now = Date.now();
    const augmented = listings.map((l) => {
      const ev = l.evaluation as Record<string, unknown> | null;
      const fxRateAt = ev?.fxRateAt as Date | null | undefined;
      const fxAgeHours = fxRateAt ? Math.round((now - new Date(fxRateAt).getTime()) / 3_600_000) : null;
      const fxStale = fxAgeHours != null && fxAgeHours > FX_STALE_HOURS;
      return Object.assign({}, l, { fxStale, fxAgeHours });
    });
    res.json({ ok: true, listings: augmented });
  } catch (err) { next(err); }
});

router.get('/listings/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const listing = await cjMlChileListingService.getById(userId, listingId);
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    const ev = listing.evaluation as Record<string, unknown> | null;
    const fxRateAt = ev?.fxRateAt as Date | null | undefined;
    const { fxStale, fxAgeHours } = computeFxAge(fxRateAt);
    res.json({ ok: true, listing: Object.assign({}, listing, { fxStale, fxAgeHours }) });
  } catch (err) { next(err); }
});

router.post('/listings/:id/pause', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const result = await cjMlChileListingService.pause(userId, listingId, correlationId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/listings/:id/force-reset', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }
    const result = await cjMlChileListingService.forceReset(userId, listingId, correlationId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/listings/:id/reprice', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) { res.status(400).json({ error: 'Invalid listing id' }); return; }

    const listing = await cjMlChileListingService.getById(userId, listingId);
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    if (listing.status !== 'DRAFT' && listing.status !== 'ACTIVE') {
      res.status(400).json({ error: `No se puede repreciar un listing en estado ${listing.status}` }); return;
    }

    const draft = listing.draftPayload as Record<string, unknown> | null;
    const snapshot = draft?.pricingSnapshot as Record<string, unknown> | null;
    const supplierCostUsd = snapshot?.supplierCostUsd != null ? Number(snapshot.supplierCostUsd) : null;
    const shippingUsd = snapshot?.shippingUsd != null ? Number(snapshot.shippingUsd) : 0;
    if (supplierCostUsd == null) {
      res.status(400).json({ error: 'Sin datos de costo en pricingSnapshot. Re-evalúa el producto.' }); return;
    }

    const settings = await cjMlChileConfigService.getOrCreate(userId);
    const result = await computeMlChilePricing({
      supplierCostUsd,
      shippingUsd,
      feesInput: {
        mlcFeePct: Number(settings.mlcFeePct),
        mpPaymentFeePct: Number(settings.mpPaymentFeePct),
        incidentBufferPct: Number(settings.incidentBufferPct),
      },
      minMarginPct: settings.minMarginPct != null ? Number(settings.minMarginPct) : null,
      minProfitUsd: settings.minProfitUsd != null ? Number(settings.minProfitUsd) : null,
    });
    if (!result.ok || !result.breakdown) {
      res.status(400).json({ error: result.error ?? 'Pricing computation failed' }); return;
    }

    const newPriceCLP = result.breakdown.suggestedPriceCLP;
    const newFxRate = result.breakdown.fxRateCLPperUSD;

    await prisma.cjMlChileListing.update({
      where: { id: listingId },
      data: {
        listedPriceCLP: new Prisma.Decimal(newPriceCLP),
        listedPriceUsd: new Prisma.Decimal(result.breakdown.suggestedPriceUsd),
        fxRateUsed: new Prisma.Decimal(newFxRate),
        draftPayload: { ...(draft ?? {}), price: newPriceCLP, pricingSnapshot: result.breakdown } as unknown as Prisma.InputJsonValue,
      },
    });

    // Si el listing está ACTIVE en ML, actualizar precio allá también
    let mlUpdated = false;
    if (listing.status === 'ACTIVE' && listing.mlListingId) {
      try {
        const mlCred = await prisma.apiCredential.findFirst({ where: { userId, apiName: 'mercadolibre' } });
        const token = (mlCred as Record<string, unknown> | null)?.accessToken as string | undefined;
        if (token) {
          const mlResp = await fetch(`https://api.mercadolibre.com/items/${listing.mlListingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ price: newPriceCLP }),
          });
          mlUpdated = mlResp.ok;
        }
      } catch { /* best-effort */ }
    }

    await cjMlChileTraceService.record({
      userId, correlationId,
      step: CJ_ML_CHILE_TRACE_STEP.LISTING_REPRICED,
      message: `Reprice listing ${listingId}: CLP=${newPriceCLP}, FX=${newFxRate}`,
      meta: { listingId, newPriceCLP, newFxRate, mlUpdated },
    });

    res.json({ ok: true, newPriceCLP, newFxRate, mlUpdated, breakdown: pricingBreakdownForResponse(result.breakdown) });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────
router.get('/orders', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
    const order = await prisma.cjMlChileOrder.findFirst({
      where: { id: req.params.id, userId },
      include: { events: { orderBy: { createdAt: 'desc' } }, tracking: true, listing: true },
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json({ ok: true, order });
  } catch (err) { next(err); }
});

router.post('/orders/:id/fetch-ml', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const correlationId = (req as Request & { correlationId?: string }).correlationId;
    const order = await prisma.cjMlChileOrder.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

    const mlCred = await prisma.apiCredential.findFirst({ where: { userId, apiName: 'mercadolibre' } });
    const token = (mlCred as Record<string, unknown> | null)?.accessToken as string | undefined
      ?? (mlCred as Record<string, unknown> | null)?.encryptedData as string | undefined;
    if (!token) { res.status(400).json({ error: 'ML_CREDENTIALS_NOT_FOUND: Conecta tu cuenta ML primero.' }); return; }

    const mlResp = await fetch(`https://api.mercadolibre.com/orders/${order.mlOrderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mlResp.ok) {
      const errBody = await mlResp.json().catch(() => ({})) as Record<string, unknown>;
      res.status(mlResp.status).json({ error: `ML API error ${mlResp.status}`, detail: errBody }); return;
    }
    const mlOrder = await mlResp.json() as Record<string, unknown>;

    const totalAmount = (mlOrder.total_amount as number) ?? null;
    const currencyId = (mlOrder.currency_id as string) ?? 'CLP';
    const mlStatus = (mlOrder.status as string) ?? null;

    // Intentar vincular listing si vino con items
    const items = (mlOrder.order_items as Array<Record<string, unknown>>) ?? [];
    const firstItemId = items[0]
      ? String((items[0].item as Record<string, unknown>)?.id ?? '')
      : null;
    const listing = firstItemId
      ? await prisma.cjMlChileListing.findFirst({ where: { userId, mlListingId: firstItemId } })
      : null;

    const newStatus = order.status === 'DETECTED' ? 'VALIDATED' : order.status;
    const updated = await prisma.cjMlChileOrder.update({
      where: { id: order.id },
      data: {
        totalCLP: totalAmount && currencyId === 'CLP' ? new Prisma.Decimal(totalAmount) : undefined,
        totalUsd: totalAmount && currencyId !== 'CLP' ? new Prisma.Decimal(totalAmount) : undefined,
        listingId: listing?.id ?? undefined,
        rawMlSummary: mlOrder as Prisma.InputJsonValue,
        status: newStatus,
      },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 3 }, tracking: true, listing: true },
    });

    await cjMlChileTraceService.record({
      userId, correlationId,
      step: CJ_ML_CHILE_TRACE_STEP.ORDER_IMPORT_SUCCESS,
      message: `ML fetch order ${order.mlOrderId}: status=${mlStatus}, total=${totalAmount} ${currencyId}`,
      meta: { orderId: order.id, mlStatus, totalAmount, listingLinked: Boolean(listing) },
    });

    res.json({ ok: true, order: updated, mlStatus, totalAmount, currencyId });
  } catch (err) { next(err); }
});

router.post('/orders/import', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
    const status = req.query.status as string | undefined;
    const alerts = await cjMlChileAlertsService.list(userId, status);
    res.json({ ok: true, alerts });
  } catch (err) { next(err); }
});

router.post('/alerts/:id/acknowledge', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const alertId = parseInt(req.params.id, 10);
    if (isNaN(alertId)) { res.status(400).json({ error: 'Invalid alert id' }); return; }
    const alert = await cjMlChileAlertsService.acknowledge(userId, alertId);
    res.json({ ok: true, alert });
  } catch (err) { next(err); }
});

router.post('/alerts/:id/resolve', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
    const userId = req.user!.userId;
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
