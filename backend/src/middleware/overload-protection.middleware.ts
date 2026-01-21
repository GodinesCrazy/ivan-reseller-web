/**
 * ? FIX STABILITY: Graceful overload protection middleware
 * Detecta event loop lag y memoria alta, responde con defaults degradados
 * para endpoints no cr?ticos en lugar de causar 502.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// ? FASE B: Umbrales ajustados para Railway Pro (8GB RAM)
const EVENT_LOOP_LAG_THRESHOLD_MS = 100; // 100ms de lag = sobrecarga
// ? FASE B: Usar RSS (Resident Set Size) real en lugar de heapTotal para detectar memoria real del proceso
// Railway Pro tiene 8GB, as? que 85% de 8GB = 6.8GB es un umbral realista
const MEMORY_THRESHOLD_RSS_MB = 6800; // 6.8GB en MB (85% de 8GB)
const MEMORY_THRESHOLD_PERCENT = 90; // 90% de heap usado (m?s conservador que antes)
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
 * Verifica si el sistema est? sobrecargado
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

  // ? FASE B: Verificar memoria cada N segundos (no en cada request)
  if (now - lastMemoryCheck > MEMORY_CHECK_INTERVAL_MS) {
    lastMemoryCheck = now;
    const memory = process.memoryUsage();
    
    // ? FASE B: Usar RSS (Resident Set Size) para detectar memoria real del proceso
    // RSS es la memoria f?sica real que el proceso est? usando
    const rssMB = memory.rss / 1024 / 1024; // Convertir bytes a MB
    
    // ? FASE B: Verificar RSS real primero (m?s preciso para Railway)
    if (rssMB > MEMORY_THRESHOLD_RSS_MB) {
      return {
        overloaded: true,
        reason: `memory_high_rss_${Math.round(rssMB)}MB`
      };
    }
    
    // ? FASE B: Verificar heap usado como fallback (solo si heapTotal es razonable)
    // No degradar por heapTotal bajo - puede ser normal en Node.js
    const heapUsedMB = memory.heapUsed / 1024 / 1024;
    const heapTotalMB = memory.heapTotal / 1024 / 1024;
    
    // Solo verificar heap si heapTotal es razonable (> 100MB)
    if (heapTotalMB > 100) {
      const usedPercent = (memory.heapUsed / memory.heapTotal) * 100;
      if (usedPercent > MEMORY_THRESHOLD_PERCENT) {
        return {
          overloaded: true,
          reason: `memory_high_heap_${Math.round(usedPercent)}%`
        };
      }
    }
  }

  return { overloaded: false, reason: null };
}

/**
 * ? FASE B: Endpoints que pueden responder con defaults degradados en sobrecarga
 * NOTA: /api/auth-status NO est aqu - es crtico y nunca debe degradarse
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
 * ? FASE B: Endpoints crticos que NUNCA deben degradarse
 */
const CRITICAL_ENDPOINTS = [
  '/api/auth-status',
  '/api/marketplace/auth-url',
  '/api/credentials',
  '/api/manual-auth',
];

/**
 * Middleware de overload protection
 * Responde con defaults degradados para endpoints no cr?ticos si hay sobrecarga
 */
export function overloadProtectionMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req as any).correlationId || 'unknown';
    const path = req.path;

    // ? FASE B: NUNCA degradar endpoints críticos
    const isCritical = CRITICAL_ENDPOINTS.some(endpoint => 
      path === endpoint || path.startsWith(endpoint + '/')
    );
    
    if (isCritical) {
      return next(); // Endpoints críticos siempre funcionan normalmente
    }

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

        // Responder con defaults degradados seg?n el endpoint
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

        // Default degradado gen?rico
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
