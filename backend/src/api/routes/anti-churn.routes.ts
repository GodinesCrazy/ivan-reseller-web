import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { antiChurnService } from '../../services/anti-churn.service';

const router = Router();
router.use(authenticate);

// ✅ GET /api/anti-churn/at-risk - Identificar usuarios en riesgo (Admin only)
router.get('/at-risk', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const atRiskUsers = await antiChurnService.identifyAtRiskUsers();
    res.json({
      success: true,
      data: atRiskUsers
    });
  } catch (error) {
    next(error);
  }
});

// ✅ POST /api/anti-churn/intervene - Intervenir con usuarios en riesgo (Admin only)
router.post('/intervene', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const result = await antiChurnService.interveneWithAtRiskUsers();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ✅ POST /api/anti-churn/onboarding/:userId - Mejorar onboarding para usuario (Admin only)
router.post('/onboarding/:userId', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const userId = parseInt(req.params.userId);
    await antiChurnService.improveOnboarding(userId);
    res.json({
      success: true,
      message: 'Onboarding improved for user'
    });
  } catch (error) {
    next(error);
  }
});

export default router;

