import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { productService } from '../../services/product.service';
import { saleService } from '../../services/sale.service';
import { commissionService } from '../../services/commission.service';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { queryWithTimeout } from '../../utils/queryWithTimeout';
import { handleSetupCheck } from '../../utils/setup-check';
import { env } from '../../config/env';
import { wrapAsync } from '../../utils/async-route-wrapper';
import { getProductPerformance } from '../../services/product-performance.engine';
import { cacheService } from '../../services/cache.service';

const router = Router();
const DASHBOARD_STATS_CACHE_TTL = Number(process.env.DASHBOARD_STATS_CACHE_TTL_SECONDS) || 50;
const prisma = new PrismaClient();
router.use(authenticate);

// ✅ A7: Validation schemas para query parameters
const queryParamsSchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined).pipe(z.number().int().min(1).max(100).optional()),
  days: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined).pipe(z.number().int().min(1).max(365).optional()),
  environment: z.enum(['production', 'sandbox', 'all']).optional().transform(v => (v ?? 'production') as 'production' | 'sandbox' | 'all'),
});
const environmentSchema = z.enum(['production', 'sandbox', 'all']).optional().transform(v => (v ?? 'production') as 'production' | 'sandbox' | 'all');

// GET /api/dashboard/stats - Estadísticas del dashboard
router.get('/stats', wrapAsync(async (req: Request, res: Response, next) => {
  console.log('[ROUTE_ENTRY] GET /api/dashboard/stats');
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || 'unknown';
  
  try {
    // ✅ FIX SIGSEGV: Safe Dashboard Mode - responder defaults rápidos sin scraping ni DB pesada
    if (env.SAFE_DASHBOARD_MODE) {
      logger.info('[Dashboard Stats] SAFE_DASHBOARD_MODE enabled - returning defaults', {
        correlationId,
        userId: req.user?.userId
      });
      
      return res.json({
        products: {
          total: 0,
          pending: 0,
          approved: 0,
          published: 0,
          rejected: 0
        },
        sales: {
          totalSales: 0,
          pendingSales: 0,
          completedSales: 0,
          cancelledSales: 0,
          totalRevenue: 0,
          totalCommissions: 0
        },
        commissions: {
          totalEarned: 0,
          pendingPayout: 0,
          totalCommissions: 0,
          thisMonthEarnings: 0
        },
        _safeMode: true,
        _timestamp: new Date().toISOString()
      });
    }
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;

    // ✅ Verificar setup antes de continuar (solo para usuarios no-admin)
    if (!isAdmin && userId) {
      const shouldStop = await handleSetupCheck(userId, res);
      if (shouldStop) {
        return;
      }
    }

    const userIdString = userId ? String(userId) : undefined;
    const environment = environmentSchema.parse(req.query.environment);
    const cacheKey = `dashboard:stats:${isAdmin ? 'admin' : userId}:${environment}`;
    const payload = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const timeoutMs = 25000;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout: Database queries exceeded 25 seconds')), timeoutMs);
        });
        const commissionEnv = environment === 'all' ? undefined : environment;
        const queriesPromise = Promise.all([
          productService.getProductStats(userId),
          saleService.getSalesStats(userIdString, undefined, environment),
          commissionService.getCommissionStats(userIdString, commissionEnv),
        ]);
        const [productStats, salesStats, commissionStats] = await Promise.race([
          queriesPromise,
          timeoutPromise,
        ]) as [any, any, any];
        return { products: productStats, sales: salesStats, commissions: commissionStats };
      },
      { ttl: DASHBOARD_STATS_CACHE_TTL }
    );

    const duration = Date.now() - startTime;
    res.json(payload);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // ✅ FIX: Si es timeout, devolver 504 Gateway Timeout (no 500)
    if (error.message?.includes('timeout') || error.message?.includes('Database query timeout')) {
      logger.error('Timeout in /api/dashboard/stats', {
        correlationId,
        error: error.message,
        userId: req.user?.userId,
        duration,
      });
      
      return res.status(504).json({
        success: false,
        error: 'Request timeout: Database queries took too long',
        errorCode: 'TIMEOUT',
        timestamp: new Date().toISOString(),
      });
    }
    
    // ✅ A8: Mejor manejo de errores con logger
    logger.error('Error in /api/dashboard/stats', {
      correlationId,
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
      duration,
    });
    next(error);
  }
}, { route: '/api/dashboard/stats', serviceName: 'dashboard' }));

