import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { saleService, CreateSaleDto } from '../../services/sale.service';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const createSaleSchema = z.object({
  orderId: z.string().min(3),
  productId: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? parseInt(val, 10) : val),
  marketplace: z.string(),
  salePrice: z.number().positive(),
  costPrice: z.number().positive(),
  platformFees: z.number().optional(),
  currency: z.string().default('USD'),
  buyerEmail: z.string().email().optional(),
  shippingAddress: z.string().optional(),
});

// ✅ PRODUCTION READY: Validación de query parameters
const getSalesQuerySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'DELIVERED', 'RETURNED']).optional(),
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1).pipe(z.number().int().min(1).max(1000)),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50).pipe(z.number().int().min(1).max(100)),
  environment: z.enum(['production', 'sandbox', 'all']).optional().default('production'),
});

// GET /api/sales/sync-status — Phase 40: last marketplace order sync time
router.get('/sync-status', async (_req: Request, res: Response, next) => {
  try {
    const { getLastMarketplaceSyncAt } = await import('../../services/marketplace-order-sync.service');
    const lastSyncAt = getLastMarketplaceSyncAt();
    res.json({
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      source: 'marketplace-order-sync',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales - Listar ventas
router.get('/', async (req: Request, res: Response, next) => {
  try {
    // ✅ PRODUCTION READY: Validar query parameters
    const validatedQuery = getSalesQuerySchema.parse(req.query);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : String(req.user?.userId || '');
    const status = validatedQuery.status;
    const environment = validatedQuery.environment;
    const sales = await saleService.getSales(userId, status as any, environment);
    
    // ✅ Phase 40: Exclude test/demo/simulated sales in production (real data only)
    const excludeFakeOrderIds = /^(DEMO|TEST|SIM_|ORD-TEST|mock-|MOCK)/i;
    let filteredSales = sales;
    if (environment === 'production') {
      filteredSales = sales.filter((s: any) => !excludeFakeOrderIds.test(String(s.orderId || '')));
    }

    // ✅ Mapear datos del backend al formato esperado por el frontend (Phase 40: full detail)
    const { toNumber } = await import('../../utils/decimal.utils');
    const mappedSales = filteredSales.map((sale: any) => {
      let productImage: string | undefined;
      try {
        const img = sale.product?.images;
        if (typeof img === 'string') {
          const arr = JSON.parse(img);
          productImage = Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined;
        }
      } catch {
        productImage = undefined;
      }
      return {
        id: String(sale.id),
        orderId: sale.orderId,
        productId: sale.productId || sale.product?.id,
        productTitle: sale.product?.title || 'Unknown Product',
        productImage,
        marketplace: sale.marketplace,
        source: sale.marketplace || 'checkout', // Phase 40: source tag eBay / ML / Amazon
        buyerName: sale.buyerName || sale.user?.username || sale.buyerEmail || 'Unknown Buyer',
        buyerEmail: sale.buyerEmail || undefined,
        shippingAddress: sale.shippingAddress || undefined,
        salePrice: toNumber(sale.salePrice),
        cost: toNumber(sale.aliexpressCost || sale.costPrice || 0),
        profit: toNumber(sale.netProfit || sale.grossProfit || 0),
        commission: toNumber(sale.commissionAmount || sale.userCommission || 0),
        marketplaceFee: toNumber(sale.marketplaceFee ?? 0),
        grossProfit: toNumber(sale.grossProfit ?? 0),
        status: sale.status,
        trackingNumber: sale.trackingNumber || undefined,
        createdAt: sale.createdAt?.toISOString() || new Date().toISOString(),
      };
    });

    // eBay orders en BD sin fila Sale (p. ej. sin mapeo de listing): siguen siendo "ventas" visibles
    let mergedSales = mappedSales;
    if (!isAdmin && req.user?.userId != null) {
      const { prisma } = await import('../../config/database');
      const uid = req.user.userId;
      const ebayOrders = await prisma.order.findMany({
        where: { userId: uid, paypalOrderId: { startsWith: 'ebay:' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          customerName: true,
          customerEmail: true,
          shippingAddress: true,
        },
      });
      if (ebayOrders.length) {
        const withSale = await prisma.sale.findMany({
          where: { orderId: { in: ebayOrders.map((o) => o.id) } },
          select: { orderId: true },
        });
        const hasSale = new Set(withSale.map((s) => s.orderId));
        const virtual = ebayOrders
          .filter((o) => !hasSale.has(o.id))
          .map((o) => {
            const st =
              o.status === 'PURCHASED' ? 'SHIPPED' : o.status === 'FAILED' ? 'PROCESSING' : 'PENDING';
            const awaiting = (o.errorMessage || '').includes('EBAY_SYNC_AWAITING_PRODUCT_MAP');
            return {
              id: `ebay-order-${o.id}`,
              orderId: o.id,
              productId: undefined as number | undefined,
              productTitle: o.title,
              productImage: undefined as string | undefined,
              marketplace: 'ebay',
              source: 'ebay-sync',
              needsProductMapping: awaiting,
              buyerName: o.customerName,
              buyerEmail: o.customerEmail || undefined,
              shippingAddress: o.shippingAddress || undefined,
              salePrice: toNumber(o.price as any),
              cost: 0,
              profit: 0,
              commission: 0,
              marketplaceFee: 0,
              grossProfit: 0,
              status: st,
              trackingNumber: undefined as string | undefined,
              createdAt: o.createdAt.toISOString(),
              syncNote: awaiting ? o.errorMessage || 'Mapea el producto (listing/item en la app)' : o.errorMessage || undefined,
            };
          });
        mergedSales = [...virtual, ...mappedSales];
      }
    }

    res.json({ sales: mergedSales });
  } catch (error) {
    next(error);
  }
});

// ✅ PRODUCTION READY: Validación de query parameters para stats
const getSalesStatsQuerySchema = z.object({
  days: z.string().optional().transform(val => val ? parseInt(val, 10) : 30).pipe(z.number().int().min(1).max(365)),
  environment: z.enum(['production', 'sandbox', 'all']).optional().default('production'),
});

// GET /api/sales/stats - Estadísticas
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    // ✅ PRODUCTION READY: Validar query parameters
    const validatedQuery = getSalesStatsQuerySchema.parse(req.query);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : (req.user?.userId ? String(req.user.userId) : undefined);
    const days = validatedQuery.days;
    const environment = validatedQuery.environment;
    const stats = await saleService.getSalesStats(userId, days, environment);
    
    // Calcular promedio de orden y cambios
    const { toNumber } = await import('../../utils/decimal.utils');
    const totalRevenueNum = toNumber(stats.totalRevenue || 0);
    const totalProfitNum = toNumber(stats.totalProfit ?? 0);
    const avgOrderValue = stats.totalSales > 0 ? totalRevenueNum / stats.totalSales : 0;
    
    // ✅ Mapear estadísticas al formato esperado por el frontend (mismo período y definición: DELIVERED o COMPLETED)
    const mappedStats = {
      totalRevenue: totalRevenueNum,
      totalProfit: totalProfitNum,
      totalSales: stats.totalSales || 0,
      avgOrderValue: avgOrderValue,
      revenueChange: 0, // TODO: Calcular cambio de ingresos comparando con período anterior
      profitChange: 0  // TODO: Calcular cambio de ganancias comparando con período anterior
    };
    
    res.json(mappedStats);
  } catch (error) {
    next(error);
  }
});

// ✅ PRODUCTION READY: Validación de parámetros de ruta
const getSaleByIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(val => parseInt(val, 10)),
});

// GET /api/sales/:id - Obtener por ID
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    // ✅ PRODUCTION READY: Validar parámetros de ruta
    const validatedParams = getSaleByIdParamsSchema.parse(req.params);
    
    // ✅ C2: Validar ownership - pasar userId y isAdmin
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = req.user?.userId;
    
    const sale = await saleService.getSaleById(validatedParams.id, userId, isAdmin);
    res.json(sale);
  } catch (error) {
    next(error);
  }
});

