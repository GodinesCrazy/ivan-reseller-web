import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { revenueChangeService } from '../../services/revenue-change.service';

const router = Router();
router.use(authenticate);

// ✅ GET /api/revenue-change/calculate - Calcular cambios de ingresos/ganancias
router.get('/calculate', async (req: Request, res: Response, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const period = (req.query.period as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly') || 'monthly';

    // Verificar permisos)
    if (userId && req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const changes = await revenueChangeService.calculateRevenueChanges(userId, period);
    res.json({
      success: true,
      data: changes
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/revenue-change/multi-period - Comparación de múltiples períodos
router.get('/multi-period', async (req: Request, res: Response, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const periods = req.query.periods ? parseInt(req.query.periods as string) : 6;

    // Verificar permisos
    if (userId && req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const comparison = await revenueChangeService.getMultiPeriodComparison(userId, periods);
    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    next(error);
  }
});

export default router;

