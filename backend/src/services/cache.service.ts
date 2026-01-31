import { trace } from '../utils/boot-trace';
trace('loading cache.service');

import { redis, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Servicio de cache mejorado con soporte para Redis y fallback a memoria
 * Soporta TTL, invalidación por patrones, y cache de queries frecuentes
 */

interface CacheOptions {
  ttl?: number; // Time to live en segundos
  tags?: string[]; // Tags para invalidación por grupo
}

class CacheService {
  private memoryCache = new Map<string, { value: any; expiresAt: number; tags?: string[] }>();
  private readonly DEFAULT_TTL = 300; // 5 minutos por defecto
  private readonly MEMORY_CACHE_MAX_SIZE = 1000; // Máximo 1000 items en memoria

  /**
   * Obtener valor del cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Intentar Redis primero
      if (isRedisAvailable) {
        const cached = await redis.get(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          return parsed.value as T;
        }
      }

      // Fallback a memoria
      const cached = this.memoryCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as T;
      } else if (cached) {
        // Expiró, eliminar
        this.memoryCache.delete(key);
      }
    } catch (error) {
      logger.warn('Cache get error', { key, error });
    }

    return null;
  }

  /**
   * Guardar valor en cache
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || this.DEFAULT_TTL;
    const expiresAt = Date.now() + ttl * 1000;

    try {
      // Guardar en Redis si está disponible
      if (isRedisAvailable) {
        await redis.setex(key, ttl, JSON.stringify({ value, expiresAt, tags: options.tags }));
        return;
      }

      // Fallback a memoria
      // Limpiar cache si está lleno
      if (this.memoryCache.size >= this.MEMORY_CACHE_MAX_SIZE) {
        this.cleanExpired();
        // Si aún está lleno, eliminar el más antiguo
        if (this.memoryCache.size >= this.MEMORY_CACHE_MAX_SIZE) {
          const firstKey = this.memoryCache.keys().next().value;
          if (firstKey) {
            this.memoryCache.delete(firstKey);
          }
        }
      }

      this.memoryCache.set(key, { value, expiresAt, tags: options.tags });
    } catch (error) {
      logger.warn('Cache set error', { key, error });
    }
  }

  /**
   * Eliminar del cache
   */
  async delete(key: string): Promise<void> {
    try {
      if (isRedisAvailable) {
        await redis.del(key);
      }
      this.memoryCache.delete(key);
    } catch (error) {
      logger.warn('Cache delete error', { key, error });
    }
  }

  /**
   * Invalidar por patrón (solo Redis)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (isRedisAvailable) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        // Fallback: eliminar todas las keys que coincidan con el patrón
        const regex = new RegExp(pattern.replace('*', '.*'));
        for (const key of this.memoryCache.keys()) {
          if (regex.test(key)) {
            this.memoryCache.delete(key);
          }
        }
      }
    } catch (error) {
      logger.warn('Cache invalidate pattern error', { pattern, error });
    }
  }

  /**
   * Invalidar por tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      if (isRedisAvailable) {
        // Buscar todas las keys con esos tags
        const allKeys = await redis.keys('*');
        for (const key of allKeys) {
          const cached = await redis.get(key);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.tags && tags.some(tag => parsed.tags.includes(tag))) {
              await redis.del(key);
            }
          }
        }
      } else {
        // Fallback a memoria
        for (const [key, cached] of this.memoryCache.entries()) {
          if (cached.tags && tags.some(tag => cached.tags!.includes(tag))) {
            this.memoryCache.delete(key);
          }
        }
      }
    } catch (error) {
      logger.warn('Cache invalidate by tags error', { tags, error });
    }
  }

  /**
   * Limpiar entradas expiradas de memoria
   */
  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, cached] of this.memoryCache.entries()) {
      if (cached.expiresAt <= now) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Limpiar todo el cache
   */
  async clear(): Promise<void> {
    try {
      if (isRedisAvailable) {
        await redis.flushdb();
      }
      this.memoryCache.clear();
    } catch (error) {
      logger.warn('Cache clear error', { error });
    }
  }

  /**
   * Obtener o establecer (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Cache de queries frecuentes con key automática
   */
  async cacheQuery<T>(
    prefix: string,
    params: Record<string, any>,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const key = `${prefix}:${JSON.stringify(params)}`;
    return this.getOrSet(key, fetcher, options);
  }
}

export const cacheService = new CacheService();

