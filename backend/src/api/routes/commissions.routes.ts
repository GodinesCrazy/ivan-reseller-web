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
    res.json({ commissions });
  } catch (error) {
    next(error);
  }
});

// GET /api/commissions/stats - Estadísticas
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
    const stats = await commissionService.getCommissionStats(userId);
    res.json(stats);
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
