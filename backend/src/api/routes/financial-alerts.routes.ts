import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { financialAlertsService } from '../../services/financial-alerts.service';

const router = Router();
router.use(authenticate);

// ✅ GET /api/financial-alerts/check - Ejecutar todas las verificaciones (Admin only)
router.get('/check', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const results = await financialAlertsService.runAllChecks();
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/financial-alerts/negative-balances - Verificar balances negativos (Admin only)
router.get('/negative-balances', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const result = await financialAlertsService.checkNegativeBalances();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/financial-alerts/high-commissions - Verificar comisiones acumuladas (Admin only)
router.get('/high-commissions', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const threshold = parseFloat(req.query.threshold as string) || 100;
    const result = await financialAlertsService.checkAccumulatedCommissions(threshold);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/financial-alerts/low-capital - Verificar capital bajo (Admin only)
router.get('/low-capital', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const thresholdPercent = parseFloat(req.query.thresholdPercent as string) || 20;
    const result = await financialAlertsService.checkLowWorkingCapital(thresholdPercent);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/financial-alerts/inactive-users - Verificar usuarios inactivos (Admin only)
router.get('/inactive-users', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const daysThreshold = parseInt(req.query.daysThreshold as string) || 30;
    const result = await financialAlertsService.checkInactiveUsers(daysThreshold);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/financial-alerts/churn-risk - Verificar riesgo de churn (Admin only)
router.get('/churn-risk', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const minSalesThreshold = parseInt(req.query.minSalesThreshold as string) || 2;
    const result = await financialAlertsService.checkChurnRisk(minSalesThreshold);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

export default router;

