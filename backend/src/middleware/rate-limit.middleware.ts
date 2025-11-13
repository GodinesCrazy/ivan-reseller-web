import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

/**
 * Rate limiting middleware para APIs de marketplace
 * Previene abuse y respeta límites de APIs externas
 * Soporta límites por usuario/plan
 */

// Tipos de planes y sus límites
export enum UserPlan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
  ADMIN = 'ADMIN',
}

// Configuración de límites por plan
const PLAN_LIMITS: Record<UserPlan, { requests: number; windowMs: number }> = {
  [UserPlan.FREE]: { requests: 50, windowMs: 15 * 60 * 1000 }, // 50 req/15min
  [UserPlan.BASIC]: { requests: 200, windowMs: 15 * 60 * 1000 }, // 200 req/15min
  [UserPlan.PRO]: { requests: 500, windowMs: 15 * 60 * 1000 }, // 500 req/15min
  [UserPlan.ENTERPRISE]: { requests: 2000, windowMs: 15 * 60 * 1000 }, // 2000 req/15min
  [UserPlan.ADMIN]: { requests: 10000, windowMs: 15 * 60 * 1000 }, // 10000 req/15min
};

// Cache de planes de usuario (evitar consultas repetidas)
const userPlanCache = new Map<number, { plan: UserPlan; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Invalidar cache del plan de un usuario (útil cuando se actualiza el plan)
 */
export function invalidateUserPlanCache(userId: number): void {
  userPlanCache.delete(userId);
  logger.info('User plan cache invalidated', { userId });
}

/**
 * Obtener plan del usuario (con cache)
 */
async function getUserPlan(userId: number): Promise<UserPlan> {
  // Verificar cache
  const cached = userPlanCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.plan;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, plan: true },
    });

    // Determinar plan: usar campo plan de la BD, o basarse en rol como fallback
    let plan: UserPlan = UserPlan.FREE;
    
    if (user?.plan) {
      // Si tiene campo plan, usarlo directamente
      plan = user.plan.toUpperCase() as UserPlan;
      // Validar que el plan sea válido
      if (!Object.values(UserPlan).includes(plan)) {
        plan = UserPlan.FREE;
      }
    } else if (user?.role === 'ADMIN') {
      // Fallback: si es ADMIN y no tiene plan, asignar ADMIN
      plan = UserPlan.ADMIN;
    } else {
      // Por defecto FREE
      plan = UserPlan.FREE;
    }

    // Actualizar cache
    userPlanCache.set(userId, {
      plan,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return plan;
  } catch (error) {
    logger.error('Error getting user plan, defaulting to FREE', { userId, error });
    return UserPlan.FREE;
  }
}

/**
 * Rate limit dinámico basado en plan del usuario
 */
export const createPlanBasedRateLimit = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos por defecto
    max: async (req: Request) => {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return PLAN_LIMITS[UserPlan.FREE].requests;
      }

      const plan = await getUserPlan(userId);
      return PLAN_LIMITS[plan].requests;
    },
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.userId;
      return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`;
    },
    message: 'Too many requests. Please upgrade your plan or try again later.',
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