// GET /api/dashboard/recent-activity - Actividad reciente (Activity no tiene environment; param aceptado para consistencia)
router.get('/recent-activity', async (req: Request, res: Response, next) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || 'unknown';
  
  try {
    // Query param environment aceptado para consistencia API (Activity es global por usuario)
    const _environment = (req.query.environment as string)?.toLowerCase();

    // ✅ FIX SIGSEGV: Safe Dashboard Mode - responder array vacío sin DB
    if (env.SAFE_DASHBOARD_MODE) {
      logger.info('[Dashboard Recent Activity] SAFE_DASHBOARD_MODE enabled - returning empty array', {
        correlationId,
        userId: req.user?.userId
      });
      
      return res.json({
        activities: [],
        _safeMode: true,
        _timestamp: new Date().toISOString()
      });
    }
    
    // ✅ A7: Validar query parameters
    const queryParams = queryParamsSchema.parse(req.query);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    
    const limit = queryParams.limit || 10;
    
    // ✅ FIX: Agregar timeout de 10 segundos para queries simples
    const timeoutMs = 10000;
    const queryPromise = prisma.activity.findMany({
      where: userId ? { userId } : undefined,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true, email: true } } },
    });
    
    const activities = await queryWithTimeout(queryPromise, timeoutMs);
    
    res.json({ activities });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // ✅ FIX: Si es timeout, devolver 504 Gateway Timeout
    if (error.message?.includes('timeout') || error.message?.includes('Database query timeout')) {
      logger.error('Timeout in /api/dashboard/recent-activity', {
        correlationId,
        error: error.message,
        userId: req.user?.userId,
        duration,
      });
      
      return res.status(504).json({
        success: false,
        error: 'Request timeout',
        errorCode: 'TIMEOUT',
        timestamp: new Date().toISOString(),
      });
    }
    
    logger.error('Error in /api/dashboard/recent-activity', {
      correlationId,
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
      duration,
    });
    next(error);
  }
});

// GET /api/dashboard/charts/sales - Datos para gráfica de ventas
router.get('/charts/sales', async (req: Request, res: Response, next) => {
  try {
    // ✅ A7: Validar query parameters
    const queryParams = queryParamsSchema.parse(req.query);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    
    const days = queryParams.days || 30;
    const environment = queryParams.environment ?? 'production';
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const salesWhere: Record<string, unknown> = {
      ...(userId ? { userId } : {}),
      createdAt: { gte: startDate },
      status: { in: ['DELIVERED', 'COMPLETED'] },
    };
    if (environment !== 'all') {
      salesWhere.environment = environment;
    }
    // Phase 23: Exclude test/mock/demo order IDs for production so chart shows only real sales
    if (environment === 'production') {
      salesWhere.AND = [
        { orderId: { not: { startsWith: 'test' } } },
        { orderId: { not: { startsWith: 'mock' } } },
        { orderId: { not: { startsWith: 'demo' } } },
      ];
    }
    const sales = await prisma.sale.findMany({
      where: salesWhere,
      orderBy: { createdAt: 'asc' },
    });
    const salesByDay = sales.reduce((acc: any, sale) => {
      const date = sale.createdAt.toISOString().split('T')[0];
      if (!acc[date]) acc[date] = { date, sales: 0, revenue: 0, commissions: 0 };
      acc[date].sales += 1;
      acc[date].revenue += sale.salePrice;
      // Usar commissionAmount en lugar de userCommission si existe
      acc[date].commissions += (sale as any).commissionAmount || (sale as any).userCommission || 0;
      return acc;
    }, {});
    res.json({ data: Object.values(salesByDay) });
  } catch (error: any) {
    logger.error('Error in /api/dashboard/charts/sales', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    next(error);
  }
});

// GET /api/dashboard/charts/products - Productos por estado
router.get('/charts/products', async (req: Request, res: Response, next) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    
    const stats = await productService.getProductStats(userId);
    const data = [
      { name: 'Pendientes', value: stats.pending || 0 },
      { name: 'Aprobados', value: stats.approved || 0 },
      { name: 'Rechazados', value: stats.rejected || 0 },
      { name: 'Publicados', value: stats.published || 0 },
    ];
    res.json({ data });
  } catch (error: any) {
    // ✅ A8: Mejor manejo de errores con logger
    logger.error('Error in /api/dashboard/charts/products', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    next(error);
  }
});

