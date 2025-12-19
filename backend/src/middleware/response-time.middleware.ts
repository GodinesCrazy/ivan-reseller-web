/**
 * ✅ PRODUCTION READY: Response Time Middleware
 * 
 * Middleware para agregar headers de tiempo de respuesta
 * Útil para monitoreo y debugging
 * 
 * ✅ FIX DEFINITIVO: NO monkey-patch res.end/res.write
 * Usa 'on-headers' para setear headers justo antes de enviarlos (seguro)
 */

import { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';

export const responseTimeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = process.hrtime.bigint();

  // ✅ FIX: Usar on-headers para setear headers justo antes de enviarlos
  // Esto es seguro y no interfiere con compression ni otros middlewares
  onHeaders(res, () => {
    // Solo setear si headers no fueron enviados aún
    if (!res.headersSent) {
      const durationNs = process.hrtime.bigint() - startTime;
      const durationMs = Number(durationNs) / 1_000_000; // Convertir a ms
      
      try {
        res.setHeader('X-Response-Time', `${Math.round(durationMs)}ms`);
        const seconds = (durationMs / 1000).toFixed(3);
        res.setHeader('X-Process-Time', `${seconds}s`);
      } catch (error) {
        // Si headers ya fueron enviados (edge case), ignorar silenciosamente
        // Esto no debería pasar con on-headers, pero es defensivo
      }
    }
  });

  next();
};

