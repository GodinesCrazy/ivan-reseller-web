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
      message: 'INTERNAL_RUN_SECRET no está configurado',
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
      message: 'Secret inválido o faltante',
    });
    return;
  }

  next();
}

router.post('/run-ebay-cycle', validateInternalSecret, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || `internal-${Date.now()}`;

  logger.info('[INTERNAL] Ejecutando ciclo real de eBay', {
    correlationId,
    ip: req.ip,
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

export default router;
