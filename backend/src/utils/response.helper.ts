/**
 * ✅ Q10: Helper para estandarizar formatos de respuesta en todos los endpoints
 * 
 * Formato estándar:
 * - Éxito: { success: true, data: any, message?: string }
 * - Error: { success: false, error: string, errorCode?: string, errorId?: string, details?: any }
 */

import { Response } from 'express';
import { AppError, ErrorCode } from '../middleware/error.middleware';

export interface StandardSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface StandardErrorResponse {
  success: false;
  error: string;
  errorCode?: string;
  errorId?: string;
  details?: Record<string, any>;
}

/**
 * Enviar respuesta de éxito estandarizada
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response {
  const response: StandardSuccessResponse<T> = {
    success: true,
    data,
  };
  
  if (message) {
    response.message = message;
  }
  
  return res.status(statusCode).json(response);
}

/**
 * Enviar respuesta de error estandarizada
 */
export function sendError(
  res: Response,
  error: string | AppError | Error,
  statusCode?: number,
  errorCode?: ErrorCode,
  details?: Record<string, any>
): Response {
  if (error instanceof AppError) {
    const response: StandardErrorResponse = {
      success: false,
      error: error.message,
      errorCode: error.errorCode,
      errorId: error.errorId,
      details: error.details || details,
    };
    return res.status(error.statusCode).json(response);
  }
  
  const response: StandardErrorResponse = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    errorCode: errorCode || ErrorCode.INTERNAL_ERROR,
  };
  
  if (details) {
    response.details = details;
  }
  
  return res.status(statusCode || 500).json(response);
}

/**
 * Enviar respuesta de lista estandarizada
 */
export function sendList<T>(
  res: Response,
  items: T[],
  count?: number,
  message?: string
): Response {
  return sendSuccess(
    res,
    {
      items,
      count: count !== undefined ? count : items.length,
    },
    message
  );
}