// ✅ FIX: Agregar endpoint /summary como alias de /stats para compatibilidad
// GET /api/dashboard/summary - Alias de /stats para compatibilidad
router.get('/summary', async (req: Request, res: Response, next) => {
  const startTime = Date.now();
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    
    // Convertir userId a string para servicios que lo requieren
    const userIdString = userId ? String(userId) : undefined;
    const environment = environmentSchema.parse(req.query.environment);
    const commissionEnv = environment === 'all' ? undefined : environment;

    // ✅ FIX: Agregar timeout de 25 segundos (mismo que /stats)
    const timeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout: Database queries exceeded 25 seconds')), timeoutMs);
    });
    
    const queriesPromise = Promise.all([
      productService.getProductStats(userId),
      saleService.getSalesStats(userIdString, undefined, environment),
      commissionService.getCommissionStats(userIdString, commissionEnv),
    ]);
    
    const [productStats, salesStats, commissionStats] = await Promise.race([
      queriesPromise,
      timeoutPromise,
    ]) as [any, any, any];
    
    const duration = Date.now() - startTime;
    // Retornar formato consistente con /stats
    res.json({ products: productStats, sales: salesStats, commissions: commissionStats });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // ✅ FIX: Si es timeout, devolver 504 Gateway Timeout
    if (error.message?.includes('timeout') || error.message?.includes('Database query timeout')) {
      logger.error('Timeout in /api/dashboard/summary', {
        error: error.message,
        userId: req.user?.userId,
        duration,
      });
      
      return res.status(504).json({
        success: false,
        error: 'Request timeout: Database queries took too long',
        errorCode: 'TIMEOUT',
        timestamp: new Date().toISOString(),
      });
    }
    
    logger.error('Error in /api/dashboard/summary', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
      duration,
    });
    next(error);
  }
});

