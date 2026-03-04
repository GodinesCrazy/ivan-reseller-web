/**
 * Orders Routes - GET /api/orders, GET /api/orders/:id, POST /api/orders/:id/retry-fulfill
 * Post-sale dropshipping orders (PayPal ? AliExpress fulfillment)
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import logger from '../../config/logger';
import { authenticate } from '../../middleware/auth.middleware';
import { orderFulfillmentService } from '../../services/order-fulfillment.service';
import { hasSufficientFreeCapital } from '../../services/working-capital.service';
import { toNumber } from '../../utils/decimal.utils';

const router = Router();

const FAILED_INSUFFICIENT_FUNDS = 'FAILED_INSUFFICIENT_FUNDS';
const MAX_RETRIES = 3;

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId as number | undefined;
    const orders = await prisma.order.findMany({
      where: userId ? {} : {}, // TODO: add userId to Order and filter by it
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.status(200).json(orders);
  } catch (err: any) {
    logger.error('[ORDERS] List failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Failed to list orders' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.status(200).json(order);
  } catch (err: any) {
    logger.error('[ORDERS] Get failed', { error: err?.message, id: req.params.id });
    return res.status(500).json({ error: err?.message || 'Failed to get order' });
  }
});

/**
 * POST /api/orders/:id/retry-fulfill
 * Retry fulfillment for an order that failed due to insufficient funds.
 * Requires authentication. Order must be FAILED with FAILED_INSUFFICIENT_FUNDS and fulfillRetryCount < 3.
 */
router.post('/:id/retry-fulfill', authenticate, async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const userId = (req as any).user?.userId as number | undefined;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status !== 'FAILED') {
      return res.status(400).json({
        error: 'Order is not in FAILED status',
        status: order.status,
      });
    }
    if (!order.errorMessage?.includes(FAILED_INSUFFICIENT_FUNDS)) {
      return res.status(400).json({
        error: 'Order did not fail due to insufficient funds; retry not applicable',
      });
    }
    if (order.fulfillRetryCount >= MAX_RETRIES) {
      return res.status(400).json({
        error: `Maximum retry count (${MAX_RETRIES}) reached for this order`,
        fulfillRetryCount: order.fulfillRetryCount,
      });
    }
    if (order.userId != null && userId != null && order.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to retry this order' });
    }

    const cost = toNumber(order.price) || 0;
    if (cost <= 0) {
      return res.status(400).json({ error: 'Invalid order price' });
    }
    const capitalCheck = await hasSufficientFreeCapital(cost);
    if (!capitalCheck.sufficient) {
      return res.status(400).json({
        error: 'Insufficient funds to retry. Deposit more to the platform PayPal account.',
        freeWorkingCapital: capitalCheck.freeWorkingCapital,
        required: capitalCheck.required,
      });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        errorMessage: null,
        fulfillRetryCount: order.fulfillRetryCount + 1,
      },
    });

    const fulfillResult = await orderFulfillmentService.fulfillOrder(orderId);
    return res.status(200).json({
      success: fulfillResult.status === 'PURCHASED',
      orderId,
      status: fulfillResult.status,
      error: fulfillResult.error,
      aliexpressOrderId: fulfillResult.aliexpressOrderId,
    });
  } catch (err: any) {
    logger.error('[ORDERS] Retry fulfill failed', { error: err?.message, id: req.params.id });
    return res.status(500).json({ error: err?.message || 'Retry fulfill failed' });
  }
});

export default router;
