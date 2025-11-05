import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { costOptimizationService } from '../../services/cost-optimization.service';

const router = Router();
router.use(authenticate);

// ✅ GET /api/cost-optimization/user/me - Costos del usuario actual
router.get('/user/me', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const period = (req.query.period as 'daily' | 'weekly' | 'monthly') || 'monthly';
    const costs = await costOptimizationService.calculateUserCosts(userId, period);
    res.json({
      success: true,
      data: costs
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/cost-optimization/user/:userId - Costos de usuario específico (Admin only)
router.get('/user/:userId', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const period = (req.query.period as 'daily' | 'weekly' | 'monthly') || 'monthly';
    const costs = await costOptimizationService.calculateUserCosts(userId, period);
    res.json({
      success: true,
      data: costs
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/cost-optimization/total - Costos totales del sistema (Admin only)
router.get('/total', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const period = (req.query.period as 'daily' | 'weekly' | 'monthly') || 'monthly';
    const costs = await costOptimizationService.calculateTotalCosts(period);
    res.json({
      success: true,
      data: costs
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/cost-optimization/alerts - Verificar alertas de costos (Admin only)
router.get('/alerts', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const thresholdPercent = parseFloat(req.query.thresholdPercent as string) || 30;
    const alerts = await costOptimizationService.checkCostAlerts(thresholdPercent);
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/cost-optimization/recommendations - Recomendaciones de optimización
router.get('/recommendations', async (req: Request, res: Response, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    
    // Verificar permisos
    if (userId && req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const recommendations = await costOptimizationService.getOptimizationRecommendations(userId);
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    next(error);
  }
});

export default router;