// GET /api/dashboard/inventory-summary - Resumen unificado de productos, listings y órdenes
router.get('/inventory-summary', async (req: Request, res: Response, next) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;

    if (!userId && !isAdmin) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let environment = (req.query.environment as string)?.toLowerCase();
    if ((environment !== 'sandbox' && environment !== 'production' && environment !== 'all') && userId) {
      const { workflowConfigService } = await import('../../services/workflow-config.service');
      environment = (await workflowConfigService.getUserEnvironment(userId)) ?? 'production';
    } else if (environment !== 'sandbox' && environment !== 'production' && environment !== 'all') {
      environment = 'production';
    }
    const saleEnvFilter = environment === 'all' ? {} : { environment };

    const whereUser = userId ? { userId } : {};

    const [
      productCounts,
      listingsByMp,
      ordersByStatus,
      pendingPurchasesCount,
      salesDeliveredCount,
    ] = await Promise.all([
      prisma.product.groupBy({
        by: ['status'],
        where: whereUser,
        _count: { id: true },
      }),
      prisma.marketplaceListing.groupBy({
        by: ['marketplace'],
        where: { ...whereUser, status: 'active' },
        _count: { id: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: userId ? { userId } : {},
        _count: { id: true },
      }),
      prisma.sale.count({
        where: {
          ...whereUser,
          ...saleEnvFilter,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
      prisma.sale.count({
        where: {
          ...whereUser,
          ...saleEnvFilter,
          status: 'DELIVERED',
        },
      }),
    ]);

    const products = {
      total: productCounts.reduce((s, p) => s + p._count.id, 0),
      pending: productCounts.find(p => p.status === 'PENDING')?._count.id ?? 0,
      approved: productCounts.find(p => p.status === 'APPROVED')?._count.id ?? 0,
      published: productCounts.find(p => p.status === 'PUBLISHED')?._count.id ?? 0,
    };

    const listingsByMarketplace = {
      ebay: listingsByMp.find(l => l.marketplace.toLowerCase() === 'ebay')?._count.id ?? 0,
      mercadolibre: listingsByMp.find(l => l.marketplace.toLowerCase() === 'mercadolibre' || l.marketplace.toLowerCase() === 'ml')?._count.id ?? 0,
      amazon: listingsByMp.find(l => l.marketplace.toLowerCase() === 'amazon')?._count.id ?? 0,
    };

    const listingsTotal =
      listingsByMarketplace.ebay + listingsByMarketplace.mercadolibre + listingsByMarketplace.amazon;

    let mercadolibreActiveCount: number | null = null;
    if (userId) {
      try {
        const { MarketplaceService } = await import('../../services/marketplace.service');
        const ms = new MarketplaceService();
        mercadolibreActiveCount = await ms.getMlActiveCount(userId);
      } catch {
        // Ignore - ML API may be unavailable
      }
    }

    const ordersByStatusMap = {
      CREATED: ordersByStatus.find(o => o.status === 'CREATED')?._count.id ?? 0,
      PAID: ordersByStatus.find(o => o.status === 'PAID')?._count.id ?? 0,
      PURCHASING: ordersByStatus.find(o => o.status === 'PURCHASING')?._count.id ?? 0,
      PURCHASED: ordersByStatus.find(o => o.status === 'PURCHASED')?._count.id ?? 0,
      FAILED: ordersByStatus.find(o => o.status === 'FAILED')?._count.id ?? 0,
    };

    return res.json({
      products,
      listingsByMarketplace,
      listingsTotal,
      mercadolibreActiveCount: mercadolibreActiveCount ?? undefined,
      ordersByStatus: ordersByStatusMap,
      pendingPurchasesCount,
      salesDeliveredCount,
    });
  } catch (error: any) {
    logger.error('Error in /api/dashboard/inventory-summary', { error: error?.message, userId: req.user?.userId });
    next(error);
  }
});

// GET /api/dashboard/autopilot-metrics - Active listings, daily sales, profit today/month, winning products count
router.get('/autopilot-metrics', async (req: Request, res: Response, next) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    if (!userId && !isAdmin) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    let environment = (req.query.environment as string)?.toLowerCase();
    if (environment !== 'sandbox' && environment !== 'production') {
      if (userId != null) {
        const { workflowConfigService } = await import('../../services/workflow-config.service');
        environment = (await workflowConfigService.getUserEnvironment(userId)) ?? 'production';
      } else {
        environment = 'production';
      }
    }
    const saleEnvFilter = environment === 'all' ? {} : { environment };

    if (env.SAFE_DASHBOARD_MODE) {
      return res.json({
        activeListings: 0,
        dailySales: 0,
        profitToday: 0,
        profitMonth: 0,
        winningProductsCount: 0,
        topWinningProducts: [],
        _safeMode: true,
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const whereUser = userId ? { userId } : undefined;
    const completedSaleStatusFilter = { status: { in: ['DELIVERED', 'COMPLETED'] } };

    const [activeListings, salesToday, salesMonth, productsWithSales] = await Promise.all([
      prisma.marketplaceListing.count({ where: { ...whereUser, status: 'active' } }),
      prisma.sale.count({
        where: {
          ...whereUser,
          ...saleEnvFilter,
          createdAt: { gte: todayStart },
          ...completedSaleStatusFilter,
        },
      }),
      prisma.sale.findMany({
        where: {
          ...whereUser,
          ...saleEnvFilter,
          createdAt: { gte: monthStart },
          ...completedSaleStatusFilter,
        },
        select: { netProfit: true },
      }),
      prisma.sale.groupBy({
        by: ['productId'],
        where: { ...whereUser, ...saleEnvFilter, ...completedSaleStatusFilter },
        _count: { productId: true },
      }),
    ]);

    const profitMonth = salesMonth.reduce((sum, s) => sum + Number(s.netProfit || 0), 0);
    const profitTodayResult = await prisma.sale.aggregate({
      where: {
        ...whereUser,
        ...saleEnvFilter,
        createdAt: { gte: todayStart },
        ...completedSaleStatusFilter,
      },
      _sum: { netProfit: true },
    });
    const profitToday = Number(profitTodayResult._sum?.netProfit ?? 0);

    let winningProductsCount = productsWithSales.length;
    let topWinningProducts: Array<{ productId: number; productTitle: string; winningScore: number }> = [];
    if (userId) {
      try {
        const entries = await getProductPerformance(userId, 90);
        const winners = entries.filter((e) => e.winningScore > 75);
        winningProductsCount = winners.length;
        topWinningProducts = winners.slice(0, 5).map((e) => ({
          productId: e.productId,
          productTitle: e.productTitle,
          winningScore: Math.round(e.winningScore),
        }));
      } catch (err) {
        logger.warn('autopilot-metrics: getProductPerformance failed', { userId, error: (err as Error)?.message });
      }
    }

    res.json({
      activeListings,
      dailySales: salesToday,
      profitToday,
      profitMonth,
      winningProductsCount,
      topWinningProducts,
    });
  } catch (error: any) {
    logger.error('Error in /api/dashboard/autopilot-metrics', { error: error?.message, userId: req.user?.userId });
    next(error);
  }
});

export default router;