// POST /api/sales - Crear venta
router.post('/', async (req: Request, res: Response, next) => {
  try {
    const parsedData = createSaleSchema.parse(req.body);
    // Convertir productId de string a number y asegurar que todos los campos requeridos estén presentes
    const data: CreateSaleDto = {
      orderId: parsedData.orderId,
      productId: typeof parsedData.productId === 'string' ? parseInt(parsedData.productId, 10) : parsedData.productId,
      marketplace: parsedData.marketplace,
      salePrice: parsedData.salePrice,
      costPrice: parsedData.costPrice,
      platformFees: parsedData.platformFees,
      currency: parsedData.currency,
      buyerEmail: parsedData.buyerEmail,
      shippingAddress: parsedData.shippingAddress,
    };
    const sale = await saleService.createSale(req.user!.userId, data);
    res.status(201).json(sale);
  } catch (error: any) {
    next(error);
  }
});

// ✅ MEJORADO: GET /api/sales/pending-purchases - Obtener ventas pendientes de compra manual
router.get('/pending-purchases', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { prisma } = await import('../../config/database');
    const { workflowConfigService } = await import('../../services/workflow-config.service');
    const { toNumber } = await import('../../utils/decimal.utils');

    let environment = (req.query.environment as string)?.toLowerCase();
    if (environment !== 'sandbox' && environment !== 'production') {
      environment = (await workflowConfigService.getUserEnvironment(userId)) ?? 'production';
    }
    const saleWhere = {
      userId,
      environment,
      status: { in: ['PENDING', 'PROCESSING'] as string[] },
    };

    // Obtener ventas pendientes o en procesamiento
    const pendingSales = await prisma.sale.findMany({
      where: saleWhere,
      include: {
        product: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calcular capital disponible
    const totalCapital = await workflowConfigService.getWorkingCapital(userId);
    
    const pendingOrders = await prisma.sale.findMany({
      where: saleWhere,
    });
    const pendingCost = pendingOrders.reduce((sum, order) => 
      sum + toNumber(order.aliexpressCost || 0), 0
    );

    const approvedProducts = await prisma.product.findMany({
      where: {
        userId: userId,
        status: 'APPROVED',
        isPublished: false
      }
    });
    const approvedCost = approvedProducts.reduce((sum, product) => 
      sum + toNumber(product.aliexpressPrice || 0), 0
    );

    const availableCapital = totalCapital - pendingCost - approvedCost;

    // Phase 39: Include FAILED orders so they appear in "Orders to Fulfill" with ⚠ Required action
    const failedOrders = await prisma.order.findMany({
      where: { userId, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Mapear ventas con información de capital
    const mappedSales = pendingSales.map(sale => {
      const requiredCapital = toNumber(sale.aliexpressCost || 0);
      const canPurchase = availableCapital >= requiredCapital;

      return {
        id: sale.id,
        orderId: sale.orderId,
        productId: sale.productId,
        productTitle: (sale as any).product?.title || 'Unknown Product',
        productUrl: (sale as any).product?.aliexpressUrl || '',
        aliexpressUrl: (sale as any).product?.aliexpressUrl || '',
        marketplace: sale.marketplace,
        salePrice: toNumber(sale.salePrice),
        aliexpressCost: toNumber(sale.aliexpressCost || 0),
        buyerName: (sale as any).buyerName || undefined,
        buyerEmail: (sale as any).buyerEmail || undefined,
        shippingAddress: (sale as any).shippingAddress || undefined,
        createdAt: sale.createdAt.toISOString(),
        availableCapital: availableCapital,
        requiredCapital: requiredCapital,
        canPurchase: canPurchase,
        isFailedOrder: false,
      };
    });

    // Append failed orders as items requiring manual fulfillment (e.g. ship-from-US error on eBay)
    const failedItems = failedOrders.map(order => {
      const cost = toNumber(order.price) || 0;
      const canPurchase = availableCapital >= cost;
      return {
        id: `order-${order.id}`,
        orderId: order.id,
        productId: order.productId ?? undefined,
        productTitle: order.title || 'Order',
        productUrl: order.productUrl || '',
        aliexpressUrl: order.productUrl || '',
        marketplace: 'ebay',
        salePrice: cost,
        aliexpressCost: cost,
        buyerName: order.customerName || undefined,
        buyerEmail: order.customerEmail || undefined,
        shippingAddress: order.shippingAddress || undefined,
        createdAt: order.createdAt.toISOString(),
        availableCapital: availableCapital,
        requiredCapital: cost,
        canPurchase: canPurchase,
        isFailedOrder: true,
        errorMessage: order.errorMessage || undefined,
      };
    });

    res.json({ sales: [...mappedSales, ...failedItems], failedOrdersCount: failedOrders.length });
  } catch (error) {
    next(error);
  }
});

// ✅ PRODUCTION READY: Validación de body y parámetros para actualizar estado
const updateSaleStatusParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(val => parseInt(val, 10)),
});

const updateSaleStatusBodySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'DELIVERED', 'RETURNED']),
});

// PATCH /api/sales/:id/status - Actualizar estado (admin)
router.patch('/:id/status', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    // ✅ PRODUCTION READY: Validar parámetros y body
    const validatedParams = updateSaleStatusParamsSchema.parse(req.params);
    const validatedBody = updateSaleStatusBodySchema.parse(req.body);
    
    // ✅ C2: Admin puede actualizar cualquier venta
    const sale = await saleService.updateSaleStatus(validatedParams.id, validatedBody.status, req.user!.userId, true);
    res.json(sale);
  } catch (error) {
    next(error);
  }
});

export default router;
