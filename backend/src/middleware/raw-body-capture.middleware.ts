/**
 * ? FIX AUTH: Raw Body Capture Middleware
 * Captura body crudo ANTES de express.json() para normalizar BOM, CRLF, espacios
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export interface RequestWithRawBody extends Request {
  rawBody?: string | Buffer;
}

/**
 * Normalizar body crudo:
 * - Quitar BOM (Byte Order Mark)
 * - Reemplazar CRLF -> LF
 * - Trim espacios extremos
 */
function normalizeRawBody(rawBody: string | Buffer): string {
  let bodyStr: string;
  
  if (Buffer.isBuffer(rawBody)) {
    // Remover BOM UTF-8 (EF BB BF) o UTF-16
    const bomRemoved = rawBody.slice(0, 3).toString('hex') === 'efbbbf' 
      ? rawBody.slice(3)
      : rawBody;
    bodyStr = bomRemoved.toString('utf8');
  } else {
    bodyStr = rawBody;
  }
  
  // Reemplazar CRLF (\r\n) -> LF (\n)
  bodyStr = bodyStr.replace(/\r\n/g, '\n');
  
  // Trim espacios extremos
  bodyStr = bodyStr.trim();
  
  return bodyStr;
}

/**
 * Middleware para capturar raw body antes de parsing
 * Se ejecuta ANTES de express.json()
 */
export function rawBodyCaptureMiddleware(
  req: RequestWithRawBody,
  res: Response,
  next: NextFunction
): void {
  // Solo procesar si Content-Type es JSON y hay body
  const contentType = req.headers['content-type'] || '';
  const isJsonRequest = contentType.includes('application/json') || 
                        contentType.includes('application/*+json');
  
  if (!isJsonRequest) {
    return next();
  }
  
  // Capturar body crudo
  const chunks: Buffer[] = [];
  
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });
  
  req.on('end', () => {
    if (chunks.length > 0) {
      const rawBody = Buffer.concat(chunks);
      const normalized = normalizeRawBody(rawBody);
      
      // Guardar en request para uso posterior
      req.rawBody = normalized;
      
      // Log solo si hay problema potencial (debug mode)
      const isDebug = process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production';
      if (isDebug) {
        const correlationId = (req as any).correlationId || 'unknown';
        logger.debug('[Raw Body] Captured and normalized', {
          correlationId,
          path: req.path,
          method: req.method,
          rawLength: rawBody.length,
          normalizedLength: normalized.length,
          preview: normalized.substring(0, 120).replace(/"password":"[^"]+"/g, '"password":"***"'),
        });
      }
    }
    next();
  });
  
  req.on('error', (err) => {
    logger.error('[Raw Body] Error capturing raw body', {
      error: err.message,
      path: req.path,
      method: req.method,
    });
    next(err);
  });
}
