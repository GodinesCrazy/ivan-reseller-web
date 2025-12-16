/**
 * ✅ PRODUCTION READY: Rate Limit Store
 * 
 * Store para rate limiting usando Redis o memoria
 * Soporta múltiples estrategias de rate limiting
 */

import { redis, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Fallback en memoria si Redis no está disponible
const memoryStore = new Map<string, RateLimitEntry>();

export class RateLimitStore {
  /**
   * Incrementar contador y verificar límite
   */
  async increment(
    key: string,
    windowMs: number,
    maxRequests: number
  ): Promise<{ count: number; remaining: number; resetTime: number }> {
    const now = Date.now();
    const resetTime = now + windowMs;

    if (isRedisAvailable && redis) {
      // Usar Redis con TTL
      try {
        const redisKey = `ratelimit:${key}`;
        const current = await redis.incr(redisKey);
        
        if (current === 1) {
          // Primera vez, setear TTL
          await redis.expire(redisKey, Math.ceil(windowMs / 1000));
        } else {
          // Verificar TTL existente
          const ttl = await redis.ttl(redisKey);
          if (ttl === -1) {
            // Sin TTL, setearlo
            await redis.expire(redisKey, Math.ceil(windowMs / 1000));
          }
        }

        const remaining = Math.max(0, maxRequests - current);
        return {
          count: current,
          remaining,
          resetTime,
        };
      } catch (error: any) {
        logger.warn('Redis rate limit failed, falling back to memory', {
          error: error.message,
          key,
        });
        // Fallback a memoria
      }
    }

    // Fallback a memoria
    const entry = memoryStore.get(key);
    if (!entry || entry.resetTime < now) {
      // Nueva ventana o expirada
      memoryStore.set(key, { count: 1, resetTime });
      return {
        count: 1,
        remaining: maxRequests - 1,
        resetTime,
      };
    }

    // Incrementar contador
    entry.count++;
    const remaining = Math.max(0, maxRequests - entry.count);
    
    return {
      count: entry.count,
      remaining,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Limpiar entradas expiradas (solo para memory store)
   */
  cleanup(): void {
    if (!isRedisAvailable || !redis) {
      const now = Date.now();
      for (const [key, entry] of memoryStore.entries()) {
        if (entry.resetTime < now) {
          memoryStore.delete(key);
        }
      }
    }
  }

  /**
   * Resetear contador (útil para testing o admin)
   */
  async reset(key: string): Promise<void> {
    if (isRedisAvailable && redis) {
      await redis.del(`ratelimit:${key}`);
    } else {
      memoryStore.delete(key);
    }
  }
}

export const rateLimitStore = new RateLimitStore();

// Limpiar memoria cada 5 minutos si no hay Redis
if (!isRedisAvailable || !redis) {
  setInterval(() => {
    rateLimitStore.cleanup();
  }, 5 * 60 * 1000);
}

