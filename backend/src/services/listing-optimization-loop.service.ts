/**
 * Spec: Every 48h evaluate listings.
 * If impressions > 200 and sales == 0: reduce price, optional title refresh, optional main image replace.
 * When marketplace metrics (impressions) are not available, use heuristic: published >= 48h and 0 sales in our DB.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

const IMPRESSIONS_THRESHOLD = Number(process.env.LISTING_OPTIMIZATION_IMPRESSIONS_THRESHOLD || '200');
const HOURS_SINCE_PUBLISH = 48;

export interface ListingOptimizationResult {
  processed: number;
  repriced: number;
  titleRefreshed: number;
  errors: string[];
}

/**
 * Run one pass of the 48h listing optimization loop.
 * Finds products with marketplace listings that qualify (impressions > threshold and 0 sales, or no metrics: 48h published and 0 sales), then reprice and optionally refresh title.
 */
export async function runListingOptimization48h(): Promise<ListingOptimizationResult> {
  const result: ListingOptimizationResult = { processed: 0, repriced: 0, titleRefreshed: 0, errors: [] };
  const since = new Date(Date.now() - HOURS_SINCE_PUBLISH * 60 * 60 * 1000);

  try {
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        publishedAt: { lte: since, not: null },
      },
      include: {
        product: {
          select: {
            id: true,
            userId: true,
            title: true,
            suggestedPrice: true,
            aliexpressPrice: true,
            shippingCost: true,
            importTax: true,
          },
        },
      },
    });

    for (const listing of listings) {
      const product = listing.product as any;
      if (!product) continue;

      const userId = listing.userId;
      if (!userId) continue;

      result.processed++;

      const impressions = listing.viewCount != null && typeof listing.viewCount === 'number' ? listing.viewCount : 0;
      const sales = await prisma.sale.count({
        where: {
          productId: product.id,
          userId,
          createdAt: { gte: listing.publishedAt || since },
        },
      });
      const salesCount = sales;

      const shouldOptimize =
        (impressions >= IMPRESSIONS_THRESHOLD && salesCount === 0) ||
        (impressions === 0 && salesCount === 0);

      if (!shouldOptimize) continue;

      try {
        const { dynamicPricingService } = await import('./dynamic-pricing.service');
        const supplierPrice = toNumber(product.aliexpressPrice) || 0;
        const marketplace = (listing.marketplace || 'ebay') as 'ebay' | 'amazon' | 'mercadolibre';
        const repriceResult = await dynamicPricingService.repriceByProduct(product.id, supplierPrice, marketplace, userId);
        if (repriceResult.success && repriceResult.newSuggestedPriceUsd != null) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              suggestedPrice: repriceResult.newSuggestedPriceUsd,
              finalPrice: repriceResult.newSuggestedPriceUsd,
            },
          });
          result.repriced++;
        }
      } catch (e: any) {
        result.errors.push(`product ${product.id}: ${e?.message || String(e)}`);
        logger.warn('[LISTING-OPTIMIZATION-48H] Reprice failed', { productId: product.id, error: e?.message });
      }

      if (process.env.LISTING_OPTIMIZATION_REFRESH_TITLE === 'true') {
        try {
          const { listingSEOService } = await import('./listing-seo.service');
          const newTitle = await listingSEOService.generateTitle(
            { title: product.title, category: null },
            marketplace,
            'en',
            userId,
            []
          );
          if (newTitle && newTitle !== product.title) {
            await prisma.product.update({
              where: { id: product.id },
              data: { title: newTitle },
            });
            result.titleRefreshed++;
          }
        } catch {
          // Optional: skip if title refresh fails
        }
      }
    }

    logger.info('[LISTING-OPTIMIZATION-48H] Run complete', result);
    return result;
  } catch (error: any) {
    logger.error('[LISTING-OPTIMIZATION-48H] Run failed', { error: error?.message });
    result.errors.push(error?.message || String(error));
    return result;
  }
}
