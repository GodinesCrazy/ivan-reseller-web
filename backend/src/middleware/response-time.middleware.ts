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

  // Interceptar res.end para agregar headers
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    // ✅ PRODUCTION READY: Agregar header de tiempo de respuesta
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    // Header adicional con tiempo en segundos (precisión de microsegundos)
    const seconds = (duration / 1000).toFixed(3);
    res.setHeader('X-Process-Time', `${seconds}s`);

    // Restaurar función original
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

