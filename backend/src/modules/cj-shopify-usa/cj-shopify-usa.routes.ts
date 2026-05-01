import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError, ErrorCode } from '../../middleware/error.middleware';
import { createWebhookSignatureValidator } from '../../middleware/webhook-signature.middleware';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { cjShopifyUsaSystemReadinessService } from './services/cj-shopify-usa-system-readiness.service';
import { cjShopifyUsaConfigService } from './services/cj-shopify-usa-config.service';
import { cjShopifyUsaAuthService } from './services/cj-shopify-usa-auth.service';
import { cjShopifyUsaAdminService } from './services/cj-shopify-usa-admin.service';
import { cjShopifyUsaPublishService } from './services/cj-shopify-usa-publish.service';
import { cjShopifyUsaReconciliationService } from './services/cj-shopify-usa-reconciliation.service';
import { cjShopifyUsaOrderIngestService } from './services/cj-shopify-usa-order-ingest.service';
import { cjShopifyUsaTrackingService } from './services/cj-shopify-usa-tracking.service';
import { automationService } from './services/cj-shopify-usa-automation.service';
import { isCjShopifyUsaPetProduct, resolveMaxSellPriceUsd } from './services/cj-shopify-usa-policy.service';
import {
  cjShopifyUsaListingDraftBodySchema,
  cjShopifyUsaListingPublishBodySchema,
  cjShopifyUsaOrderImportBodySchema,
  cjShopifyUsaTrackingSyncBodySchema,
  cjShopifyUsaUpdateConfigSchema,
  cjShopifyUsaDiscoverSearchSchema,
  cjShopifyUsaDiscoverEvaluateBodySchema,
  cjShopifyUsaDiscoverImportDraftBodySchema,
  cjShopifyUsaDiscoverAiSuggestionsBodySchema,
} from './schemas/cj-shopify-usa.schemas';
import { cjShopifyUsaDiscoverService } from './services/cj-shopify-usa-discover.service';
import {
  CJ_SHOPIFY_USA_ALERT_TYPE,
  CJ_SHOPIFY_USA_LISTING_STATUS,
  CJ_SHOPIFY_USA_ORDER_STATUS,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from './cj-shopify-usa.constants';

const router = Router();

function cjShopifyUsaEnabled(): boolean {
  return env.ENABLE_CJ_SHOPIFY_USA_MODULE === true;
}

function moduleGate(_req: Request, res: Response, next: NextFunction): void {
  if (!cjShopifyUsaEnabled()) {
    res.status(404).json({ ok: false, error: 'CJ_SHOPIFY_USA_MODULE_DISABLED' });
    return;
  }
  next();
}

async function recordTrace(userId: number, step: string, message: string, meta?: Prisma.InputJsonValue) {
  await prisma.cjShopifyUsaExecutionTrace.create({
    data: {
      userId,
      step,
      message,
      meta,
    },
  });
}

router.post(
  '/webhooks/orders-create',
  moduleGate,
  createWebhookSignatureValidator('shopify'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await cjShopifyUsaOrderIngestService.resolveUserIdFromWebhookShop(
        req.headers['x-shopify-shop-domain'],
      );
      const result = await cjShopifyUsaOrderIngestService.handleOrdersCreateWebhook({
        userId,
        body: req.body,
      });
      res.json({ ok: true, count: result.count });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/webhooks/app-uninstalled',
  moduleGate,
  createWebhookSignatureValidator('shopify'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await cjShopifyUsaOrderIngestService.resolveUserIdFromWebhookShop(
        req.headers['x-shopify-shop-domain'],
      );
      await prisma.cjShopifyUsaAlert.create({
        data: {
          userId,
          type: CJ_SHOPIFY_USA_ALERT_TYPE.SHOPIFY_DISCONNECTED,
          severity: 'warning',
          status: 'OPEN',
          payload: {
            topic: 'APP_UNINSTALLED',
            occurredAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_COMPLETE, 'shopify.app_uninstalled', {
        topic: 'APP_UNINSTALLED',
      } as Prisma.InputJsonValue);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

router.use(authenticate);

router.get('/system-readiness', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const out = await cjShopifyUsaSystemReadinessService.evaluateForUser(userId);
    res.json({ ready: out.ready, checks: out.checks });
  } catch (error) {
    next(error);
  }
});

router.use(moduleGate);

router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      ok: true,
      module: 'cj-shopify-usa',
      moduleEnabled: true,
      authMode: 'client_credentials',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const snapshot = await cjShopifyUsaConfigService.getConfigSnapshot(userId);
    res.json({ ok: true, ...snapshot });
  } catch (error) {
    next(error);
  }
});

router.post('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaUpdateConfigSchema.parse(req.body);
    const settings = await cjShopifyUsaConfigService.updateSettings(userId, body);
    res.json({ ok: true, settings });
  } catch (error) {
    next(error);
  }
});

