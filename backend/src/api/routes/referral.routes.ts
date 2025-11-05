import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { referralService } from '../../services/referral.service';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ✅ GET /api/referral/code - Obtener código de referido del usuario
router.get('/code', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const referralCode = await referralService.generateReferralCode(userId);
    res.json({
      success: true,
      data: { referralCode }
    });
  } catch (error) {
    next(error);
  }
});

// ✅ POST /api/referral/register - Registrar referido (usado durante registro)
router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const schema = z.object({
      referralCode: z.string(),
      userId: z.number()
    });

    const { referralCode, userId } = schema.parse(req.body);
    const result = await referralService.registerReferral(referralCode, userId);
    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/referral/stats - Obtener estadísticas de referidos del usuario
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const stats = await referralService.getReferralStats(userId);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/referral/stats/:userId - Obtener estadísticas de usuario específico (Admin only)
router.get('/stats/:userId', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const stats = await referralService.getReferralStats(userId);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/referral/global - Estadísticas globales de referidos (Admin only)
router.get('/global', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const stats = await referralService.getGlobalReferralStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// ✅ POST /api/referral/validate - Validar código de referido
router.post('/validate', async (req: Request, res: Response, next) => {
  try {
    const schema = z.object({
      referralCode: z.string()
    });

    const { referralCode } = schema.parse(req.body);
    const validation = await referralService.validateReferralCode(referralCode);
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    next(error);
  }
});

export default router;

