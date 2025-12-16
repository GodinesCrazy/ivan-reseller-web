/**
 * ✅ PRODUCTION READY: Correlation ID Middleware
 * 
 * Agrega un correlation ID único a cada request para rastrear logs
 * y respuestas de error a través de múltiples servicios y jobs.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/**
 * Middleware para agregar correlation ID a cada request
 */
export const correlationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Usar correlation ID del header si existe (para propagación entre servicios)
  // o generar uno nuevo
  const correlationId = 
    req.headers['x-correlation-id'] as string || 
    req.headers['x-request-id'] as string ||
    uuidv4();

  // Agregar al request para uso en handlers
  req.correlationId = correlationId;

  // Agregar al header de respuesta para que el cliente pueda rastrear
  res.setHeader('X-Correlation-ID', correlationId);

  next();
};

/**
 * Helper para obtener correlation ID del request actual
 * Útil para usar en servicios fuera del contexto de Express
 */
export function getCorrelationId(req?: Request): string {
  return req?.correlationId || 'unknown';
}

