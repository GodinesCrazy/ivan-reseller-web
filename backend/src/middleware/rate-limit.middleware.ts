import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * ✅ FASE 8: Rate limiting middleware para APIs de marketplace
 * Previene abuse y respeta límites de APIs externas
 * Límites configurables vía variables de entorno
 */

// ✅ FASE 8: Límites de rate limiting configurables
const DEFAULT_LIMIT = env.RATE_LIMIT_DEFAULT ?? 200; // requests por 15 minutos para usuarios normales
const ADMIN_LIMIT = env.RATE_LIMIT_ADMIN ?? 1000; // requests por 15 minutos para ADMIN
const LOGIN_LIMIT = env.RATE_LIMIT_LOGIN ?? 5; // intentos de login por 15 minutos
const WINDOW_MS = env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000; // ventana de tiempo en ms

/**
 * ✅ FASE 8: Rate limit basado en rol del usuario (configurable)
 */
export const createRoleBasedRateLimit = () => {
  // ✅ FASE 8: Si rate limiting está deshabilitado, retornar middleware no-op
  if (!env.RATE_LIMIT_ENABLED) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }
  
  return rateLimit({
    windowMs: WINDOW_MS,
    max: async (req: Request) => {
      const user = (req as any).user;
      const userRole = user?.role?.toUpperCase();
      
      // ADMIN tiene límites más altos
      if (userRole === 'ADMIN') {
        return ADMIN_LIMIT;
      }
      
      return DEFAULT_LIMIT;
    },
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.userId;
      if (userId) {
        return `user:${userId}`;
      }
      // Usar ipKeyGenerator helper para soporte IPv6 correcto
      const ip = ipKeyGenerator(req as any);
      return `ip:${ip}`;
    },
    message: 'Too many requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
      // Skip rate limiting for auth endpoints (evita 429 en bucles 401→logout→redirect)
      if (req.path === '/auth/login') return true;
      if (req.path === '/auth/logout') return true;
      if (req.path === '/auth/refresh') return true;
      // Skip rate limiting para ADMIN en ciertos casos
      const user = (req as any).user;
      return user?.role === 'ADMIN' && req.path.startsWith('/api/admin');
    },
  });
};

// Rate limit general para APIs de marketplace
export const marketplaceRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por 15 minutos
  message: 'Too many requests to marketplace APIs, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit específico para eBay (más restrictivo)
export const ebayRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // 5 requests por minuto (eBay tiene límites estrictos)
  message: 'eBay API rate limit exceeded. Please wait before making more requests.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit específico para MercadoLibre
export const mercadolibreRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // 10 requests por minuto
  message: 'MercadoLibre API rate limit exceeded. Please wait before making more requests.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit específico para Amazon
export const amazonRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // 10 requests por minuto
  message: 'Amazon API rate limit exceeded. Please wait before making more requests.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit para scraping (más restrictivo)
export const scrapingRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // 3 requests por minuto (scraping es más pesado)
  message: 'Scraping rate limit exceeded. Please wait before making more requests.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit para autopilot (prevenir ciclos excesivos)
export const autopilotRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // 10 ciclos por 5 minutos
  message: 'Autopilot rate limit exceeded. Please wait before starting another cycle.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limit por usuario (usando IP o userId)
 */
export const createUserRateLimit = (maxRequests: number = 50, windowMs: number = 15 * 60 * 1000) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req: Request) => {
      // Usar userId si está autenticado, sino IP
      return (req as any).user?.userId?.toString() || req.ip || 'unknown';
    },
    message: 'Too many requests from this user, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
};

/**
 * ✅ FASE 8: Rate limit específico para login - Alto umbral para no bloquear tráfico browser (proxy/Vercel)
 */
export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in a minute.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = ipKeyGenerator(req as any);
    return `login:${ip}`;
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

