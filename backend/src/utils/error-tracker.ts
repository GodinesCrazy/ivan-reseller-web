/**
 * ✅ PRODUCTION READY: Error Tracker
 * 
 * Utilidad para tracking y categorización de errores
 * Facilita debugging y monitoreo en producción
 */

import { logger } from '../config/logger';

export enum ErrorCategory {
  DATABASE = 'DATABASE',
  EXTERNAL_API = 'EXTERNAL_API',
  AUTHENTICATION = 'AUTHENTICATION',
  VALIDATION = 'VALIDATION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorContext {
  userId?: number;
  correlationId?: string;
  requestPath?: string;
  requestMethod?: string;
  userAgent?: string;
  ip?: string;
  [key: string]: any;
}

export class ErrorTracker {
  private errorCounts = new Map<string, number>();
  private readonly MAX_ERROR_COUNT = 1000;

  track(
    error: Error,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    context: ErrorContext = {}
  ): void {
    const errorKey = `${category}:${error.name}:${error.message.substring(0, 50)}`;
    
    // Incrementar contador
    const count = (this.errorCounts.get(errorKey) || 0) + 1;
    this.errorCounts.set(errorKey, count);

    // Log estructurado
    logger.error('Error Tracked', {
      category,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      count,
      ...context,
    });

    // Si el error se repite mucho, alerta
    if (count === 10 || count === 50 || count === 100) {
      logger.warn('Recurring Error Alert', {
        category,
        errorName: error.name,
        errorMessage: error.message,
        count,
        ...context,
      });
    }

    // Limpiar si hay demasiados tipos de errores
    if (this.errorCounts.size > this.MAX_ERROR_COUNT) {
      const entries = Array.from(this.errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, this.MAX_ERROR_COUNT);
      
      this.errorCounts.clear();
      for (const [key, value] of entries) {
        this.errorCounts.set(key, value);
      }
    }
  }

  getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts.entries());
  }

  reset(): void {
    this.errorCounts.clear();
  }
}

export const errorTracker = new ErrorTracker();

