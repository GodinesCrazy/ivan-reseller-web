/**
 * Orders controller — list, sync, process, tracking
 * Extracted from cj-shopify-usa.routes.ts for maintainability.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../../config/database';
import { cjShopifyUsaOrderIngestService } from '../services/cj-shopify-usa-order-ingest.service';
import { cjShopifyUsaTrackingService } from '../services/cj-shopify-usa-tracking.service';
import {
  CJ_SHOPIFY_USA_ORDER_STATUS,
  CJ_SHOPIFY_USA_ALERT_TYPE,
  CJ_SHOPIFY_USA_TRACE_STEP,
} from '../cj-shopify-usa.constants';
import {
  cjShopifyUsaOrderImportBodySchema,
  cjShopifyUsaTrackingSyncBodySchema,
} from '../schemas/cj-shopify-usa.schemas';
import { normalizeCountMap, sumStatuses } from './route-helpers';

const router = Router();

// ── GET /orders — list with pagination ────────────────────────────────────────
router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const status = String(req.query.status || '').trim() || undefined;
    const q = String(req.query.q || '').trim() || undefined;

    const where: any = { userId };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { shopifyOrderId: { contains: q, mode: 'insensitive' } },
        { cjOrderId: { contains: q, mode: 'insensitive' } },
        { shopifySku: { contains: q, mode: 'insensitive' } },
        { lastError: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [orders, total, groupedStatuses] = await Promise.all([
      prisma.cjShopifyUsaOrder.findMany({
        where,
        include: {
          tracking: true,
          events: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cjShopifyUsaOrder.count({ where }),
      prisma.cjShopifyUsaOrder.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      }),
    ]);

    res.json({
      ok: true,
      orders,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      statusCounts: normalizeCountMap(groupedStatuses),
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /orders/sync ─────────────────────────────────────────────────────────
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

// ── POST /orders/:orderId/process ─────────────────────────────────────────────
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

// ── POST /orders/auto-sync-tracking ───────────────────────────────────────────
router.post('/orders/auto-sync-tracking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await cjShopifyUsaOrderIngestService.autoSyncAllTracking(userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// ── POST /orders/:orderId/sync-tracking ───────────────────────────────────────
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

// ── GET /orders/:orderId — detail ─────────────────────────────────────────────
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

// ── GET /post-sale/dashboard ──────────────────────────────────────────────────
router.get('/post-sale/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const [
      groupedStatuses,
      recentOrders,
      recentEvents,
      openAlerts,
      recentTraceCount,
      lastOrder,
      lastTracking,
    ] = await Promise.all([
      prisma.cjShopifyUsaOrder.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      }),
      prisma.cjShopifyUsaOrder.findMany({
        where: { userId },
        include: {
          tracking: true,
          listing: {
            select: {
              id: true,
              status: true,
              listedPriceUsd: true,
              product: { select: { title: true, cjProductId: true } },
            },
          },
          events: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      }),
      prisma.cjShopifyUsaOrderEvent.findMany({
        where: { order: { userId } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { order: { select: { id: true, shopifyOrderId: true, status: true, rawShopifySummary: true } } },
      }),
      prisma.cjShopifyUsaAlert.findMany({
        where: {
          userId,
          status: 'OPEN',
          type: {
            in: [
              CJ_SHOPIFY_USA_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED,
              CJ_SHOPIFY_USA_ALERT_TYPE.ORDER_FAILED,
              CJ_SHOPIFY_USA_ALERT_TYPE.ORDER_NEEDS_MANUAL,
              CJ_SHOPIFY_USA_ALERT_TYPE.TRACKING_MISSING,
              CJ_SHOPIFY_USA_ALERT_TYPE.REFUND_PENDING,
              CJ_SHOPIFY_USA_ALERT_TYPE.REFUND_FAILED,
            ],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.cjShopifyUsaExecutionTrace.count({
        where: {
          userId,
          createdAt: { gte: since72h },
          step: {
            in: [
              CJ_SHOPIFY_USA_TRACE_STEP.ORDER_IMPORT_SUCCESS,
              CJ_SHOPIFY_USA_TRACE_STEP.ORDER_PLACE_SUCCESS,
              CJ_SHOPIFY_USA_TRACE_STEP.ORDER_PLACE_ERROR,
              CJ_SHOPIFY_USA_TRACE_STEP.CJ_ORDER_CREATE_SUCCESS,
              CJ_SHOPIFY_USA_TRACE_STEP.CJ_ORDER_CREATE_ERROR,
              CJ_SHOPIFY_USA_TRACE_STEP.TRACKING_SYNC_SUCCESS,
              CJ_SHOPIFY_USA_TRACE_STEP.TRACKING_SYNC_ERROR,
            ],
          },
        },
      }),
      prisma.cjShopifyUsaOrder.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, status: true, rawShopifySummary: true },
      }),
      prisma.cjShopifyUsaTracking.findFirst({
        where: { order: { userId }, trackingNumber: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { orderId: true, trackingNumber: true, updatedAt: true, status: true },
      }),
    ]);

    const countsByStatus = normalizeCountMap(groupedStatuses);
    const stages = [
      {
        id: 'payment',
        label: 'Pago Shopify',
        ok: sumStatuses(countsByStatus, ['VALIDATED', 'CJ_ORDER_PLACING', 'CJ_ORDER_PLACED', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMING', 'CJ_ORDER_CONFIRMED', 'CJ_PAYMENT_PENDING', 'CJ_PAYMENT_PROCESSING', 'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_SHOPIFY', 'COMPLETED']),
        pending: sumStatuses(countsByStatus, ['WAITING_PAYMENT', 'DETECTED']),
        blocked: 0,
        next: 'Esperar PAID antes de comprar al proveedor.',
      },
      {
        id: 'guardrails',
        label: 'Guardrails',
        ok: sumStatuses(countsByStatus, ['VALIDATED']),
        pending: 0,
        blocked: sumStatuses(countsByStatus, ['FAILED', 'NEEDS_MANUAL']),
        next: 'Corregir errores de margen, país, SKU, dirección o listing.',
      },
      {
        id: 'supplier',
        label: 'Compra CJ',
        ok: sumStatuses(countsByStatus, ['CJ_ORDER_PLACED', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMED', 'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_SHOPIFY', 'COMPLETED']),
        pending: sumStatuses(countsByStatus, ['CJ_ORDER_PLACING', 'CJ_ORDER_CONFIRMING', 'CJ_PAYMENT_PROCESSING']),
        blocked: sumStatuses(countsByStatus, ['SUPPLIER_PAYMENT_BLOCKED']),
        next: 'Crear/confirmar orden CJ solo si hay margen demostrado.',
      },
      {
        id: 'balance',
        label: 'Saldo proveedor',
        ok: sumStatuses(countsByStatus, ['CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED', 'TRACKING_ON_SHOPIFY', 'COMPLETED']),
        pending: sumStatuses(countsByStatus, ['CJ_PAYMENT_PENDING']),
        blocked: sumStatuses(countsByStatus, ['SUPPLIER_PAYMENT_BLOCKED']),
        next: 'Recargar balance CJ; el ciclo reintenta con cooldown para evitar llamadas repetidas.',
      },
      {
        id: 'tracking',
        label: 'Tracking',
        ok: sumStatuses(countsByStatus, ['TRACKING_ON_SHOPIFY', 'COMPLETED']),
        pending: sumStatuses(countsByStatus, ['CJ_FULFILLING', 'CJ_SHIPPED']),
        blocked: openAlerts.filter((alert) => alert.type === CJ_SHOPIFY_USA_ALERT_TYPE.TRACKING_MISSING).length,
        next: 'Sincronizar guía CJ y notificar a Shopify.',
      },
      {
        id: 'complete',
        label: 'Completado',
        ok: countsByStatus.COMPLETED ?? 0,
        pending: 0,
        blocked: 0,
        next: 'Orden cerrada con tracking o fulfillment confirmado.',
      },
    ];
    const ordersNeedingAttention = sumStatuses(countsByStatus, ['FAILED', 'NEEDS_MANUAL', 'SUPPLIER_PAYMENT_BLOCKED']);
    const activeQueue = sumStatuses(countsByStatus, ['VALIDATED', 'SUPPLIER_PAYMENT_BLOCKED', 'CJ_ORDER_PLACING', 'CJ_ORDER_PLACED', 'CJ_ORDER_CREATED', 'CJ_ORDER_CONFIRMING', 'CJ_ORDER_CONFIRMED', 'CJ_PAYMENT_PENDING', 'CJ_PAYMENT_PROCESSING', 'CJ_PAYMENT_COMPLETED', 'CJ_FULFILLING', 'CJ_SHIPPED']);
    const queueCanRun = sumStatuses(countsByStatus, ['VALIDATED', 'SUPPLIER_PAYMENT_BLOCKED']) > 0;
    const recommendedAction = queueCanRun
      ? {
          key: 'queue',
          label: 'Procesar cola post venta',
          description: 'Compra/reintenta en CJ solo órdenes pagadas y validadas; si falta saldo, quedan esperando.',
        }
      : activeQueue > 0
        ? {
            key: 'tracking',
            label: 'Sincronizar tracking CJ',
            description: 'Busca guías disponibles y actualiza Shopify cuando CJ ya haya enviado.',
          }
        : {
            key: 'sync',
            label: 'Sincronizar órdenes Shopify',
            description: 'Importa pagos recientes y detecta nuevas órdenes para iniciar el ciclo post venta.',
          };

    res.json({
      ok: true,
      countsByStatus,
      stages,
      totals: {
        orders: Object.values(countsByStatus).reduce((sum, count) => sum + count, 0),
        activeQueue,
        waitingPayment: sumStatuses(countsByStatus, ['WAITING_PAYMENT', 'DETECTED']),
        needsAttention: ordersNeedingAttention,
        ordersNeedingAttention,
        openAlerts: openAlerts.length,
        completed: countsByStatus.COMPLETED ?? 0,
        traceSignals72h: recentTraceCount,
      },
      health: {
        lastOrder,
        lastTracking,
        openAlerts: openAlerts.length,
        queueCanRun,
      },
      recommendedAction,
      recentOrders,
      recentEvents,
      openAlerts,
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /post-sale/run-safe-queue ────────────────────────────────────────────
router.post('/post-sale/run-safe-queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const orders = await prisma.cjShopifyUsaOrder.findMany({
      where: {
        userId,
        status: {
          in: [
            CJ_SHOPIFY_USA_ORDER_STATUS.VALIDATED,
            CJ_SHOPIFY_USA_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
          ],
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 10,
      select: { id: true, status: true },
    });

    const processed: Array<{ orderId: string; ok: boolean; status?: string; message?: string }> = [];
    let stoppedForBalance = false;
    for (const order of orders) {
      try {
        const result = await cjShopifyUsaOrderIngestService.processOrder({ userId, orderId: order.id });
        processed.push({ orderId: order.id, ok: true, status: result.status });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        processed.push({ orderId: order.id, ok: false, message });
        if (/balance|insufficient|saldo|funds|supplier payment/i.test(message)) {
          stoppedForBalance = true;
          break;
        }
      }
    }
    const tracking = await cjShopifyUsaOrderIngestService.autoSyncAllTracking(userId);
    res.json({
      ok: true,
      checked: orders.length,
      processed,
      stoppedForBalance,
      tracking,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
