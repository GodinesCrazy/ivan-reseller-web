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
  private getCacheKey(userId: number, apiName: string): string {
    return `user_${userId}_${apiName}`;
  }

  /**
   * Get full Redis key
   */
  private getRedisKey(userId: number, apiName: string): string {
    return `${this.redisPrefix}${this.getCacheKey(userId, apiName)}`;
  }

  /**
   * Get from cache (Redis or memory)
   */
  private async getCached(key: string): Promise<APIStatus | null> {
    if (this.useRedis) {
      try {
        const cached = await redis.get(this.redisPrefix + key);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Convertir lastChecked de string a Date
          if (parsed.lastChecked) {
            parsed.lastChecked = new Date(parsed.lastChecked);
          }
          return parsed as APIStatus;
        }
      } catch (error) {
        logger.warn('Failed to get from Redis cache, falling back to memory', { error });
        // Fallback a cache en memoria
      }
    }
    
    // Fallback a cache en memoria
    return this.cache.get(key) || null;
  }

  /**
   * Set cache (Redis or memory)
   */
  private async setCached(key: string, value: APIStatus): Promise<void> {
    if (this.useRedis) {
      try {
        const serialized = JSON.stringify(value);
        // Guardar en Redis con TTL
        await redis.setex(
          this.redisPrefix + key,
          Math.floor(this.cacheExpiry / 1000), // TTL en segundos
          serialized
        );
        return;
      } catch (error) {
        logger.warn('Failed to set Redis cache, falling back to memory', { error });
        // Fallback a cache en memoria
      }
    }
    
    // Fallback a cache en memoria
    this.cache.set(key, value);
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
    const breaker = circuitBreakerManager.getBreaker(`ebay-${environment}`, {
      failureThreshold: 3,
      timeout: 60000,
    });

    try {
      return await breaker.execute(async () => {
        const { MarketplaceService } = await import('./marketplace.service');
        const marketplaceService = new MarketplaceService();
        
        const startTime = Date.now();
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
        const latency = Date.now() - startTime;

        return {
          success: result.success,
          error: result.success ? undefined : result.message,
          latency,
        };
      });
    } catch (error: any) {
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
      
      if (!credentials) {
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

      // Normalize field names (credentials manager uses different names)
      const normalizedCreds: Record<string, string> = {
        appId: credentials['appId'] || credentials['EBAY_APP_ID'] || '',
        devId: credentials['devId'] || credentials['EBAY_DEV_ID'] || '',
        certId: credentials['certId'] || credentials['EBAY_CERT_ID'] || '',
        token: credentials['token'] || credentials['authToken'] || credentials['accessToken'] || '',
        refreshToken: credentials['refreshToken'] || '',
      };

      const validation = this.hasRequiredFields(normalizedCreds, requiredFields);

      // Level 2: Real health check (only if fields are valid and not recently checked)
      let healthCheckResult: { success: boolean; error?: string } | null = null;
      const lastHealthCheck = await this.getCached(healthCheckKey);
      // 🚀 PERFORMANCE: Usar TTL dinámico según criticidad
      const healthCheckTTL = this.getHealthCheckTTL('ebay');
      const shouldPerformHealthCheck = 
        forceHealthCheck || 
        !lastHealthCheck || 
        Date.now() - lastHealthCheck.lastChecked.getTime() >= healthCheckTTL;

      if (validation.valid && shouldPerformHealthCheck) {
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

      if (tokenExpired) {
        status.isAvailable = false;
        status.status = 'unhealthy';
        status.error = 'Token OAuth expirado';
        status.message = 'El token OAuth ha expirado. Reautoriza en Settings → API Settings → eBay.';
      } else if (!tokenLike && !refreshToken) {
        status.isAvailable = false;
        status.status = 'unhealthy';
        status.error = 'Falta token OAuth de eBay';
        status.message = 'Completa la autorización OAuth para este entorno.';
      } else if (!validation.valid) {
        status.isAvailable = false;
        status.status = 'unhealthy';
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
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

      const status: APIStatus = {
        apiName: 'mercadolibre',
        name: 'MercadoLibre API',
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
          status.message = `Opcional: faltan campos (${missingList}). Configúralos para mejorar la precisión regional.`;
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
      const requiredFields = ['GROQ_API_KEY'];
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

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: 'groq',
        name: 'GROQ AI API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
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
  async checkScraperAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'scraperapi');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['SCRAPER_API_KEY'];
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

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: 'scraperapi',
        name: 'ScraperAPI',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
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
      const requiredFields = ['ZENROWS_API_KEY'];
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

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: 'zenrows',
        name: 'ZenRows',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
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
      const requiredFields = ['CAPTCHA_2CAPTCHA_KEY'];
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

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: '2captcha',
        name: '2Captcha',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
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
   */
  async checkPayPalAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'paypal');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENVIRONMENT'];
      const credentials = await this.getUserCredentials(userId, 'paypal');
      
      if (!credentials) {
        const status: APIStatus = {
          apiName: 'paypal',
          name: 'PayPal Payouts API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'PayPal API not configured for this user'
        };
        await this.setCached(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: 'paypal',
        name: 'PayPal Payouts API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
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
        apiName: 'paypal',
        name: 'PayPal Payouts API',
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
   * Check AliExpress Auto-Purchase availability for specific user
   */
  async checkAliExpressAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'aliexpress');
    const cached = await this.getCached(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['ALIEXPRESS_EMAIL', 'ALIEXPRESS_PASSWORD'];
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

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: 'aliexpress',
        name: 'AliExpress Auto-Purchase',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
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
      () => this.checkPayPalAPI(userId),
    ];
    
    const simpleChecks = [
      () => this.checkGroqAPI(userId),
      () => this.checkScraperAPI(userId),
      () => this.checkZenRowsAPI(userId),
      () => this.check2CaptchaAPI(userId),
      () => this.checkAliExpressAPI(userId),
    ];
    
    // Ejecutar checks críticos en serie con timeout y error handling
    const criticalResults: APIStatus[] = [];
    const criticalCheckNames = ['ebay', 'amazon', 'mercadolibre', 'paypal'];
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
        criticalResults.push(result);
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
    const paypal = criticalResults[3] || {
      apiName: 'paypal',
      name: 'PayPal API',
      isConfigured: false,
      isAvailable: false,
      lastChecked: new Date(),
      error: 'Check failed',
    } as APIStatus;
    
    // Extraer resultados simples con nombres correctos
    const simpleCheckNames = ['groq', 'scraperapi', 'zenrows', '2captcha', 'aliexpress'];
    const [
      groq,
      scraper,
      zenrows,
      captcha,
      aliexpress
    ] = simpleResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
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
      zenrows,
      captcha,
      paypal,
      aliexpress
    ];

    if (supportsEnvironments('ebay')) {
      const index = statuses.findIndex((status) => status.apiName === 'ebay');
      const sandboxStatus = await this.checkEbayAPI(userId, 'sandbox');
      if (index >= 0) {
        statuses.splice(index + 1, 0, sandboxStatus);
      } else {
        statuses.unshift(sandboxStatus);
      }
    }
    if (supportsEnvironments('amazon')) {
      const index = statuses.findIndex((status) => status.apiName === 'amazon');
      const sandboxStatus = await this.checkAmazonAPI(userId, 'sandbox');
      if (index >= 0) {
        statuses.splice(index + 1, 0, sandboxStatus);
      } else {
        statuses.push(sandboxStatus);
      }
    }
    if (supportsEnvironments('mercadolibre')) {
      const index = statuses.findIndex((status) => status.apiName === 'mercadolibre');
      const sandboxStatus = await this.checkMercadoLibreAPI(userId, 'sandbox');
      if (index >= 0) {
        statuses.splice(index + 1, 0, sandboxStatus);
      } else {
        statuses.push(sandboxStatus);
      }
    }

    return statuses;
  }

  /**
   * Get system capabilities based on configured APIs for specific user
   */
  async getCapabilities(userId: number): Promise<APICapabilities> {
    const statuses = await this.getAllAPIStatus(userId);
    const byApi = (api: string) => statuses.filter((status) => status.apiName === api);

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
      canPublishToEbay: ebayStatuses.some((status) => status.isAvailable),
      canPublishToAmazon: amazonStatuses.some((status) => status.isAvailable),
      canPublishToMercadoLibre: mercadolibreStatuses.some((status) => status.isAvailable),
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
