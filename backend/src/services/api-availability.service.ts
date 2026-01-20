/**
 * API Availability Service - MULTI-TENANT VERSION
 * Central system to detect which APIs are configured and working per user
 * All services should check this before attempting to use external APIs
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { supportsEnvironments } from '../config/api-keys.config';
import { OPTIONAL_MARKETPLACES } from '../config/marketplaces.config';
import { redis, isRedisAvailable } from '../config/redis';
import { circuitBreakerManager } from './circuit-breaker.service';
import { retryWithBackoff, isRetryableError } from '../utils/retry';
import { normalizeAPIName, resolveToCanonical } from '../utils/api-name-resolver';

export type APIHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

interface APIStatus {
  apiName: string;
  name: string;
  isConfigured: boolean;
  isAvailable: boolean;
  status?: APIHealthStatus; // Estado de salud: healthy, degraded, unhealthy, unknown
  lastChecked: Date;
  error?: string;
  message?: string;
  missingFields?: string[];
  environment?: 'sandbox' | 'production';
  isOptional?: boolean;
  latency?: number; // Latencia en ms
  trustScore?: number; // Score de confianza 0-100
}

interface APICapabilities {
  canPublishToEbay: boolean;
  canPublishToAmazon: boolean;
  canPublishToMercadoLibre: boolean;
  canScrapeAliExpress: boolean;
  canUseAI: boolean;
  canSolveCaptchas: boolean;
  canPayCommissions: boolean;
  canAutoPurchaseAliExpress: boolean;
}

export class APIAvailabilityService {
  private cache: Map<string, APIStatus> = new Map(); // Fallback cache en memoria
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes (para validación rápida)
  // 🚀 PERFORMANCE: TTL más corto para APIs críticas (5 min) vs no críticas (15 min)
  private healthCheckExpiry: number = 5 * 60 * 1000; // 5 minutes (para APIs críticas)
  private healthCheckExpiryNonCritical: number = 15 * 60 * 1000; // 15 minutes (para APIs no críticas)
  private useRedis: boolean = isRedisAvailable;
  private redisPrefix = 'api_availability:'; // Prefijo para keys de Redis
  private healthCheckPrefix = 'api_health:'; // Prefijo para health checks en Redis

  /**
   * 🚀 PERFORMANCE: Determinar TTL según criticidad de la API
   */
  private getHealthCheckTTL(apiName: string): number {
    // APIs críticas: eBay, Amazon, MercadoLibre (marketplaces principales)
    const criticalAPIs = ['ebay', 'amazon', 'mercadolibre'];
    if (criticalAPIs.includes(apiName.toLowerCase())) {
      return this.healthCheckExpiry; // 5 minutos
    }
    // APIs no críticas: GROQ, ScraperAPI, etc.
    return this.healthCheckExpiryNonCritical; // 15 minutos
  }

  /**
   * Generate cache key including userId for multi-tenant isolation
   */
  private getCacheKey(userId: number, apiName: string, environment?: string): string {
    if (environment) {
      return `user_${userId}_${apiName}-${environment}`;
    }
    return `user_${userId}_${apiName}`;
  }

  /**
   * Get full Redis key
   */
  private getRedisKey(userId: number, apiName: string): string {
    return `${this.redisPrefix}${this.getCacheKey(userId, apiName)}`;
  }

  /**
   * ✅ FASE 1: Get from cache (Redis or memory) with timeout protection
   * Prevents SIGSEGV by adding strict timeouts to Redis operations
   */
  private async getCached(key: string): Promise<APIStatus | null> {
    if (this.useRedis) {
      try {
        // ✅ FASE 1: Timeout estricto de 1 segundo para evitar bloqueos
        const cached = await Promise.race([
          redis.get(this.redisPrefix + key),
          new Promise<string | null>((_, reject) =>
            setTimeout(() => reject(new Error('Redis get timeout')), 1000)
          ),
        ]) as string | null;
        
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            // Convertir lastChecked de string a Date
            if (parsed.lastChecked) {
              parsed.lastChecked = new Date(parsed.lastChecked);
            }
            return parsed as APIStatus;
          } catch (parseError) {
            logger.warn('Failed to parse cached value, falling back to memory', { 
              error: parseError instanceof Error ? parseError.message : String(parseError),
              key 
            });
            // Fallback a cache en memoria si parsing falla
          }
        }
      } catch (error) {
        // ✅ FASE 1: No loguear timeout como error crítico, solo como warning
        const isTimeout = error instanceof Error && error.message === 'Redis get timeout';
        if (isTimeout) {
          logger.debug('Redis get timeout, falling back to memory cache', { key });
        } else {
          logger.warn('Failed to get from Redis cache, falling back to memory', { 
            error: error instanceof Error ? error.message : String(error),
            key 
          });
        }
        // Fallback a cache en memoria
      }
    }
    
    // Fallback a cache en memoria
    return this.cache.get(key) || null;
  }

  /**
   * ✅ FASE 1: Set cache (Redis or memory) with timeout protection
   * Prevents SIGSEGV by adding strict timeouts and non-blocking fallback
   */
  private async setCached(key: string, value: APIStatus): Promise<void> {
    // ✅ FASE 1: Siempre guardar en memoria primero (no bloqueante)
    this.cache.set(key, value);
    
    // ✅ FASE 1: Intentar guardar en Redis de forma asíncrona con timeout
    if (this.useRedis) {
      // Ejecutar Redis set en background sin bloquear
      Promise.race([
        (async () => {
          try {
            const serialized = JSON.stringify(value);
            // Guardar en Redis con TTL
            await redis.setex(
              this.redisPrefix + key,
              Math.floor(this.cacheExpiry / 1000), // TTL en segundos
              serialized
            );
          } catch (error) {
            // Error ya manejado por Promise.race timeout o Redis error
            throw error;
          }
        })(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Redis setex timeout')), 1000)
        ),
      ]).catch((error) => {
        // ✅ FASE 1: No loguear timeout como error crítico
        const isTimeout = error instanceof Error && error.message === 'Redis setex timeout';
        if (!isTimeout) {
          logger.warn('Failed to set Redis cache (non-blocking)', { 
            error: error instanceof Error ? error.message : String(error),
            key 
          });
        }
        // Cache en memoria ya está actualizado, no es crítico
      });
    }
  }

  /**
   * Delete from cache (Redis or memory)
   */
  private async deleteCached(key: string): Promise<void> {
    if (this.useRedis) {
      try {
        await redis.del(this.redisPrefix + key);
      } catch (error) {
        logger.warn('Failed to delete from Redis cache, falling back to memory', { error });
      }
    }
    
    // También eliminar de cache en memoria
    this.cache.delete(key);
  }

  /**
   * Get API credentials from database for specific user
   * Usa CredentialsManager para obtener credenciales desencriptadas correctamente
   */
  private async getUserCredentials(
    userId: number, 
    apiName: string,
    environment: 'sandbox' | 'production' = 'production'
  ): Promise<Record<string, string> | null> {
    try {
      // Usar CredentialsManager que maneja correctamente la desencriptación
      const { CredentialsManager } = await import('./credentials-manager.service');
      const credentials = await CredentialsManager.getCredentials(
        userId,
        apiName as any,
        environment
      );

      if (!credentials) {
        return null;
      }

      // Convertir a Record<string, string> para compatibilidad
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(credentials)) {
        if (value !== null && value !== undefined) {
          result[key] = String(value);
        }
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get credentials for user ${userId}, API ${apiName}`, error);
      return null;
    }
  }

  /**
   * Check if required fields are present
   */
  private hasRequiredFields(credentials: Record<string, string>, required: string[]): { 
    valid: boolean; 
    missing: string[] 
  } {
    const missing = required.filter(key => !credentials[key] || credentials[key].trim() === '');
    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Check if OAuth token is expired
   */
  private isTokenExpired(token: string): boolean {
    try {
      // Try to decode JWT token
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token, { complete: true });
      
      if (decoded && decoded.payload && decoded.payload.exp) {
        const expirationTime = decoded.payload.exp * 1000; // Convert to milliseconds
        const now = Date.now();
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
        return expirationTime <= (now + bufferTime);
      }
      
      // If not JWT, assume it might be expired (conservative approach)
      return false;
    } catch (error) {
      // If can't decode, assume not expired (let health check determine)
      return false;
    }
  }

  /**
   * Calculate health status based on metrics
   */
  private calculateHealthStatus(
    isAvailable: boolean,
    latency?: number,
    error?: string
  ): APIHealthStatus {
    if (!isAvailable) {
      return 'unhealthy';
    }

    if (error) {
      return 'degraded';
    }

    // Latency thresholds (ms)
    if (latency !== undefined) {
      if (latency > 5000) {
        return 'degraded'; // Very slow
      }
      if (latency > 10000) {
        return 'unhealthy'; // Extremely slow
      }
    }

    return 'healthy';
  }

  /**
   * Calculate trust score based on history
   */
  private async calculateTrustScore(
    userId: number,
    apiName: string,
    environment: string,
    currentStatus: APIHealthStatus
  ): Promise<number> {
    try {
      // Get last 10 status changes from history
      const history = await prisma.aPIStatusHistory.findMany({
        where: {
          userId,
          apiName,
          environment,
        },
        orderBy: { changedAt: 'desc' },
        take: 10,
      });

      if (history.length === 0) {
        return currentStatus === 'healthy' ? 100 : 50;
      }

      // Calculate score based on recent history
      let score = 100;
      const healthyCount = history.filter(h => h.status === 'healthy').length;
      const degradedCount = history.filter(h => h.status === 'degraded').length;
      const unhealthyCount = history.filter(h => h.status === 'unhealthy').length;

      // Weight recent status more
      if (history.length > 0) {
        const recentStatus = history[0].status;
        if (recentStatus === 'unhealthy') score -= 30;
        else if (recentStatus === 'degraded') score -= 15;
      }

      // Adjust based on overall history
      const total = history.length;
      score -= (unhealthyCount / total) * 40;
      score -= (degradedCount / total) * 20;

      return Math.max(0, Math.min(100, score));
    } catch (error) {
      logger.warn('Error calculating trust score', { userId, apiName, error });
      return 50; // Default score
    }
  }

  /**
   * Persist API status to database
   */
  private async persistStatus(
    userId: number,
    status: APIStatus,
    previousStatus?: APIStatus
  ): Promise<void> {
    try {
      // ✅ FIX: Guard - validate status and apiName before accessing
      if (!status || !status.apiName || typeof status.apiName !== 'string') {
        logger.warn('[persistStatus] Skipping invalid status entry', { userId, status });
        return;
      }
      
      const apiName = status.apiName;
      const environment = status.environment || 'production';
      const healthStatus = status.status || (status.isAvailable ? 'healthy' : 'unhealthy');

      // Save snapshot (current state)
      await prisma.aPIStatusSnapshot.upsert({
        where: {
          userId_apiName_environment: {
            userId,
            apiName,
            environment,
          },
        },
        create: {
          userId,
          apiName,
          environment,
          status: healthStatus,
          isAvailable: status.isAvailable,
          isConfigured: status.isConfigured,
          error: status.error || null,
          message: status.message || null,
          latency: status.latency || null,
          trustScore: status.trustScore || 100,
          lastChecked: status.lastChecked,
        },
        update: {
          status: healthStatus,
          isAvailable: status.isAvailable,
          isConfigured: status.isConfigured,
          error: status.error || null,
          message: status.message || null,
          latency: status.latency || null,
          trustScore: status.trustScore || 100,
          lastChecked: status.lastChecked,
        },
      });

      // Save to history if status changed
      if (!previousStatus || 
          previousStatus.status !== status.status ||
          previousStatus.isAvailable !== status.isAvailable) {
        await prisma.aPIStatusHistory.create({
          data: {
            userId,
            apiName,
            environment,
            status: healthStatus,
            previousStatus: previousStatus?.status || null,
            isAvailable: status.isAvailable,
            isConfigured: status.isConfigured,
            error: status.error || null,
            message: status.message || null,
            latency: status.latency || null,
            trustScore: status.trustScore || 100,
            changedAt: status.lastChecked,
          },
        });
      }
    } catch (error) {
      logger.warn('Error persisting API status', { userId, apiName: status.apiName, error });
      // Don't throw - persistence is not critical
    }
  }

  /**
   * Load persisted status from database
   */
  private async loadPersistedStatus(
    userId: number,
    apiName: string,
    environment: string
  ): Promise<APIStatus | null> {
    try {
      const snapshot = await prisma.aPIStatusSnapshot.findUnique({
        where: {
          userId_apiName_environment: {
            userId,
            apiName,
            environment,
          },
        },
      });

      if (!snapshot) {
        return null;
      }

      // Check if snapshot is recent (less than 1 hour old)
      const age = Date.now() - snapshot.lastChecked.getTime();
      if (age > 60 * 60 * 1000) {
        return null; // Too old, don't use
      }

      // ✅ FIX: Guard - validate snapshot before accessing apiName
      if (!snapshot || !snapshot.apiName || typeof snapshot.apiName !== 'string') {
        logger.warn('[loadPersistedStatus] Invalid snapshot entry', { userId, apiName, snapshot });
        return null;
      }
      
      return {
        apiName: snapshot.apiName,
        name: snapshot.apiName, // Will be set by caller
        isConfigured: snapshot.isConfigured,
        isAvailable: snapshot.isAvailable,
        status: snapshot.status as APIHealthStatus,
        lastChecked: snapshot.lastChecked,
        error: snapshot.error || undefined,
        message: snapshot.message || undefined,
        environment: snapshot.environment as 'sandbox' | 'production',
        latency: snapshot.latency || undefined,
        trustScore: snapshot.trustScore,
      };
    } catch (error) {
      logger.warn('Error loading persisted status', { userId, apiName, error });
      return null;
    }
  }

  /**
   * Perform real health check for eBay API
   */
  private async performEbayHealthCheck(
    userId: number,
    environment: 'sandbox' | 'production',
    credentials: Record<string, string>
  ): Promise<{ success: boolean; error?: string; latency?: number }> {
    const correlationId = `ebay-health-${Date.now()}`;
    const memoryStart = {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      unit: 'MB'
    };
    
    // ✅ FIX SIGSEGV: Circuit breaker con timeout estricto de 1500ms
    const breaker = circuitBreakerManager.getBreaker(`ebay-${environment}`, {
      failureThreshold: 3,
      timeout: 1500, // ✅ FIX: Timeout estricto de 1500ms (antes 60000ms)
    });

    try {
      // ✅ FIX SIGSEGV: Log inicio con memoria
      logger.info('[performEbayHealthCheck] Starting health check', {
        correlationId,
        userId,
        environment,
        memory: memoryStart
      });
      
      return await breaker.execute(async () => {
        const checkStartTime = Date.now();
        
        // ✅ FIX SIGSEGV: Timeout estricto de 1500ms con Promise.race
        const healthCheckPromise = (async () => {
          const { MarketplaceService } = await import('./marketplace.service');
          const marketplaceService = new MarketplaceService();
          
          const result = await retryWithBackoff(
            async () => {
              return await marketplaceService.testConnection(userId, 'ebay', environment);
            },
            {
              maxAttempts: 2,
              initialDelay: 1000,
              retryable: isRetryableError,
            }
          );
          const latency = Date.now() - checkStartTime;

          return {
            success: result.success,
            error: result.success ? undefined : result.message,
            latency,
          };
        })();
        
        // ✅ FIX SIGSEGV: Timeout de 1500ms - si excede, retornar degraded
        const timeoutPromise = new Promise<{ success: boolean; error?: string; latency?: number }>((resolve) => {
          setTimeout(() => {
            resolve({
              success: false,
              error: 'Health check timeout (1500ms)',
              latency: 1500
            });
          }, 1500);
        });
        
        const result = await Promise.race([healthCheckPromise, timeoutPromise]);
        
        const memoryEnd = {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          unit: 'MB'
        };
        
        // ✅ FIX SIGSEGV: Log fin con memoria
        logger.info('[performEbayHealthCheck] Health check completed', {
          correlationId,
          userId,
          environment,
          success: result.success,
          latency: result.latency,
          memory: {
            start: memoryStart,
            end: memoryEnd,
            delta: {
              heapUsed: memoryEnd.heapUsed - memoryStart.heapUsed,
              heapTotal: memoryEnd.heapTotal - memoryStart.heapTotal,
              rss: memoryEnd.rss - memoryStart.rss,
              unit: 'MB'
            }
          }
        });
        
        return result;
      });
    } catch (error: any) {
      const memoryEnd = {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        unit: 'MB'
      };
      
      // ✅ FIX SIGSEGV: Log error con memoria
      logger.error('[performEbayHealthCheck] Health check failed', {
        correlationId,
        userId,
        environment,
        error: error?.message || String(error),
        stack: error?.stack,
        memory: {
          start: memoryStart,
          end: memoryEnd
        }
      });
      
      // ✅ FIX SIGSEGV: NUNCA throw - siempre retornar status degraded
      if (error.message?.includes('Circuit breaker')) {
        // Circuit is open, return cached degraded status
        return { success: false, error: 'Service temporarily unavailable (circuit open)' };
      }
      return {
        success: false,
        error: error.message || 'Health check failed',
      };
    }
  }

  /**
   * Check eBay API availability for specific user
   * @param userId - User ID
   * @param environment - Environment (sandbox/production). Defaults to 'production'
   * @param forceHealthCheck - Force a real health check (bypass cache)
   */
  async checkEbayAPI(
    userId: number,
    environment: 'sandbox' | 'production' = 'production',
    forceHealthCheck: boolean = false
  ): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, `ebay-${environment}`);
    const healthCheckKey = `${this.healthCheckPrefix}${cacheKey}`;
    
    // Try to load from persisted status first (if recent)
    if (!forceHealthCheck) {
      const persistedStatus = await this.loadPersistedStatus(userId, 'ebay', environment);
      if (persistedStatus) {
        // Use persisted status if recent (less than 5 minutes)
        const age = Date.now() - persistedStatus.lastChecked.getTime();
        if (age < 5 * 60 * 1000) {
          persistedStatus.name = 'eBay Trading API';
          return persistedStatus;
        }
      }
    }
    
    // Level 1: Fast validation (check cache first)
    if (!forceHealthCheck) {
      const cached = await this.getCached(cacheKey);
      if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
        return cached;
      }
    }

    try {
      const requiredFields = ['appId', 'devId', 'certId'];
      const credentials = await this.getUserCredentials(userId, 'ebay', environment);
      
      // ✅ FIX: Logging detallado para debugging
      logger.info('[checkEbayAPI] Verificando credenciales', {
        userId,
        environment,
        hasCredentials: !!credentials,
        credentialKeys: credentials ? Object.keys(credentials) : [],
      });
      
      if (!credentials) {
        logger.warn('[checkEbayAPI] No se encontraron credenciales', { userId, environment });
        const status: APIStatus = {
          apiName: 'ebay',
          name: 'eBay Trading API',
          isConfigured: false,
          isAvailable: false,
          environment,
          lastChecked: new Date(),
          error: 'eBay API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ FIX: Normalización mejorada de nombres de campos (bidireccional)
      const normalizedCreds: Record<string, string> = {
        appId: credentials['appId'] || credentials['EBAY_APP_ID'] || '',
        devId: credentials['devId'] || credentials['EBAY_DEV_ID'] || '',
        certId: credentials['certId'] || credentials['EBAY_CERT_ID'] || '',
        token: credentials['token'] || credentials['authToken'] || credentials['accessToken'] || credentials['EBAY_TOKEN'] || '',
        refreshToken: credentials['refreshToken'] || credentials['EBAY_REFRESH_TOKEN'] || '',
        redirectUri: credentials['redirectUri'] || credentials['ruName'] || credentials['EBAY_REDIRECT_URI'] || '',
      };

      // ✅ FIX: Logging de normalización
      logger.info('[checkEbayAPI] Credenciales normalizadas', {
        userId,
        environment,
        hasAppId: !!normalizedCreds.appId && normalizedCreds.appId.length > 0,
        hasDevId: !!normalizedCreds.devId && normalizedCreds.devId.length > 0,
        hasCertId: !!normalizedCreds.certId && normalizedCreds.certId.length > 0,
        appIdLength: normalizedCreds.appId.length,
        devIdLength: normalizedCreds.devId.length,
        certIdLength: normalizedCreds.certId.length,
        hasToken: !!normalizedCreds.token,
      });

      const validation = this.hasRequiredFields(normalizedCreds, requiredFields);
      
      // ✅ FIX: Logging de validación
      logger.info('[checkEbayAPI] Validación de campos', {
        userId,
        environment,
        valid: validation.valid,
        missing: validation.missing,
      });

      // ✅ FIX SIGSEGV: Level 2: Real health check (only if fields are valid and not recently checked)
      // NO ejecutar health checks activos si SAFE_AUTH_STATUS_MODE está activo
      let healthCheckResult: { success: boolean; error?: string } | null = null;
      const lastHealthCheck = await this.getCached(healthCheckKey);
      // 🚀 PERFORMANCE: Usar TTL dinámico según criticidad
      const healthCheckTTL = this.getHealthCheckTTL('ebay');
      const shouldPerformHealthCheck = 
        forceHealthCheck || 
        !lastHealthCheck || 
        Date.now() - lastHealthCheck.lastChecked.getTime() >= healthCheckTTL;
      
      // ✅ FIX SIGSEGV: Verificar SAFE_AUTH_STATUS_MODE antes de ejecutar health check activo
      const { env } = await import('../config/env');
      const safeAuthStatusMode = env.SAFE_AUTH_STATUS_MODE ?? true;

      if (validation.valid && shouldPerformHealthCheck && !safeAuthStatusMode) {
        // ✅ FIX SIGSEGV: Solo ejecutar health check si SAFE_AUTH_STATUS_MODE está desactivado
        try {
          healthCheckResult = await this.performEbayHealthCheck(userId, environment, normalizedCreds);
          // Cache health check result
          await this.setCached(healthCheckKey, {
            apiName: 'ebay',
            name: 'eBay Trading API',
            isConfigured: true,
            isAvailable: healthCheckResult.success,
            environment,
            lastChecked: new Date(),
            error: healthCheckResult.error,
            message: healthCheckResult.success ? 'API funcionando correctamente' : healthCheckResult.error,
          } as APIStatus);
        } catch (error: any) {
          logger.warn(`Health check failed for eBay ${environment}`, { userId, error: error.message });
          // Don't fail completely, use field validation result
        }
      } else if (lastHealthCheck && validation.valid) {
        // Use cached health check result
        healthCheckResult = {
          success: lastHealthCheck.isAvailable,
          error: lastHealthCheck.error,
        };
      } else if (safeAuthStatusMode && validation.valid) {
        // ✅ FIX SIGSEGV: En SAFE_AUTH_STATUS_MODE, usar status "degraded" sin hacer health check activo
        logger.info('[checkEbayAPI] SAFE_AUTH_STATUS_MODE enabled - skipping active health check', {
          userId,
          environment
        });
        healthCheckResult = {
          success: false, // Asumir degraded hasta que se haga check activo
          error: 'Health check skipped (SAFE_AUTH_STATUS_MODE)'
        };
      }

      const tokenLike = normalizedCreds.token;
      const refreshToken = normalizedCreds.refreshToken;

      // Check if token is expired
      let tokenExpired = false;
      if (tokenLike && !refreshToken) {
        tokenExpired = this.isTokenExpired(tokenLike);
      }

      // Load previous status for comparison
      const previousStatus = await this.loadPersistedStatus(userId, 'ebay', environment);

      // Determine availability and health status
      let isAvailable = validation.valid && (!!tokenLike || !!refreshToken) && !tokenExpired;
      if (healthCheckResult) {
        isAvailable = isAvailable && healthCheckResult.success;
      }

      // Calculate health status
      const healthStatus = this.calculateHealthStatus(
        isAvailable,
        (healthCheckResult as any)?.latency,
        healthCheckResult?.error
      );

      // Calculate trust score
      const trustScore = await this.calculateTrustScore(userId, 'ebay', environment, healthStatus);

      const status: APIStatus = {
        apiName: 'ebay',
        name: 'eBay Trading API',
        isConfigured: validation.valid,
        isAvailable,
        status: healthStatus,
        environment,
        lastChecked: new Date(),
        missingFields: validation.missing,
        latency: (healthCheckResult as any)?.latency,
        trustScore,
      };

      // ✅ MEJORA: Distinguir entre "falta todo" vs "credenciales básicas guardadas pero falta OAuth"
      if (tokenExpired) {
        status.isAvailable = false;
        status.status = 'unhealthy';
        status.error = 'Token OAuth expirado';
        status.message = 'El token OAuth ha expirado. Reautoriza en Settings → API Settings → eBay.';
      } else if (!validation.valid) {
        // Primero verificar si faltan credenciales básicas
        status.isAvailable = false;
        status.status = 'unhealthy';
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else if (!tokenLike && !refreshToken) {
        // ✅ CORRECCIÓN: Si las credenciales básicas están correctas pero falta OAuth,
        // NO marcar como "unhealthy", sino como "pending_oauth" (degraded)
        // Esto es normal después de guardar credenciales básicas
        status.isAvailable = false;
        status.status = 'degraded'; // Cambiar de 'unhealthy' a 'degraded'
        status.error = 'Falta token OAuth de eBay';
        status.message = 'Credenciales básicas guardadas. Completa la autorización OAuth para activar.';
      } else if (healthCheckResult && !healthCheckResult.success) {
        status.isAvailable = false;
        status.status = healthStatus;
        status.error = healthCheckResult.error || 'Health check failed';
        status.message = healthCheckResult.error || 'La API no responde correctamente';
      } else if (healthCheckResult?.success) {
        status.message = healthStatus === 'healthy' 
          ? 'API funcionando correctamente' 
          : 'API funcionando con problemas menores';
      } else {
        status.message = 'API configurada correctamente';
      }

      // Persist to database
      await this.persistStatus(userId, status, previousStatus || undefined);

      await this.setCached(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'ebay',
        name: 'eBay Trading API',
        isConfigured: false,
        isAvailable: false,
        environment,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      await this.setCached(cacheKey, status);
      return status;
    }
  }

  /**
   * Check Amazon SP-API availability for specific user
   * @param userId - User ID
   * @param environment - Environment (sandbox/production). Defaults to 'production'
   */
  async checkAmazonAPI(userId: number, environment: 'sandbox' | 'production' = 'production'): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, `amazon-${environment}`);
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    const isOptional = OPTIONAL_MARKETPLACES.includes('amazon');
    try {
      const requiredFields = [
        'AMAZON_SELLER_ID',
        'AMAZON_CLIENT_ID',
        'AMAZON_CLIENT_SECRET',
        'AMAZON_REFRESH_TOKEN',
        'AMAZON_ACCESS_KEY_ID',
        'AMAZON_SECRET_ACCESS_KEY',
        'AMAZON_REGION',
        'AMAZON_MARKETPLACE_ID'
      ];
      const credentials = await this.getUserCredentials(userId, 'amazon', environment);
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'amazon',
          name: 'Amazon SP-API',
          isConfigured: false,
          isAvailable: false,
          environment,
          lastChecked: new Date(),
          isOptional,
          message: isOptional
            ? 'Opcional: agrega credenciales de Amazon para mejorar la comparación de precios.'
            : 'Amazon API not configured for this user',
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: 'amazon',
        name: 'Amazon SP-API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        environment,
        lastChecked: new Date(),
        missingFields: validation.missing,
        isOptional,
      };

      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        if (isOptional) {
          status.message = `Opcional: faltan campos (${missingList}). La precisión será menor hasta que los completes.`;
        } else {
          status.error = `Missing credentials: ${missingList}`;
          status.message = `Faltan credenciales requeridas: ${missingList}`;
        }
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'amazon',
        name: 'Amazon SP-API',
        isConfigured: false,
        isAvailable: false,
        environment,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        isOptional,
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check MercadoLibre API availability for specific user
   * @param userId - User ID
   * @param environment - Environment (sandbox/production). Defaults to 'production'
   */
  async checkMercadoLibreAPI(userId: number, environment: 'sandbox' | 'production' = 'production'): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, `mercadolibre-${environment}`);
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    const isOptional = OPTIONAL_MARKETPLACES.includes('mercadolibre');
    try {
      const requiredFields = ['MERCADOLIBRE_CLIENT_ID', 'MERCADOLIBRE_CLIENT_SECRET'];
      const credentials = await this.getUserCredentials(userId, 'mercadolibre', environment);
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'mercadolibre',
          name: 'MercadoLibre API',
          isConfigured: false,
          isAvailable: false,
          environment,
          lastChecked: new Date(),
          isOptional,
          message: isOptional
            ? 'Opcional: agrega credenciales de MercadoLibre para ampliar la cobertura regional.'
            : 'MercadoLibre API not configured for this user',
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);
      
      // ✅ CORRECCIÓN MERCADOLIBRE OAUTH: Verificar tokens OAuth
      const accessToken = credentials['accessToken'] || credentials['MERCADOLIBRE_ACCESS_TOKEN'] || '';
      const refreshToken = credentials['refreshToken'] || credentials['MERCADOLIBRE_REFRESH_TOKEN'] || '';
      const tokenLike = accessToken;
      const hasToken = !!(tokenLike || refreshToken);

      const status: APIStatus = {
        apiName: 'mercadolibre',
        name: 'MercadoLibre API',
        isConfigured: validation.valid,
        isAvailable: validation.valid && hasToken,
        status: validation.valid && hasToken ? 'healthy' : (validation.valid ? 'degraded' : 'unhealthy'),
        environment,
        lastChecked: new Date(),
        missingFields: validation.missing,
        isOptional,
      };

      // ✅ MEJORA: Distinguir entre "falta todo" vs "credenciales básicas guardadas pero falta OAuth"
      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        if (isOptional) {
          status.message = `Opcional: faltan campos (${missingList}). Configúralos para mejorar la precisión regional.`;
        } else {
          status.error = `Missing credentials: ${missingList}`;
          status.message = `Faltan credenciales requeridas: ${missingList}`;
        }
      } else if (!hasToken) {
        // ✅ CORRECCIÓN: Si las credenciales básicas están correctas pero falta OAuth
        status.isAvailable = false;
        status.status = 'degraded';
        status.error = 'Falta token OAuth de MercadoLibre';
        status.message = 'Credenciales básicas guardadas. Completa la autorización OAuth para activar.';
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'mercadolibre',
        name: 'MercadoLibre API',
        isConfigured: false,
        isAvailable: false,
        environment,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        isOptional,
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check GROQ AI API availability for specific user
   */
  async checkGroqAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'groq');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      // ✅ CORRECCIÓN GROQ: Buscar campo en camelCase (como se guarda) y UPPER_CASE (legacy)
      const credentials = await this.getUserCredentials(userId, 'groq');
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'groq',
          name: 'GROQ AI API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'GROQ API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN GROQ: Verificar campo con nombres correctos (camelCase + UPPER_CASE para compatibilidad)
      const apiKey = credentials['apiKey'] || credentials['GROQ_API_KEY'];
      const hasApiKey = !!(apiKey && String(apiKey).trim());

      const validation = {
        valid: hasApiKey,
        missing: !hasApiKey ? ['apiKey'] : []
      };

      const status: APIStatus = {
        apiName: 'groq',
        name: 'GROQ AI API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        status: validation.valid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: apiKey`;
        status.message = `Faltan credenciales requeridas: apiKey`;
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'groq',
        name: 'GROQ AI API',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check ScraperAPI availability for specific user
   */
  async checkSerpAPI(userId: number): Promise<APIStatus> {
    // ✅ FIX: Agregar caché como otros métodos de verificación
    const cacheKey = this.getCacheKey(userId, 'serpapi');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      logger.debug('[checkSerpAPI] Returning cached status', { userId, cacheKey, isConfigured: cached.isConfigured });
      return cached;
    }
    
    try {
      // ✅ FIX: Logging detallado para debugging
      logger.info('[checkSerpAPI] Verificando credenciales', {
        userId,
        searchingFor: 'serpapi',
        cacheKey
      });
      
      // ✅ REFACTOR: Usar nombre canónico directamente (serpapi)
      const canonicalName = resolveToCanonical('serpapi');
      let credentials = await this.getUserCredentials(userId, canonicalName, 'production');
      
      logger.info('[checkSerpAPI] Resultado búsqueda con serpapi', {
        userId,
        found: !!credentials,
        credentialKeys: credentials ? Object.keys(credentials) : []
      });
      
      // Si no se encontraron credenciales con 'serpapi', intentar con alias 'googletrends'
      if (!credentials) {
        logger.info('[checkSerpAPI] No se encontraron credenciales con serpapi, intentando con googletrends', { userId });
        const googletrendsCreds = await this.getUserCredentials(userId, 'googletrends', 'production');
        
        logger.info('[checkSerpAPI] Resultado búsqueda con googletrends', {
          userId,
          found: !!googletrendsCreds,
          credentialKeys: googletrendsCreds ? Object.keys(googletrendsCreds) : []
        });
        
        if (googletrendsCreds) {
          credentials = googletrendsCreds;
        }
      }
        
      if (!credentials) {
        logger.warn('[checkSerpAPI] No se encontraron credenciales ni con serpapi ni con googletrends', { userId });
        const status: APIStatus = {
          apiName: 'serpapi',
          name: 'SerpAPI (Google Trends)',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          message: 'API key no configurada. Opcional: si no se configura, el sistema usará análisis de datos internos.',
          status: 'unhealthy'
        };
        // ✅ FIX: Guardar en caché de forma asíncrona
        this.setCached(cacheKey, status).catch(() => {});
        return status;
      }
      
      // Usar credenciales encontradas (pueden ser de 'serpapi' o 'googletrends')
      const apiKey = credentials.apiKey || credentials.SERP_API_KEY || credentials.GOOGLE_TRENDS_API_KEY;
      
      logger.info('[checkSerpAPI] Verificando API key', {
        userId,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        apiKeyPreview: apiKey ? `${apiKey.substring(0, 10)}...` : 'none'
      });
      
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        logger.warn('[checkSerpAPI] API key vacía o inválida en credenciales serpapi', { userId });
        const status: APIStatus = {
          apiName: 'serpapi',
          name: 'SerpAPI (Google Trends)',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          message: 'API key vacía o inválida',
          status: 'unhealthy'
        };
        // ✅ FIX: Guardar en caché de forma asíncrona
        this.setCached(cacheKey, status).catch(() => {});
        return status;
      }
      
      // Validar formato básico de API key (típicamente alfanumérica)
      if (!/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
        logger.warn('[checkSerpAPI] API key con formato inválido', { userId, apiKeyLength: apiKey.length });
        const status: APIStatus = {
          apiName: 'serpapi',
          name: 'SerpAPI (Google Trends)',
          isConfigured: true,
          isAvailable: false,
          lastChecked: new Date(),
          message: 'API key con formato inválido',
          status: 'unhealthy'
        };
        // ✅ FIX: Guardar en caché de forma asíncrona
        this.setCached(cacheKey, status).catch(() => {});
        return status;
      }
      
      logger.info('[checkSerpAPI] API key válida encontrada en serpapi', { userId });
      const status: APIStatus = {
        apiName: 'serpapi',
        name: 'SerpAPI (Google Trends)',
        isConfigured: true,
        isAvailable: true,
        lastChecked: new Date(),
        message: 'API configurada y lista para usar',
        status: 'healthy'
      };
      // ✅ FIX: Guardar en caché de forma asíncrona después de retornar para evitar que crash SIGSEGV interrumpa la respuesta
      // Esto permite que la respuesta HTTP se envíe inmediatamente
      this.setCached(cacheKey, status).catch((err) => {
        logger.warn('[checkSerpAPI] Failed to cache status (non-blocking)', { userId, error: err?.message });
      });
      return status;
    } catch (error: any) {
      logger.error('Error checking SerpAPI', { userId, error: error.message, stack: error.stack });
      const status: APIStatus = {
        apiName: 'serpapi',
        name: 'SerpAPI (Google Trends)',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error.message,
        status: 'unhealthy'
      };
      // ✅ FIX: Guardar en caché de forma asíncrona
      this.setCached(cacheKey, status).catch(() => {});
      return status;
    }
  }

  async checkScraperAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'scraperapi');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      // ✅ CORRECCIÓN SCRAPERAPI: Buscar campo en camelCase (como se guarda) y UPPER_CASE (legacy)
      const credentials = await this.getUserCredentials(userId, 'scraperapi');
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'scraperapi',
          name: 'ScraperAPI',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'ScraperAPI not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN SCRAPERAPI: Verificar campo con nombres correctos (camelCase + UPPER_CASE para compatibilidad)
      const apiKey = credentials['apiKey'] || credentials['SCRAPERAPI_KEY'] || credentials['SCRAPER_API_KEY'];
      const hasApiKey = !!(apiKey && String(apiKey).trim());

      const validation = {
        valid: hasApiKey,
        missing: !hasApiKey ? ['apiKey'] : []
      };

      const status: APIStatus = {
        apiName: 'scraperapi',
        name: 'ScraperAPI',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        status: validation.valid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: apiKey`;
        status.message = `Faltan credenciales requeridas: apiKey`;
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'scraperapi',
        name: 'ScraperAPI',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check ZenRows availability for specific user
   */
  async checkZenRowsAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'zenrows');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      // ✅ CORRECCIÓN ZENROWS: Buscar campo en camelCase (como se guarda) y UPPER_CASE (legacy)
      const credentials = await this.getUserCredentials(userId, 'zenrows');
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'zenrows',
          name: 'ZenRows',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'ZenRows not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN ZENROWS: Verificar campo con nombres correctos (camelCase + UPPER_CASE para compatibilidad)
      const apiKey = credentials['apiKey'] || credentials['ZENROWS_API_KEY'];
      const hasApiKey = !!(apiKey && String(apiKey).trim());

      const validation = {
        valid: hasApiKey,
        missing: !hasApiKey ? ['apiKey'] : []
      };

      const status: APIStatus = {
        apiName: 'zenrows',
        name: 'ZenRows',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        status: validation.valid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: apiKey`;
        status.message = `Faltan credenciales requeridas: apiKey`;
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'zenrows',
        name: 'ZenRows',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check 2Captcha availability for specific user
   */
  async check2CaptchaAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, '2captcha');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      // ✅ CORRECCIÓN 2CAPTCHA: Buscar campo en camelCase (como se guarda) y UPPER_CASE (legacy)
      const credentials = await this.getUserCredentials(userId, '2captcha');
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: '2captcha',
          name: '2Captcha',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: '2Captcha not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN 2CAPTCHA: Verificar campo con nombres correctos (camelCase + múltiples variantes UPPER_CASE para compatibilidad)
      const apiKey = credentials['apiKey'] || credentials['CAPTCHA_2CAPTCHA_KEY'] || credentials['TWO_CAPTCHA_API_KEY'] || credentials['2CAPTCHA_API_KEY'];
      const hasApiKey = !!(apiKey && String(apiKey).trim());

      const validation = {
        valid: hasApiKey,
        missing: !hasApiKey ? ['apiKey'] : []
      };

      const status: APIStatus = {
        apiName: '2captcha',
        name: '2Captcha',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        status: validation.valid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: apiKey`;
        status.message = `Faltan credenciales requeridas: apiKey`;
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: '2captcha',
        name: '2Captcha',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check PayPal Payouts API availability for specific user
   * 
   * ✅ NOTA: PayPal usa 'live' en el schema pero 'production' internamente en el servicio
   * El servicio convierte 'live' a 'production' automáticamente
   */
  async checkPayPalAPI(userId: number, environment: 'sandbox' | 'production' = 'production', forceRefresh: boolean = false): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, `paypal-${environment}`);
    const cached = await this.getCached(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      // ✅ CORRECCIÓN PAYPAL: Buscar campos en camelCase (como se guardan) y UPPER_CASE (legacy)
      const requiredFields = ['clientId', 'clientSecret', 'environment'];
      const credentials = await this.getUserCredentials(userId, 'paypal', environment);
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'paypal',
          name: 'PayPal Payouts API',
          isConfigured: false,
          isAvailable: false,
          environment,
          lastChecked: new Date(),
          error: 'PayPal API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN PAYPAL: Verificar campos con nombres correctos (camelCase)
      // También aceptar UPPER_CASE para compatibilidad
      const clientId = credentials['clientId'] || credentials['PAYPAL_CLIENT_ID'];
      const clientSecret = credentials['clientSecret'] || credentials['PAYPAL_CLIENT_SECRET'];
      const env = credentials['environment'] || credentials['PAYPAL_ENVIRONMENT'] || credentials['PAYPAL_MODE'];
      
      const hasClientId = !!(clientId && String(clientId).trim());
      const hasClientSecret = !!(clientSecret && String(clientSecret).trim());
      const hasEnvironment = !!(env && (env === 'sandbox' || env === 'live' || env === 'production'));
      
      const validation = {
        valid: hasClientId && hasClientSecret && hasEnvironment,
        missing: [
          !hasClientId && 'clientId',
          !hasClientSecret && 'clientSecret',
          !hasEnvironment && 'environment'
        ].filter(Boolean) as string[]
      };

      // ✅ VERIFICAR: Si el environment en las credenciales coincide con el solicitado
      const credEnv = env === 'live' ? 'production' : (env === 'production' ? 'production' : 'sandbox');
      const envMismatch = credEnv !== environment;

      const status: APIStatus = {
        apiName: 'paypal',
        name: 'PayPal Payouts API',
        isConfigured: validation.valid,
        isAvailable: validation.valid && !envMismatch,
        status: validation.valid && !envMismatch ? 'healthy' : (validation.valid ? 'degraded' : 'unhealthy'),
        environment,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else if (envMismatch) {
        // ✅ ADVERTENCIA: environment en credenciales no coincide con el solicitado
        status.status = 'degraded';
        status.error = `Environment mismatch: credenciales tienen environment=${env} pero se solicitó ${environment}`;
        status.message = `Advertencia: El environment de las credenciales (${env}) no coincide con el solicitado (${environment}).`;
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'paypal',
        name: 'PayPal Payouts API',
        isConfigured: false,
        isAvailable: false,
        environment,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check AliExpress Auto-Purchase availability for specific user
   */
  async checkAliExpressAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'aliexpress');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      // ✅ CORRECCIÓN ALIEXPRESS AUTO-PURCHASE: Buscar campos en camelCase (como se guardan) y UPPER_CASE (legacy)
      const credentials = await this.getUserCredentials(userId, 'aliexpress');
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'aliexpress',
          name: 'AliExpress Auto-Purchase',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'AliExpress API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN ALIEXPRESS AUTO-PURCHASE: Verificar campos con nombres correctos (camelCase + múltiples variantes UPPER_CASE para compatibilidad)
      const email = credentials['email'] || credentials['ALIEXPRESS_EMAIL'] || credentials['ALIEXPRESS_USERNAME'];
      const password = credentials['password'] || credentials['ALIEXPRESS_PASSWORD'];
      
      const hasEmail = !!(email && String(email).trim());
      const hasPassword = !!(password && String(password).trim());

      const validation = {
        valid: hasEmail && hasPassword,
        missing: [
          !hasEmail && 'email',
          !hasPassword && 'password'
        ].filter(Boolean) as string[]
      };

      const status: APIStatus = {
        apiName: 'aliexpress',
        name: 'AliExpress Auto-Purchase',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        status: validation.valid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'aliexpress',
        name: 'AliExpress Auto-Purchase',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check AliExpress Affiliate API availability for specific user
   * 
   * ✅ NOTA: AliExpress Affiliate API usa el mismo endpoint para sandbox y production
   * La distinción es solo organizacional. Sin embargo, validamos por ambiente
   * para mantener consistencia con otras APIs.
   */
  async checkAliExpressAffiliateAPI(userId: number, environment: 'sandbox' | 'production' = 'production', forceRefresh: boolean = false): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, `aliexpress-affiliate-${environment}`);
    const cached = await this.getCached(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['appKey', 'appSecret'];
      const credentials = await this.getUserCredentials(userId, 'aliexpress-affiliate', environment);
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'aliexpress-affiliate',
          name: 'AliExpress Affiliate API',
          isConfigured: false,
          isAvailable: false,
          environment,
          lastChecked: new Date(),
          error: 'AliExpress Affiliate API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);
      
      // ✅ CRÍTICO: Sincronizar sandbox flag con environment
      // Aunque el endpoint es el mismo, mantenemos consistencia organizacional
      const credSandbox = credentials['sandbox'];
      const envSandbox = environment === 'sandbox';
      const credSandboxBool = credSandbox === 'true' || credSandbox === '1';
      const sandboxMismatch = credSandbox !== undefined && credSandboxBool !== envSandbox;

      const status: APIStatus = {
        apiName: 'aliexpress-affiliate',
        name: 'AliExpress Affiliate API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        status: validation.valid ? 'healthy' : 'unhealthy',
        environment,
        lastChecked: new Date(),
        missingFields: validation.missing,
      };

      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else if (sandboxMismatch) {
        // ✅ ADVERTENCIA: sandbox flag no coincide con environment
        status.status = 'degraded';
        status.error = `Sandbox flag mismatch: credenciales tienen sandbox=${credSandbox} pero environment=${environment}`;
        status.message = `Advertencia: El flag sandbox de las credenciales no coincide con el ambiente seleccionado. Nota: AliExpress Affiliate API usa el mismo endpoint para ambos ambientes, pero mantenemos la distinción por consistencia.`;
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'aliexpress-affiliate',
        name: 'AliExpress Affiliate API',
        isConfigured: false,
        isAvailable: false,
        environment,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check AliExpress Dropshipping API availability for specific user
   */
  async checkAliExpressDropshippingAPI(userId: number, environment: 'sandbox' | 'production' = 'production', forceRefresh: boolean = false): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, `aliexpress-dropshipping-${environment}`);
    const cached = await this.getCached(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['appKey', 'appSecret'];
      const credentials = await this.getUserCredentials(userId, 'aliexpress-dropshipping', environment);
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'aliexpress-dropshipping',
          name: 'AliExpress Dropshipping API',
          isConfigured: false,
          isAvailable: false,
          environment,
          lastChecked: new Date(),
          error: 'AliExpress Dropshipping API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);
      
      // ✅ CORRECCIÓN ALIEXPRESS DROPSHIPPING OAUTH: Verificar tokens OAuth
      const accessToken = credentials['accessToken'] || '';
      const refreshToken = credentials['refreshToken'] || '';
      const hasToken = !!(accessToken || refreshToken);
      
      // ✅ CRÍTICO: Sincronizar sandbox flag con environment
      const credSandbox = credentials['sandbox'];
      const envSandbox = environment === 'sandbox';
      const credSandboxBool = credSandbox === 'true' || credSandbox === '1';
      const sandboxMismatch = credSandbox !== undefined && credSandboxBool !== envSandbox;

      const status: APIStatus = {
        apiName: 'aliexpress-dropshipping',
        name: 'AliExpress Dropshipping API',
        isConfigured: validation.valid,
        isAvailable: validation.valid && hasToken,
        status: validation.valid && hasToken ? 'healthy' : (validation.valid ? 'degraded' : 'unhealthy'),
        environment,
        lastChecked: new Date(),
        missingFields: validation.missing,
      };

      // ✅ MEJORA: Distinguir entre "falta todo" vs "credenciales básicas guardadas pero falta OAuth"
      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else if (sandboxMismatch) {
        // ✅ ADVERTENCIA: sandbox flag no coincide con environment
        status.status = 'degraded';
        status.error = `Sandbox flag mismatch: credenciales tienen sandbox=${credSandbox} pero environment=${environment}`;
        status.message = `Advertencia: El flag sandbox de las credenciales no coincide con el ambiente seleccionado.`;
      } else if (!hasToken) {
        // ✅ CORRECCIÓN: Si las credenciales básicas están correctas pero falta OAuth
        status.isAvailable = false;
        status.status = 'degraded';
        status.error = 'Falta token OAuth de AliExpress Dropshipping';
        status.message = 'Credenciales básicas guardadas. Completa la autorización OAuth para activar.';
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'aliexpress-dropshipping',
        name: 'AliExpress Dropshipping API',
        isConfigured: false,
        isAvailable: false,
        environment,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check Email/SMTP API availability for specific user
   */
  async checkEmailAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'email', 'production');
    if (!forceRefresh) {
      const cached = await this.getCached(cacheKey);
      if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
        return cached;
      }
    } else {
      await this.deleteCached(cacheKey);
    }

    try {
      // ✅ CORRECCIÓN EMAIL: Buscar credenciales en CredentialsManager primero, luego variables de entorno
      let credentials = await this.getUserCredentials(userId, 'email', 'production').catch(() => null);
      
      // Si no hay credenciales en la BD, verificar variables de entorno
      if (!credentials) {
        const hasEnvHost = !!(process.env.EMAIL_HOST || process.env.SMTP_HOST);
        const hasEnvUser = !!(process.env.EMAIL_USER || process.env.SMTP_USER);
        const hasEnvPass = !!(process.env.EMAIL_PASSWORD || process.env.SMTP_PASS);
        const hasEnvFrom = !!(process.env.EMAIL_FROM || process.env.SMTP_FROM);
        
        if (hasEnvHost && hasEnvUser && hasEnvPass && hasEnvFrom) {
          // Usar variables de entorno como credenciales
          credentials = {
            host: process.env.EMAIL_HOST || process.env.SMTP_HOST || '',
            port: parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || '587'),
            user: process.env.EMAIL_USER || process.env.SMTP_USER || '',
            password: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || '',
            from: process.env.EMAIL_FROM || process.env.SMTP_FROM || '',
            fromName: process.env.EMAIL_FROM_NAME || process.env.SMTP_FROM_NAME,
            secure: process.env.EMAIL_SECURE === 'true' || process.env.SMTP_SECURE === 'true' || false,
          };
        }
      }
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'email',
          name: 'Email SMTP',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'Email SMTP not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN EMAIL: Verificar campos con nombres correctos (camelCase + múltiples variantes)
      const host = credentials['host'] || credentials['EMAIL_HOST'] || credentials['SMTP_HOST'] || '';
      const port = credentials['port'] || parseInt(String(credentials['EMAIL_PORT'] || credentials['SMTP_PORT'] || '587'));
      const user = credentials['user'] || credentials['EMAIL_USER'] || credentials['SMTP_USER'] || '';
      const password = credentials['password'] || credentials['EMAIL_PASSWORD'] || credentials['SMTP_PASS'] || '';
      const from = credentials['from'] || credentials['EMAIL_FROM'] || credentials['SMTP_FROM'] || '';
      
      const hasHost = !!(host && String(host).trim());
      const hasPort = !!(port && port > 0 && port <= 65535);
      const hasUser = !!(user && String(user).trim());
      const hasPassword = !!(password && String(password).trim());
      const hasFrom = !!(from && String(from).trim() && from.includes('@')); // Validar que sea un email válido

      const validation = {
        valid: hasHost && hasPort && hasUser && hasPassword && hasFrom,
        missing: [
          !hasHost && 'host',
          !hasPort && 'port',
          !hasUser && 'user',
          !hasPassword && 'password',
          !hasFrom && 'from'
        ].filter(Boolean) as string[]
      };

      // ✅ VALIDAR: Formato de puerto
      let portValid = true;
      let portError: string | undefined;
      if (hasPort) {
        const portNum = typeof port === 'number' ? port : parseInt(String(port));
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          portValid = false;
          portError = 'Port must be a number between 1 and 65535';
        }
      }

      // ✅ VALIDAR: Formato de email en 'from'
      let fromEmailValid = true;
      let fromEmailError: string | undefined;
      if (hasFrom) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(from).trim())) {
          fromEmailValid = false;
          fromEmailError = 'From address must be a valid email address';
        }
      }

      const status: APIStatus = {
        apiName: 'email',
        name: 'Email SMTP',
        isConfigured: validation.valid && portValid && fromEmailValid,
        isAvailable: validation.valid && portValid && fromEmailValid,
        status: validation.valid && portValid && fromEmailValid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else if (!portValid) {
        status.error = portError || 'Port format invalid';
        status.message = portError || 'El puerto debe ser un número entre 1 y 65535';
      } else if (!fromEmailValid) {
        status.error = fromEmailError || 'From email format invalid';
        status.message = fromEmailError || 'La dirección de email "from" debe ser un email válido';
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'email',
        name: 'Email SMTP',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check Twilio API availability for specific user
   */
  async checkTwilioAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'twilio', 'production');
    if (!forceRefresh) {
      const cached = await this.getCached(cacheKey);
      if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
        return cached;
      }
    } else {
      await this.deleteCached(cacheKey);
    }

    try {
      // ✅ CORRECCIÓN TWILIO: Buscar credenciales en CredentialsManager primero, luego variables de entorno
      let credentials = await this.getUserCredentials(userId, 'twilio', 'production').catch(() => null);
      
      // Si no hay credenciales en la BD, verificar variables de entorno
      if (!credentials) {
        const hasEnvAccountSid = !!(process.env.TWILIO_ACCOUNT_SID);
        const hasEnvAuthToken = !!(process.env.TWILIO_AUTH_TOKEN);
        const hasEnvPhoneNumber = !!(process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER);
        
        if (hasEnvAccountSid && hasEnvAuthToken && hasEnvPhoneNumber) {
          // Usar variables de entorno como credenciales
          credentials = {
            accountSid: process.env.TWILIO_ACCOUNT_SID || '',
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || '',
            whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
          };
        }
      }
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'twilio',
          name: 'Twilio API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'Twilio API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN TWILIO: Verificar campos con nombres correctos (camelCase + múltiples variantes)
      const accountSid = credentials['accountSid'] || credentials['TWILIO_ACCOUNT_SID'] || '';
      const authToken = credentials['authToken'] || credentials['TWILIO_AUTH_TOKEN'] || '';
      const phoneNumber = credentials['phoneNumber'] || credentials['TWILIO_PHONE_NUMBER'] || credentials['TWILIO_FROM_NUMBER'] || '';
      
      const hasAccountSid = !!(accountSid && String(accountSid).trim());
      const hasAuthToken = !!(authToken && String(authToken).trim());
      const hasPhoneNumber = !!(phoneNumber && String(phoneNumber).trim());

      const validation = {
        valid: hasAccountSid && hasAuthToken && hasPhoneNumber,
        missing: [
          !hasAccountSid && 'accountSid',
          !hasAuthToken && 'authToken',
          !hasPhoneNumber && 'phoneNumber'
        ].filter(Boolean) as string[]
      };

      // ✅ VALIDAR: Formato de Account SID (debe empezar con 'AC')
      let accountSidValid = true;
      let accountSidError: string | undefined;
      if (hasAccountSid) {
        const accountSidStr = String(accountSid).trim();
        if (!accountSidStr.startsWith('AC')) {
          accountSidValid = false;
          accountSidError = 'Account SID debe empezar con "AC"';
        } else if (accountSidStr.length < 32 || accountSidStr.length > 34) {
          accountSidValid = false;
          accountSidError = 'Account SID debe tener entre 32 y 34 caracteres';
        }
      }

      // ✅ VALIDAR: Formato de número de teléfono (debe empezar con +)
      let phoneNumberValid = true;
      let phoneNumberError: string | undefined;
      if (hasPhoneNumber) {
        const phoneNumberStr = String(phoneNumber).trim();
        if (!phoneNumberStr.startsWith('+') && !phoneNumberStr.startsWith('whatsapp:+')) {
          phoneNumberValid = false;
          phoneNumberError = 'Phone Number debe empezar con "+" o "whatsapp:+"';
        }
      }

      const status: APIStatus = {
        apiName: 'twilio',
        name: 'Twilio API',
        isConfigured: validation.valid && accountSidValid && phoneNumberValid,
        isAvailable: validation.valid && accountSidValid && phoneNumberValid,
        status: validation.valid && accountSidValid && phoneNumberValid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else if (!accountSidValid) {
        status.error = accountSidError || 'Account SID format invalid';
        status.message = accountSidError || 'El Account SID tiene un formato inválido';
      } else if (!phoneNumberValid) {
        status.error = phoneNumberError || 'Phone Number format invalid';
        status.message = phoneNumberError || 'El número de teléfono tiene un formato inválido';
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'twilio',
        name: 'Twilio API',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check Slack API availability for specific user
   */
  async checkSlackAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'slack', 'production');
    if (!forceRefresh) {
      const cached = await this.getCached(cacheKey);
      if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
        return cached;
      }
    } else {
      await this.deleteCached(cacheKey);
    }

    try {
      // ✅ CORRECCIÓN SLACK: Buscar credenciales en CredentialsManager primero, luego variables de entorno
      let credentials = await this.getUserCredentials(userId, 'slack', 'production').catch(() => null);
      
      // Si no hay credenciales en la BD, verificar variables de entorno
      if (!credentials) {
        const hasEnvWebhookUrl = !!(process.env.SLACK_WEBHOOK_URL);
        const hasEnvBotToken = !!(process.env.SLACK_BOT_TOKEN);
        
        if (hasEnvWebhookUrl || hasEnvBotToken) {
          // Usar variables de entorno como credenciales
          credentials = {
            webhookUrl: process.env.SLACK_WEBHOOK_URL || undefined,
            botToken: process.env.SLACK_BOT_TOKEN || undefined,
            channel: process.env.SLACK_CHANNEL || '#ivan-reseller',
          };
        }
      }
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'slack',
          name: 'Slack API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'Slack API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN SLACK: Verificar campos con nombres correctos (camelCase + múltiples variantes)
      const webhookUrl = credentials['webhookUrl'] || credentials['SLACK_WEBHOOK_URL'] || '';
      const botToken = credentials['botToken'] || credentials['SLACK_BOT_TOKEN'] || '';
      const channel = credentials['channel'] || credentials['SLACK_CHANNEL'] || '';
      
      const hasWebhookUrl = !!(webhookUrl && String(webhookUrl).trim());
      const hasBotToken = !!(botToken && String(botToken).trim());

      // ✅ VALIDACIÓN ESPECIAL SLACK: Requiere AL MENOS uno de webhookUrl o botToken
      const validation = {
        valid: hasWebhookUrl || hasBotToken,
        missing: (!hasWebhookUrl && !hasBotToken) ? ['webhookUrl o botToken (al menos uno es requerido)'] : []
      };

      // ✅ VALIDAR: Formato de Webhook URL (debe ser URL válida)
      let webhookUrlValid = true;
      let webhookUrlError: string | undefined;
      if (hasWebhookUrl) {
        const webhookUrlStr = String(webhookUrl).trim();
        try {
          const url = new URL(webhookUrlStr);
          if (!url.href.startsWith('https://hooks.slack.com/')) {
            webhookUrlValid = false;
            webhookUrlError = 'Webhook URL debe ser una URL de Slack válida (https://hooks.slack.com/...)';
          }
        } catch {
          webhookUrlValid = false;
          webhookUrlError = 'Webhook URL debe ser una URL válida';
        }
      }

      // ✅ VALIDAR: Formato de Bot Token (debe empezar con xoxb- o xoxp-)
      let botTokenValid = true;
      let botTokenError: string | undefined;
      if (hasBotToken) {
        const botTokenStr = String(botToken).trim();
        if (!botTokenStr.startsWith('xoxb-') && !botTokenStr.startsWith('xoxp-')) {
          botTokenValid = false;
          botTokenError = 'Bot Token debe empezar con "xoxb-" (bot) o "xoxp-" (user)';
        }
      }

      const status: APIStatus = {
        apiName: 'slack',
        name: 'Slack API',
        isConfigured: validation.valid && (!hasWebhookUrl || webhookUrlValid) && (!hasBotToken || botTokenValid),
        isAvailable: validation.valid && (!hasWebhookUrl || webhookUrlValid) && (!hasBotToken || botTokenValid),
        status: validation.valid && (!hasWebhookUrl || webhookUrlValid) && (!hasBotToken || botTokenValid) ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = 'Either webhookUrl or botToken is required';
        status.message = 'Se requiere al menos uno de: webhookUrl o botToken';
      } else if (hasWebhookUrl && !webhookUrlValid) {
        status.error = webhookUrlError || 'Webhook URL format invalid';
        status.message = webhookUrlError || 'El Webhook URL tiene un formato inválido';
      } else if (hasBotToken && !botTokenValid) {
        status.error = botTokenError || 'Bot Token format invalid';
        status.message = botTokenError || 'El Bot Token tiene un formato inválido';
      } else {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'slack',
        name: 'Slack API',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Check OpenAI API availability for specific user
   */
  async checkOpenAIAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'openai', 'production');
    if (!forceRefresh) {
      const cached = await this.getCached(cacheKey);
      if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
        return cached;
      }
    } else {
      await this.deleteCached(cacheKey);
    }

    try {
      // ✅ CORRECCIÓN OPENAI: Buscar credenciales en CredentialsManager primero, luego variables de entorno
      let credentials = await this.getUserCredentials(userId, 'openai', 'production').catch(() => null);
      
      // Si no hay credenciales en la BD, verificar variables de entorno
      if (!credentials) {
        const hasEnvApiKey = !!(process.env.OPENAI_API_KEY);
        
        if (hasEnvApiKey) {
          // Usar variables de entorno como credenciales
          credentials = {
            apiKey: process.env.OPENAI_API_KEY || '',
            organization: process.env.OPENAI_ORGANIZATION,
            model: process.env.OPENAI_MODEL,
          };
        }
      }
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'openai',
          name: 'OpenAI API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'OpenAI API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      // ✅ CORRECCIÓN OPENAI: Verificar campos con nombres correctos (camelCase + múltiples variantes)
      const apiKey = credentials['apiKey'] || credentials['OPENAI_API_KEY'] || '';
      const organization = credentials['organization'] || credentials['OPENAI_ORGANIZATION'];
      const model = credentials['model'] || credentials['OPENAI_MODEL'];
      
      const hasApiKey = !!(apiKey && String(apiKey).trim());

      const validation = {
        valid: hasApiKey,
        missing: !hasApiKey ? ['apiKey'] : []
      };

      // ✅ VALIDAR: Formato de API Key (debe empezar con 'sk-')
      let apiKeyValid = true;
      let apiKeyError: string | undefined;
      if (hasApiKey) {
        const apiKeyStr = String(apiKey).trim();
        if (!apiKeyStr.startsWith('sk-')) {
          apiKeyValid = false;
          apiKeyError = 'API Key debe empezar con "sk-"';
        } else if (apiKeyStr.length < 20) {
          apiKeyValid = false;
          apiKeyError = 'API Key parece ser demasiado corta (debe tener al menos 20 caracteres)';
        }
      }

      const status: APIStatus = {
        apiName: 'openai',
        name: 'OpenAI API',
        isConfigured: validation.valid && apiKeyValid,
        isAvailable: validation.valid && apiKeyValid,
        status: validation.valid && apiKeyValid ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = 'Missing credentials: apiKey';
        status.message = 'Faltan credenciales requeridas: apiKey';
      } else if (!apiKeyValid) {
        status.error = apiKeyError || 'API Key format invalid';
        status.message = apiKeyError || 'El API Key tiene un formato inválido';
      } else {
        status.message = 'API configurada correctamente';
        if (model) {
          status.message += ` (Modelo: ${model})`;
        }
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        apiName: 'openai',
        name: 'OpenAI API',
        isConfigured: false,
        isAvailable: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.cache.set(cacheKey, status);
      return status;
    }
  }

  /**
   * Get all API statuses for specific user
   * 
   * ⚠️ FIX SIGSEGV: Serializar checks críticos en lugar de Promise.all
   * El problema era que 9 Promise.all en paralelo + desencriptación + Prisma queries
   * saturaban el event loop y causaban segmentation fault.
   */
  async getAllAPIStatus(userId: number): Promise<APIStatus[]> {
    // ✅ FIX: Ejecutar checks críticos (que usan desencriptación) en serie
    // Los checks simples (que no usan credenciales) pueden ejecutarse en paralelo
    const criticalChecks = [
      () => this.checkEbayAPI(userId, 'production'),
      () => this.checkAmazonAPI(userId, 'production'),
      () => this.checkMercadoLibreAPI(userId, 'production'),
      () => this.checkPayPalAPI(userId, 'production'),
      // ✅ FIX: Stripe check removed - not implemented yet
    ];
    
    const simpleChecks = [
      () => this.checkGroqAPI(userId),
      () => this.checkScraperAPI(userId),
      () => this.checkZenRowsAPI(userId),
      () => this.check2CaptchaAPI(userId),
      () => this.checkAliExpressAPI(userId),
      () => this.checkAliExpressAffiliateAPI(userId, 'production'),
      () => this.checkAliExpressDropshippingAPI(userId, 'production'),
      () => this.checkEmailAPI(userId),
      () => this.checkTwilioAPI(userId),
      () => this.checkSlackAPI(userId),
      () => this.checkOpenAIAPI(userId),
    ];
    
    // Ejecutar checks críticos en serie con timeout y error handling
    const criticalResults: APIStatus[] = [];
    const criticalCheckNames = ['ebay', 'amazon', 'mercadolibre', 'paypal']; // ✅ FIX: Removed 'stripe' as checkStripeAPI doesn't exist
    for (let i = 0; i < criticalChecks.length; i++) {
      const check = criticalChecks[i];
      const checkName = criticalCheckNames[i] || 'unknown';
      try {
        const result = await Promise.race([
          check(),
          new Promise<APIStatus>((_, reject) => 
            setTimeout(() => reject(new Error('Check timeout')), 10000)
          )
        ]);
        // ✅ FIX: Validar que result existe y tiene apiName válido antes de agregar
        if (!result || !result.apiName || typeof result.apiName !== 'string') {
          logger.warn(`Critical API check returned invalid result for user ${userId}`, { 
            check: checkName,
            result: result
          });
          criticalResults.push({
            apiName: checkName,
            name: `${checkName} API`,
            isConfigured: false,
            isAvailable: false,
            lastChecked: new Date(),
            error: 'Check returned invalid result',
          } as APIStatus);
        } else {
          criticalResults.push(result);
        }
      } catch (error: any) {
        logger.warn(`API check failed for user ${userId}`, { 
          error: error.message,
          check: checkName 
        });
        // Continuar con el siguiente check en lugar de fallar completamente
        criticalResults.push({
          apiName: checkName,
          name: `${checkName} API`,
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: error.message,
        } as APIStatus);
      }
    }
    
    // Ejecutar checks simples en paralelo (más seguros)
    const simpleResults = await Promise.allSettled(
      simpleChecks.map(check => 
        Promise.race([
          check(),
          new Promise<APIStatus>((_, reject) => 
            setTimeout(() => reject(new Error('Check timeout')), 5000)
          )
        ])
      )
    );
    
    // Extraer resultados críticos con fallbacks seguros
    const ebayProduction = criticalResults[0] || {
      apiName: 'ebay',
      name: 'eBay Trading API',
      isConfigured: false,
      isAvailable: false,
      lastChecked: new Date(),
      error: 'Check failed',
    } as APIStatus;
    const amazonProduction = criticalResults[1] || {
      apiName: 'amazon',
      name: 'Amazon SP-API',
      isConfigured: false,
      isAvailable: false,
      lastChecked: new Date(),
      error: 'Check failed',
    } as APIStatus;
    const mercadolibreProduction = criticalResults[2] || {
      apiName: 'mercadolibre',
      name: 'MercadoLibre API',
      isConfigured: false,
      isAvailable: false,
      lastChecked: new Date(),
      error: 'Check failed',
    } as APIStatus;
    const paypalProduction = criticalResults[3] || {
      apiName: 'paypal',
      name: 'PayPal API',
      isConfigured: false,
      isAvailable: false,
      lastChecked: new Date(),
      error: 'Check failed',
    } as APIStatus;
    
    // Extraer resultados simples con nombres correctos
    const simpleCheckNames = ['groq', 'scraperapi', 'serpapi', 'zenrows', '2captcha', 'aliexpress', 'aliexpress-affiliate', 'aliexpress-dropshipping', 'email', 'twilio', 'slack', 'openai'];
    const [
      groq,
      scraper,
      serpapi,
      zenrows,
      captcha,
      aliexpress,
      aliexpressAffiliate,
      aliexpressDropshipping,
      email,
      twilio,
      slack,
      openai
    ] = simpleResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        // ✅ FIX: Validar que result.value existe y tiene apiName válido
        const value = result.value;
        if (!value || !value.apiName || typeof value.apiName !== 'string') {
          const checkName = simpleCheckNames[index] || 'unknown';
          logger.warn(`Simple API check returned invalid result for user ${userId}`, { 
            check: checkName,
            value: value
          });
          return {
            apiName: checkName,
            name: `${checkName} API`,
            isConfigured: false,
            isAvailable: false,
            lastChecked: new Date(),
            error: 'Check returned invalid result',
          } as APIStatus;
        }
        return value;
      } else {
        const checkName = simpleCheckNames[index] || 'unknown';
        logger.warn(`Simple API check failed for user ${userId}`, { 
          error: result.reason?.message,
          check: checkName 
        });
        return {
          apiName: checkName,
          name: `${checkName} API`,
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: result.reason?.message || 'Check failed',
        } as APIStatus;
      }
    });

    const statuses: APIStatus[] = [
      ebayProduction,
      amazonProduction,
      mercadolibreProduction,
      groq,
      scraper,
      serpapi, // ✅ NUEVO: SerpAPI/Google Trends
      zenrows,
      captcha,
      paypalProduction,
      // ✅ FIX: stripeProduction removed - Stripe check not implemented
      aliexpress,
      aliexpressAffiliate,
      aliexpressDropshipping,
      email,
      twilio,
      slack,
      openai
    ];

    // ✅ FIX: Agregar sandbox statuses con validación - MEJORADA con guards estrictos
    try {
      if (supportsEnvironments('ebay')) {
        const index = statuses.findIndex((status) => status && typeof status.apiName === 'string' && status.apiName === 'ebay');
        if (index >= 0) {
          try {
            const sandboxStatus = await this.checkEbayAPI(userId, 'sandbox');
            if (sandboxStatus && sandboxStatus.apiName && typeof sandboxStatus.apiName === 'string') {
              statuses.splice(index + 1, 0, sandboxStatus);
            }
          } catch (error: any) {
            logger.warn('[getAllAPIStatus] Failed to get eBay sandbox status', { userId, error: error?.message });
          }
        }
      }
      if (supportsEnvironments('amazon')) {
        const index = statuses.findIndex((status) => status && typeof status.apiName === 'string' && status.apiName === 'amazon');
        if (index >= 0) {
          try {
            const sandboxStatus = await this.checkAmazonAPI(userId, 'sandbox');
            if (sandboxStatus && sandboxStatus.apiName && typeof sandboxStatus.apiName === 'string') {
              statuses.splice(index + 1, 0, sandboxStatus);
            }
          } catch (error: any) {
            logger.warn('[getAllAPIStatus] Failed to get Amazon sandbox status', { userId, error: error?.message });
          }
        }
      }
      if (supportsEnvironments('mercadolibre')) {
        const index = statuses.findIndex((status) => status && typeof status.apiName === 'string' && status.apiName === 'mercadolibre');
        if (index >= 0) {
          try {
            const sandboxStatus = await this.checkMercadoLibreAPI(userId, 'sandbox');
            if (sandboxStatus && sandboxStatus.apiName && typeof sandboxStatus.apiName === 'string') {
              statuses.splice(index + 1, 0, sandboxStatus);
            }
          } catch (error: any) {
            logger.warn('[getAllAPIStatus] Failed to get MercadoLibre sandbox status', { userId, error: error?.message });
          }
        }
      }
      
      // ✅ CORRECCIÓN ALIEXPRESS AFFILIATE: Agregar sandbox si aplica
      const aliexpressAffiliateIndex = statuses.findIndex((status) => status && typeof status.apiName === 'string' && status.apiName === 'aliexpress-affiliate');
      if (aliexpressAffiliateIndex >= 0) {
        try {
          const sandboxStatus = await this.checkAliExpressAffiliateAPI(userId, 'sandbox');
          if (sandboxStatus && sandboxStatus.apiName && typeof sandboxStatus.apiName === 'string') {
            statuses.splice(aliexpressAffiliateIndex + 1, 0, sandboxStatus);
          }
        } catch (error: any) {
          logger.warn('[getAllAPIStatus] Failed to get AliExpress Affiliate sandbox status', { userId, error: error?.message });
        }
      }
      
      // ✅ CORRECCIÓN PAYPAL: Agregar sandbox si aplica
      if (supportsEnvironments('paypal')) {
        const index = statuses.findIndex((status) => status && typeof status.apiName === 'string' && status.apiName === 'paypal');
        if (index >= 0) {
          try {
            const sandboxStatus = await this.checkPayPalAPI(userId, 'sandbox');
            if (sandboxStatus && sandboxStatus.apiName && typeof sandboxStatus.apiName === 'string') {
              statuses.splice(index + 1, 0, sandboxStatus);
            }
          } catch (error: any) {
            logger.warn('[getAllAPIStatus] Failed to get PayPal sandbox status', { userId, error: error?.message });
          }
        }
      }
      
      // ✅ CORRECCIÓN ALIEXPRESS DROPSHIPPING: Agregar sandbox si aplica
      if (supportsEnvironments('aliexpress-dropshipping')) {
        const index = statuses.findIndex((status) => status && typeof status.apiName === 'string' && status.apiName === 'aliexpress-dropshipping');
        if (index >= 0) {
          try {
            const sandboxStatus = await this.checkAliExpressDropshippingAPI(userId, 'sandbox');
            if (sandboxStatus && sandboxStatus.apiName && typeof sandboxStatus.apiName === 'string') {
              statuses.splice(index + 1, 0, sandboxStatus);
            }
          } catch (error: any) {
            logger.warn('[getAllAPIStatus] Failed to get AliExpress Dropshipping sandbox status', { userId, error: error?.message });
          }
        }
      }
    } catch (error: any) {
      logger.warn('[getAllAPIStatus] Error adding sandbox statuses', { userId, error: error?.message });
      // Continuar con los statuses que ya tenemos
    }

    // ✅ FIX: Sanitizar antes de retornar - NUNCA retornar entries undefined/null
    const sanitizedStatuses = statuses.filter((status, index) => {
      if (!status) {
        logger.warn('[getAllAPIStatus] Filtering out undefined/null status entry', { userId, index, totalStatuses: statuses.length });
        return false;
      }
      if (!status.apiName || typeof status.apiName !== 'string' || status.apiName.trim().length === 0) {
        logger.warn('[getAllAPIStatus] Filtering out status entry without valid apiName', {
          userId,
          index,
          status: status,
          apiNameType: typeof status.apiName,
          apiNameValue: status.apiName
        });
        return false;
      }
      return true;
    });

    return sanitizedStatuses;
  }

  /**
   * Get system capabilities based on configured APIs for specific user
   */
  async getCapabilities(userId: number): Promise<APICapabilities> {
    const statuses = await this.getAllAPIStatus(userId);
    
    // ✅ FIX: Validar que statuses es array válido
    if (!Array.isArray(statuses)) {
      logger.warn('[getCapabilities] getAllAPIStatus returned non-array', { userId, type: typeof statuses });
      return {
        canPublishToEbay: false,
        canPublishToAmazon: false,
        canPublishToMercadoLibre: false,
        canScrapeAliExpress: false,
        canUseAI: false,
        canSolveCaptchas: false,
        canPayCommissions: false,
        canAutoPurchaseAliExpress: false
      };
    }
    
    // ✅ FIX: Filtrar entradas inválidas antes de procesar
    const validStatuses = statuses.filter((status) => {
      return status && status.apiName && typeof status.apiName === 'string';
    });
    
    const byApi = (api: string) => validStatuses.filter((status) => status.apiName === api);

    const ebayStatuses = byApi('ebay');
    const amazonStatuses = byApi('amazon');
    const mercadolibreStatuses = byApi('mercadolibre');
    const scraperapi = byApi('scraperapi')[0];
    const zenrows = byApi('zenrows')[0];
    const groq = byApi('groq')[0];
    const captcha = byApi('2captcha')[0];
    const paypal = byApi('paypal')[0];
    const aliexpress = byApi('aliexpress')[0];

    return {
      canPublishToEbay: ebayStatuses.some((status) => status && status.isAvailable === true),
      canPublishToAmazon: amazonStatuses.some((status) => status && status.isAvailable === true),
      canPublishToMercadoLibre: mercadolibreStatuses.some((status) => status && status.isAvailable === true),
      canScrapeAliExpress: Boolean(scraperapi?.isAvailable || zenrows?.isAvailable),
      canUseAI: Boolean(groq?.isAvailable),
      canSolveCaptchas: Boolean(captcha?.isAvailable),
      canPayCommissions: Boolean(paypal?.isAvailable),
      canAutoPurchaseAliExpress: Boolean(aliexpress?.isAvailable)
    };
  }

  /**
   * Clear cache for specific user (force re-check on next call)
   */
  async clearUserCache(userId: number): Promise<void> {
    const prefix = `user_${userId}_`;
    
    if (this.useRedis) {
      try {
        const pattern = `${this.redisPrefix}${prefix}*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          logger.info(`Redis cache cleared for user ${userId} (${keys.length} keys)`);
        }
      } catch (error) {
        logger.warn('Failed to clear Redis cache, falling back to memory', { error });
      }
    }
    
    // También limpiar cache en memoria
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
    
    logger.info(`API availability cache cleared for user ${userId} (${keysToDelete.length} memory keys)`);
  }

  /**
   * Clear specific API cache for specific user
   */
  async clearAPICache(userId: number, apiName: string): Promise<void> {
    const prefix = `user_${userId}_${apiName.toLowerCase()}`;
    
    if (this.useRedis) {
      try {
        // Buscar todas las keys que coincidan con el patrón
        const pattern = `${this.redisPrefix}${prefix}*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          logger.info(`Redis cache cleared for user ${userId}, API: ${apiName} (${keys.length} keys)`);
        }
      } catch (error) {
        logger.warn('Failed to clear Redis cache, falling back to memory', { error });
      }
    }
    
    // También limpiar cache en memoria
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
    
    logger.info(`Cache cleared for user ${userId}, API: ${apiName} (${keysToDelete.length} memory keys)`);
  }

  /**
   * Clear all cache (admin function)
   */
  async clearAllCache(): Promise<void> {
    if (this.useRedis) {
      try {
        const pattern = `${this.redisPrefix}*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          logger.info(`Redis cache cleared (${keys.length} keys)`);
        }
      } catch (error) {
        logger.warn('Failed to clear Redis cache, falling back to memory', { error });
      }
    }
    
    // También limpiar cache en memoria
    this.cache.clear();
    logger.info('All API availability cache cleared');
  }

  /**
   * Recover persisted statuses on server startup
   */
  async recoverPersistedStatuses(): Promise<void> {
    try {
      const snapshots = await prisma.aPIStatusSnapshot.findMany({
        where: {
          lastChecked: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
        take: 1000, // Limit to prevent memory issues
      });

      logger.info(`Recovering ${snapshots.length} persisted API statuses`);

      for (const snapshot of snapshots) {
        const cacheKey = this.getCacheKey(snapshot.userId, `${snapshot.apiName}-${snapshot.environment}`);
        const status: APIStatus = {
          apiName: snapshot.apiName,
          name: snapshot.apiName,
          isConfigured: snapshot.isConfigured,
          isAvailable: snapshot.isAvailable,
          status: snapshot.status as APIHealthStatus,
          lastChecked: snapshot.lastChecked,
          error: snapshot.error || undefined,
          message: snapshot.message || undefined,
          environment: snapshot.environment as 'sandbox' | 'production',
          latency: snapshot.latency || undefined,
          trustScore: snapshot.trustScore,
        };

        await this.setCached(cacheKey, status);
      }

      logger.info(`Recovered ${snapshots.length} API statuses from database`);
    } catch (error) {
      logger.error('Error recovering persisted statuses', { error });
    }
  }
}

// Export singleton instance
export const apiAvailability = new APIAvailabilityService();
