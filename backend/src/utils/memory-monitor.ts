/**
 * ✅ PRODUCTION READY: Memory Monitor
 * 
 * Utilidad para monitorear uso de memoria y detectar leaks
 */

import { logger } from '../config/logger';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  percentage: number; // Porcentaje de heap usado
}

let lastMemoryCheck: MemoryStats | null = null;
let consecutiveHighMemoryWarnings = 0;

export function getMemoryStats(): MemoryStats {
  const usage = process.memoryUsage();
  const percentage = (usage.heapUsed / usage.heapTotal) * 100;
  
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    arrayBuffers: usage.arrayBuffers,
    percentage: Math.round(percentage * 100) / 100,
  };
}

export function checkMemoryHealth(): { healthy: boolean; warning?: string } {
  const stats = getMemoryStats();
  lastMemoryCheck = stats;

  // Alertas si el heap está más del 80% usado
  if (stats.percentage > 80) {
    consecutiveHighMemoryWarnings++;
    
    if (consecutiveHighMemoryWarnings >= 3) {
      logger.warn('High memory usage detected', {
        percentage: stats.percentage,
        heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(stats.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(stats.rss / 1024 / 1024)}MB`,
        consecutiveWarnings: consecutiveHighMemoryWarnings,
      });
    }
    
    return {
      healthy: false,
      warning: `Memory usage is ${stats.percentage.toFixed(2)}%`,
    };
  }

  // Resetear contador si está saludable
  if (stats.percentage < 70) {
    consecutiveHighMemoryWarnings = 0;
  }

  return { healthy: true };
}

export function getMemoryStatsFormatted(): Record<string, string> {
  const stats = getMemoryStats();
  
  return {
    heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(stats.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(stats.rss / 1024 / 1024)}MB`,
    external: `${Math.round(stats.external / 1024 / 1024)}MB`,
    percentage: `${stats.percentage.toFixed(2)}%`,
  };
}

// Monitoreo periódico en producción
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    checkMemoryHealth();
  }, 60000); // Cada minuto
}

