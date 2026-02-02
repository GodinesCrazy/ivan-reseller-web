/**
 * AliExpress product acquisition - cascading strategy:
 * 1) Affiliate API
 * 2) Scraper Bridge (if enabled)
 * 3) Native Scraper
 */

import { trace } from '../utils/boot-trace';
trace('loading aliexpress-acquisition.service');

import axios from 'axios';
import logger from '../config/logger';
import { aliexpressAffiliateAPIService } from './aliexpress-affiliate-api.service';
import scraperBridge from './scraper-bridge.service';

export interface AliExpressProductResult {
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

export async function getAliExpressProductCascaded(
  aliexpressUrl: string,
  userId: number
): Promise<AliExpressProductResult> {
  // 1) Try Affiliate API
  try {
    const result = await aliexpressAffiliateAPIService.getProductByUrl(aliexpressUrl);
    logger.info('[ALIEXPRESS-ACQUISITION] Succeeded via Affiliate API', { url: aliexpressUrl });
    return result;
  } catch (e1) {
    logger.warn('[ALIEXPRESS-ACQUISITION] Affiliate API failed', {
      url: aliexpressUrl,
      error: e1 instanceof Error ? e1.message : String(e1),
    });
  }

  // 2) Try Scraper Bridge (if enabled)
  if (process.env.SCRAPER_BRIDGE_ENABLED === 'true') {
    try {
      const result = await scraperBridge.fetchAliExpressProduct(aliexpressUrl);
      logger.info('[ALIEXPRESS-ACQUISITION] Succeeded via Scraper Bridge', { url: aliexpressUrl });
      return result;
    } catch (e2) {
      logger.warn('[ALIEXPRESS-ACQUISITION] Scraper bridge failed', {
        url: aliexpressUrl,
        error: e2 instanceof Error ? e2.message : String(e2),
      });
    }
  }

  // 3) Try Native Scraper microservice (HTTP)
  const nativeUrl = process.env.NATIVE_SCRAPER_URL;
  if (!nativeUrl) {
    logger.error('[ALIEXPRESS-ACQUISITION] NATIVE_SCRAPER_URL not configured');
    throw new Error('All AliExpress acquisition methods failed');
  }
  try {
    const response = await axios.post(
      `${nativeUrl.replace(/\/$/, '')}/scrape/aliexpress`,
      { url: aliexpressUrl },
      { timeout: 120000 }
    );
    const data = response.data;
    logger.info('[ALIEXPRESS-ACQUISITION] Succeeded via Native Scraper microservice', { url: aliexpressUrl });
    const priceNum = typeof data.price === 'number' ? data.price : parseFloat(String(data.price || '0').replace(/[^0-9.]/g, '')) || 0;
    return {
      title: data.title || 'Producto sin título',
      description: '',
      price: priceNum,
      currency: data.currency || 'USD',
      images: Array.isArray(data.images) ? data.images : [],
      category: data.category,
      shipping: data.shipping,
      rating: data.rating,
      reviews: data.reviews,
      seller: data.seller,
    };
  } catch (e3) {
    logger.error('[ALIEXPRESS-ACQUISITION] Native scraping failed', {
      url: aliexpressUrl,
      error: e3 instanceof Error ? e3.message : String(e3),
    });
    throw new Error('All AliExpress acquisition methods failed');
  }
}
