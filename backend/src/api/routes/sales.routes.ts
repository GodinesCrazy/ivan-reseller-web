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

// GET /api/sales - Listar ventas
router.get('/', async (req: Request, res: Response, next) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : String(req.user?.userId || '');
    const status = req.query.status as string | undefined;
    const sales = await saleService.getSales(userId, status as any);
    
    // ✅ Mapear datos del backend al formato esperado por el frontend
    const { toNumber } = await import('../../utils/decimal.utils');
    const mappedSales = sales.map((sale: any) => ({
      id: String(sale.id),
      orderId: sale.orderId,
      productId: sale.productId || sale.product?.id, // ✅ Para workflow status
      productTitle: sale.product?.title || 'Unknown Product',
      marketplace: sale.marketplace,
      buyerName: sale.buyerName || sale.user?.username || sale.buyerEmail || 'Unknown Buyer',
      buyerEmail: sale.buyerEmail || undefined, // ✅ MEJORADO: Incluir email del comprador
      shippingAddress: sale.shippingAddress || undefined, // ✅ MEJORADO: Incluir dirección de envío
      salePrice: toNumber(sale.salePrice),
      cost: toNumber(sale.aliexpressCost || sale.costPrice || 0),
      profit: toNumber(sale.netProfit || sale.grossProfit || 0),
      commission: toNumber(sale.commissionAmount || sale.userCommission || 0),
      status: sale.status,
      trackingNumber: sale.trackingNumber || undefined,
      createdAt: sale.createdAt?.toISOString() || new Date().toISOString()
    }));
    
    res.json({ sales: mappedSales });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/stats - Estadísticas
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : (req.user?.userId ? String(req.user.userId) : undefined);
    const days = parseInt(req.query.days as string) || 30;
    const stats = await saleService.getSalesStats(userId);
    
    // Calcular promedio de orden y cambios
    const { toNumber } = await import('../../utils/decimal.utils');
    const totalRevenueNum = toNumber(stats.totalRevenue || 0);
    const totalCommissionsNum = toNumber(stats.totalCommissions || 0);
    const avgOrderValue = stats.totalSales > 0 ? totalRevenueNum / stats.totalSales : 0;
    
    // ✅ Mapear estadísticas al formato esperado por el frontend
    const mappedStats = {
      totalRevenue: totalRevenueNum,
      totalProfit: totalRevenueNum - totalCommissionsNum,
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

// GET /api/sales/:id - Obtener por ID
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    // ✅ C2: Validar ownership - pasar userId y isAdmin
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = req.user?.userId;
    
    const sale = await saleService.getSaleById(Number(req.params.id), userId, isAdmin);
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

    // Obtener ventas pendientes o en procesamiento
    const pendingSales = await prisma.sale.findMany({
      where: {
        userId: userId,
        status: { in: ['PENDING', 'PROCESSING'] }
      },
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
      where: {
        userId: userId,
        status: { in: ['PENDING', 'PROCESSING'] }
      }
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

    // Mapear ventas con información de capital
    const mappedSales = pendingSales.map(sale => {
      const requiredCapital = toNumber(sale.aliexpressCost || 0);
      const canPurchase = availableCapital >= requiredCapital;

      return {
        id: sale.id,
        orderId: sale.orderId,
        productId: sale.productId,
        productTitle: sale.product?.title || 'Unknown Product',
        productUrl: sale.product?.aliexpressUrl || '',
        aliexpressUrl: sale.product?.aliexpressUrl || '',
        marketplace: sale.marketplace,
        salePrice: toNumber(sale.salePrice),
        aliexpressCost: toNumber(sale.aliexpressCost || 0),
        buyerName: sale.buyerName || undefined,
        buyerEmail: sale.buyerEmail || undefined,
        shippingAddress: sale.shippingAddress || undefined,
        createdAt: sale.createdAt.toISOString(),
        availableCapital: availableCapital,
        requiredCapital: requiredCapital,
        canPurchase: canPurchase
      };
    });

    res.json({ sales: mappedSales });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/sales/:id/status - Actualizar estado (admin)
router.patch('/:id/status', authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    // ✅ C2: Admin puede actualizar cualquier venta
    const sale = await saleService.updateSaleStatus(Number(req.params.id), status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'COMPLETED' | 'RETURNED', req.user!.userId, true);
    res.json(sale);
  } catch (error) {
    next(error);
  }
});

export default router;
