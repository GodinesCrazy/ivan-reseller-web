import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { businessMetricsService } from '../../services/business-metrics.service';

const router = Router();
router.use(authenticate);

// ✅ GET /api/business-metrics/all - Obtener todas las métricas (Admin only)
router.get('/all', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const metrics = await businessMetricsService.getAllMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/mrr - Calcular MRR (Admin only)
router.get('/mrr', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const mrr = await businessMetricsService.calculateMRR();
    res.json({
      success: true,
      data: mrr
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/arr - Calcular ARR (Admin only)
router.get('/arr', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const arr = await businessMetricsService.calculateARR();
    res.json({
      success: true,
      data: { arr }
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/ltv - Calcular LTV (Admin only)
router.get('/ltv', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const ltv = await businessMetricsService.calculateLTV(userId);
    res.json({
      success: true,
      data: ltv
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/churn-rate - Calcular Churn Rate (Admin only)
router.get('/churn-rate', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const period = (req.query.period as 'monthly' | 'annual') || 'monthly';
    const churnRate = await businessMetricsService.calculateChurnRate(period);
    res.json({
      success: true,
      data: churnRate
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/cac - Calcular CAC (Admin only)
router.get('/cac', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const cac = await businessMetricsService.calculateCAC();
    res.json({
      success: true,
      data: cac
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/rpu - Calcular Revenue per User (Admin only)
router.get('/rpu', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const rpu = await businessMetricsService.calculateRPU();
    res.json({
      success: true,
      data: rpu
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/gross-margin - Calcular Gross Margin (Admin only)
router.get('/gross-margin', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const estimatedCosts = req.query.estimatedCosts ? parseFloat(req.query.estimatedCosts as string) : undefined;
    const grossMargin = await businessMetricsService.calculateGrossMargin(estimatedCosts);
    res.json({
      success: true,
      data: grossMargin
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/business-metrics/cohorts - Análisis de Cohortes (Admin only)
router.get('/cohorts', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const cohorts = await businessMetricsService.analyzeCohorts();
    res.json({
      success: true,
      data: cohorts
    });
  } catch (error) {
    next(error);
  }
});

export default router;

