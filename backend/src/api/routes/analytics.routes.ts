/**
 * Phase 1: Performance Dashboard API
 * GET /analytics/listings — metrics aggregated by listing
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { toNumber } from '../../utils/decimal.utils';
import { getEffectiveShippingCost } from '../../utils/shipping.utils';

const router = Router();
router.use(authenticate);

const querySchema = z.object({
  days: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 30)).pipe(z.number().int().min(1).max(365)),
  marketplace: z.string().optional(),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
});

/**
 * GET /api/analytics/listings
 * Returns listing performance metrics aggregated by listing.
 * Query: days (default 30), marketplace (optional filter), limit (default 50).
 */
router.get('/listings', async (req: Request, res: Response) => {
  try {
    const parsed = querySchema.safeParse({
      days: req.query.days,
      marketplace: req.query.marketplace,
      limit: req.query.limit,
    });
    const { days = 30, marketplace, limit = 50 } = parsed.success ? parsed.data : { days: 30, marketplace: undefined as string | undefined, limit: 50 };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    if (!userId && !isAdmin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const whereListing: { userId?: number; marketplace?: string } = isAdmin ? {} : { userId: userId! };
    if (marketplace) {
      whereListing.marketplace = marketplace;
    }

    const listings = await prisma.marketplaceListing.findMany({
      where: whereListing,
      take: limit,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            suggestedPrice: true,
            supplierStock: true,
            supplierStockCheckedAt: true,
          },
        },
        listingMetrics: {
          where: { date: { gte: since } },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    /** Health score 0-100: visibility 40%, conversion 30%, sales 30% */
    const healthScoreFromMetrics = (imp: number, convRate: number | null, clicksVal: number, salesVal: number): number => {
      const visibilityScore = imp <= 0 ? 0 : Math.min(40, Math.log10(imp + 1) * 12);
      const conversionScore = convRate != null && convRate >= 0 ? Math.min(30, convRate * 30) : (imp > 0 ? Math.min(30, (clicksVal / imp) * 30) : 0);
      const salesScore = Math.min(30, salesVal * 10);
      return Math.round(Math.min(100, visibilityScore + conversionScore + salesScore));
    };

    const results = listings.map((l) => {
      const metrics = l.listingMetrics || [];
      const impressions = metrics.reduce((s, m) => s + (m.impressions || 0), 0) || (l.viewCount ?? 0);
      const clicks = metrics.reduce((s, m) => s + (m.clicks || 0), 0);
      const sales = metrics.reduce((s, m) => s + (m.sales || 0), 0);
      const lastMetric = metrics[0];
      const conversionRate = lastMetric?.conversionRate != null ? toNumber(lastMetric.conversionRate) : null;
      const price = lastMetric?.price != null ? toNumber(lastMetric.price) : (l.product ? toNumber((l.product as any).suggestedPrice) : null);
      const competitorPrice = lastMetric?.competitorPrice != null ? toNumber(lastMetric.competitorPrice) : null;
      const healthScore = healthScoreFromMetrics(impressions, conversionRate, clicks, sales);

      return {
        listingId: l.id,
        marketplaceListingId: l.listingId,
        marketplace: l.marketplace,
        listingUrl: l.listingUrl,
        productId: l.productId,
        productTitle: (l.product as any)?.title ?? null,
        suggestedPrice: l.product ? toNumber((l.product as any).suggestedPrice) : null,
        supplierStock: (l.product as any)?.supplierStock ?? null,
        supplierStockCheckedAt: (l.product as any)?.supplierStockCheckedAt ?? null,
        publishedAt: l.publishedAt?.toISOString() ?? null,
        impressions,
        clicks,
        sales,
        conversionRate,
        price,
        competitorPrice,
        viewCount: l.viewCount ?? 0,
        healthScore,
      };
    });

    return res.json({
      listings: results,
      days,
      marketplace: marketplace ?? 'all',
    });
  } catch (e: any) {
    logger.error('[analytics/listings] Error', { error: e?.message, stack: e?.stack });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 3: Winning products from winner-detection engine */
const winningQuerySchema = z.object({
  days: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 90)).pipe(z.number().int().min(1).max(365)),
  marketplace: z.string().optional(),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
});

router.get('/winning-products', async (req: Request, res: Response) => {
  try {
    const parsed = winningQuerySchema.safeParse({
      days: req.query.days,
      marketplace: req.query.marketplace,
      limit: req.query.limit,
    });
    const { days = 90, marketplace, limit = 50 } = parsed.success ? parsed.data : { days: 90, marketplace: undefined as string | undefined, limit: 50 };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: { userId?: number; marketplace?: string; detectedAt?: { gte: Date } } = {
      detectedAt: { gte: since },
    };
    if (!isAdmin) where.userId = userId;
    if (marketplace) where.marketplace = marketplace;

    const winners = await prisma.winningProduct.findMany({
      where,
      take: limit,
      orderBy: { detectedAt: 'desc' },
      include: {
        product: { select: { id: true, title: true } },
        marketplaceListing: { select: { id: true, listingId: true, listingUrl: true } },
      },
    });

    const results = winners.map((w) => {
      const meta = (w.metadata as any) || {};
      return {
        id: w.id,
        productId: w.productId,
        productTitle: (w.product as any)?.title ?? null,
        marketplaceListingId: w.marketplaceListingId,
        marketplace: w.marketplace,
        listingUrl: (w.marketplaceListing as any)?.listingUrl ?? null,
        score: toNumber(w.score),
        reason: w.reason,
        detectedAt: w.detectedAt.toISOString(),
        impressions: meta.impressions ?? null,
        clicks: meta.clicks ?? null,
        sales: meta.sales ?? null,
        conversionRate: meta.conversionRate != null ? Number(meta.conversionRate) : null,
        salesVelocity: meta.salesVelocity != null ? Number(meta.salesVelocity) : null,
      };
    });

    return res.json({ winners: results, days, marketplace: marketplace ?? 'all' });
  } catch (e: any) {
    logger.error('[analytics/winning-products] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 4: Market Intelligence — discovered opportunities (score, trend, demand, competition, margin) */
const marketOpportunitiesQuerySchema = z.object({
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
  source: z.string().optional(),
});

router.get('/market-opportunities', async (req: Request, res: Response) => {
  try {
    const parsed = marketOpportunitiesQuerySchema.safeParse(req.query);
    const { limit = 50, source } = parsed.success ? parsed.data : { limit: 50, source: undefined as string | undefined };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const where: { userId?: number; source?: string } = isAdmin ? {} : { userId: userId! };
    if (source) where.source = source;

    const opportunities = await prisma.marketOpportunity.findMany({
      where,
      take: limit,
      orderBy: [{ score: 'desc' }, { detectedAt: 'desc' }],
      include: {
        product: { select: { id: true, title: true, suggestedPrice: true, aliexpressPrice: true, aliexpressUrl: true } },
      },
    });

    const results = opportunities.map((o) => ({
      id: o.id,
      productId: o.productId,
      productTitle: (o.product as any)?.title ?? null,
      aliexpressUrl: (o.product as any)?.aliexpressUrl ?? null,
      suggestedPrice: (o.product as any)?.suggestedPrice != null ? toNumber((o.product as any).suggestedPrice) : null,
      aliexpressPrice: (o.product as any)?.aliexpressPrice != null ? toNumber((o.product as any).aliexpressPrice) : null,
      source: o.source,
      score: toNumber(o.score),
      trendScore: o.trendScore != null ? toNumber(o.trendScore) : null,
      demandScore: o.demandScore != null ? toNumber(o.demandScore) : null,
      competitionScore: o.competitionScore != null ? toNumber(o.competitionScore) : null,
      marginScore: o.marginScore != null ? toNumber(o.marginScore) : null,
      supplierScore: o.supplierScore != null ? toNumber(o.supplierScore) : null,
      detectedAt: o.detectedAt.toISOString(),
    }));

    return res.json({ opportunities: results, limit });
  } catch (e: any) {
    logger.error('[analytics/market-opportunities] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 5: Auto Listing Strategy — decisions (recommended products, priority, marketplace, execution status) */
const autoListingDecisionsQuerySchema = z.object({
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
  executed: z.enum(['true', 'false']).optional(),
});

router.get('/auto-listing-decisions', async (req: Request, res: Response) => {
  try {
    const parsed = autoListingDecisionsQuerySchema.safeParse(req.query);
    const { limit = 50, executed: executedFilter } = parsed.success ? parsed.data : { limit: 50, executed: undefined as 'true' | 'false' | undefined };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const where: { userId?: number; executed?: boolean } = isAdmin ? {} : { userId: userId! };
    if (executedFilter !== undefined) where.executed = executedFilter === 'true';

    const decisions = await prisma.autoListingDecision.findMany({
      where,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { priorityScore: 'desc' }],
      include: {
        product: { select: { id: true, title: true, status: true } },
      },
    });

    const results = decisions.map((d) => ({
      id: d.id,
      productId: d.productId,
      productTitle: (d.product as any)?.title ?? null,
      productStatus: (d.product as any)?.status ?? null,
      marketplace: d.marketplace,
      priorityScore: toNumber(d.priorityScore),
      decisionReason: d.decisionReason,
      executed: d.executed,
      createdAt: d.createdAt.toISOString(),
    }));

    return res.json({ decisions: results, limit });
  } catch (e: any) {
    logger.error('[analytics/auto-listing-decisions] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 6: Listing Optimization — optimization actions, performance improvements, recent adjustments */
const listingOptimizationActionsQuerySchema = z.object({
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
  executed: z.enum(['true', 'false']).optional(),
});

router.get('/listing-optimization-actions', async (req: Request, res: Response) => {
  try {
    const parsed = listingOptimizationActionsQuerySchema.safeParse(req.query);
    const { limit = 50, executed: executedFilter } = parsed.success ? parsed.data : { limit: 50, executed: undefined as 'true' | 'false' | undefined };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const where: { executed?: boolean; marketplaceListing?: { userId: number } } = executedFilter !== undefined ? { executed: executedFilter === 'true' } : {};
    if (!isAdmin) where.marketplaceListing = { userId: userId! };

    const actions = await prisma.listingOptimizationAction.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        marketplaceListing: {
          select: {
            id: true,
            productId: true,
            marketplace: true,
            listingId: true,
            userId: true,
            product: { select: { id: true, title: true } },
          },
        },
      },
    });

    const results = actions.map((a) => {
      const ml = a.marketplaceListing as any;
      return {
        id: a.id,
        listingId: a.listingId,
        productId: ml?.productId ?? null,
        productTitle: ml?.product?.title ?? null,
        marketplace: ml?.marketplace ?? null,
        actionType: a.actionType,
        reason: a.reason,
        executed: a.executed,
        createdAt: a.createdAt.toISOString(),
      };
    });

    return res.json({ actions: results, limit });
  } catch (e: any) {
    logger.error('[analytics/listing-optimization-actions] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 7: Demand Radar — top trending keywords, trend growth, sources */
const demandSignalsQuerySchema = z.object({
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
  source: z.string().optional(),
  minTrendScore: z.string().optional().transform((v) => (v ? parseFloat(v) : 0)).pipe(z.number().min(0).max(100)),
});

router.get('/demand-signals', async (req: Request, res: Response) => {
  try {
    const parsed = demandSignalsQuerySchema.safeParse(req.query);
    const { limit = 50, source, minTrendScore = 0 } = parsed.success ? parsed.data : { limit: 50, source: undefined as string | undefined, minTrendScore: 0 };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const where: { source?: string; trendScore?: { gte: any } } = {};
    if (source) where.source = source;
    if (minTrendScore > 0) where.trendScore = { gte: minTrendScore };

    const signals = await prisma.demandSignal.findMany({
      where,
      take: limit,
      orderBy: [{ trendScore: 'desc' }, { detectedAt: 'desc' }],
    });

    const results = signals.map((s) => ({
      id: s.id,
      source: s.source,
      externalProductId: s.externalProductId,
      keyword: s.keyword,
      trendScore: toNumber(s.trendScore),
      demandScore: s.demandScore != null ? toNumber(s.demandScore) : null,
      confidence: toNumber(s.confidence),
      detectedAt: s.detectedAt.toISOString(),
      metadata: s.metadata,
    }));

    return res.json({ signals: results, limit });
  } catch (e: any) {
    logger.error('[analytics/demand-signals] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 8: Strategy Brain — top strategic products, scores, recommended actions, recent decisions */
const strategyDecisionsQuerySchema = z.object({
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
  decisionType: z.string().optional(),
});

router.get('/strategy-decisions', async (req: Request, res: Response) => {
  try {
    const parsed = strategyDecisionsQuerySchema.safeParse(req.query);
    const { limit = 50, decisionType } = parsed.success ? parsed.data : { limit: 50, decisionType: undefined as string | undefined };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const where: { userId?: number; decisionType?: string } = isAdmin ? {} : { userId: userId! };
    if (decisionType) where.decisionType = decisionType;

    const decisions = await prisma.strategyDecision.findMany({
      where,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { score: 'desc' }],
      include: {
        product: { select: { id: true, title: true, status: true } },
      },
    });

    const results = decisions.map((d) => ({
      id: d.id,
      productId: d.productId,
      productTitle: (d.product as any)?.title ?? null,
      productStatus: (d.product as any)?.status ?? null,
      decisionType: d.decisionType,
      score: toNumber(d.score),
      reason: d.reason,
      executed: d.executed,
      createdAt: d.createdAt.toISOString(),
    }));

    return res.json({ decisions: results, limit });
  } catch (e: any) {
    logger.error('[analytics/strategy-decisions] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 9: Autonomous Scaling — scaled products, scale score, marketplace expansion, scaling actions */
const scalingActionsQuerySchema = z.object({
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
});

router.get('/scaling-actions', async (req: Request, res: Response) => {
  try {
    const parsed = scalingActionsQuerySchema.safeParse(req.query);
    const { limit = 50 } = parsed.success ? parsed.data : { limit: 50 };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const where = isAdmin ? {} : { userId: userId! };

    const actions = await prisma.scalingAction.findMany({
      where,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { score: 'desc' }],
      include: {
        product: { select: { id: true, title: true } },
      },
    });

    const results = actions.map((a) => ({
      id: a.id,
      productId: a.productId,
      productTitle: (a.product as any)?.title ?? null,
      marketplace: a.marketplace,
      actionType: a.actionType,
      score: toNumber(a.score),
      executed: a.executed,
      createdAt: a.createdAt.toISOString(),
    }));

    return res.json({ actions: results, limit });
  } catch (e: any) {
    logger.error('[analytics/scaling-actions] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 11: Conversion Rate Optimization — recent CRO actions, conversion improvements */
const conversionOptimizationQuerySchema = z.object({
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)).pipe(z.number().int().min(1).max(200)),
});

router.get('/conversion-optimization-actions', async (req: Request, res: Response) => {
  try {
    const parsed = conversionOptimizationQuerySchema.safeParse(req.query);
    const { limit = 50 } = parsed.success ? parsed.data : { limit: 50 };

    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const where = isAdmin ? {} : { marketplaceListing: { userId: userId! } };

    const actions = await prisma.conversionOptimizationAction.findMany({
      where,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { score: 'desc' }],
      include: {
        marketplaceListing: {
          select: {
            id: true,
            marketplace: true,
            listingId: true,
            product: { select: { id: true, title: true } },
          },
        },
      },
    });

    const results = actions.map((a) => {
      const listing = a.marketplaceListing as any;
      return {
        id: a.id,
        listingId: a.listingId,
        productId: listing?.product?.id ?? null,
        productTitle: listing?.product?.title ?? null,
        marketplace: listing?.marketplace ?? null,
        actionType: a.actionType,
        reason: a.reason,
        score: toNumber(a.score),
        executed: a.executed,
        createdAt: a.createdAt.toISOString(),
      };
    });

    return res.json({ actions: results, limit });
  } catch (e: any) {
    logger.error('[analytics/conversion-optimization-actions] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/** Phase 12: Strategic Control Center — unified funnel and KPIs */
router.get('/control-center-funnel', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const whereUser = isAdmin ? {} : { userId: userId! };
    const rawEnv = (req.query.environment as string)?.toLowerCase();
    const environment = rawEnv === 'sandbox' || rawEnv === 'all' ? rawEnv : 'production';
    const saleEnvFilter = environment === 'all' ? {} : { environment };

    const [
      trendSignalsCount,
      opportunitiesCount,
      activeListingsCount,
      listingMetricsCount,
      winnersCount,
      strategyDecisionsCount,
      scalingActionsCount,
      conversionOptimizationCount,
    ] = await Promise.all([
      prisma.demandSignal.count({ where: {} }),
      prisma.marketOpportunity.count({ where: whereUser }),
      prisma.marketplaceListing.count({
        where: {
          ...whereUser,
          status: 'active',
          product: {
            status: 'PUBLISHED',
            targetCountry: { not: null },
            aliexpressSku: { not: null },
            shippingCost: { not: null },
            totalCost: { not: null },
          },
        },
      }),
      prisma.listingMetric.count({
        where: isAdmin ? {} : { marketplaceListing: { userId: userId! } },
      }),
      prisma.winningProduct.count({ where: whereUser }),
      prisma.strategyDecision.count({ where: whereUser }),
      prisma.scalingAction.count({ where: whereUser }),
      prisma.conversionOptimizationAction.count({
        where: isAdmin ? {} : { marketplaceListing: { userId: userId! } },
      }),
    ]);

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const salesByMarketplace = await prisma.sale.groupBy({
      by: ['marketplace'],
      where: {
        ...(isAdmin ? {} : { userId }),
        ...saleEnvFilter,
        createdAt: { gte: since },
        status: { in: ['DELIVERED', 'COMPLETED'] },
      },
      _sum: { netProfit: true },
      _count: { id: true },
    });

    const profitDistribution = salesByMarketplace.map((s) => ({
      marketplace: s.marketplace,
      totalProfit: s._sum?.netProfit != null ? toNumber(s._sum.netProfit) : 0,
      salesCount: s._count.id,
    }));

    const funnel = [
      { stage: 'trend_signals', count: trendSignalsCount, label: 'Trend signals' },
      { stage: 'opportunities', count: opportunitiesCount, label: 'Market opportunities' },
      { stage: 'active_listings', count: activeListingsCount, label: 'Active listings' },
      { stage: 'listing_metrics', count: listingMetricsCount, label: 'Listing metrics' },
      { stage: 'winners', count: winnersCount, label: 'Winner products' },
      { stage: 'strategy_decisions', count: strategyDecisionsCount, label: 'Strategy decisions' },
      { stage: 'scaling_actions', count: scalingActionsCount, label: 'Scaling actions' },
      { stage: 'conversion_optimization', count: conversionOptimizationCount, label: 'CRO actions' },
    ];

    return res.json({
      funnel,
      profitDistribution,
      counts: {
        trendSignals: trendSignalsCount,
        opportunities: opportunitiesCount,
        activeListings: activeListingsCount,
        listingMetrics: listingMetricsCount,
        winners: winnersCount,
        strategyDecisions: strategyDecisionsCount,
        scalingActions: scalingActionsCount,
        conversionOptimization: conversionOptimizationCount,
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? '';
    const isConnectionLimit =
      typeof msg === 'string' &&
      (msg.toLowerCase().includes('too many clients') ||
        msg.toLowerCase().includes('too many connections') ||
        msg.toLowerCase().includes('too many database connections'));
    if (isConnectionLimit) {
      logger.error('[analytics/control-center-funnel] DB connection limit', { error: msg });
      return res.status(503).json({
        error: 'El servicio no pudo conectar con la base de datos. Intenta de nuevo en unos segundos.',
        code: 'DB_CONNECTION_LIMIT',
      });
    }
    logger.error('[analytics/control-center-funnel] Error', { error: msg });
    return res.status(500).json({ error: msg || 'Internal server error' });
  }
});

/** Phase 12: Marketplace performance — ROI, margin, conversion funnel, velocity, top/underperforming */
router.get('/marketplace-performance', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId as number | undefined;
    const role = (req as any).user?.role as string | undefined;
    const isAdmin = role?.toUpperCase() === 'ADMIN';
    if (!userId && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sales = await prisma.sale.findMany({
      where: { ...(isAdmin ? {} : { userId }), createdAt: { gte: since } },
      include: { product: { select: { id: true, title: true } } },
    });

    const profitByProduct = new Map<
      number,
      { productId: number; title: string; revenue: number; cost: number; profit: number; sales: number }
    >();
    for (const s of sales) {
      const rev = toNumber(s.salePrice);
      const cost = toNumber(s.aliexpressCost);
      const profit = toNumber(s.netProfit);
      const existing = profitByProduct.get(s.productId);
      if (!existing) {
        profitByProduct.set(s.productId, {
          productId: s.productId,
          title: (s.product as any)?.title ?? '',
          revenue: rev,
          cost,
          profit,
          sales: 1,
        });
      } else {
        existing.revenue += rev;
        existing.cost += cost;
        existing.profit += profit;
        existing.sales += 1;
      }
    }

    const roiPerProduct = Array.from(profitByProduct.values()).map((p) => ({
      ...p,
      roiPct: p.cost > 0 ? (p.profit / p.cost) * 100 : 0,
    }));

    const listingMetricsAgg = await prisma.listingMetric.groupBy({
      by: ['listingId'],
      where: { date: { gte: since } },
      _sum: { impressions: true, clicks: true, sales: true },
    });

    const listingIds = listingMetricsAgg.map((l) => l.listingId);
    const listings = await prisma.marketplaceListing.findMany({
      where: { id: { in: listingIds }, ...(isAdmin ? {} : { userId }) },
      include: { product: { select: { id: true, title: true, suggestedPrice: true, totalCost: true } } },
    });
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const marginPerListing = listingMetricsAgg.map((agg) => {
      const list = listingMap.get(agg.listingId);
      const product = list?.product as any;
      const price = product?.suggestedPrice != null ? toNumber(product.suggestedPrice) : 0;
      const cost = product?.totalCost != null ? toNumber(product.totalCost) : 0;
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
      return {
        listingId: agg.listingId,
        productTitle: product?.title ?? null,
        impressions: agg._sum.impressions ?? 0,
        clicks: agg._sum.clicks ?? 0,
        sales: agg._sum.sales ?? 0,
        marginPct,
      };
    });

    const conversionFunnel = {
      totalImpressions: listingMetricsAgg.reduce((s, a) => s + (a._sum.impressions ?? 0), 0),
      totalClicks: listingMetricsAgg.reduce((s, a) => s + (a._sum.clicks ?? 0), 0),
      totalSales: listingMetricsAgg.reduce((s, a) => s + (a._sum.sales ?? 0), 0),
    };

    const salesVelocity = sales.length / Math.max(days / 30, 0.1);

    const topPerforming = roiPerProduct.sort((a, b) => b.profit - a.profit).slice(0, 10);
    const underperforming = marginPerListing
      .filter((m) => m.impressions >= 50 && m.sales === 0)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    const salesByMp = await prisma.sale.groupBy({
      by: ['marketplace'],
      where: { ...(isAdmin ? {} : { userId }), createdAt: { gte: since } },
      _count: { id: true },
      _sum: { netProfit: true },
    });
    const profitDistribution = salesByMp.map((s) => ({
      marketplace: s.marketplace,
      salesCount: s._count.id,
      totalProfit: s._sum?.netProfit != null ? toNumber(s._sum.netProfit) : 0,
    }));

    return res.json({
      roiPerProduct: roiPerProduct.slice(0, 50),
      marginPerListing: marginPerListing.slice(0, 50),
      conversionFunnel,
      salesVelocity,
      topPerformingProducts: topPerforming,
      underperformingListings: underperforming,
      profitDistribution,
      days,
    });
  } catch (e: any) {
    logger.error('[analytics/marketplace-performance] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/**
 * Phase 13: GET /api/analytics/fee-intelligence
 * Calculate marketplace fee intelligence for a product or given params.
 * Query: marketplace (mercadolibre|ebay), listingPrice, supplierCost; or productId to use product costs.
 */
router.get('/fee-intelligence', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId as number | undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const marketplace = (req.query.marketplace as string)?.toLowerCase();
    const productId = req.query.productId ? Number(req.query.productId) : null;
    let listingPrice = req.query.listingPrice != null ? Number(req.query.listingPrice) : null;
    let supplierCost = req.query.supplierCost != null ? Number(req.query.supplierCost) : null;

    if (productId && (!listingPrice || !supplierCost)) {
      const product = await prisma.product.findFirst({
        where: { id: productId, userId },
        select: { suggestedPrice: true, finalPrice: true, aliexpressPrice: true, totalCost: true, shippingCost: true },
      });
      if (!product) return res.status(404).json({ error: 'Product not found' });
      listingPrice = listingPrice ?? Number(product.suggestedPrice ?? product.finalPrice ?? product.aliexpressPrice ?? 0);
      supplierCost = supplierCost ?? (product.totalCost ? Number(product.totalCost) : Number(product.aliexpressPrice ?? 0) + getEffectiveShippingCost(product));
    }

    if (!marketplace || marketplace !== 'mercadolibre' && marketplace !== 'ebay') {
      return res.status(400).json({ error: 'marketplace (mercadolibre|ebay) required' });
    }
    if (listingPrice == null || listingPrice < 0 || supplierCost == null) {
      return res.status(400).json({ error: 'listingPrice and supplierCost (or productId) required' });
    }

    const { calculateFeeIntelligence, isProfitabilityAllowed, getMinAllowedMargin } = await import(
      '../../services/marketplace-fee-intelligence.service'
    );
    const result = calculateFeeIntelligence({
      marketplace: marketplace as 'mercadolibre' | 'ebay',
      listingPrice,
      supplierCost,
      currency: marketplace === 'mercadolibre' ? 'CLP' : 'USD',
    });
    return res.json({
      ...result,
      allowed: isProfitabilityAllowed(result),
      minAllowedMargin: getMinAllowedMargin(),
    });
  } catch (e: any) {
    logger.error('[analytics/fee-intelligence] Error', { error: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

export default router;
