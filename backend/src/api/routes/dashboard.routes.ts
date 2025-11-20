import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { productService } from '../../services/product.service';
import { saleService } from '../../services/sale.service';
import { commissionService } from '../../services/commission.service';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../../config/logger';

const router = Router();
const prisma = new PrismaClient();
router.use(authenticate);

// ✅ A7: Validation schemas para query parameters
const queryParamsSchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined).pipe(z.number().int().min(1).max(100).optional()),
  days: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined).pipe(z.number().int().min(1).max(365).optional()),
});

// GET /api/dashboard/stats - Estadísticas del dashboard
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    
    // Convertir userId a string para servicios que lo requieren
    const userIdString = userId ? String(userId) : undefined;
    
    const [productStats, salesStats, commissionStats] = await Promise.all([
      productService.getProductStats(userId),
      saleService.getSalesStats(userIdString),
      commissionService.getCommissionStats(userIdString),
    ]);
    res.json({ products: productStats, sales: salesStats, commissions: commissionStats });
  } catch (error: any) {
    // ✅ A8: Mejor manejo de errores con logger
    logger.error('Error in /api/dashboard/stats', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    next(error);
  }
});

// GET /api/dashboard/recent-activity - Actividad reciente
router.get('/recent-activity', async (req: Request, res: Response, next) => {
  try {
    // ✅ A7: Validar query parameters
    const queryParams = queryParamsSchema.parse(req.query);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    
    const limit = queryParams.limit || 10;
    const activities = await prisma.activity.findMany({
      where: userId ? { userId } : undefined,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true, email: true } } },
    });
    res.json({ activities });
  } catch (error: any) {
    logger.error('Error in /api/dashboard/recent-activity', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
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
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const sales = await prisma.sale.findMany({
      where: userId ? { userId, createdAt: { gte: startDate } } : { createdAt: { gte: startDate } },
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

export default router;
