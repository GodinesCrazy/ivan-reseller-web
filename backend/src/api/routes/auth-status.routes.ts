import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { marketplaceAuthStatusService } from '../../services/marketplace-auth-status.service';
import ManualAuthService from '../../services/manual-auth.service';
import { aliExpressAuthMonitor } from '../../services/ali-auth-monitor.service';
import { handleSetupCheck } from '../../utils/setup-check';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || 'unknown';
  const memoryStart = {
    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    unit: 'MB'
  };
  
  // ✅ FIX AUTH: Detectar presencia de cookies
  const hasCookies = !!req.headers.cookie;
  const cookieHeader = req.headers.cookie ? 'cookie_present' : 'cookie_missing';
  const cookieCount = req.headers.cookie ? req.headers.cookie.split(';').length : 0;
  
  try {
    // ✅ FIX SIGSEGV + AUTH: Log inicio con memoria y cookies
    logger.info('[Auth Status] Request start', {
      correlationId,
      userId: req.user?.userId,
      memory: memoryStart,
      safeMode: env.SAFE_AUTH_STATUS_MODE,
      cookieStatus: cookieHeader,
      cookieCount,
      hasCookies,
      origin: req.headers.origin,
      referer: req.headers.referer,
    });
    
    const userId = req.user?.userId;
    if (!userId) {
      logger.warn('[Auth Status] No userId - unauthenticated request', {
        correlationId,
        cookieStatus: cookieHeader,
        hasCookies,
      });
      return res.status(401).json({ success: false, error: 'Authentication required', correlationId });
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

    // ✅ FIX SIGSEGV: Obtener statuses de forma resiliente - SOLO desde DB/cache, NO checks activos
    let statuses: any[] = [];
    try {
      // ✅ FIX SIGSEGV: En SAFE_AUTH_STATUS_MODE, solo leer de DB/cache persistido
      // NO ejecutar checks activos que puedan causar SIGSEGV
      if (env.SAFE_AUTH_STATUS_MODE) {
        logger.info('[Auth Status] SAFE_AUTH_STATUS_MODE enabled - reading from DB only', {
          correlationId,
          userId
        });
        // Solo leer de DB - marketplaceAuthStatusService.listByUser solo lee de DB, no hace checks
        statuses = await marketplaceAuthStatusService.listByUser(userId);
        if (!Array.isArray(statuses)) {
          logger.warn('[Auth Status] listByUser returned non-array', {
            correlationId,
            userId,
            type: typeof statuses
          });
          statuses = [];
        }
      } else {
        // Modo normal: leer de DB (pero aún no hacer checks activos desde este endpoint)
        statuses = await marketplaceAuthStatusService.listByUser(userId);
        if (!Array.isArray(statuses)) {
          logger.warn('[Auth Status] listByUser returned non-array', {
            correlationId,
            userId,
            type: typeof statuses
          });
          statuses = [];
        }
      }
    } catch (statusError: any) {
      logger.warn('[Auth Status] Failed to get marketplace statuses', {
        correlationId,
        userId,
        error: statusError?.message || String(statusError),
        stack: statusError?.stack
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

    const duration = Date.now() - startTime;
    const memoryEnd = {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      unit: 'MB'
    };
    const memoryDelta = {
      heapUsed: memoryEnd.heapUsed - memoryStart.heapUsed,
      heapTotal: memoryEnd.heapTotal - memoryStart.heapTotal,
      rss: memoryEnd.rss - memoryStart.rss,
      unit: 'MB'
    };
    
    // ✅ FIX SIGSEGV: Log fin con memoria y duración
    logger.info('[Auth Status] Request completed', {
      correlationId,
      userId: req.user?.userId,
      duration: `${duration}ms`,
      durationMs: duration,
      memory: {
        start: memoryStart,
        end: memoryEnd,
        delta: memoryDelta
      }
    });
    
    // ✅ FIX: Siempre retornar 200 OK si hay sesión válida
    return res.status(200).json({
      success: true,
      data: {
        statuses: payload,
      },
      warnings: setupCheckPassed ? undefined : ['Setup check failed, but auth status is available'],
      _safeMode: env.SAFE_AUTH_STATUS_MODE,
      _timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const memoryEnd = {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      unit: 'MB'
    };
    
    // ✅ FIX SIGSEGV: Manejar errores de forma resiliente - nunca 500 si hay sesión válida
    logger.error('[Auth Status] Unexpected error', {
      correlationId,
      userId: req.user?.userId,
      error: error?.message || String(error),
      stack: error?.stack,
      duration: `${duration}ms`,
      memory: {
        start: memoryStart,
        end: memoryEnd
      }
    });
    
    // Si hay sesión válida, retornar respuesta parcial en lugar de 500
    if (req.user?.userId) {
      return res.status(200).json({
        success: true,
        data: {
          statuses: {},
        },
        warnings: ['Error loading some status information'],
        _safeMode: env.SAFE_AUTH_STATUS_MODE,
        _timestamp: new Date().toISOString()
      });
    }
    
    // Solo retornar error si no hay sesión válida
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      correlationId
    });
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

