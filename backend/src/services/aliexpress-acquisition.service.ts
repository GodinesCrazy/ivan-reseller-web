/**
 * AliExpress product acquisition - cascading strategy:
 * 1) Affiliate API
 * 2) Native Scraper
 */

import { trace } from '../utils/boot-trace';
trace('loading aliexpress-acquisition.service');

import logger from '../config/logger';
import { aliexpressAffiliateAPIService } from './aliexpress-affiliate-api.service';
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
  try {
    logger.info('[ALIEXPRESS] Trying Affiliate API');
    const p = await aliexpressAffiliateAPIService.getProductByUrl(aliexpressUrl);
    logger.info('[ALIEXPRESS] Affiliate API success');
    return p;
  } catch (e) {
    logger.warn('[ALIEXPRESS] Affiliate API failed', e?.message || e);
  }

  // 2) Try Native Scraper (if NATIVE_SCRAPER_URL configured)
  if (process.env.NATIVE_SCRAPER_URL) {
    try {
      logger.info('[ALIEXPRESS] Trying Native Scraper');
      console.log('[ALIEXPRESS] Native scraper waiting for human confirmation...');
      const nativeScraper = getNativeScraperService();
      const p = await nativeScraper.scrapeAliExpress(aliexpressUrl);
      console.log('[ALIEXPRESS] Native scraper SUCCESS');
      logger.info('[ALIEXPRESS] Native Scraper success');
      return p;
    } catch (e) {
      logger.error('[ALIEXPRESS] Native Scraper failed', e?.message || e);
    }
  }

  logger.error('[ALIEXPRESS] All methods failed');
  throw new Error('All AliExpress acquisition methods failed');
}
