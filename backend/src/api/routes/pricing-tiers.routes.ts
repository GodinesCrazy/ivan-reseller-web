import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { pricingTiersService, PlanType } from '../../services/pricing-tiers.service';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ✅ GET /api/pricing-tiers/plans - Obtener todos los planes disponibles
router.get('/plans', async (req: Request, res: Response, next) => {
  try {
    const plans = pricingTiersService.getAvailablePlans();
    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/pricing-tiers/plans/:planId - Obtener plan específico
router.get('/plans/:planId', async (req: Request, res: Response, next) => {
  try {
    const planId = req.params.planId.toUpperCase() as PlanType;
    const plan = pricingTiersService.getPlan(planId);
    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/pricing-tiers/user/me - Obtener plan actual del usuario
router.get('/user/me', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const planInfo = await pricingTiersService.getUserPlan(userId);
    res.json({
      success: true,
      data: planInfo
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/pricing-tiers/user/:userId - Obtener plan de usuario específico (Admin only)
router.get('/user/:userId', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const planInfo = await pricingTiersService.getUserPlan(userId);
    res.json({
      success: true,
      data: planInfo
    });
  } catch (error) {
    next(error);
  }
});

// ✅ POST /api/pricing-tiers/assign - Asignar plan a usuario (Admin only)
router.post('/assign', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const schema = z.object({
      userId: z.number(),
      planType: z.enum(['BASIC', 'PRO', 'ENTERPRISE'])
    });

    const { userId, planType } = schema.parse(req.body);
    const adminId = req.user!.userId;

    const result = await pricingTiersService.assignPlanToUser(adminId, userId, planType);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/pricing-tiers/savings/:userId/:targetPlan - Calcular ahorros potenciales
router.get('/savings/:userId/:targetPlan', async (req: Request, res: Response, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const targetPlan = req.params.targetPlan.toUpperCase() as PlanType;

    // Verificar que el usuario puede ver estos datos
    if (req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const savings = await pricingTiersService.calculateSavings(userId, targetPlan);
    res.json({
      success: true,
      data: savings
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/pricing-tiers/recommend/:userId - Recomendar plan para usuario
router.get('/recommend/:userId', async (req: Request, res: Response, next) => {
  try {
    const userId = parseInt(req.params.userId);

    // Verificar que el usuario puede ver estos datos
    if (req.user!.role !== 'ADMIN' && req.user!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const recommendedPlan = await pricingTiersService.recommendPlan(userId);
    res.json({
      success: true,
      data: { recommendedPlan }
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/pricing-tiers/statistics - Estadísticas de planes (Admin only)
router.get('/statistics', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const stats = await pricingTiersService.getPlanStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

export default router;

