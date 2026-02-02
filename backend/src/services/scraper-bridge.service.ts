import { trace } from '../utils/boot-trace';
trace('loading scraper-bridge.service');

import axios, { AxiosInstance } from 'axios';

export interface AliExpressSearchParams {
  query: string;
  maxItems?: number;
  locale?: string; // e.g., 'es-ES', 'en-US'
}

export interface AliExpressProduct {
  productId: string;
  title: string;
  url: string;
  price: number;
  currency: string;
  images: string[];
  store?: string;
  rating?: number;
  orders?: number;
  shippingCost?: number;
  raw?: any; // full payload from scraper
}

/** Result shape for single product fetch (compatible with ScrapedProduct) */
export interface ScrapedProductFromBridge {
  title: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  category?: string;
  shipping?: { cost?: number; estimatedDays?: number };
  rating?: number;
  reviews?: number;
  seller?: { name: string; rating: number; location: string };
}

export class ScraperBridgeService {
  private _client: AxiosInstance | null = null;
  private readonly baseURL: string;
  private readonly enabled: boolean;

  constructor(baseURL?: string) {
    this.enabled = process.env.SCRAPER_BRIDGE_ENABLED === 'true';
    this.baseURL = baseURL || process.env.SCRAPER_BRIDGE_URL || 'http://127.0.0.1:8077';
  }

  private getClient(): AxiosInstance {
    if (this._client) return this._client;
    if (!this.baseURL) {
      throw new Error('Scraper bridge disabled or URL missing');
    }
    this._client = axios.create({
      baseURL: this.baseURL,
      timeout: 120000,
      validateStatus: (status) => status < 500,
    });
    return this._client;
  }

  /**
   * ✅ FASE 2: Verificar si el bridge está disponible y habilitado
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    
    try {
      await this.health();
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<{ status: string; details?: any }> {
    // ✅ FASE 2: Si está deshabilitado, retornar no disponible
    if (!this.enabled) {
      throw new Error('Scraper bridge is disabled (SCRAPER_BRIDGE_ENABLED=false)');
    }
    
    // ✅ PRODUCTION READY: Retry logic para health checks con timeout estricto
    const { retryWithBackoff } = await import('../utils/retry');
    const result = await retryWithBackoff(
      async () => {
        // ✅ FASE 2: Timeout estricto de 5 segundos para health check
        const { data } = await Promise.race([
          this.getClient().get('/health'),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          ),
        ]);
        return (data as any).data;
      },
      {
        maxAttempts: 2, // ✅ FASE 2: Reducir reintentos para health check
        initialDelay: 1000,
        retryable: (error: any) => {
          // Reintentar solo en errores de red o timeout, no en 4xx
          return !error.response || (error.response.status >= 500 && error.response.status < 600);
        },
      }
    );
    return result;
  }

  async aliexpressSearch(params: AliExpressSearchParams): Promise<AliExpressProduct[]> {
    // ✅ FASE 2: Si está deshabilitado, lanzar error para que se use fallback
    if (!this.enabled) {
      const error: any = new Error('Scraper bridge is disabled');
      error.code = 'BRIDGE_DISABLED';
      throw error;
    }
    
    // ✅ PRODUCTION READY: Retry logic para búsquedas (crítico) con timeout estricto
    const { retryWithBackoff } = await import('../utils/retry');
    
    const result = await retryWithBackoff(
      async () => {
        // ✅ FASE 2: Timeout estricto de 120 segundos para búsqueda (2 minutos)
        const response = await Promise.race([
          this.getClient().post('/scraping/aliexpress/search', {
            query: params.query,
            max_items: Math.min(Math.max(params.maxItems || 10, 1), 20),
            locale: params.locale || 'es-ES',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Search request timeout after 120s')), 120000)
          ),
        ]);
        
        const data = (response as any).data;
        
        // Detect CAPTCHA requirement patterns from bridge
        const lower = JSON.stringify(data || {}).toLowerCase();
        if ((data && (data.captcha_required || data.requires_captcha)) || /captcha/.test(lower)) {
          const err: any = new Error('CAPTCHA_REQUIRED');
          err.code = 'CAPTCHA_REQUIRED';
          err.details = data;
          throw err; // No reintentar CAPTCHA
        }
        
        return (data?.items || data || []) as AliExpressProduct[];
      },
      {
        maxAttempts: 2, // ✅ FASE 2: Reducir reintentos (2 en lugar de 3)
        initialDelay: 2000,
        retryable: (error: any) => {
          // No reintentar si es CAPTCHA requerido o bridge deshabilitado
          if (error.code === 'CAPTCHA_REQUIRED' || error.code === 'BRIDGE_DISABLED') {
            return false;
          }
          // Reintentar en errores de red, timeout o 5xx
          return !error.response || 
                 (error.response.status >= 500 && error.response.status < 600) ||
                 error.code === 'ECONNREFUSED' ||
                 error.code === 'ETIMEDOUT' ||
                 error.message?.includes('timeout');
        },
      }
    );
    
    return result;
  }

  /**
   * Fetch single AliExpress product by URL (primary datasource when SCRAPER_BRIDGE_ENABLED=true)
   */
  async fetchAliExpressProduct(aliexpressUrl: string): Promise<ScrapedProductFromBridge> {
    if (!this.enabled || !this.baseURL) {
      const error: any = new Error('Scraper bridge disabled or URL missing');
      error.code = 'BRIDGE_DISABLED';
      throw error;
    }

    try {
      const { retryWithBackoff } = await import('../utils/retry');
      const response = await retryWithBackoff(
        async () => {
          const res = await Promise.race([
            this.getClient().post('/scraping/aliexpress/product', { url: aliexpressUrl }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Product fetch timeout after 120s')), 120000)
          ),
        ]);
        const data = (res as any).data;
        const lower = JSON.stringify(data || {}).toLowerCase();
        if ((data && (data.captcha_required || data.requires_captcha)) || /captcha/.test(lower)) {
          const err: any = new Error('CAPTCHA_REQUIRED');
          err.code = 'CAPTCHA_REQUIRED';
          err.details = data;
          throw err;
        }
        if (data?.error || (res as any).status >= 400) {
          throw new Error(data?.error || data?.message || `Bridge returned ${(res as any).status}`);
        }
        return data;
      },
      {
        maxAttempts: 2,
        initialDelay: 2000,
        retryable: (error: any) =>
          error.code !== 'CAPTCHA_REQUIRED' &&
          error.code !== 'BRIDGE_DISABLED' &&
          (!error.response || error.response?.status >= 500),
      }
    );

      return {
        title: response?.title || 'Producto sin título',
        description: response?.description || '',
        price: Number(response?.price) || 0,
        currency: response?.currency || 'USD',
        images: Array.isArray(response?.images) ? response.images : response?.image ? [response.image] : [],
        category: response?.category,
        shipping: response?.shipping,
        rating: response?.rating,
        reviews: response?.reviews,
        seller: response?.seller,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      const controlled = new Error(`Scraper bridge request failed: ${msg}`) as any;
      controlled.code = err?.code || 'BRIDGE_ERROR';
      controlled.cause = err;
      throw controlled;
    }
  }
}

const scraperBridge = new ScraperBridgeService();
export default scraperBridge;
