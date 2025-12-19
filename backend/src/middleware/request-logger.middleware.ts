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

  // ✅ FIX: Use 'finish' event instead of intercepting res.end to avoid ERR_HTTP_HEADERS_SENT
  // This ensures logging happens after response is fully sent, without interfering with headers
  res.once('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log response (safe to do after finish, no header manipulation)
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
  });

  // ✅ FIX: Also handle 'close' event for cases where connection closes before finish
  res.once('close', () => {
    // Only log if finish event didn't fire (connection closed early)
    if (!res.writableEnded) {
      const duration = Date.now() - startTime;
      logger.warn('HTTP Request Closed Early', {
        correlationId,
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
      });
    }
  });

  next();
};

