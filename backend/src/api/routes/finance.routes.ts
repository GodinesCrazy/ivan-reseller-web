import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { toNumber } from '../../utils/decimal.utils';

const router = Router();
router.use(authenticate);

/**
 * GET /api/finance/summary
 * Obtener resumen financiero consolidado
 */
router.get('/summary', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const range = (req.query.range as string) || 'month';
    
    // Calcular fechas según el rango
    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    // Obtener datos consolidados
    const [sales, commissions, products] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        }
      }),
      prisma.commission.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        }
      }),
      prisma.product.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        }
      })
    ]);

    // Calcular métricas
    const totalSales = sales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
    const totalCosts = sales.reduce((sum, s) => sum + toNumber(s.aliexpressCost), 0);
    const totalCommissions = commissions
      .filter(c => c.status === 'PAID')
      .reduce((sum, c) => sum + toNumber(c.amount), 0);
    const totalProfit = totalSales - totalCosts - totalCommissions;
    const grossMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100) : 0;

    const summary = {
      totalSales,
      totalCosts,
      totalCommissions,
      totalProfit,
      grossMargin: Number(grossMargin.toFixed(2)),
      salesCount: sales.length,
      productsCount: products.length,
      commissionsCount: commissions.length,
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        range
      }
    };

    res.json({ success: true, summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/breakdown
 * Obtener desglose por categorías
 */
router.get('/breakdown', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const range = (req.query.range as string) || 'month';
    
    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    const sales = await prisma.sale.findMany({
      where: {
        userId,
        createdAt: { gte: startDate }
      },
      include: {
        product: true
      }
    });

    // Agrupar por categoría
    const breakdown: Record<string, { sales: number; profit: number; count: number }> = {};
    
    sales.forEach(sale => {
      const category = sale.product?.category || 'Uncategorized';
      if (!breakdown[category]) {
        breakdown[category] = { sales: 0, profit: 0, count: 0 };
      }
      breakdown[category].sales += toNumber(sale.salePrice);
      breakdown[category].profit += (toNumber(sale.salePrice) - toNumber(sale.aliexpressCost));
      breakdown[category].count += 1;
    });

    const result = Object.entries(breakdown).map(([category, data]) => ({
      category,
      ...data,
      margin: data.sales > 0 ? ((data.profit / data.sales) * 100) : 0
    }));

    res.json({ success: true, breakdown: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/cashflow
 * Obtener flujo de caja por período
 */
router.get('/cashflow', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const range = (req.query.range as string) || 'month';
    
    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    const [sales, commissions] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.commission.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    // Agrupar por día
    const cashflow: Record<string, { income: number; expenses: number; net: number }> = {};
    
    sales.forEach(sale => {
      const date = sale.createdAt.toISOString().split('T')[0];
      if (!cashflow[date]) {
        cashflow[date] = { income: 0, expenses: 0, net: 0 };
      }
      cashflow[date].income += toNumber(sale.salePrice);
      cashflow[date].expenses += toNumber(sale.aliexpressCost);
      cashflow[date].net = cashflow[date].income - cashflow[date].expenses;
    });

    commissions.forEach(comm => {
      if (comm.status === 'PAID') {
        const date = comm.paidAt?.toISOString().split('T')[0] || comm.createdAt.toISOString().split('T')[0];
        if (!cashflow[date]) {
          cashflow[date] = { income: 0, expenses: 0, net: 0 };
        }
        cashflow[date].expenses += toNumber(comm.amount);
        cashflow[date].net = cashflow[date].income - cashflow[date].expenses;
      }
    });

    const result = Object.entries(cashflow)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, cashFlow: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/tax-summary
 * Obtener resumen para impuestos
 */
router.get('/tax-summary', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const range = (req.query.range as string) || 'year';
    
    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setFullYear(now.getFullYear() - 1);
    }

    const [sales, commissions] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        }
      }),
      prisma.commission.findMany({
        where: {
          userId,
          status: 'PAID',
          paidAt: { gte: startDate }
        }
      })
    ]);

    const totalRevenue = sales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
    const totalCosts = sales.reduce((sum, s) => sum + toNumber(s.aliexpressCost), 0);
    const totalCommissions = commissions.reduce((sum, c) => sum + toNumber(c.amount), 0);
    const netIncome = totalRevenue - totalCosts - totalCommissions;

    const taxSummary = {
      totalRevenue,
      totalCosts,
      totalCommissions,
      netIncome,
      salesCount: sales.length,
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        range
      }
    };

    res.json({ success: true, taxSummary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/export/:format
 * Exportar reporte financiero
 */
router.get('/export/:format', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const format = req.params.format as 'pdf' | 'excel' | 'csv';
    const range = (req.query.range as string) || 'month';

    if (!['pdf', 'excel', 'csv'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Invalid format. Use pdf, excel, or csv' });
    }

    // Calcular fechas según el rango
    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    // Obtener datos directamente
    const [sales, commissions] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        }
      }),
      prisma.commission.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        }
      })
    ]);

    const totalSales = sales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
    const totalCosts = sales.reduce((sum, s) => sum + toNumber(s.aliexpressCost), 0);
    const totalCommissions = commissions
      .filter(c => c.status === 'PAID')
      .reduce((sum, c) => sum + toNumber(c.amount), 0);
    const totalProfit = totalSales - totalCosts - totalCommissions;
    const grossMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100) : 0;

    if (format === 'csv') {
      // Generar CSV simple
      const csv = [
        'Metric,Value',
        `Total Sales,${totalSales.toFixed(2)}`,
        `Total Costs,${totalCosts.toFixed(2)}`,
        `Total Commissions,${totalCommissions.toFixed(2)}`,
        `Total Profit,${totalProfit.toFixed(2)}`,
        `Gross Margin,${grossMargin.toFixed(2)}%`,
        `Sales Count,${sales.length}`,
        `Commissions Count,${commissions.length}`
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=financial-report-${range}.csv`);
      return res.send(csv);
    }

    // Para PDF y Excel, retornar JSON (el frontend puede usar una librería para generar)
    res.json({
      success: true,
      message: 'Export functionality requires client-side library',
      data: {
        totalSales,
        totalCosts,
        totalCommissions,
        totalProfit,
        grossMargin: Number(grossMargin.toFixed(2)),
        salesCount: sales.length,
        commissionsCount: commissions.length
      },
      format
    });
  } catch (error) {
    next(error);
  }
});

export default router;

