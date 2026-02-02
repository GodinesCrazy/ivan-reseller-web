/**
 * Native Scraper microservice client (Puppeteer-based HTTP service)
 */

import { trace } from '../utils/boot-trace';
trace('loading native-scraper.service');

import axios, { AxiosInstance } from 'axios';

export interface ScrapedProduct {
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

export class NativeScraperService {
  private readonly baseUrl: string;
  private client: AxiosInstance;

  constructor(baseUrl?: string) {
    const url = baseUrl || process.env.NATIVE_SCRAPER_URL || '';
    if (!url || !url.trim()) {
      throw new Error('NATIVE_SCRAPER_URL is not configured');
    }
    this.baseUrl = url.replace(/\/$/, '');
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000,
      validateStatus: (status) => status < 500,
    });
  }

  async health(): Promise<{ status: string }> {
    const { data } = await this.client.get('/health');
    return data;
  }

  async scrapeAliExpress(url: string): Promise<ScrapedProduct> {
    const response = await this.client.post('/scrape/aliexpress', { url });

    if (response.status === 429) {
      const err = new Error(response.data?.error || 'captcha_or_blocked') as Error & { code?: string };
      err.code = 'CAPTCHA_OR_BLOCKED';
      throw err;
    }

    if (response.status >= 400) {
      throw new Error(response.data?.error || `Native scraper returned ${response.status}`);
    }

    const d = response.data;
    const priceNum = typeof d.price === 'number' ? d.price : parseFloat(String(d.price || '0').replace(/[^0-9.]/g, '')) || 0;

    return {
      title: d.title || 'Producto sin título',
      description: '',
      price: priceNum,
      currency: d.currency || 'USD',
      images: Array.isArray(d.images) ? d.images : [],
      category: d.category,
      shipping: d.shipping,
      rating: d.rating,
      reviews: d.reviews,
      seller: d.seller,
    };
  }
}

let _instance: NativeScraperService | null = null;

export function getNativeScraperService(): NativeScraperService {
  if (!_instance) {
    _instance = new NativeScraperService();
  }
  return _instance;
}
