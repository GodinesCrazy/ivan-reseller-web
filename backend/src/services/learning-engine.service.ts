/**
 * Learning Engine — Track category, views, clicks, conversions, revenue.
 * ProductPerformance: conversionRate * revenuePerView.
 * getTopCategories for opportunity ranking.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

export interface LearningInput {
  userId: number;
  category: string;
  priceRangeMin: number;
  priceRangeMax: number;
  converted: boolean;
  profitUsd?: number;
}

export interface LearningScoreResult {
  category: string;
  learningScore: number;
  sampleCount: number;
}

export class LearningEngineService {
  /**
   * Record outcome and update learning score.
   */
  async recordOutcome(input: LearningInput): Promise<void> {
    try {
      const existing = await prisma.learningScore.findUnique({
        where: {
          userId_category: { userId: input.userId, category: input.category },
        },
      });

      const n = existing ? existing.sampleCount + 1 : 1;
      const conv = existing ? Number(existing.conversionRate) : 0;
      const newConv = (conv * (n - 1) + (input.converted ? 1 : 0)) / n;
      const avgProfit = existing ? Number(existing.avgProfit) : 0;
      const newAvgProfit =
        n === 1
          ? (input.profitUsd ?? 0)
          : (avgProfit * (n - 1) + (input.profitUsd ?? 0)) / n;

      const score = newConv * 50 + Math.min(newAvgProfit / 10, 50);

      await prisma.learningScore.upsert({
        where: {
          userId_category: { userId: input.userId, category: input.category },
        },
        create: {
          userId: input.userId,
          category: input.category,
          priceRangeMin: input.priceRangeMin,
          priceRangeMax: input.priceRangeMax,
          conversionRate: newConv,
          avgProfit: newAvgProfit,
          sampleCount: n,
          learningScore: score,
          updatedAt: new Date(),
        },
        update: {
          priceRangeMin: input.priceRangeMin,
          priceRangeMax: input.priceRangeMax,
          conversionRate: newConv,
          avgProfit: newAvgProfit,
          sampleCount: n,
          learningScore: score,
          updatedAt: new Date(),
        },
      });
    } catch (e: any) {
      logger.warn('[LEARNING-ENGINE] recordOutcome failed', { error: e?.message });
    }
  }

  /**
   * Get learning score for category (bias for opportunity ranking).
   */
  async getLearningScore(
    userId: number,
    category: string
  ): Promise<number> {
    try {
      const row = await prisma.learningScore.findUnique({
        where: { userId_category: { userId, category } },
      });
      return row ? Number(row.learningScore) : 50;
    } catch {
      return 50;
    }
  }

  /**
   * Apply learning bias to opportunity score.
   */
  applyLearningBias(baseScore: number, learningScore: number): number {
    const bias = (learningScore - 50) / 100;
    return Math.max(0, Math.min(100, baseScore + bias * 20));
  }

  /**
   * Record/update ProductPerformance (views, clicks, conversions, revenue).
   */
  async recordPerformance(
    productId: number,
    category: string,
    data: { views?: number; clicks?: number; conversions?: number; revenue?: number }
  ): Promise<void> {
    try {
      const existing = await prisma.productPerformance.findUnique({
        where: { productId },
      });
      const views = (existing?.views ?? 0) + (data.views ?? 0);
      const clicks = (existing?.clicks ?? 0) + (data.clicks ?? 0);
      const conversions = (existing?.conversions ?? 0) + (data.conversions ?? 0);
      const revenue = Number(existing?.revenue ?? 0) + (data.revenue ?? 0);
      await prisma.productPerformance.upsert({
        where: { productId },
        create: { productId, category, views, clicks, conversions, revenue },
        update: { category, views, clicks, conversions, revenue },
      });
    } catch (e: any) {
      logger.warn('[LEARNING-ENGINE] recordPerformance failed', { error: e?.message });
    }
  }

  /**
   * Get top categories by score: conversionRate * revenuePerView.
   */
  async getTopCategories(
    _userId?: number,
    limit: number = 10
  ): Promise<Array<{ category: string; score: number; conversions: number; revenue: number }>> {
    try {
      const rows = await prisma.productPerformance.findMany();
      const byCategory = new Map<
        string,
        { views: number; clicks: number; conversions: number; revenue: number }
      >();
      for (const r of rows) {
        const cur = byCategory.get(r.category) ?? {
          views: 0,
          clicks: 0,
          conversions: 0,
          revenue: 0,
        };
        cur.views += r.views;
        cur.clicks += r.clicks;
        cur.conversions += r.conversions;
        cur.revenue += Number(r.revenue);
        byCategory.set(r.category, cur);
      }
      const scored = Array.from(byCategory.entries())
        .map(([category, agg]) => {
          const views = agg.views || 1;
          const conversionRate = agg.conversions / views;
          const revenuePerView = agg.revenue / views;
          const score = conversionRate * revenuePerView;
          return { category, score, conversions: agg.conversions, revenue: agg.revenue };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return scored;
    } catch (e: any) {
      logger.warn('[LEARNING-ENGINE] getTopCategories failed', { error: e?.message });
      return [];
    }
  }
}

export const learningEngineService = new LearningEngineService();
