import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { auditUserConfiguration } from '../../services/config-audit.service';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await auditUserConfiguration(userId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

