/**
 * Orders Routes - GET /api/orders, GET /api/orders/:id
 * Post-sale dropshipping orders (PayPal ? AliExpress fulfillment)
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import logger from '../../config/logger';

const router = Router();

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

export default router;
