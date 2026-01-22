import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import { errorTracker, ErrorCategory } from '../utils/error-tracker';

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
  } else if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    // ✅ FIX AUTH: Capturar SyntaxError de JSON parser si no lo capturó safe-json middleware
    statusCode = 400;
    message = 'Invalid JSON body';
    errorCode = ErrorCode.VALIDATION_ERROR;
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

  // ✅ FIX AUTH: Incluir correlation ID en logs (debe estar disponible por correlationMiddleware)
  const correlationId = (req as any).correlationId || res.locals?.correlationId || 'unknown';

  // ✅ FIX AUTH: Logging estructurado con request info completo
  const logContext: any = {
    errorId,
    correlationId,
    errorCode,
    statusCode,
    message: err.message,
    stack: err.stack, // ✅ Incluir stack en logs (no se expone al cliente)
    userId: (req as any).user?.userId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    details,
    isOperational,
  };
  
  // ✅ FIX AUTH: Agregar información adicional para errores de validación/JSON
  if (err instanceof SyntaxError || err.name === 'SyntaxError') {
    logContext.bodyType = typeof req.body;
    logContext.bodyPreview = typeof req.body === 'string' ? req.body.substring(0, 200) : 'not a string';
  }

  // ✅ PRODUCTION READY: Categorizar y trackear errores
  let errorCategory = ErrorCategory.UNKNOWN;
  if (err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientUnknownRequestError') {
    errorCategory = ErrorCategory.DATABASE;
  } else if (statusCode >= 500 && (err.message.includes('API') || err.message.includes('timeout'))) {
    errorCategory = ErrorCategory.EXTERNAL_API;
  } else if (statusCode === 401 || statusCode === 403) {
    errorCategory = ErrorCategory.AUTHENTICATION;
  } else if (statusCode === 400) {
    errorCategory = ErrorCategory.VALIDATION;
  }

  // Trackear error
  errorTracker.track(err as Error, errorCategory, {
    userId: (req as any).user?.userId,
    correlationId,
    requestPath: req.path,
    requestMethod: req.method,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    statusCode,
    errorCode,
  });

  if (statusCode >= 500) {
    logger.error('Internal server error', logContext);
  } else if (statusCode >= 400) {
    logger.warn('Client error', logContext);
  }

  // ✅ PRODUCTION READY: Incluir correlation ID en respuesta (reutilizar variable ya declarada)

  // Respuesta al cliente
  const response: any = {
    success: false,
    error: message,
    errorCode,
    errorId,
    correlationId, // ✅ Agregar correlation ID
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

  // ✅ HOTFIX: NO intentar responder si headers ya fueron enviados
  // Esto previene ERR_HTTP_HEADERS_SENT y doble respuesta
  if (res.headersSent) {
    // Headers ya enviados, solo loggear (no podemos responder)
    // CRITICAL: Do NOT call res.status/res.json/res.send after this point
    logger.warn('Error handler: headers already sent, cannot send error response', {
      errorId,
      correlationId,
      statusCode,
      path: req.path,
      method: req.method,
      errorMessage: err.message,
    });
    return; // ✅ CRITICAL: Return immediately, do NOT call next()
  }

  // ✅ PRODUCTION FIX: NO borrar headers CORS existentes
  // El error handler NO debe hacer res.setHeader que sobrescriba CORS headers
  // CORS middleware ya corrió antes, así que los headers están presentes
  
  // ✅ HOTFIX: Wrap in try/catch to prevent uncaught exceptions
  try {
    res.status(statusCode).json(response);
  } catch (sendError) {
    // If sending response fails (e.g., connection closed), just log
    logger.error('Error handler: failed to send error response', {
      errorId,
      correlationId,
      sendError: sendError instanceof Error ? sendError.message : String(sendError),
      originalError: err.message,
    });
  }
};
