/**
 * ✅ FIX AUTH: Safe JSON Middleware Mejorado
 * Captura SyntaxError del body parser y responde 400 en lugar de 500
 * Incluye logging robusto con rawBody normalizado
 */

import { Request, Response, NextFunction } from 'express';
import { RequestWithRawBody } from './raw-body-capture.middleware';
import { logger } from '../config/logger';

export function safeJsonErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // ✅ FIX AUTH: Capturar SyntaxError del body parser
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    const correlationId = (req as any).correlationId || res.locals?.correlationId || 'unknown';
    const reqWithRaw = req as RequestWithRawBody;
    
    // Obtener rawBody normalizado si existe
    let bodyPreview = 'no body';
    let bodyLength = 0;
    
    if (reqWithRaw.rawBody) {
      if (typeof reqWithRaw.rawBody === 'string') {
        bodyLength = reqWithRaw.rawBody.length;
        // Redactar password en preview
        bodyPreview = reqWithRaw.rawBody
          .substring(0, 120)
          .replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"***"')
          .replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"***"');
      } else if (Buffer.isBuffer(reqWithRaw.rawBody)) {
        bodyLength = reqWithRaw.rawBody.length;
        const bodyStr = reqWithRaw.rawBody.toString('utf8').substring(0, 120);
        bodyPreview = bodyStr.replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"***"');
      }
    } else if (typeof req.body === 'string') {
      bodyLength = req.body.length;
      bodyPreview = req.body.substring(0, 120).replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"***"');
    }
    
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
    
    // ✅ Loggear el error con correlationId y rawBody info
    logger.warn('[Safe JSON] Invalid JSON body rejected', {
      correlationId,
      path: req.path,
      method: req.method,
      error: err.message,
      bodyLength,
      bodyPreview,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
    });
    
    return; // ✅ CRITICAL: NO llamar next()
  }
  
  // Si no es un SyntaxError de JSON, pasar al siguiente error handler
  next(err);
}
