/**
 * Safe JSON Middleware
 * Captura SyntaxError del body parser y responde 400 en lugar de 500
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function safeJsonErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Capturar SyntaxError del body parser
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    const correlationId = (req as any).correlationId || res.locals?.correlationId || 'unknown';
    
    // Obtener body preview si existe
    let bodyPreview = 'no body';
    let bodyLength = 0;
    
    if (typeof req.body === 'string') {
      bodyLength = req.body.length;
      bodyPreview = req.body.substring(0, 120).replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"***"');
    }
    
    // NO llamar next(err) para evitar que llegue al error handler global (500)
    // Responder directamente con 400 con diagnóstico adicional
    const contentType = req.headers['content-type'] || 'not set';
    const contentLength = req.headers['content-length'] || 'not set';
    const diagnostic = {
      contentType,
      contentLength: typeof contentLength === 'string' ? parseInt(contentLength, 10) || contentLength : contentLength,
      bodyLength,
      bodyPreview: bodyPreview.substring(0, 80), // Primeros 80 chars sanitizados
    };
    
    res.status(400).json({
      success: false,
      error: 'Invalid JSON body',
      errorCode: 'INVALID_JSON',
      correlationId,
      diagnostic,
      hint: 'Ensure body is valid JSON e.g. {"username":"admin","password":"..."}. Use PowerShell Invoke-WebRequest or Node fetch, not curl.exe on Windows.',
      timestamp: new Date().toISOString(),
    });
    
    // Loggear el error con correlationId (sin credenciales)
    logger.warn('[Safe JSON] Invalid JSON body rejected', {
      correlationId,
      path: req.path,
      method: req.method,
      error: err.message,
      diagnostic,
    });
    
    return; // ✅ CRITICAL: NO llamar next()
  }
  
  // Si no es un SyntaxError de JSON, pasar al siguiente error handler
  next(err);
}
