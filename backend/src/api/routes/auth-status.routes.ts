import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { marketplaceAuthStatusService } from '../../services/marketplace-auth-status.service';
import ManualAuthService from '../../services/manual-auth.service';
import { aliExpressAuthMonitor } from '../../services/ali-auth-monitor.service';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const statuses = await marketplaceAuthStatusService.listByUser(userId);
    const manualSession = await ManualAuthService.getActiveSession(userId, 'aliexpress');

    const payload: Record<string, any> = {};

    statuses.forEach((status) => {
      payload[status.marketplace] = {
        status: status.status,
        message: status.message,
        requiresManual: status.requiresManual,
        updatedAt: status.updatedAt,
        lastAutomaticAttempt: status.lastAutomaticAttempt,
        lastAutomaticSuccess: status.lastAutomaticSuccess,
      };
    });

    if (!payload.aliexpress) {
      payload.aliexpress = {
        status: 'unknown',
        message: null,
        requiresManual: false,
      };
    }

    payload.aliexpress.manualSession = manualSession
      ? {
          token: manualSession.token,
          loginUrl: `/manual-login/${manualSession.token}`,
          expiresAt: manualSession.expiresAt,
          status: manualSession.status,
        }
      : null;

    return res.json({
      success: true,
      data: {
        statuses: payload,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:marketplace/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { marketplace } = req.params;

    if (marketplace !== 'aliexpress') {
      return res.status(400).json({ success: false, error: 'Marketplace not supported' });
    }

    const result = await aliExpressAuthMonitor.refreshNow(userId, { force: true, reason: 'user-request' });

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

