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

export class ScraperBridgeService {
  private client: AxiosInstance;

  constructor(baseURL = process.env.SCRAPER_BRIDGE_URL || 'http://127.0.0.1:8077') {
    this.client = axios.create({
      baseURL,
      timeout: 120000,
    });
  }

  async health(): Promise<{ status: string; details?: any }> {
    // ✅ PRODUCTION READY: Retry logic para health checks
    const { retryWithBackoff } = await import('../utils/retry');
    const result = await retryWithBackoff(
      async () => {
        const { data } = await this.client.get('/health');
        return data;
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        retryable: (error: any) => {
          // Reintentar en errores de red o timeout
          return !error.response || (error.response.status >= 500 && error.response.status < 600);
        },
      }
    );
    return result;
  }

  async aliexpressSearch(params: AliExpressSearchParams): Promise<AliExpressProduct[]> {
    // ✅ PRODUCTION READY: Retry logic para búsquedas (crítico)
    const { retryWithBackoff } = await import('../utils/retry');
    
    const result = await retryWithBackoff(
      async () => {
        const { data } = await this.client.post('/scraping/aliexpress/search', {
          query: params.query,
          max_items: Math.min(Math.max(params.maxItems || 10, 1), 20),
          locale: params.locale || 'es-ES',
        });
        
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
        maxAttempts: 3,
        initialDelay: 2000,
        retryable: (error: any) => {
          // No reintentar si es CAPTCHA requerido
          if (error.code === 'CAPTCHA_REQUIRED') {
            return false;
          }
          // Reintentar en errores de red, timeout o 5xx
          return !error.response || 
                 (error.response.status >= 500 && error.response.status < 600) ||
                 error.code === 'ECONNREFUSED' ||
                 error.code === 'ETIMEDOUT';
        },
      }
    );
    
    return result;
  }
}

const scraperBridge = new ScraperBridgeService();
export default scraperBridge;
