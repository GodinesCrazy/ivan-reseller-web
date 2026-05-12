/**
 * Overview controller — GET /overview, GET /system-readiness
 * Extracted from cj-shopify-usa.routes.ts for maintainability.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../../config/database';
import { cjShopifyUsaSystemReadinessService } from '../services/cj-shopify-usa-system-readiness.service';
import { CJ_SHOPIFY_USA_LISTING_STATUS, CJ_SHOPIFY_USA_TRACE_STEP } from '../cj-shopify-usa.constants';
import { normalizeCountMap } from './route-helpers';

const router = Router();

router.get('/system-readiness', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaSystemReadinessService.evaluateForUser(userId);
    res.json({ ready: result.ready, checks: result.checks });
  } catch (error) {
    next(error);
  }
});

router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

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
      shopifyProductsInSoftware,
      orders,
      ordersOpen,
      ordersWithTracking,
      alertsOpen,
      profitSnapshots,
      tracesLast24h,
      lastOrderReceived,
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
      prisma.cjShopifyUsaListing.count({
        where: { userId, shopifyProductId: { not: null } },
      }),
      prisma.cjShopifyUsaOrder.count({ where: { userId } }),
      prisma.cjShopifyUsaOrder.count({
        where: { userId, status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] } },
      }),
      prisma.cjShopifyUsaOrder.count({
        where: { userId, tracking: { trackingNumber: { not: null } } },
      }),
      prisma.cjShopifyUsaAlert.count({ where: { userId, status: 'OPEN' } }),
      prisma.cjShopifyUsaProfitSnapshot.count({ where: { userId } }),
      prisma.cjShopifyUsaExecutionTrace.count({
        where: { userId, createdAt: { gte: since24h } },
      }),
      prisma.cjShopifyUsaOrder.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const hasRecentActivity = lastOrderReceived
      ? lastOrderReceived.createdAt >= since48h
      : false;

    const ordersNeedingAttention = await prisma.cjShopifyUsaOrder.count({
      where: {
        userId,
        status: { in: ['FAILED', 'NEEDS_MANUAL', 'SUPPLIER_PAYMENT_BLOCKED'] },
      },
    });

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
        shopifyProductsInSoftware,
        orders,
        ordersOpen,
        ordersWithTracking,
        alertsOpen,
        profitSnapshots,
        tracesLast24h,
      },
      webhookHealth: {
        lastOrderReceived: lastOrderReceived?.createdAt?.toISOString() ?? null,
        hasRecentActivity,
        ordersNeedingAttention,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
