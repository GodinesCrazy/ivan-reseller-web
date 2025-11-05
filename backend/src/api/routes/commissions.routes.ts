import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { commissionService } from '../../services/commission.service';
import { z } from 'zod';
import { CommissionStatus } from '@prisma/client';

const router = Router();
router.use(authenticate);

// GET /api/commissions - Listar comisiones
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
    const status = req.query.status as CommissionStatus | undefined;
    const commissions = await commissionService.getCommissions(userId, status);
    
    // ✅ Mapear datos del backend al formato esperado por el frontend
    const mappedCommissions = commissions.map((commission: any) => ({
      id: String(commission.id),
      saleId: String(commission.saleId),
      productTitle: commission.sale?.product?.title || 'Unknown Product',
      marketplace: commission.sale?.marketplace || 'unknown',
      amount: commission.amount,
      status: commission.status,
      paymentDate: commission.paidAt?.toISOString() || null,
      createdAt: commission.createdAt?.toISOString() || new Date().toISOString()
    }));
    
    res.json({ commissions: mappedCommissions });
  } catch (error) {
    next(error);
  }
});

// GET /api/commissions/stats - Estadísticas
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
    const stats = await commissionService.getCommissionStats(userId);
    
    // ✅ Mapear estadísticas al formato esperado por el frontend
    const mappedStats = {
      totalPending: stats.pending || stats.pendingCount || 0,
      totalPaid: stats.paid || stats.paidCount || 0,
      totalCommissions: stats.total || stats.totalCount || 0,
      nextPayoutDate: stats.nextPayoutDate?.toISOString() || stats.nextScheduledDate?.toISOString() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      monthlyEarnings: stats.monthlyEarnings || stats.totalPaidAmount || stats.paidAmount || 0,
      earningsChange: 0 // TODO: Calcular cambio de ganancias
    };
    
    res.json(mappedStats);
  } catch (error) {
    next(error);
  }
});

// GET /api/commissions/balance - Balance del usuario
router.get('/balance', async (req: Request, res: Response, next) => {
  try {
    const balance = await commissionService.getUserBalance(req.user!.userId);
    res.json(balance);
  } catch (error) {
    next(error);
  }
});

// GET /api/commissions/:id - Obtener por ID
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const commission = await commissionService.getCommissionById(req.params.id);
    res.json(commission);
  } catch (error) {
    next(error);
  }
});

// POST /api/commissions/:id/schedule - Programar pago (admin)
router.post('/:id/schedule', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const schema = z.object({ scheduledDate: z.string().datetime() });
    const { scheduledDate } = schema.parse(req.body);
    const commission = await commissionService.scheduleCommission(req.params.id, new Date(scheduledDate));
    res.json(commission);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    next(error);
  }
});

// POST /api/commissions/:id/pay - Marcar como pagada (admin)
router.post('/:id/pay', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const { paypalTransactionId } = req.body;
    const commission = await commissionService.markAsPaid(req.params.id, paypalTransactionId);
    res.json(commission);
  } catch (error) {
    next(error);
  }
});

// POST /api/commissions/batch-pay - Pago lote (admin)
router.post('/batch-pay', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const schema = z.object({
      commissionIds: z.array(z.string().uuid()),
      paypalBatchId: z.string().optional(),
    });
    const { commissionIds, paypalBatchId } = schema.parse(req.body);
    const result = await commissionService.batchPayCommissions(commissionIds, paypalBatchId);
    res.json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    next(error);
  }
});

export default router;
