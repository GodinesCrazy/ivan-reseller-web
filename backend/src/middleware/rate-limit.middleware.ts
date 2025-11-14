import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiting middleware para APIs de marketplace
 * Previene abuse y respeta límites de APIs externas
 * Límites uniformes para todos los usuarios (ADMIN tiene límites más altos)
 */

// Límites de rate limiting
const DEFAULT_LIMIT = 200; // requests por 15 minutos para usuarios normales
const ADMIN_LIMIT = 1000; // requests por 15 minutos para ADMIN

/**
 * Rate limit basado en rol del usuario
 */
export const createRoleBasedRateLimit = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
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
      return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`;
    },
    message: 'Too many requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
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
 * Rate limit específico para login - Previene brute force attacks
 * 5 intentos por 15 minutos por IP
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos de login por 15 minutos
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Usar IP para prevenir brute force desde múltiples cuentas
    return `login:${req.ip || 'unknown'}`;
  },
  skipSuccessfulRequests: false, // Contar todos los intentos, incluso los exitosos
  skipFailedRequests: false, // Contar todos los intentos fallidos
});

