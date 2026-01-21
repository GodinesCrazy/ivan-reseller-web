/**
 * ? FIX STABILITY: Graceful overload protection middleware
 * Detecta event loop lag y memoria alta, responde con defaults degradados
 * para endpoints no críticos en lugar de causar 502.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// Umbrales de sobrecarga
const EVENT_LOOP_LAG_THRESHOLD_MS = 100; // 100ms de lag = sobrecarga
const MEMORY_THRESHOLD_PERCENT = 85; // 85% de memoria usada = sobrecarga
const MEMORY_CHECK_INTERVAL_MS = 5000; // Verificar memoria cada 5 segundos

// Estado global de sobrecarga
let isOverloaded = false;
let lastMemoryCheck = Date.now();
let overloadReason: string | null = null;

/**
 * Mide event loop lag usando setImmediate
 */
function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      resolve(lag);
    });
  });
}

/**
 * Verifica si el sistema está sobrecargado
 */
async function checkOverload(): Promise<{ overloaded: boolean; reason: string | null }> {
  const now = Date.now();
  
  // Verificar event loop lag
  const eventLoopLag = await measureEventLoopLag();
  if (eventLoopLag > EVENT_LOOP_LAG_THRESHOLD_MS) {
    return {
      overloaded: true,
      reason: `event_loop_lag_${eventLoopLag}ms`
    };
  }

  // Verificar memoria cada N segundos (no en cada request)
  if (now - lastMemoryCheck > MEMORY_CHECK_INTERVAL_MS) {
    lastMemoryCheck = now;
    const memory = process.memoryUsage();
    const totalMemory = memory.heapTotal;
    const usedMemory = memory.heapUsed;
    const usedPercent = (usedMemory / totalMemory) * 100;

    if (usedPercent > MEMORY_THRESHOLD_PERCENT) {
      return {
        overloaded: true,
        reason: `memory_high_${Math.round(usedPercent)}%`
      };
    }
  }

  return { overloaded: false, reason: null };
}

/**
 * Endpoints que pueden responder con defaults degradados en sobrecarga
 */
const DEGRADABLE_ENDPOINTS = [
  '/api/dashboard/stats',
  '/api/dashboard/recent-activity',
  '/api/products',
  '/api/automation/config',
  '/api/ai-suggestions',
  '/api/opportunities/list',
];

/**
 * Middleware de overload protection
 * Responde con defaults degradados para endpoints no críticos si hay sobrecarga
 */
export function overloadProtectionMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req as any).correlationId || 'unknown';
    const path = req.path;

    // Solo aplicar a endpoints degradables
    const isDegradable = DEGRADABLE_ENDPOINTS.some(endpoint => 
      path === endpoint || path.startsWith(endpoint + '/')
    );

    if (!isDegradable) {
      return next();
    }

    try {
      // Verificar sobrecarga
      const { overloaded, reason } = await checkOverload();
      
      if (overloaded) {
        isOverloaded = true;
        overloadReason = reason;

        logger.warn('[Overload Protection] System overloaded, returning degraded response', {
          correlationId,
          path,
          reason,
          eventLoopLag: reason?.includes('event_loop_lag') ? reason.split('_')[3] : undefined,
          memoryPercent: reason?.includes('memory_high') ? reason.split('_')[2] : undefined,
        });

        // Responder con defaults degradados según el endpoint
        res.setHeader('X-Degraded', 'true');
        res.setHeader('X-Overload-Reason', reason || 'unknown');

        if (path === '/api/dashboard/stats') {
          return res.status(200).json({
            products: { total: 0, pending: 0, approved: 0, published: 0, rejected: 0 },
            sales: { totalSales: 0, pendingSales: 0, completedSales: 0, cancelledSales: 0, totalRevenue: 0, totalCommissions: 0 },
            commissions: { totalEarned: 0, pendingPayout: 0, totalCommissions: 0, thisMonthEarnings: 0 },
            _degraded: true,
            _overloadReason: reason,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/dashboard/recent-activity') {
          return res.status(200).json({
            activities: [],
            _degraded: true,
            _overloadReason: reason,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/products') {
          return res.status(200).json({
            products: [],
            pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
            _degraded: true,
            _overloadReason: reason,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/automation/config') {
          return res.status(200).json({
            enabled: false,
            rules: [],
            _degraded: true,
            _overloadReason: reason,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/ai-suggestions') {
          return res.status(200).json({
            suggestions: [],
            _degraded: true,
            _overloadReason: reason,
            _timestamp: new Date().toISOString(),
          });
        }

        if (path === '/api/opportunities/list') {
          return res.status(200).json({
            opportunities: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            _degraded: true,
            _overloadReason: reason,
            _timestamp: new Date().toISOString(),
          });
        }

        // Default degradado genérico
        return res.status(200).json({
          _degraded: true,
          _overloadReason: reason,
          _timestamp: new Date().toISOString(),
        });
      } else {
        // Sistema no sobrecargado, continuar normalmente
        isOverloaded = false;
        overloadReason = null;
        return next();
      }
    } catch (error: any) {
      // Si hay error verificando sobrecarga, continuar normalmente (no bloquear)
      logger.warn('[Overload Protection] Error checking overload, continuing normally', {
        correlationId,
        path,
        error: error.message,
      });
      return next();
    }
  };
}
