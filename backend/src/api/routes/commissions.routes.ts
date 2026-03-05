import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { commissionService } from '../../services/commission.service';
import { z } from 'zod';
// CommissionStatus no existe como enum, usar string

const router = Router();
router.use(authenticate);

// Resolver environment: query param sandbox | production | all. Default production (solo datos production).
function resolveEnvironment(query: Record<string, unknown>): 'sandbox' | 'production' | undefined {
  const env = (query.environment as string)?.toLowerCase();
  if (env === 'all') return undefined;
  if (env === 'sandbox' || env === 'production') return env;
  return 'production'; // default: solo production
}

// GET /api/commissions - Listar comisiones
router.get('/', async (req: Request, res: Response, next) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const status = req.query.status as string | undefined;
    const environment = resolveEnvironment(req.query);
    const commissions = await commissionService.getCommissions(userId, status, environment);
    
    const { toNumber } = await import('../../utils/decimal.utils');
    // ✅ Mapear datos del backend al formato esperado por el frontend (amount como número)
    const mappedCommissions = commissions.map((commission: any) => ({
      id: String(commission.id),
      saleId: String(commission.saleId),
      productTitle: commission.sale?.product?.title || 'Unknown Product',
      marketplace: commission.sale?.marketplace || 'unknown',
      amount: toNumber(commission.amount),
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
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const environment = resolveEnvironment(req.query);
    const stats = await commissionService.getCommissionStats(userId ? String(userId) : undefined, environment);
    
    // ✅ Mapear estadísticas al formato esperado por el frontend (montos en dólares, no conteos)
    const mappedStats = {
      totalPending: Number(stats.pendingAmount) || 0,
      totalPaid: Number(stats.paidAmount) || 0,
      totalCommissions: Number(stats.totalAmount) || 0,
      nextPayoutDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // TODO: Calcular desde scheduledAt
      monthlyEarnings: Number(stats.paidAmount) || 0,
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
    // ✅ P0.1: Validar ownership antes de retornar comisión
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const commission = await commissionService.getCommissionById(Number(req.params.id), userId, isAdmin);
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
    // ✅ P0.1: Admin puede programar cualquier comisión
    const commission = await commissionService.scheduleCommission(Number(req.params.id), new Date(scheduledDate), req.user?.userId, true);
    res.json(commission);
  } catch (error: any) {
    next(error);
  }
});

// POST /api/commissions/:id/pay - Marcar como pagada (admin)
router.post('/:id/pay', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const { paypalTransactionId } = req.body;
    // ✅ P0.1: Admin puede marcar como pagada cualquier comisión
    const commission = await commissionService.markAsPaid(Number(req.params.id), paypalTransactionId, req.user?.userId, true);
    res.json(commission);
  } catch (error) {
    next(error);
  }
});

// POST /api/commissions/batch-pay - Pago lote (admin)
router.post('/batch-pay', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const schema = z.object({
      commissionIds: z.array(z.number().int().positive()),
      paypalBatchId: z.string().optional(),
    });
    const { commissionIds, paypalBatchId } = schema.parse(req.body);
    // ✅ P0.1: Admin puede pagar cualquier comisión en lote
    const result = await commissionService.batchPayCommissions(commissionIds, paypalBatchId, req.user?.userId, true);
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// POST /api/commissions/request-payout - Solicitar pago de comisiones pendientes (solo production por defecto)
router.post('/request-payout', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const environment = (req.body?.environment as string)?.toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
    // Obtener comisiones pendientes del usuario (mismo entorno que la página)
    const pendingCommissions = await commissionService.getCommissions(userId, 'PENDING', environment);
    
    if (pendingCommissions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay comisiones pendientes para solicitar pago'
      });
    }

    // Calcular total pendiente
    const totalAmount = pendingCommissions.reduce((sum: number, comm: any) => sum + (comm.amount || 0), 0);

    // Marcar comisiones como SCHEDULED (programadas para pago)
    const commissionIds = pendingCommissions.map((c: any) => c.id);
    const nextPayoutDate = new Date();
    nextPayoutDate.setDate(nextPayoutDate.getDate() + 7); // Pago en 7 días

    for (const comm of pendingCommissions) {
      // ✅ P0.1: Usuario solo puede programar sus propias comisiones
      await commissionService.scheduleCommission(comm.id, nextPayoutDate, userId, false);
    }

    res.json({
      success: true,
      message: 'Payout request submitted successfully',
      data: {
        commissionCount: pendingCommissions.length,
        totalAmount,
        scheduledDate: nextPayoutDate.toISOString(),
        commissionIds
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/commissions/payout-schedule - Obtener programación de pagos (formato esperado por frontend: date, amount, count, status)
router.get('/payout-schedule', async (req: Request, res: Response, next) => {
  try {
    const { toNumber } = await import('../../utils/decimal.utils');
    const userId = req.user!.role === 'ADMIN' ? undefined : req.user!.userId;
    const environment = resolveEnvironment(req.query);
    const scheduledCommissions = await commissionService.getCommissions(userId, 'SCHEDULED', environment);

    const schedule = scheduledCommissions.map((comm: any) => ({
      date: comm.scheduledAt?.toISOString() ?? new Date().toISOString(),
      amount: toNumber(comm.amount),
      count: 1,
      status: 'scheduled' as const
    }));

    res.json({
      success: true,
      schedule,
      totalAmount: schedule.reduce((sum: number, s: any) => sum + s.amount, 0),
      count: schedule.length
    });
  } catch (error) {
    next(error);
  }
});

export default router;
