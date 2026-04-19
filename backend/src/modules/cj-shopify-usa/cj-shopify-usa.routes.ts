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
} from './schemas/cj-shopify-usa.schemas';
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

export default router;
