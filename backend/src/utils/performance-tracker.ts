/**
 * ✅ PRODUCTION READY: Performance Tracker
 * 
 * Utilidad para tracking de performance de endpoints y operaciones
 */

import { logger } from '../config/logger';

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

class PerformanceTracker {
  private metrics: PerformanceMetric[] = [];
  private readonly MAX_METRICS = 10000;

  /**
   * Track performance de una operación
   */
  track(operation: string, duration: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);

    // Limpiar métricas antiguas si hay demasiadas
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Log warning para operaciones lentas
    if (duration > 1000) {
      logger.warn('Slow operation detected', {
        operation,
        duration: `${duration}ms`,
        metadata,
      });
    }
  }

  /**
   * Obtener estadísticas de performance por operación
   */
  getStats(operation?: string): Record<string, {
    count: number;
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  }> {
    const filtered = operation
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;

    const byOperation = new Map<string, PerformanceMetric[]>();
    for (const metric of filtered) {
      if (!byOperation.has(metric.operation)) {
        byOperation.set(metric.operation, []);
      }
      byOperation.get(metric.operation)!.push(metric);
    }

    const stats: Record<string, any> = {};

    for (const [op, metrics] of byOperation.entries()) {
      const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
      const count = durations.length;
      const sum = durations.reduce((a, b) => a + b, 0);
      const avg = sum / count;
      const min = durations[0];
      const max = durations[count - 1];
      const p95Index = Math.floor(count * 0.95);
      const p99Index = Math.floor(count * 0.99);

      stats[op] = {
        count,
        avg: Math.round(avg),
        min,
        max,
        p95: durations[p95Index] || 0,
        p99: durations[p99Index] || 0,
      };
    }

    return stats;
  }

  /**
   * Decorator para trackear funciones async
   */
  async trackAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.track(operation, duration, { ...metadata, success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.track(operation, duration, { ...metadata, success: false, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Resetear métricas
   */
  reset(): void {
    this.metrics = [];
  }
}

export const performanceTracker = new PerformanceTracker();

