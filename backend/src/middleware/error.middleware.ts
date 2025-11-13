import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

// Error codes para diferentes tipos de errores
export enum ErrorCode {
  // Autenticación y autorización
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  
  // Validación
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Recursos
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  
  // APIs externas
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_TIMEOUT = 'API_TIMEOUT',
  
  // Base de datos
  DATABASE_ERROR = 'DATABASE_ERROR',
  QUERY_ERROR = 'QUERY_ERROR',
  
  // Servicios
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CREDENTIALS_ERROR = 'CREDENTIALS_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  
  // General
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorCode: ErrorCode;
  errorId: string;
  details?: Record<string, any>;

  constructor(
    message: string, 
    statusCode: number = 500,
    errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errorCode = errorCode;
    this.errorId = uuidv4();
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Helper para generar error IDs únicos
function generateErrorId(): string {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;
  let errorCode = ErrorCode.UNKNOWN_ERROR;
  let errorId = generateErrorId();
  let details: Record<string, any> | undefined = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
    errorCode = err.errorCode;
    errorId = err.errorId;
    details = err.details;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
    errorCode = ErrorCode.VALIDATION_ERROR;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    errorCode = ErrorCode.INVALID_TOKEN;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    errorCode = ErrorCode.TOKEN_EXPIRED;
  } else if (err.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    message = 'Database error';
    errorCode = ErrorCode.DATABASE_ERROR;
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation error';
    errorCode = ErrorCode.VALIDATION_ERROR;
    details = { validationErrors: (err as any).errors };
  }

  // Logging estructurado
  const logContext = {
    errorId,
    errorCode,
    statusCode,
    message: err.message,
    stack: err.stack,
    userId: (req as any).user?.userId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    details,
    isOperational,
  };

  if (statusCode >= 500) {
    logger.error('Internal server error', logContext);
  } else if (statusCode >= 400) {
    logger.warn('Client error', logContext);
  }

  // Respuesta al cliente
  const response: any = {
    success: false,
    error: message,
    errorCode,
    errorId,
    timestamp: new Date().toISOString(),
  };

  // Agregar detalles en desarrollo o si es operacional
  if (process.env.NODE_ENV === 'development' || isOperational) {
    if (details) {
      response.details = details;
    }
    if (process.env.NODE_ENV === 'development' && !isOperational && err.stack) {
      response.stack = err.stack;
    }
  }

  // Mensaje user-friendly
  if (statusCode >= 500) {
    response.message = 'Ha ocurrido un error interno. Por favor, intenta nuevamente. Si el problema persiste, contacta soporte con el código de error.';
  }

  res.status(statusCode).json(response);
};
