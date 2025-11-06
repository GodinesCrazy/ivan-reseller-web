import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware para APIs de marketplace
 * Previene abuse y respeta límites de APIs externas
 */

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
      return req.user?.userId?.toString() || req.ip || 'unknown';
    },
    message: 'Too many requests from this user, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
};

