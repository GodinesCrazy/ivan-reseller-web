import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { marketplaceAuthStatusService } from '../../services/marketplace-auth-status.service';
import ManualAuthService from '../../services/manual-auth.service';
import { aliExpressAuthMonitor } from '../../services/ali-auth-monitor.service';
import { handleSetupCheck } from '../../utils/setup-check';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // ✅ FIX: Verificar setup de forma resiliente - nunca debe crashear el endpoint
    let setupCheckPassed = true;
    try {
      const shouldStop = await handleSetupCheck(userId, res);
      if (shouldStop) {
        return; // Ya se envió respuesta de setup_required
      }
    } catch (setupError: any) {
      // ✅ FIX: Si setup check falla, loggear pero continuar (no bloquear auth-status)
      logger.warn('[Auth Status] Setup check failed, continuing anyway', {
        userId,
        error: setupError?.message || String(setupError)
      });
      setupCheckPassed = false;
      // Continuar - el endpoint debe responder aunque el setup check falle
    }

    // ✅ FIX: Obtener statuses de forma resiliente
    let statuses: any[] = [];
    try {
      statuses = await marketplaceAuthStatusService.listByUser(userId);
      if (!Array.isArray(statuses)) {
        logger.warn('[Auth Status] listByUser returned non-array', { userId, type: typeof statuses });
        statuses = [];
      }
    } catch (statusError: any) {
      logger.warn('[Auth Status] Failed to get marketplace statuses', {
        userId,
        error: statusError?.message || String(statusError)
      });
      statuses = [];
    }

    // ✅ FIX: Obtener manual session de forma resiliente
    let manualSession = null;
    try {
      manualSession = await ManualAuthService.getActiveSession(userId, 'aliexpress');
    } catch (sessionError: any) {
      logger.warn('[Auth Status] Failed to get manual session', {
        userId,
        error: sessionError?.message || String(sessionError)
      });
      // Continuar sin manual session
    }

    const payload: Record<string, any> = {};

    // ✅ FIX: Validar status antes de procesar
    statuses.forEach((status) => {
      if (!status || !status.marketplace) {
        logger.warn('[Auth Status] Skipping invalid status entry', { userId, status });
        return;
      }
      payload[status.marketplace] = {
        status: status.status || 'unknown',
        message: status.message || null,
        requiresManual: status.requiresManual === true,
        updatedAt: status.updatedAt || null,
        lastAutomaticAttempt: status.lastAutomaticAttempt || null,
        lastAutomaticSuccess: status.lastAutomaticSuccess || null,
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

    // ✅ FIX: Siempre retornar 200 OK si hay sesión válida
    return res.status(200).json({
      success: true,
      data: {
        statuses: payload,
      },
      warnings: setupCheckPassed ? undefined : ['Setup check failed, but auth status is available']
    });
  } catch (error: any) {
    // ✅ FIX: Manejar errores de forma resiliente - nunca 500 si hay sesión válida
    logger.error('[Auth Status] Unexpected error', {
      userId: req.user?.userId,
      error: error?.message || String(error),
      stack: error?.stack
    });
    
    // Si hay sesión válida, retornar respuesta parcial en lugar de 500
    if (req.user?.userId) {
      return res.status(200).json({
        success: true,
        data: {
          statuses: {},
        },
        warnings: ['Error loading some status information']
      });
    }
    
    // Solo retornar error si no hay sesión válida
    return res.status(401).json({ success: false, error: 'Authentication required' });
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

