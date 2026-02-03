/**
 * AliExpress product acquisition - Affiliate API only.
 * No scraper fallback (validates OAuth flow).
 */

import { trace } from '../utils/boot-trace';
trace('loading aliexpress-acquisition.service');

import logger from '../config/logger';
import { aliexpressAffiliateAPIService } from './aliexpress-affiliate-api.service';

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
  // Affiliate API only – no scraper fallback (validate OAuth flow)
  logger.info('[ALIEXPRESS] Trying Affiliate API');
  const p = await aliexpressAffiliateAPIService.getProductByUrl(aliexpressUrl);
  logger.info('[ALIEXPRESS] Affiliate API success');
  return p;
}
