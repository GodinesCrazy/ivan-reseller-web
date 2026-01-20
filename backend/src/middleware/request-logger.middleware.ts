/**
 * ✅ PRODUCTION READY: Request Logger Middleware
 * 
 * Middleware para logging estructurado de requests
 * Incluye correlation ID, métricas de performance y memoria
 * 
 * ✅ FIX SIGSEGV: Agregado tracing robusto con memoria y duración
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Helper para obtener memoria en MB
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
    external: Math.round(usage.external / 1024 / 1024),
    unit: 'MB'
  };
}

export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || 'unknown';
  const memoryStart = getMemoryUsage();

  // ✅ FIX SIGSEGV: Log request inicio con memoria
  logger.info('HTTP Request Start', {
    correlationId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: (req as any).user?.userId,
    memory: memoryStart,
  });

  // ✅ HOTFIX: Use 'finish' event instead of intercepting res.end to avoid ERR_HTTP_HEADERS_SENT
  // This ensures logging happens after response is fully sent, without interfering with headers
  // CRITICAL: NEVER call res.setHeader/res.status/res.json in these callbacks
  res.once('finish', () => {
    try {
      const duration = Date.now() - startTime;
      const memoryEnd = getMemoryUsage();
      const memoryDelta = {
        heapUsed: memoryEnd.heapUsed - memoryStart.heapUsed,
        heapTotal: memoryEnd.heapTotal - memoryStart.heapTotal,
        rss: memoryEnd.rss - memoryStart.rss,
        unit: 'MB'
      };
      
      // ✅ FIX SIGSEGV: Log response con memoria y duración
      logger.info('HTTP Response', {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode, // ✅ READ ONLY - never modify
        duration: `${duration}ms`,
        durationMs: duration,
        userId: (req as any).user?.userId,
        memory: {
          start: memoryStart,
          end: memoryEnd,
          delta: memoryDelta
        }
      });

      // ✅ FIX SIGSEGV: Log warning para requests lentos (> 2 segundos) con memoria
      if (duration > 2000) {
        logger.warn('Slow Request (>2s)', {
          correlationId,
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          durationMs: duration,
          threshold: '2000ms',
          memory: {
            start: memoryStart,
            end: memoryEnd,
            delta: memoryDelta
          },
          userId: (req as any).user?.userId,
        });
      }
    } catch (error) {
      // Silently ignore logging errors to prevent crashes
      // This should never happen, but defensive programming
    }
  });

  // ✅ HOTFIX: Also handle 'close' event for cases where connection closes before finish
  res.once('close', () => {
    try {
      // Only log if finish event didn't fire (connection closed early)
      if (!res.writableEnded) {
        const duration = Date.now() - startTime;
        const memoryEnd = getMemoryUsage();
        logger.warn('HTTP Request Closed Early', {
          correlationId,
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          memory: {
            start: memoryStart,
            end: memoryEnd
          }
        });
      }
    } catch (error) {
      // Silently ignore logging errors
    }
  });

  next();
};

