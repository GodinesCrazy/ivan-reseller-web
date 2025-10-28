import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { saleService } from '../../services/sale.service';
import { z } from 'zod';
import { SaleStatus } from '@prisma/client';

const router = Router();
router.use(authenticate);

const createSaleSchema = z.object({
  orderId: z.string().min(3),
  productId: z.string().uuid(),
  marketplace: z.string(),
  salePrice: z.number().positive(),
  costPrice: z.number().positive(),
  platformFees: z.number().optional(),
  currency: z.string().default('USD'),
  buyerEmail: z.string().email().optional(),
  shippingAddress: z.string().optional(),
});

// GET /api/sales - Listar ventas
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
    const status = req.query.status as SaleStatus | undefined;
    const sales = await saleService.getSales(userId, status);
    res.json({ sales });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/stats - Estadísticas
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
    const stats = await saleService.getSalesStats(userId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/:id - Obtener por ID
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const sale = await saleService.getSaleById(req.params.id);
    res.json(sale);
  } catch (error) {
    next(error);
  }
});

// POST /api/sales - Crear venta
router.post('/', async (req: Request, res: Response, next) => {
  try {
    const data = createSaleSchema.parse(req.body);
    const sale = await saleService.createSale(req.user!.userId, data);
    res.status(201).json(sale);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    next(error);
  }
});

// PATCH /api/sales/:id/status - Actualizar estado (admin)
router.patch('/:id/status', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const sale = await saleService.updateSaleStatus(req.params.id, status);
    res.json(sale);
  } catch (error) {
    next(error);
  }
});

export default router;
