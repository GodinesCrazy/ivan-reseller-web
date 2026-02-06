/**
 * Dynamic Pricing Engine — Recalculate selling price periodically.
 * Never prices below Profit Guard.
 * Fetches competitor prices via competitor-analyzer.
 * Writes to DynamicPriceHistory.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { checkProfitGuard } from './profit-guard.service';
import competitorAnalyzer from './competitor-analyzer.service';

const REPRICE_INTERVAL_HOURS = Number(process.env.DYNAMIC_PRICING_INTERVAL_HOURS || '6');

export interface RepriceInputs {
  productId?: number;
  orderId?: string;
  costUsd?: number;
  supplierPriceUsd?: number;
  competitorPrices?: number[];
  taxUsd?: number;
  shippingUsd?: number;
  marketplace?: 'ebay' | 'amazon' | 'mercadolibre';
  currentPriceUsd?: number;
  userId?: number;
}

export interface RepriceResult {
  success: boolean;
  newSuggestedPriceUsd?: number;
  previousPriceUsd?: number;
  reason?: string;
  error?: string;
  historyRowCreated?: boolean;
}

export class DynamicPricingService {
  /**
   * Reprice by productId: fetch competitor prices, compute targetPrice, enforce profit guard.
   * targetPrice = min(averageCompetitorPrice * 0.98, maxAllowedPrice)
   * Writes to DynamicPriceHistory.
   */
  async repriceByProduct(
    productId: number,
    supplierPriceUsd: number,
    marketplace: 'ebay' | 'amazon' | 'mercadolibre' = 'ebay',
    userId: number = 1
  ): Promise<RepriceResult> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { title: true, suggestedPrice: true, totalCost: true, shippingCost: true, importTax: true },
    });
    if (!product) {
      return { success: false, error: 'Product not found' };
    }
    const oldPrice = Number(product.suggestedPrice) || supplierPriceUsd * 1.5;
    const taxUsd = Number(product.importTax) || 0;
    const shippingUsd = Number(product.shippingCost) || 0;

    const mpMap: Array<'ebay' | 'amazon' | 'mercadolibre'> = [marketplace];
    const analysis = await competitorAnalyzer.analyzeCompetition(userId, product.title, mpMap, 'us');
    const key = `${marketplace}_us`;
    const comp = analysis[key];
    const avgCompetitor = comp?.averagePrice ?? 0;
    const competitorPrices = comp?.prices ?? [];
    const averageCompetitorPrice = competitorPrices.length > 0
      ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length
      : avgCompetitor;

    let targetPrice = averageCompetitorPrice > 0 ? averageCompetitorPrice * 0.98 : oldPrice;
    const maxAllowedPrice = averageCompetitorPrice > 0 ? averageCompetitorPrice * 1.1 : supplierPriceUsd * 3;
    targetPrice = Math.min(targetPrice, maxAllowedPrice);
    targetPrice = Math.round(targetPrice * 100) / 100;

    const profitCheck = checkProfitGuard({
      sellingPriceUsd: targetPrice,
      supplierPriceUsd,
      taxUsd,
      shippingUsd,
    });
    if (!profitCheck.allowed) {
      const minPrice =
        supplierPriceUsd +
        profitCheck.breakdown.platformFeesUsd +
        profitCheck.breakdown.paypalFeesUsd +
        taxUsd +
        shippingUsd;
      targetPrice = Math.ceil(minPrice * 1.05 * 100) / 100;
    }

    try {
      await prisma.dynamicPriceHistory.create({
        data: {
          productId,
          oldPrice,
          newPrice: targetPrice,
          reason: 'dynamic_reprice_competitor',
        },
      });
    } catch (e: any) {
      logger.warn('[DYNAMIC-PRICING] Failed to write DynamicPriceHistory', { error: e?.message });
      return { success: false, error: e?.message };
    }

    logger.info('[DYNAMIC-PRICING] Repriced by product', { productId, oldPrice, newPrice: targetPrice });
    return {
      success: true,
      newSuggestedPriceUsd: targetPrice,
      previousPriceUsd: oldPrice,
      reason: 'dynamic_reprice_competitor',
      historyRowCreated: true,
    };
  }

  /**
   * Recalculate selling price from competitor data, cost, fees.
   * Never below Profit Guard minimum.
   * Supports both productId+supplierPriceUsd and legacy costUsd+competitorPrices.
   */
  async repriceProduct(inputs: RepriceInputs): Promise<RepriceResult> {
    const {
      productId,
      orderId,
      costUsd = 0,
      supplierPriceUsd,
      competitorPrices = [],
      taxUsd = 0,
      shippingUsd = 0,
      marketplace = 'ebay',
      currentPriceUsd,
    } = inputs;
    const cost = supplierPriceUsd ?? costUsd;

    const competitorMin = competitorPrices.length > 0 ? Math.min(...competitorPrices) : undefined;
    const competitorAvg =
      competitorPrices.length > 0
        ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length
        : undefined;

    // Profit Guard floor: find minimum price that passes
    let candidatePrice =
      currentPriceUsd ?? (competitorMin ? competitorMin * 0.95 : cost * 1.5);
    if (competitorAvg && candidatePrice > competitorAvg * 1.1) {
      candidatePrice = competitorAvg * 1.05;
    }
    candidatePrice = Math.round(candidatePrice * 100) / 100;

    const profitCheck = checkProfitGuard({
      sellingPriceUsd: candidatePrice,
      supplierPriceUsd: cost,
      taxUsd,
      shippingUsd,
    });

    if (!profitCheck.allowed) {
      const minPrice = cost + profitCheck.breakdown.platformFeesUsd + profitCheck.breakdown.paypalFeesUsd + taxUsd + shippingUsd;
      candidatePrice = Math.ceil(minPrice * 1.05 * 100) / 100;
    }

    const previousPriceUsd = currentPriceUsd ?? candidatePrice;
    const newSuggestedPriceUsd = candidatePrice;

    let historyRowCreated = false;
    if (productId != null) {
      try {
        await prisma.dynamicPriceHistory.create({
          data: {
            productId,
            oldPrice: previousPriceUsd,
            newPrice: newSuggestedPriceUsd,
            reason: 'dynamic_reprice',
          },
        });
        historyRowCreated = true;
      } catch (e: any) {
        logger.warn('[DYNAMIC-PRICING] Failed to write DynamicPriceHistory', { error: e?.message });
      }
    }
    try {
      await prisma.dynamicPriceLog.create({
        data: {
          productId: productId ?? null,
          orderId: orderId ?? null,
          previousPriceUsd,
          newPriceUsd: newSuggestedPriceUsd,
          costUsd: cost,
          competitorMinUsd: competitorMin ?? null,
          competitorAvgUsd: competitorAvg ?? null,
          reason: 'dynamic_reprice',
        },
      });
    } catch (e: any) {
      logger.warn('[DYNAMIC-PRICING] Failed to log DynamicPriceLog', { error: e?.message });
    }

    logger.info('[DYNAMIC-PRICING] Repriced', {
      productId,
      previousPriceUsd,
      newSuggestedPriceUsd,
      costUsd: cost,
    });

    return {
      success: true,
      newSuggestedPriceUsd,
      previousPriceUsd,
      reason: 'dynamic_reprice',
      historyRowCreated: productId != null ? historyRowCreated : undefined,
    };
  }
}

export const dynamicPricingService = new DynamicPricingService();
