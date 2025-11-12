/**
 * API Availability Service - MULTI-TENANT VERSION
 * Central system to detect which APIs are configured and working per user
 * All services should check this before attempting to use external APIs
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { supportsEnvironments } from '../config/api-keys.config';
import { OPTIONAL_MARKETPLACES } from '../config/marketplaces.config';

interface APIStatus {
  apiName: string;
  name: string;
  isConfigured: boolean;
  isAvailable: boolean;
  lastChecked: Date;
  error?: string;
  message?: string;
  missingFields?: string[];
  environment?: 'sandbox' | 'production';
  isOptional?: boolean;
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
  private cache: Map<string, APIStatus> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate cache key including userId for multi-tenant isolation
   */
  private getCacheKey(userId: number, apiName: string): string {
    return `user_${userId}_${apiName}`;
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
   * Check eBay API availability for specific user
   * @param userId - User ID
   * @param environment - Environment (sandbox/production). Defaults to 'production'
   */
  async checkEbayAPI(userId: number, environment: 'sandbox' | 'production' = 'production'): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, `ebay-${environment}`);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID'];
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
        this.cache.set(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        apiName: 'ebay',
        name: 'eBay Trading API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        environment,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      const tokenLike =
        credentials['token'] ||
        credentials['authToken'] ||
        credentials['accessToken'];
      const refreshToken = credentials['refreshToken'];

      if (!tokenLike && !refreshToken) {
        status.isAvailable = false;
        status.error = 'Falta token OAuth de eBay';
        status.message = 'Completa la autorización OAuth para este entorno.';
      }

      if (!validation.valid) {
        const missingList = validation.missing.join(', ');
        status.error = `Missing credentials: ${missingList}`;
        status.message = `Faltan credenciales requeridas: ${missingList}`;
      } else if (!status.error) {
        status.message = 'API configurada correctamente';
      }

      this.cache.set(cacheKey, status);
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
      this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
    const cached = this.cache.get(cacheKey);
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
        this.cache.set(cacheKey, status);
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
   */
  async getAllAPIStatus(userId: number): Promise<APIStatus[]> {
    const [
      ebayProduction,
      amazonProduction,
      mercadolibreProduction,
      groq,
      scraper,
      zenrows,
      captcha,
      paypal,
      aliexpress
    ] = await Promise.all([
      this.checkEbayAPI(userId, 'production'),
      this.checkAmazonAPI(userId, 'production'),
      this.checkMercadoLibreAPI(userId, 'production'),
      this.checkGroqAPI(userId),
      this.checkScraperAPI(userId),
      this.checkZenRowsAPI(userId),
      this.check2CaptchaAPI(userId),
      this.checkPayPalAPI(userId),
      this.checkAliExpressAPI(userId)
    ]);

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
  clearUserCache(userId: number): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`user_${userId}_`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
    logger.info(`API availability cache cleared for user ${userId}`);
  }

  /**
   * Clear specific API cache for specific user
   */
  clearAPICache(userId: number, apiName: string): void {
    const prefix = `user_${userId}_${apiName.toLowerCase()}`;
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
    logger.info(`Cache cleared for user ${userId}, API: ${apiName}`);
  }

  /**
   * Clear all cache (admin function)
   */
  clearAllCache(): void {
    this.cache.clear();
    logger.info('All API availability cache cleared');
  }
}

// Export singleton instance
export const apiAvailability = new APIAvailabilityService();
