/**
 * API Availability Service - MULTI-TENANT VERSION
 * Central system to detect which APIs are configured and working per user
 * All services should check this before attempting to use external APIs
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.randomBytes(32);

interface APIStatus {
  name: string;
  isConfigured: boolean;
  isAvailable: boolean;
  lastChecked: Date;
  error?: string;
  missingFields?: string[];
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
   * Decrypt stored credential
   */
  private decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) return encryptedText; // Not encrypted

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = Buffer.from(parts[2], 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString();
    } catch (error) {
      logger.error('Failed to decrypt credential', error);
      return encryptedText;
    }
  }

  /**
   * Get API credentials from database for specific user
   */
  private async getUserCredentials(
    userId: number, 
    apiName: string,
    environment: 'sandbox' | 'production' = 'production'
  ): Promise<Record<string, string> | null> {
    try {
      const credential = await prisma.apiCredential.findUnique({
        where: {
          userId_apiName_environment: {
            userId,
            apiName,
            environment
          }
        }
      });

      if (!credential || !credential.isActive) {
        return null;
      }

      // Decrypt and parse JSON credentials
      const decrypted = this.decrypt(credential.credentials);
      return JSON.parse(decrypted);
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
   */
  async checkEbayAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'ebay');
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID'];
      const credentials = await this.getUserCredentials(userId, 'ebay');
      
      if (!credentials) {
        const status: APIStatus = {
          name: 'eBay Trading API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'eBay API not configured for this user'
        };
        this.cache.set(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        name: 'eBay Trading API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        name: 'eBay Trading API',
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
   * Check Amazon SP-API availability for specific user
   */
  async checkAmazonAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'amazon');
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

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
      const credentials = await this.getUserCredentials(userId, 'amazon');
      
      if (!credentials) {
        const status: APIStatus = {
          name: 'Amazon SP-API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'Amazon API not configured for this user'
        };
        this.cache.set(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        name: 'Amazon SP-API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        name: 'Amazon SP-API',
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
   * Check MercadoLibre API availability for specific user
   */
  async checkMercadoLibreAPI(userId: number): Promise<APIStatus> {
    const cacheKey = this.getCacheKey(userId, 'mercadolibre');
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheExpiry) {
      return cached;
    }

    try {
      const requiredFields = ['MERCADOLIBRE_CLIENT_ID', 'MERCADOLIBRE_CLIENT_SECRET'];
      const credentials = await this.getUserCredentials(userId, 'mercadolibre');
      
      if (!credentials) {
        const status: APIStatus = {
          name: 'MercadoLibre API',
          isConfigured: false,
          isAvailable: false,
          lastChecked: new Date(),
          error: 'MercadoLibre API not configured for this user'
        };
        this.cache.set(cacheKey, status);
        return status;
      }

      const validation = this.hasRequiredFields(credentials, requiredFields);

      const status: APIStatus = {
        name: 'MercadoLibre API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
        name: 'MercadoLibre API',
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
        name: 'GROQ AI API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
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
        name: 'ScraperAPI',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
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
        name: 'ZenRows',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
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
        name: '2Captcha',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
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
        name: 'PayPal Payouts API',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
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
        name: 'AliExpress Auto-Purchase',
        isConfigured: validation.valid,
        isAvailable: validation.valid,
        lastChecked: new Date(),
        missingFields: validation.missing
      };

      if (!validation.valid) {
        status.error = `Missing credentials: ${validation.missing.join(', ')}`;
      }

      this.cache.set(cacheKey, status);
      return status;
    } catch (error) {
      const status: APIStatus = {
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
    const statuses = await Promise.all([
      this.checkEbayAPI(userId),
      this.checkAmazonAPI(userId),
      this.checkMercadoLibreAPI(userId),
      this.checkGroqAPI(userId),
      this.checkScraperAPI(userId),
      this.checkZenRowsAPI(userId),
      this.check2CaptchaAPI(userId),
      this.checkPayPalAPI(userId),
      this.checkAliExpressAPI(userId)
    ]);

    return statuses;
  }

  /**
   * Get system capabilities based on configured APIs for specific user
   */
  async getCapabilities(userId: number): Promise<APICapabilities> {
    const [ebay, amazon, mercadolibre, groq, scraperapi, zenrows, captcha, paypal, aliexpress] = 
      await Promise.all([
        this.checkEbayAPI(userId),
        this.checkAmazonAPI(userId),
        this.checkMercadoLibreAPI(userId),
        this.checkGroqAPI(userId),
        this.checkScraperAPI(userId),
        this.checkZenRowsAPI(userId),
        this.check2CaptchaAPI(userId),
        this.checkPayPalAPI(userId),
        this.checkAliExpressAPI(userId)
      ]);

    return {
      canPublishToEbay: ebay.isAvailable,
      canPublishToAmazon: amazon.isAvailable,
      canPublishToMercadoLibre: mercadolibre.isAvailable,
      canScrapeAliExpress: scraperapi.isAvailable || zenrows.isAvailable,
      canUseAI: groq.isAvailable,
      canSolveCaptchas: captcha.isAvailable,
      canPayCommissions: paypal.isAvailable,
      canAutoPurchaseAliExpress: aliexpress.isAvailable
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
    const cacheKey = this.getCacheKey(userId, apiName.toLowerCase());
    this.cache.delete(cacheKey);
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
