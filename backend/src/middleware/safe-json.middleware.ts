/**
 * ? FIX AUTH: Safe JSON Middleware
 * Captura SyntaxError del body parser y responde 400 en lugar de 500
 */

import { Request, Response, NextFunction } from 'express';

export function safeJsonErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // ? FIX AUTH: Capturar SyntaxError del body parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const correlationId = (req as any).correlationId || 'unknown';
    
    // NO llamar next(err) para evitar que llegue al error handler global (500)
    // Responder directamente con 400
    res.status(400).json({
      success: false,
      error: 'Invalid JSON body',
      errorCode: 'INVALID_JSON',
      correlationId,
      hint: 'Ensure body is valid JSON e.g. {"username":"admin","password":"..."}',
      timestamp: new Date().toISOString(),
    });
    
    // Loggear el error con correlationId
    const logger = (require('../config/logger')).default;
    logger.warn('[Safe JSON] Invalid JSON body rejected', {
      correlationId,
      path: req.path,
      method: req.method,
      error: err.message,
      bodyPreview: typeof req.body === 'string' ? req.body.substring(0, 100) : 'not a string',
    });
    
    return; // ? CRITICAL: NO llamar next()
  }
  
  // Si no es un SyntaxError de JSON, pasar al siguiente error handler
  next(err);
}
