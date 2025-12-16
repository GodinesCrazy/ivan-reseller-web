/**
 * ✅ PRODUCTION READY: Request Logger Middleware
 * 
 * Middleware para logging estructurado de requests
 * Incluye correlation ID y métricas de performance
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || 'unknown';

  // Log request inicio
  logger.info('HTTP Request', {
    correlationId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: (req as any).user?.userId,
  });

  // Interceptar res.end para loggear respuesta
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info('HTTP Response', {
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.userId,
    });

    // Log warning para requests lentos (> 1 segundo)
    if (duration > 1000) {
      logger.warn('Slow Request', {
        correlationId,
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        threshold: '1000ms',
      });
    }

    // Restaurar función original
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

