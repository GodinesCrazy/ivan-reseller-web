import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { createWebhookSignatureValidator } from '../../middleware/webhook-signature.middleware';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { cjShopifyUsaSystemReadinessService } from './services/cj-shopify-usa-system-readiness.service';
import { cjShopifyUsaConfigService } from './services/cj-shopify-usa-config.service';
import { cjShopifyUsaAuthService } from './services/cj-shopify-usa-auth.service';
import { cjShopifyUsaAdminService } from './services/cj-shopify-usa-admin.service';
import { cjShopifyUsaPublishService } from './services/cj-shopify-usa-publish.service';
import { cjShopifyUsaOrderIngestService } from './services/cj-shopify-usa-order-ingest.service';
import { cjShopifyUsaTrackingService } from './services/cj-shopify-usa-tracking.service';
import {
  cjShopifyUsaListingDraftBodySchema,
  cjShopifyUsaListingPublishBodySchema,
  cjShopifyUsaOrderImportBodySchema,
  cjShopifyUsaTrackingSyncBodySchema,
  cjShopifyUsaUpdateConfigSchema,
  cjShopifyUsaDiscoverSearchSchema,
  cjShopifyUsaDiscoverEvaluateBodySchema,
  cjShopifyUsaDiscoverImportDraftBodySchema,
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
        orders,
        ordersOpen,
        ordersWithTracking,
        alertsOpen,
        profitSnapshots,
        tracesLast24h,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/listings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const listings = await prisma.cjShopifyUsaListing.findMany({
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
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json({ ok: true, listings });
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
  try {
    const userId = req.user!.userId;
    const query = cjShopifyUsaDiscoverSearchSchema.parse(req.query);
    const results = await cjShopifyUsaDiscoverService.search(userId, query.keyword, query.page, query.pageSize);
    res.json({ ok: true, results, count: results.length, page: query.page, pageSize: query.pageSize });
  } catch (error) {
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
          select: { id: true, status: true, shopifyProductId: true },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json({ ok: true, products });
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

export default router;
