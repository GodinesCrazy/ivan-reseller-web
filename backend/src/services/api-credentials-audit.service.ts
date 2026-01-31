/**
 * API Credentials Audit Service
 * 
 * Servicio para auditar, registrar y monitorear intentos de configuración de APIs
 * Facilita debugging y análisis de problemas
 */

import { trace } from '../utils/boot-trace';
trace('loading api-credentials-audit.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface APICredentialsAuditLog {
  id?: number;
  userId: number;
  apiName: string;
  environment: 'sandbox' | 'production' | 'other';
  action: 'save' | 'test' | 'delete' | 'oauth' | 'toggle';
  success: boolean;
  error?: string;
  errorCode?: string;
  fieldErrors?: string[];
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export class APICredentialsAuditService {
  /**
   * Registrar intento de guardado de credenciales
   */
  static async logSaveAttempt(params: {
    userId: number;
    apiName: string;
    environment: string;
    success: boolean;
    error?: string;
    errorCode?: string;
    fieldErrors?: string[];
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // Registrar en logs estructurados
      if (params.success) {
        logger.info('[API Credentials Audit] Save attempt successful', {
          userId: params.userId,
          apiName: params.apiName,
          environment: params.environment,
          metadata: params.metadata
        });
      } else {
        logger.warn('[API Credentials Audit] Save attempt failed', {
          userId: params.userId,
          apiName: params.apiName,
          environment: params.environment,
          error: params.error,
          errorCode: params.errorCode,
          fieldErrors: params.fieldErrors,
          metadata: params.metadata
        });
      }

      // TODO: Si se implementa tabla de auditoría en BD, guardar aquí
      // await prisma.apiCredentialsAudit.create({ ... });
    } catch (error: any) {
      logger.error('[API Credentials Audit] Failed to log save attempt', {
        error: error.message,
        params
      });
      // No lanzar error - logging no debe interrumpir el flujo principal
    }
  }

  /**
   * Registrar intento de test de conexión
   */
  static async logTestAttempt(params: {
    userId: number;
    apiName: string;
    environment: string;
    success: boolean;
    message?: string;
    error?: string;
    latency?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      if (params.success) {
        logger.info('[API Credentials Audit] Test connection successful', {
          userId: params.userId,
          apiName: params.apiName,
          environment: params.environment,
          latency: params.latency,
          message: params.message,
          metadata: params.metadata
        });
      } else {
        logger.warn('[API Credentials Audit] Test connection failed', {
          userId: params.userId,
          apiName: params.apiName,
          environment: params.environment,
          error: params.error,
          message: params.message,
          metadata: params.metadata
        });
      }
    } catch (error: any) {
      logger.error('[API Credentials Audit] Failed to log test attempt', {
        error: error.message
      });
    }
  }

  /**
   * Obtener historial de auditoría reciente (últimas 24 horas)
   */
  static async getRecentAuditLogs(
    userId: number,
    apiName?: string,
    limit: number = 50
  ): Promise<APICredentialsAuditLog[]> {
    try {
      // TODO: Implementar cuando se agregue tabla de auditoría
      // Por ahora, retornar array vacío
      return [];
    } catch (error: any) {
      logger.error('[API Credentials Audit] Failed to get audit logs', {
        error: error.message,
        userId,
        apiName
      });
      return [];
    }
  }

  /**
   * Detectar patrones de errores recurrentes
   */
  static async detectErrorPatterns(
    userId: number,
    apiName: string,
    hours: number = 24
  ): Promise<{
    commonErrors: Array<{ error: string; count: number }>;
    fieldErrors: Array<{ field: string; count: number }>;
    recommendations: string[];
  }> {
    try {
      // TODO: Implementar cuando se agregue tabla de auditoría
      return {
        commonErrors: [],
        fieldErrors: [],
        recommendations: []
      };
    } catch (error: any) {
      logger.error('[API Credentials Audit] Failed to detect error patterns', {
        error: error.message
      });
      return {
        commonErrors: [],
        fieldErrors: [],
        recommendations: []
      };
    }
  }
}

