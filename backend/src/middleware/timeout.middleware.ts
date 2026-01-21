/**
 * ? FIX STABILITY: Hard timeout middleware para endpoints específicos
 * Garantiza que endpoints no críticos respondan en máximo 1500ms
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Endpoints con timeout de 1500ms
 */
const TIMEOUT_ENDPOINTS: Record<string, number> = {
  '/api/dashboard/stats': 1500,
  '/api/dashboard/recent-activity': 1500,
  '/api/products': 1500,
  '/api/automation/config': 1500,
  '/api/ai-suggestions': 1500,
};

/**
 * Middleware de timeout hard
 * Si el endpoint excede el timeout, responde con 200 y defaults
 */
export function timeoutMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    const timeoutMs = TIMEOUT_ENDPOINTS[path];

    // Solo aplicar a endpoints configurados
    if (!timeoutMs) {
      return next();
    }

    const correlationId = (req as any).correlationId || 'unknown';
    const startTime = Date.now();

    // Crear timeout
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('[Timeout Middleware] Request exceeded timeout', {
          correlationId,
          path,
          timeoutMs,
          duration: Date.now() - startTime,
        });

        // Responder con defaults degradados
        res.setHeader('X-Degraded', 'true');
        res.setHeader('X-Timeout', 'true');

        if (path === '/api/dashboard/stats') {
          return res.status(200).json({
            products: { total: 0, pending: 0, approved: 0, published: 0, rejected: 0 },
            sales: { totalSales: 0, pendingSales: 0, completedSales: 0, cancelledSales: 0, totalRevenue: 0, totalCommissions: 0 },
            commissions: { totalEarned: 0, pendingPayout: 0, totalCommissions: 0, thisMonthEarnings: 0 },
            _degraded: true,
            _timeout: true,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/dashboard/recent-activity') {
          return res.status(200).json({
            activities: [],
            _degraded: true,
            _timeout: true,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/products') {
          return res.status(200).json({
            products: [],
            pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
            _degraded: true,
            _timeout: true,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/automation/config') {
          return res.status(200).json({
            enabled: false,
            rules: [],
            _degraded: true,
            _timeout: true,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/ai-suggestions') {
          return res.status(200).json({
            suggestions: [],
            _degraded: true,
            _timeout: true,
            _timestamp: new Date().toISOString(),
          });
        }

        // Default genérico
        return res.status(200).json({
          _degraded: true,
          _timeout: true,
          _timestamp: new Date().toISOString(),
        });
      }
    }, timeoutMs);

    // Limpiar timeout cuando la respuesta se envía
    const originalEnd = res.end.bind(res);
    res.end = function(...args: any[]) {
      clearTimeout(timeoutId);
      return originalEnd(...args);
    };

    next();
  };
}
