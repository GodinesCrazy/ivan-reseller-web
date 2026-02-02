/**
 * AliExpress product acquisition - cascading strategy:
 * 1) Affiliate API
 * 2) Scraper Bridge (if enabled)
 * 3) Native Scraper
 */

import { trace } from '../utils/boot-trace';
trace('loading aliexpress-acquisition.service');

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

  // 3) Try Native Scraper
  try {
    const { AdvancedScrapingService } = await import('./scraping.service');
    const advancedScrapingService = new AdvancedScrapingService();
    const result = await advancedScrapingService.scrapeAliExpressProduct(aliexpressUrl, userId);
    logger.info('[ALIEXPRESS-ACQUISITION] Succeeded via Native Scraper', { url: aliexpressUrl });
    return {
      title: result.title,
      description: result.description,
      price: result.price,
      currency: result.currency,
      images: result.images || [],
      category: result.category,
      shipping: result.shipping,
      rating: result.rating,
      reviews: result.reviews,
      seller: result.seller,
    };
  } catch (e3) {
    logger.error('[ALIEXPRESS-ACQUISITION] Native scraping failed', {
      url: aliexpressUrl,
      error: e3 instanceof Error ? e3.message : String(e3),
    });
    throw new Error('All AliExpress acquisition methods failed');
  }
}
