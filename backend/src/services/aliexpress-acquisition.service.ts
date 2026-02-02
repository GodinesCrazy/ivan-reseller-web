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
import { getNativeScraperService } from './native-scraper.service';

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
  _userId: number
): Promise<AliExpressProductResult> {
  // 1) Try Affiliate API
  logger.info('[ALIEXPRESS] Trying Affiliate API');
  try {
    const result = await aliexpressAffiliateAPIService.getProductByUrl(aliexpressUrl);
    logger.info('[ALIEXPRESS-ACQUISITION] Succeeded via Affiliate API', { url: aliexpressUrl });
    return result;
  } catch (e1) {
    logger.warn('[ALIEXPRESS] Affiliate API failed', {
      error: e1 instanceof Error ? e1.message : String(e1),
    });
  }

  // 2) Try Scraper Bridge (if enabled)
  logger.info('[ALIEXPRESS] Trying Scraper Bridge');
  if (process.env.SCRAPER_BRIDGE_ENABLED === 'true') {
    try {
      const result = await scraperBridge.fetchAliExpressProduct(aliexpressUrl);
      logger.info('[ALIEXPRESS-ACQUISITION] Succeeded via Scraper Bridge', { url: aliexpressUrl });
      return result;
    } catch (e2) {
      logger.warn('[ALIEXPRESS] Scraper Bridge failed', {
        error: e2 instanceof Error ? e2.message : String(e2),
      });
    }
  }

  // 3) Try Native Scraper (if NATIVE_SCRAPER_URL configured)
  logger.info('[ALIEXPRESS] Trying Native Scraper');
  if (process.env.NATIVE_SCRAPER_URL) {
    try {
      const nativeScraper = getNativeScraperService();
      const result = await nativeScraper.scrapeAliExpress(aliexpressUrl);
      logger.info('[ALIEXPRESS-ACQUISITION] Succeeded via Native Scraper', { url: aliexpressUrl });
      return result;
    } catch (e3) {
      logger.error('[ALIEXPRESS] Native Scraper failed', {
        error: e3 instanceof Error ? e3.message : String(e3),
      });
    }
  }

  throw new Error('All AliExpress acquisition methods failed');
}