// ── GET /config/preview-impact — preview how many products pass/fail new rules ─
router.get('/config/preview-impact', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const minMarginPct  = Number(req.query.minMarginPct  ?? 12);
    const minProfitUsd  = Number(req.query.minProfitUsd  ?? 1.5);
    const maxShippingUsd = Number(req.query.maxShippingUsd ?? 15);
    const maxSellPriceUsd = Number(req.query.maxSellPriceUsd ?? 45);
    const minCostUsd    = Number(req.query.minCostUsd    ?? 2);

    const evaluations = await prisma.cjShopifyUsaProductEvaluation.findMany({
      where: { userId },
      select: {
        estimatedMarginPct: true,
        decision: true,
        product: {
          select: {
            title: true,
            description: true,
            listings: {
              where: { userId },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { listedPriceUsd: true, draftPayload: true },
            },
          },
        },
      },
    });

    let approved = 0, rejected = 0;
    for (const ev of evaluations) {
      const margin = Number(ev.estimatedMarginPct ?? 0);
      const listing = ev.product.listings[0];
      const draft = (listing?.draftPayload || null) as Record<string, any> | null;
      const sellPrice = Number(listing?.listedPriceUsd ?? draft?.pricingSnapshot?.suggestedSellPriceUsd ?? 0);
      const pet = isCjShopifyUsaPetProduct({ title: ev.product.title, description: ev.product.description });
      const priceOk = !Number.isFinite(sellPrice) || sellPrice <= 0 || sellPrice <= maxSellPriceUsd;
      if (margin >= minMarginPct && pet && priceOk) approved++;
      else rejected++;
    }
    res.json({ ok: true, approved, rejected, total: evaluations.length, rules: { minMarginPct, minProfitUsd, maxShippingUsd, maxSellPriceUsd, minCostUsd } });
  } catch (error) { next(error); }
});

// ── Automation ────────────────────────────────────────────────────────────────

router.get('/automation/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    res.json({ ok: true, ...await automationService.getStatus(userId) });
  } catch (e) { next(e); }
});

router.post('/automation/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const status = await automationService.start(userId);
    res.json({ ok: true, ...status });
  } catch (e) { next(e); }
});

router.post('/automation/run-now', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const status = await automationService.runNow(userId);
    res.json({ ok: true, ...status });
  } catch (e) { next(e); }
});

router.post('/automation/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await automationService.pause(req.user!.userId);
    res.json({ ok: true, ...status });
  } catch (e) { next(e); }
});

router.post('/automation/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const status = await automationService.resume(userId);
    res.json({ ok: true, ...status });
  } catch (e) { next(e); }
});

router.post('/automation/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await automationService.stop(req.user!.userId);
    res.json({ ok: true, ...status });
  } catch (e) { next(e); }
});

router.post('/automation/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await automationService.updateConfig(req.user!.userId, req.body as Parameters<typeof automationService.updateConfig>[1]);
    res.json({ ok: true, config });
  } catch (e) { next(e); }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

