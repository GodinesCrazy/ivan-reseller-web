/**
 * Overview controller — GET /overview (module-gated).
 * GET /system-readiness stays in cj-shopify-usa.routes.ts before moduleGate.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../../config/database';
import { CJ_SHOPIFY_USA_LISTING_STATUS, CJ_SHOPIFY_USA_ORDER_STATUS } from '../cj-shopify-usa.constants';

const router = Router();

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

export default router;
