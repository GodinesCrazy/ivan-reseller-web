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

    function fulfillmentAutomationFromOrder(order: { status?: string; errorMessage?: string | null } | null): { status: string; errorReason?: string } {
      if (!order) return { status: 'unknown' };
      const s = (order.status || '').toUpperCase();
      const err = (order.errorMessage || '').trim();
      if (s === 'PURCHASED') return { status: 'completed' };
      if (s === 'PAID' || s === 'PURCHASING') return { status: 'pending_purchase' };
      if (err.includes('EBAY_SYNC_AWAITING_PRODUCT_MAP') || err.includes('no_listing') || err.includes('no_aliexpress_url')) return { status: 'needs_mapping', errorReason: err || undefined };
      if (s === 'FAILED') return { status: 'failed', errorReason: err || undefined };
      return { status: 'unknown' };
    }

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
        ebayOrderId: undefined as string | undefined,
        mercadolibreOrderId: undefined as string | undefined,
        amazonOrderId: undefined as string | undefined,
        fulfillmentAutomationStatus: undefined as string | undefined,
        fulfillmentErrorReason: undefined as string | undefined,
      };
    });

    // Enrich with Order data for eBay ID and automation status
    const orderIds = [...new Set(mappedSales.map((s: any) => s.orderId).filter(Boolean))];
    if (orderIds.length > 0) {
      const { prisma } = await import('../../config/database');
      const orders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, paypalOrderId: true, status: true, errorMessage: true },
      });
      const orderMap = new Map(orders.map((o) => [o.id, o]));
      for (const row of mappedSales) {
        const order = orderMap.get(row.orderId);
        if (!order) continue;
        const pp = (order.paypalOrderId || '').trim();
        if (pp.startsWith('ebay:')) row.ebayOrderId = pp.slice(5);
        if (pp.startsWith('mercadolibre:')) row.mercadolibreOrderId = pp.slice(13).replace(/-[\w-]+$/, '');
        if (pp.startsWith('amazon:')) row.amazonOrderId = pp.slice(7).replace(/-[\w-]+$/, '');
        const auto = fulfillmentAutomationFromOrder(order);
        row.fulfillmentAutomationStatus = auto.status;
        row.fulfillmentErrorReason = auto.errorReason;
      }
    }

    // eBay orders en BD sin fila Sale (p. ej. sin mapeo de listing): siguen siendo "ventas" visibles
    let mergedSales = mappedSales;
    const shouldMergeOrphans = (!isAdmin && req.user?.userId != null) || isAdmin;
    if (shouldMergeOrphans) {
      const { prisma } = await import('../../config/database');
      const uid = isAdmin ? undefined : req.user!.userId;
      const ebayOrders = await prisma.order.findMany({
        where: uid != null ? { userId: uid, paypalOrderId: { startsWith: 'ebay:' } } : { paypalOrderId: { startsWith: 'ebay:' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          errorMessage: true,
          paypalOrderId: true,
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
            const auto = fulfillmentAutomationFromOrder(o);
            const pp = (o.paypalOrderId || '').trim();
            return {
              id: `ebay-order-${o.id}`,
              orderId: o.id,
              productId: undefined as number | undefined,
              productTitle: o.title,
              productImage: '',
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
              ebayOrderId: pp.startsWith('ebay:') ? pp.slice(5) : undefined,
              mercadolibreOrderId: undefined as string | undefined,
              amazonOrderId: undefined as string | undefined,
              fulfillmentAutomationStatus: auto.status,
              fulfillmentErrorReason: auto.errorReason,
            };
          });
        mergedSales = [...virtual, ...mappedSales];
      }

      // Mercado Libre orders in DB without Sale row: show as virtual sales
      const mlOrders = await prisma.order.findMany({
        where: uid != null ? { userId: uid, paypalOrderId: { startsWith: 'mercadolibre:' } } : { paypalOrderId: { startsWith: 'mercadolibre:' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          errorMessage: true,
          paypalOrderId: true,
          createdAt: true,
          customerName: true,
          customerEmail: true,
          shippingAddress: true,
        },
      });
      if (mlOrders.length) {
        const withSaleMl = await prisma.sale.findMany({
          where: { orderId: { in: mlOrders.map((o) => o.id) } },
          select: { orderId: true },
        });
        const hasSaleMl = new Set(withSaleMl.map((s) => s.orderId));
        const mlVirtual = mlOrders
          .filter((o) => !hasSaleMl.has(o.id))
          .map((o) => {
            const st =
              o.status === 'PURCHASED' ? 'SHIPPED' : o.status === 'FAILED' ? 'PROCESSING' : 'PENDING';
            const auto = fulfillmentAutomationFromOrder(o);
            const pp = (o.paypalOrderId || '').trim();
            const mlId = pp.startsWith('mercadolibre:') ? pp.slice(13).replace(/-[\w-]+$/, '') : undefined;
            return {
              id: `mercadolibre-order-${o.id}`,
              orderId: o.id,
              productId: undefined as number | undefined,
              productTitle: o.title,
              productImage: '',
              marketplace: 'mercadolibre',
              source: 'mercadolibre-sync',
              needsProductMapping: false,
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
              syncNote: o.errorMessage || undefined,
              ebayOrderId: undefined as string | undefined,
              mercadolibreOrderId: mlId,
              amazonOrderId: undefined as string | undefined,
              fulfillmentAutomationStatus: auto.status,
              fulfillmentErrorReason: auto.errorReason,
            };
          });
        mergedSales = [...mlVirtual, ...mergedSales];
      }

      // Amazon orders in DB without Sale row: show as virtual sales
      const amazonOrders = await prisma.order.findMany({
        where: uid != null ? { userId: uid, paypalOrderId: { startsWith: 'amazon:' } } : { paypalOrderId: { startsWith: 'amazon:' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          errorMessage: true,
          paypalOrderId: true,
          createdAt: true,
          customerName: true,
          customerEmail: true,
          shippingAddress: true,
        },
      });
      if (amazonOrders.length) {
        const withSaleAmz = await prisma.sale.findMany({
          where: { orderId: { in: amazonOrders.map((o) => o.id) } },
          select: { orderId: true },
        });
        const hasSaleAmz = new Set(withSaleAmz.map((s) => s.orderId));
        const amazonVirtual = amazonOrders
          .filter((o) => !hasSaleAmz.has(o.id))
          .map((o) => {
            const st =
              o.status === 'PURCHASED' ? 'SHIPPED' : o.status === 'FAILED' ? 'PROCESSING' : 'PENDING';
            const auto = fulfillmentAutomationFromOrder(o);
            const pp = (o.paypalOrderId || '').trim();
            const amzId = pp.startsWith('amazon:') ? pp.slice(7).replace(/-[\w-]+$/, '') : undefined;
            return {
              id: `amazon-order-${o.id}`,
              orderId: o.id,
              productId: undefined as number | undefined,
              productTitle: o.title,
              productImage: '',
              marketplace: 'amazon',
              source: 'amazon-sync',
              needsProductMapping: false,
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
              syncNote: o.errorMessage || undefined,
              ebayOrderId: undefined as string | undefined,
              mercadolibreOrderId: undefined as string | undefined,
              amazonOrderId: amzId,
              fulfillmentAutomationStatus: auto.status,
              fulfillmentErrorReason: auto.errorReason,
            };
          });
        mergedSales = [...amazonVirtual, ...mergedSales];
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
    
    const { toNumber } = await import('../../utils/decimal.utils');
    const totalSalesAll = stats.totalSalesAll ?? stats.totalSales ?? 0;
    const totalRevenueAll = toNumber(stats.totalRevenueAll ?? stats.totalRevenue ?? 0);
    const totalProfitAll = toNumber(stats.totalProfitAll ?? stats.totalProfit ?? 0);
    const avgOrderValue = totalSalesAll > 0 ? totalRevenueAll / totalSalesAll : 0;

    const mappedStats = {
      totalRevenue: totalRevenueAll,
      totalProfit: totalProfitAll,
      totalSales: totalSalesAll,
      avgOrderValue,
      revenueChange: 0,
      profitChange: 0,
      completedSales: stats.totalSales ?? 0,
      completedRevenue: toNumber(stats.totalRevenue ?? 0),
      completedProfit: toNumber(stats.totalProfit ?? 0),
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
