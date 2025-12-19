/**
 * ✅ PRODUCTION READY: Response Time Middleware
 * 
 * Middleware para agregar headers de tiempo de respuesta
 * Útil para monitoreo y debugging
 */

import { Request, Response, NextFunction } from 'express';

export const responseTimeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // ✅ FIX: Set headers BEFORE response is sent (on first write or finish)
  // Use 'finish' event instead of intercepting res.end to avoid ERR_HTTP_HEADERS_SENT
  res.once('finish', () => {
    // Only set headers if not already sent (safety check)
    if (!res.headersSent) {
      const duration = Date.now() - startTime;
      try {
        res.setHeader('X-Response-Time', `${duration}ms`);
        const seconds = (duration / 1000).toFixed(3);
        res.setHeader('X-Process-Time', `${seconds}s`);
      } catch (error) {
        // Headers already sent, ignore silently
      }
    }
  });

  // ✅ FIX: Also set headers early if possible (before first write)
  // This ensures headers are set even if response finishes quickly
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let headersSet = false;

  res.write = function(chunk?: any, encoding?: any, cb?: any): boolean {
    if (!headersSet && !res.headersSent) {
      const duration = Date.now() - startTime;
      try {
        res.setHeader('X-Response-Time', `${duration}ms`);
        const seconds = (duration / 1000).toFixed(3);
        res.setHeader('X-Process-Time', `${seconds}s`);
        headersSet = true;
      } catch (error) {
        // Ignore if headers already sent
      }
    }
    return originalWrite.call(this, chunk, encoding, cb);
  };

  res.end = function(chunk?: any, encoding?: any, cb?: any): Response {
    if (!headersSet && !res.headersSent) {
      const duration = Date.now() - startTime;
      try {
        res.setHeader('X-Response-Time', `${duration}ms`);
        const seconds = (duration / 1000).toFixed(3);
        res.setHeader('X-Process-Time', `${seconds}s`);
        headersSet = true;
      } catch (error) {
        // Ignore if headers already sent
      }
    }
    return originalEnd.call(this, chunk, encoding, cb) as Response;
  };

  next();
};