router.post('/auth/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaAuthService.testConnection(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/webhooks/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaAdminService.ensureWebhookSubscriptions(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// GET /storefront-status — Verifica si el storefront está protegido por password gate
router.get('/storefront-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const productHandle = String(req.query.productHandle || '').trim();

    if (!productHandle) {
      res.status(400).json({
        ok: false,
        error: 'MISSING_PRODUCT_HANDLE',
        message: 'Se requiere productHandle como query parameter (ej: ?productHandle=mi-producto)'
      });
      return;
    }

    const result = await cjShopifyUsaAdminService.checkStorefrontStatus(userId, productHandle);

    res.json({
      ok: true,
      storefront: {
        ...result,
        buyerAccessible: !result.passwordGate,
        status: result.passwordGate ? 'PASSWORD_PROTECTED' : 'PUBLIC'
      },
      nextStep: result.passwordGate
        ? {
            action: 'MANUAL_SHOPIFY_ADMIN',
            description: 'El storefront está protegido por password gate. Se requiere acción manual en Shopify Admin.',
            steps: [
              `1. Acceder a: https://${result.shopDomain}/admin`,
              '2. Navegar a: Online Store > Preferences',
              '3. En sección "Password protection", desmarcar "Enable password"',
              '4. Guardar cambios'
            ],
            alternative: `shopify store:disable-password --store=${result.shopDomain} (si Shopify CLI está configurado)`
          }
        : {
            action: 'NONE',
            description: 'Storefront está público y accesible para buyers.'
          }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
      listingsActiveOrPendingShopifyProducts,
      orders,
      ordersOpen,
      ordersWithTracking,
      alertsOpen,
      profitSnapshots,
      tracesLast24h,
    ] = await Promise.all([
      prisma.cjShopifyUsaProduct.count({ where: { userId } }),
      prisma.cjShopifyUsaProductVariant.count({ where: { product: { userId } } }),
      prisma.cjShopifyUsaProductEvaluation.count({ where: { userId } }),
      prisma.cjShopifyUsaProductEvaluation.count({ where: { userId, decision: 'APPROVED' } }),
      prisma.cjShopifyUsaProductEvaluation.count({ where: { userId, decision: 'REJECTED' } }),
      prisma.cjShopifyUsaProductEvaluation.count({ where: { userId, decision: 'PENDING' } }),
      prisma.cjShopifyUsaShippingQuote.count({ where: { userId } }),
      prisma.cjShopifyUsaListing.count({ where: { userId } }),
      prisma.cjShopifyUsaListing.count({
        where: { userId, status: CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE },
      }),
      prisma.cjShopifyUsaListing.findMany({
        where: {
          userId,
          status: {
            in: [
              CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
              CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
            ],
          },
          shopifyProductId: { not: null },
        },
        distinct: ['shopifyProductId'],
        select: { shopifyProductId: true },
      }),
      prisma.cjShopifyUsaOrder.count({ where: { userId } }),
      prisma.cjShopifyUsaOrder.count({
        where: {
          userId,
          status: {
            notIn: [CJ_SHOPIFY_USA_ORDER_STATUS.COMPLETED, CJ_SHOPIFY_USA_ORDER_STATUS.FAILED],
          },
        },
      }),
      prisma.cjShopifyUsaTracking.count({
        where: {
          order: { userId },
          trackingNumber: { not: null },
        },
      }),
      prisma.cjShopifyUsaAlert.count({ where: { userId, status: 'OPEN' } }),
      prisma.cjShopifyUsaProfitSnapshot.count({ where: { userId } }),
      prisma.cjShopifyUsaExecutionTrace.count({
        where: {
          userId,
          createdAt: { gte: since24h },
        },
      }),
    ]);

    // Webhook health: last order ingested via webhook vs last 48h
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const lastWebhookOrder = await prisma.cjShopifyUsaOrder.findFirst({
      where: { userId, createdAt: { gte: since48h } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const ordersNeedingAttention = await prisma.cjShopifyUsaOrder.count({
      where: { userId, status: { in: ['FAILED', 'NEEDS_MANUAL', 'SUPPLIER_PAYMENT_BLOCKED'] } },
    });
    const webhookHealth = {
      lastOrderReceived: lastWebhookOrder?.createdAt ?? null,
      hasRecentActivity: !!lastWebhookOrder,
      ordersNeedingAttention,
    };

    res.json({
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
        shopifyProductsInSoftware: listingsActiveOrPendingShopifyProducts.length,
        orders,
        ordersOpen,
        ordersWithTracking,
        alertsOpen,
        profitSnapshots,
        tracesLast24h,
      },
      webhookHealth,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/listings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [listings, total, activeOrPendingShopifyProducts] = await Promise.all([
      prisma.cjShopifyUsaListing.findMany({
        where: { userId },
        include: {
          product: {
            select: {
              id: true,
              cjProductId: true,
              title: true,
            },
          },
          variant: {
            select: {
              id: true,
              cjSku: true,
              cjVid: true,
              stockLastKnown: true,
              unitCostUsd: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.cjShopifyUsaListing.count({ where: { userId } }),
      prisma.cjShopifyUsaListing.findMany({
        where: {
          userId,
          status: {
            in: [
              CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
              CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
            ],
          },
          shopifyProductId: { not: null },
        },
        distinct: ['shopifyProductId'],
        select: { shopifyProductId: true },
      }),
    ]);
    const listingsWithStorefront = await cjShopifyUsaReconciliationService.reconcileListings(userId, listings);
    res.json({
      ok: true,
      listings: listingsWithStorefront,
      meta: {
        total,
        returned: listingsWithStorefront.length,
        shopifyProductsInSoftware: activeOrPendingShopifyProducts.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/listings/draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaListingDraftBodySchema.parse(req.body);
    const listing = await cjShopifyUsaPublishService.buildDraft({
      userId,
      productId: Number(body.productId),
      variantId: body.variantId ? Number(body.variantId) : undefined,
      quantity: body.quantity,
    });
    res.json({ ok: true, listing });
  } catch (error) {
    next(error);
  }
});

router.post('/listings/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaListingPublishBodySchema.parse(req.body);
    const listing = await cjShopifyUsaPublishService.publishListing({
      userId,
      listingId: body.listingId,
    });
    res.json({ ok: true, listing });
  } catch (error) {
    next(error);
  }
});

router.post('/listings/:listingId/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const listingId = Number(req.params.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      res.status(400).json({ ok: false, error: 'INVALID_LISTING_ID' });
      return;
    }
    const listing = await cjShopifyUsaPublishService.pauseListing({
      userId,
      listingId,
    });
    res.json({ ok: true, listing });
  } catch (error) {
    next(error);
  }
});

router.post('/listings/:listingId/unpublish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const listingId = Number(req.params.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      res.status(400).json({ ok: false, error: 'INVALID_LISTING_ID' });
      return;
    }
    const listing = await cjShopifyUsaPublishService.unpublishListing({
      userId,
      listingId,
    });
    res.json({ ok: true, listing });
  } catch (error) {
    next(error);
  }
});

router.post('/listings/:listingId/expand-variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const listingId = Number(req.params.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      res.status(400).json({ ok: false, error: 'INVALID_LISTING_ID' });
      return;
    }
    const result = await cjShopifyUsaPublishService.expandProductVariants({ userId, listingId });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orders = await prisma.cjShopifyUsaOrder.findMany({
      where: { userId },
      include: {
        tracking: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json({ ok: true, orders });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaOrderImportBodySchema.parse(req.body);
    const result = await cjShopifyUsaOrderIngestService.syncOrders({
      userId,
      shopifyOrderId: body.shopifyOrderId,
      sinceHours: body.sinceHours,
      first: body.first,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// ── POST /orders/:orderId/process — idempotent CJ order placement ────────────
router.post('/orders/:orderId/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orderId = String(req.params.orderId || '').trim();
    const result = await cjShopifyUsaOrderIngestService.processOrder({ userId, orderId });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// ── POST /orders/auto-sync-tracking — bulk tracking sync for all shipped orders
router.post('/orders/auto-sync-tracking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaOrderIngestService.autoSyncAllTracking(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:orderId/sync-tracking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaTrackingSyncBodySchema.parse(req.body || {});
    const result = await cjShopifyUsaTrackingService.syncTracking({
      userId,
      orderId: req.params.orderId,
      carrierCode: body.carrierCode,
      trackingNumber: body.trackingNumber,
      trackingUrl: body.trackingUrl,
      notifyCustomer: body.notifyCustomer,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ── GET /orders/:orderId — order detail ───────────────────────────────────────

router.get('/orders/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.orderId || '').trim();
    const order = await prisma.cjShopifyUsaOrder.findFirst({
      where: { id, userId },
      include: {
        tracking: true,
        events: { orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) {
      res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND' });
      return;
    }
    res.json({ ok: true, order });
  } catch (error) {
    next(error);
  }
});

// ── Discover — live CJ catalog search + evaluate + import-and-draft ───────────

router.get('/discover/search', async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.userId || 0;
  try {
    const query = cjShopifyUsaDiscoverSearchSchema.parse(req.query);
    const results = await cjShopifyUsaDiscoverService.search(userId, query.keyword, query.page, query.pageSize);
    res.json({ ok: true, results, count: results.length, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_ERROR, 'discover.search.failed', {
      error: msg,
      stack: error instanceof Error ? error.stack : undefined,
      query: req.query
    } as Prisma.InputJsonValue).catch(() => {});
    next(error);
  }
});

router.post('/discover/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaDiscoverEvaluateBodySchema.parse(req.body);
    const result = await cjShopifyUsaDiscoverService.evaluate(userId, body.cjProductId, body.quantity, body.destPostalCode);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/discover/import-draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaDiscoverImportDraftBodySchema.parse(req.body);
    const result = await cjShopifyUsaDiscoverService.importAndDraft(
      userId,
      body.cjProductId,
      body.variantCjVid,
      body.quantity,
      body.destPostalCode,
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/discover/ai-suggestions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const body = cjShopifyUsaDiscoverAiSuggestionsBodySchema.parse(req.body || {});
    const result = await cjShopifyUsaDiscoverService.aiSuggestions(userId, {
      count: body.count,
      destPostalCode: body.destPostalCode,
      keywords: body.keywords,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// ── GET /products — list CJ product snapshots with evaluations ─────────────────

router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const products = await prisma.cjShopifyUsaProduct.findMany({
      where: { userId },
      include: {
        variants: {
          select: {
            id: true,
            cjSku: true,
            cjVid: true,
            unitCostUsd: true,
            stockLastKnown: true,
            stockCheckedAt: true,
          },
        },
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            decision: true,
            estimatedMarginPct: true,
            reasons: true,
            evaluatedAt: true,
          },
        },
        listings: {
          select: { id: true, status: true, shopifyProductId: true, shopifyVariantId: true, shopifyHandle: true },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const allListings = products.flatMap((product) =>
      product.listings.map((listing) => ({
        ...listing,
        userId,
      })),
    );
    const reconciledListings = await cjShopifyUsaReconciliationService.reconcileListings(userId, allListings);
    const reconciledById = new Map(reconciledListings.map((listing) => [listing.id, listing]));
    const productsWithStorefront = products.map((product) => ({
      ...product,
      policy: {
        isPetProduct: isCjShopifyUsaPetProduct({ title: product.title }),
      },
      listings: product.listings.map((listing) => {
        return reconciledById.get(listing.id) ?? listing;
      }),
    }));
    res.json({ ok: true, products: productsWithStorefront });
  } catch (error) {
    next(error);
  }
});

// ── POST /products/:productId/re-evaluate — force fresh evaluation ────────────
router.post('/products/:productId/re-evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new AppError('ID inválido', 400, ErrorCode.VALIDATION_ERROR);
    }
    const product = await prisma.cjShopifyUsaProduct.findFirst({
      where: { id: productId, userId },
      include: { variants: { take: 1 } },
    });
    if (!product) throw new AppError('Producto no encontrado', 404, ErrorCode.NOT_FOUND);

    const variant = product.variants[0];
    if (!variant) throw new AppError('Producto sin variantes', 422, ErrorCode.VALIDATION_ERROR);

    // Re-run evaluation using discover service
    const result = await cjShopifyUsaDiscoverService.evaluate(
      userId,
      product.cjProductId,
      1, // quantity (fixed: was undefined)
      undefined, // postal code
    );
    res.json({ ok: true, evaluation: result });
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new AppError('ID de producto CJ Shopify USA inválido.', 400, ErrorCode.VALIDATION_ERROR);
    }

    const product = await prisma.cjShopifyUsaProduct.findFirst({
      where: { id: productId, userId },
      select: {
        id: true,
        title: true,
        listings: {
          select: {
            id: true,
            status: true,
            shopifyProductId: true,
            shopifyHandle: true,
          },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!product) {
      throw new AppError('Producto CJ Shopify USA no encontrado.', 404, ErrorCode.NOT_FOUND);
    }

    const linkedListing = product.listings.find(
      (listing) => Boolean(listing.shopifyProductId) || listing.status === CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
    );

    if (linkedListing) {
      throw new AppError(
        'No se puede eliminar un artículo con producto Shopify vinculado. Primero elimínalo u ocúltalo desde Store Products/Shopify.',
        409,
        ErrorCode.RESOURCE_CONFLICT,
      );
    }

    if (product._count.orders > 0) {
      throw new AppError(
        'No se puede eliminar un artículo con órdenes asociadas.',
        409,
        ErrorCode.RESOURCE_CONFLICT,
      );
    }

    await prisma.cjShopifyUsaProduct.delete({ where: { id: product.id } });
    await recordTrace(userId, 'PRODUCT_DELETE', 'cj_shopify_usa.product.deleted', {
      productId: product.id,
      title: product.title,
    } as Prisma.InputJsonValue);

    res.json({ ok: true, deletedProductId: product.id });
  } catch (error) {
    next(error);
  }
});

// ── Alerts ────────────────────────────────────────────────────────────────────

const ALERT_META: Record<string, { label: string; description: string }> = {
  REFUND_PENDING:          { label: 'Reembolso pendiente',       description: 'Una orden tiene un reembolso en espera de procesamiento.' },
  RETURN_IN_PROGRESS:      { label: 'Devolución en curso',        description: 'El cliente inició una devolución que requiere seguimiento.' },
  SUPPLIER_PAYMENT_BLOCKED:{ label: 'Pago proveedor bloqueado',   description: 'El pago a CJ está bloqueado. Verificar balance de cuenta.' },
  ORDER_FAILED:            { label: 'Orden fallida',              description: 'Una orden no pudo procesarse correctamente.' },
  ORDER_NEEDS_MANUAL:      { label: 'Intervención manual requerida', description: 'Una orden requiere acción manual del operador.' },
  TRACKING_MISSING:        { label: 'Tracking no disponible',     description: 'Una orden despachada no tiene número de tracking.' },
  REFUND_COMPLETED:        { label: 'Reembolso completado',       description: 'Un reembolso fue procesado exitosamente.' },
  REFUND_FAILED:           { label: 'Reembolso fallido',          description: 'El procesamiento de un reembolso falló.' },
  ORDER_LOSS:              { label: 'Pérdida en orden',           description: 'Una orden resultó en pérdida neta según los registros de profit.' },
  SHOPIFY_DISCONNECTED:    { label: 'Shopify desconectado',       description: 'La app fue desinstalada o la conexión con Shopify se interrumpió.' },
};

router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const statusFilter = String(req.query.status || '').trim() || undefined;
    const alerts = await prisma.cjShopifyUsaAlert.findMany({
      where: {
        userId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const withMeta = alerts.map((a) => ({
      ...a,
      meta: ALERT_META[a.type] ?? { label: a.type, description: '' },
    }));
    res.json({ ok: true, alerts: withMeta });
  } catch (error) {
    next(error);
  }
});

router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const alertId = parseInt(String(req.params.alertId), 10);
    if (!Number.isFinite(alertId)) {
      res.status(400).json({ ok: false, error: 'INVALID_ALERT_ID' });
      return;
    }
    const alert = await prisma.cjShopifyUsaAlert.findFirst({ where: { id: alertId, userId } });
    if (!alert) {
      res.status(404).json({ ok: false, error: 'ALERT_NOT_FOUND' });
      return;
    }
    const updated = await prisma.cjShopifyUsaAlert.update({
      where: { id: alertId },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    res.json({ ok: true, alert: updated });
  } catch (error) {
    next(error);
  }
});

router.post('/alerts/:alertId/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const alertId = parseInt(String(req.params.alertId), 10);
    if (!Number.isFinite(alertId)) {
      res.status(400).json({ ok: false, error: 'INVALID_ALERT_ID' });
      return;
    }
    const alert = await prisma.cjShopifyUsaAlert.findFirst({ where: { id: alertId, userId } });
    if (!alert) {
      res.status(404).json({ ok: false, error: 'ALERT_NOT_FOUND' });
      return;
    }
    const updated = await prisma.cjShopifyUsaAlert.update({
      where: { id: alertId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    res.json({ ok: true, alert: updated });
  } catch (error) {
    next(error);
  }
});

// ── GET /profit — financial summary ──────────────────────────────────────────

router.get('/profit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;

    const dateFilter = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };

    const [snapshots, orders] = await Promise.all([
      prisma.cjShopifyUsaProfitSnapshot.findMany({
        where: {
          userId,
          ...(Object.keys(dateFilter).length ? { snapshotDate: dateFilter } : {}),
        },
        orderBy: { snapshotDate: 'desc' },
        take: 90,
      }),
      prisma.cjShopifyUsaOrder.findMany({
        where: {
          userId,
          ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        },
        select: {
          id: true,
          shopifyOrderId: true,
          status: true,
          totalUsd: true,
          lastError: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    ]);

    const totalRevenue = snapshots.reduce((s, r) => s + (r.estimatedRevenueUsd?.toNumber() ?? 0), 0);
    const totalCjCost = snapshots.reduce((s, r) => s + (r.estimatedCjCostUsd?.toNumber() ?? 0), 0);
    const totalFees = snapshots.reduce((s, r) => s + (r.estimatedFeesUsd?.toNumber() ?? 0), 0);
    const totalProfit = snapshots.reduce((s, r) => s + (r.estimatedProfitUsd?.toNumber() ?? 0), 0);

    const completedOrders = orders.filter((o) => o.status === CJ_SHOPIFY_USA_ORDER_STATUS.COMPLETED).length;
    const failedOrders = orders.filter((o) => o.status === CJ_SHOPIFY_USA_ORDER_STATUS.FAILED).length;
    const openOrders = orders.length - completedOrders - failedOrders;

    res.json({
      ok: true,
      kpis: {
        totalRevenueUsd: totalRevenue,
        totalCjCostUsd: totalCjCost,
        totalFeesUsd: totalFees,
        totalProfitUsd: totalProfit,
        snapshotCount: snapshots.length,
        totalOrders: orders.length,
        completedOrders,
        openOrders,
        failedOrders,
        dataNote: snapshots.length === 0
          ? 'Sin snapshots de profit registrados aún. Los datos aparecerán cuando se procesen órdenes.'
          : `${snapshots.length} snapshots diarios disponibles.`,
      },
      snapshots: snapshots.map((s) => ({
        id: s.id,
        snapshotDate: s.snapshotDate,
        estimatedRevenueUsd: s.estimatedRevenueUsd?.toNumber() ?? 0,
        estimatedCjCostUsd: s.estimatedCjCostUsd?.toNumber() ?? 0,
        estimatedFeesUsd: s.estimatedFeesUsd?.toNumber() ?? 0,
        estimatedProfitUsd: s.estimatedProfitUsd?.toNumber() ?? 0,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        shopifyOrderId: o.shopifyOrderId,
        status: o.status,
        totalUsd: o.totalUsd?.toNumber() ?? null,
        lastError: o.lastError,
        updatedAt: o.updatedAt,
      })),
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /logs — execution traces ──────────────────────────────────────────────

router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 200);
    const step = String(req.query.step || '').trim() || undefined;

    const traces = await prisma.cjShopifyUsaExecutionTrace.findMany({
      where: {
        userId,
        ...(step ? { step } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        step: true,
        message: true,
        correlationId: true,
        createdAt: true,
      },
    });
    res.json({ ok: true, traces, count: traces.length });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /listings/:listingId/price — Update listing price and sync to Shopify ─

router.patch('/listings/:listingId/price', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const listingId = parseInt(String(req.params.listingId), 10);
    const { sellPriceUsd } = req.body as { sellPriceUsd?: number };

    if (!Number.isFinite(listingId) || !Number.isFinite(sellPriceUsd) || sellPriceUsd! <= 0) {
      res.status(400).json({ ok: false, error: 'INVALID_PARAMS', message: 'listingId and positive sellPriceUsd required' });
      return;
    }

    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const maxSellPriceUsd = resolveMaxSellPriceUsd(settings.maxSellPriceUsd);
    if (sellPriceUsd! > maxSellPriceUsd) {
      res.status(400).json({
        ok: false,
        error: 'PRICE_EXCEEDS_MAX_SELL_PRICE',
        message: `El precio de venta $${sellPriceUsd!.toFixed(2)} supera el máximo configurado $${maxSellPriceUsd.toFixed(2)}.`,
      });
      return;
    }

    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: { id: listingId, userId },
      include: { product: true, variant: true },
    });

    if (!listing) {
      res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
      return;
    }

    const shouldSyncToShopify = Boolean(listing.shopifyProductId && listing.shopifyVariantId);
    if (shouldSyncToShopify) {
      await cjShopifyUsaAdminService.updateVariantPrice({
        userId,
        productId: listing.shopifyProductId!,
        variantId: listing.shopifyVariantId!,
        price: sellPriceUsd!,
      });
    }

    await prisma.cjShopifyUsaListing.update({
      where: { id: listingId },
      data: {
        listedPriceUsd: sellPriceUsd,
        lastSyncedAt: shouldSyncToShopify ? new Date() : listing.lastSyncedAt,
        lastError: null,
      },
    });

    await recordTrace(userId, CJ_SHOPIFY_USA_TRACE_STEP.REQUEST_COMPLETE, 'listing.price.updated', {
      listingId,
      newPrice: sellPriceUsd,
    } as Prisma.InputJsonValue);

    const updated = await prisma.cjShopifyUsaListing.findFirst({
      where: { id: listingId, userId },
      include: { product: true, variant: true },
    });
    const [reconciled] = updated
      ? await cjShopifyUsaReconciliationService.reconcileListings(userId, [updated])
      : [];

    res.json({ ok: true, listingId, sellPriceUsd, syncedToShopify: shouldSyncToShopify, listing: reconciled ?? updated });
  } catch (error) {
    next(error);
  }
});

// ── POST /collections/create — Create a collection in Shopify ─────────────────

router.post('/collections/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { title, handle, descriptionHtml = '', collectionType = 'manual' } = req.body as {
      title?: string;
      handle?: string;
      descriptionHtml?: string;
      collectionType?: 'manual' | 'smart';
    };

    if (!title || !handle) {
      res.status(400).json({ ok: false, error: 'MISSING_FIELDS', message: 'title and handle are required' });
      return;
    }

    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const shopDomain = settings.shopifyStoreUrl ? settings.shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

    if (!shopDomain || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
      res.status(503).json({ ok: false, error: 'SHOPIFY_NOT_CONFIGURED' });
      return;
    }

    const token = await cjShopifyUsaAdminService.getAccessToken(userId);
    const accessToken = token.accessToken;

    // Create custom collection via REST API
    const createRes = await fetch(
      `https://${shopDomain}/admin/api/2026-04/custom_collections.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          custom_collection: {
            title,
            handle,
            body_html: descriptionHtml,
          },
        }),
      }
    );

    if (!createRes.ok) {
      const errorText = await createRes.text();
      res.status(502).json({ ok: false, error: 'SHOPIFY_API_ERROR', details: errorText });
      return;
    }

    const created = await createRes.json() as { custom_collection?: { id?: number; handle?: string } };

    res.json({
      ok: true,
      collection: {
        id: created?.custom_collection?.id,
        title,
        handle: created?.custom_collection?.handle || handle,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /collections/assign — Assign product to collection ───────────────────

router.post('/collections/assign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { listingId, collectionId } = req.body as { listingId?: number; collectionId?: number };

    if (!Number.isFinite(listingId) || !Number.isFinite(collectionId)) {
      res.status(400).json({ ok: false, error: 'INVALID_PARAMS', message: 'listingId and collectionId required' });
      return;
    }

    const listing = await prisma.cjShopifyUsaListing.findFirst({
      where: { id: listingId, userId },
    });

    if (!listing || !listing.shopifyProductId) {
      res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND_OR_NOT_PUBLISHED' });
      return;
    }

    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const shopDomain = settings.shopifyStoreUrl ? settings.shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

    if (!shopDomain || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
      res.status(503).json({ ok: false, error: 'SHOPIFY_NOT_CONFIGURED' });
      return;
    }

    const token = await cjShopifyUsaAdminService.getAccessToken(userId);
    const accessToken = token.accessToken;

    // Create collect (product-collection link) via REST API
    const collectRes = await fetch(
      `https://${shopDomain}/admin/api/2026-04/collects.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collect: {
            product_id: listing.shopifyProductId,
            collection_id: collectionId,
          },
        }),
      }
    );

    if (!collectRes.ok) {
      const errorText = await collectRes.text();
      res.status(502).json({ ok: false, error: 'SHOPIFY_API_ERROR', details: errorText });
      return;
    }

    const created = await collectRes.json() as { collect?: { id?: number } };

    res.json({
      ok: true,
      assignment: {
        collectId: created?.collect?.id,
        listingId,
        collectionId,
        shopifyProductId: listing.shopifyProductId,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /collections — List Shopify collections ─────────────────────────────

router.get('/collections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    const shopDomain = settings.shopifyStoreUrl ? settings.shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

    if (!shopDomain || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
      res.status(503).json({ ok: false, error: 'SHOPIFY_NOT_CONFIGURED' });
      return;
    }

    const token = await cjShopifyUsaAdminService.getAccessToken(userId);
    const accessToken = token.accessToken;

    // Fetch collections from Shopify
    const collectionsRes = await fetch(
      `https://${shopDomain}/admin/api/2026-04/custom_collections.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
        },
      }
    );

    if (!collectionsRes.ok) {
      const errorText = await collectionsRes.text();
      res.status(502).json({ ok: false, error: 'SHOPIFY_API_ERROR', details: errorText });
      return;
    }

    const collections = await collectionsRes.json() as { custom_collections?: Array<{ id: number; title: string; handle: string }> };

    res.json({
      ok: true,
      collections: collections?.custom_collections || [],
    });
  } catch (error) {
    next(error);
  }
});

export default router;
