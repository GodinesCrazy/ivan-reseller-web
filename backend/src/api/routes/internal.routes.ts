import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger';
import { runEbayRealCycle } from '../../scripts/run-ebay-real-cycle';

const router = Router();

const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

if (!INTERNAL_SECRET) {
  logger.warn('[INTERNAL] INTERNAL_RUN_SECRET no configurado - endpoint deshabilitado');
}

function validateInternalSecret(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_SECRET) {
    res.status(503).json({
      success: false,
      error: 'Internal endpoint not configured',
      message: 'INTERNAL_RUN_SECRET no esta configurado',
    });
    return;
  }

  const providedSecret = req.headers['x-internal-secret'];
  if (!providedSecret || providedSecret !== INTERNAL_SECRET) {
    logger.warn('[INTERNAL] Intento de acceso no autorizado', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      hasSecret: !!providedSecret,
    });
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Secret invalido o faltante',
    });
    return;
  }

  next();
}

// ? Health check del endpoint (sin autenticación para verificar que existe)
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Internal routes endpoint is active',
    hasSecret: !!INTERNAL_SECRET,
    routes: ['POST /api/internal/run-ebay-cycle'],
  });
});

// ? Ruta siempre registrada, validación de secret en middleware
router.post('/run-ebay-cycle', validateInternalSecret, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || `internal-${Date.now()}`;

  logger.info('[INTERNAL] POST /api/internal/run-ebay-cycle - Ejecutando ciclo real de eBay', {
    correlationId,
    ip: req.ip,
    path: req.path,
    method: req.method,
  });

  try {
    const result = await runEbayRealCycle();

    const duration = Date.now() - startTime;

    logger.info('[INTERNAL] Ciclo completado', {
      correlationId,
      success: result.success,
      duration: `${duration}ms`,
      listingId: result.data?.listingId,
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
        duration: `${duration}ms`,
        correlationId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Unknown error',
        message: result.message,
        duration: `${duration}ms`,
        correlationId,
      });
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error('[INTERNAL] Error ejecutando ciclo', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error ejecutando ciclo real de eBay',
      duration: `${duration}ms`,
      correlationId,
    });
  }
});

// ? LOG: Registrar rutas al cargar el módulo
const routes = router.stack.map((layer: any) => ({
  path: layer.route?.path,
  method: layer.route?.stack?.[0]?.method?.toUpperCase(),
}));
logger.info('[INTERNAL] Routes registered', {
  routes: routes.filter((r: any) => r.path && r.method),
  totalRoutes: routes.filter((r: any) => r.path && r.method).length,
  hasSecret: !!INTERNAL_SECRET,
});
console.log('[INTERNAL] Routes mounted at /api/internal');
console.log('[INTERNAL]   - GET  /api/internal/health (no auth)');
console.log('[INTERNAL]   - POST /api/internal/run-ebay-cycle (requires x-internal-secret)');

export default router;
