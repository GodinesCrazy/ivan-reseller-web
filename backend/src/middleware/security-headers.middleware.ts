/**
 * ✅ PRODUCTION READY: Security Headers Middleware
 * 
 * Middleware adicional para headers de seguridad
 * Complementa helmet con headers específicos
 */

import { Request, Response, NextFunction } from 'express';

export const securityHeadersMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // ✅ PRODUCTION READY: Headers de seguridad adicionales
  
  // Prevenir clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevenir MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection (legacy pero útil)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy - Solo enviar referrer en el mismo origen
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (antes Feature-Policy)
  res.setHeader('Permissions-Policy', [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'fullscreen=(self)',
    'payment=(self)',
  ].join(', '));
  
  // Strict Transport Security (HSTS) - Solo en producción HTTPS
  if (process.env.NODE_ENV === 'production' && req.protocol === 'https') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  
  next();
};

