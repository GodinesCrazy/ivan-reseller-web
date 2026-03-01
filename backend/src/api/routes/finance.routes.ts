import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { toNumber } from '../../utils/decimal.utils';
import { getSalesLedger } from '../../services/sales-ledger.service';
import { getWorkingCapitalDetail } from '../../services/working-capital-detail.service';
import { calculateMaxNewListingsAllowed } from '../../services/capital-allocation.engine';
import { getProductPerformance } from '../../services/product-performance.engine';
import { computeFinanceRisk } from '../../services/finance-risk.engine';

const router = Router();
router.use(authenticate);

/**
 * GET /api/finance/sales-ledger
 * Phase 1: Forensic complete sales ledger per sale
 */
router.get('/sales-ledger', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const range = (req.query.range as string) || 'month';
    const entries = await getSalesLedger(userId, range as any);
    res.json({ success: true, sales: entries });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/working-capital-detail
 * Phase 2: Working capital intelligence
 */
router.get('/working-capital-detail', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const detail = await getWorkingCapitalDetail(userId);
    res.json({ success: true, detail });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/leverage-and-risk
 * Phase 3+5: Leverage, capital allocation, and finance risk
 */
router.get('/leverage-and-risk', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const wc = await getWorkingCapitalDetail(userId);
    const allocation = await calculateMaxNewListingsAllowed(userId, wc.totalCapital);
    const risk = await computeFinanceRisk(userId, wc.totalCapital);
    res.json({
      success: true,
      leverage: {
        iclr: allocation.iclr,
        olr: allocation.olr,
        riskLevel: allocation.riskLevel,
      },
      capitalAllocation: {
        canPublish: allocation.canPublish,
        remainingExposure: allocation.remainingExposure,
        maxExposureAllowed: allocation.maxExposureAllowed,
        currentExposure: allocation.currentExposure,
      },
      risk: {
        worstCaseCost: risk.worstCaseCost,
        capitalBuffer: risk.capitalBuffer,
        bufferPercent: risk.bufferPercent,
        capitalTurnover: risk.capitalTurnover,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/top-products
 * Phase 4: Product performance / winners
 */
router.get('/top-products', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const days = parseInt((req.query.days as string) || '90', 10);
    const entries = await getProductPerformance(userId, days);
    res.json({ success: true, products: entries });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/capital-allocation
 * Phase 3: Capital allocation status for publishing
 */
router.get('/capital-allocation', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const supplierCost = parseFloat((req.query.supplierCost as string) || '0');
    const wc = await getWorkingCapitalDetail(userId);
    const allocation = await calculateMaxNewListingsAllowed(
      userId,
      wc.totalCapital,
      supplierCost > 0 ? supplierCost : undefined
    );
    res.json({ success: true, allocation });
  } catch (error) {
    next(error);
  }
});

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

    // ✅ MEJORADO: Calcular métricas incluyendo costos adicionales (envío, impuestos)
    const totalSales = sales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
    const totalBaseCosts = sales.reduce((sum, s) => sum + toNumber(s.aliexpressCost || 0), 0);
    
    // ✅ Incluir costos adicionales de productos (si están disponibles)
    const totalShippingCosts = products.reduce((sum, p) => sum + toNumber(p.shippingCost || 0), 0);
    const totalImportTaxes = products.reduce((sum, p) => sum + toNumber(p.importTax || 0), 0);
    const totalMarketplaceFees = sales.reduce((sum, s) => sum + toNumber(s.marketplaceFee || 0), 0);
    
    const totalCosts = totalBaseCosts + totalShippingCosts + totalImportTaxes + totalMarketplaceFees;
    const totalCommissions = commissions
      .filter(c => c.status === 'PAID')
      .reduce((sum, c) => sum + toNumber(c.amount), 0);
    
    // ✅ Calcular ganancia neta considerando todos los costos
    const grossProfit = totalSales - totalBaseCosts - totalMarketplaceFees;
    const totalProfit = grossProfit - totalShippingCosts - totalImportTaxes - totalCommissions;
    const grossMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100) : 0;
    const netMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100) : 0;

    // ✅ Obtener ventas pendientes
    const pendingSales = await prisma.sale.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      include: {
        product: true
      }
    });

    // ✅ NUEVO: Calcular métricas financieras avanzadas
    // 1. Capital comprometido vs disponible
    const { workflowConfigService } = await import('../../services/workflow-config.service');
    const totalWorkingCapital = await workflowConfigService.getWorkingCapital(userId);
    
    const committedCapital = pendingSales.reduce((sum, sale) => 
      sum + toNumber(sale.aliexpressCost || 0), 0
    );
    const availableCapital = Math.max(0, totalWorkingCapital - committedCapital);

    // 2. Rotación de capital (revenue / averageWorkingCapital)
    // Capital promedio = (capital inicial + capital final) / 2
    // Para simplificar, usamos capital actual como aproximación
    const averageWorkingCapital = totalWorkingCapital;
    const capitalTurnover = averageWorkingCapital > 0 
      ? totalSales / averageWorkingCapital 
      : 0;

    // 3. Tiempo promedio de recuperación de capital
    // Calcular días promedio desde compra hasta venta cobrada
    const paidSales = sales.filter(s => s.status === 'SHIPPED' || s.status === 'DELIVERED');
    let avgRecoveryDays = 0;
    if (paidSales.length > 0) {
      const recoveryDays: number[] = [];
      
      for (const sale of paidSales.slice(0, 50)) { // Limitar a 50 para performance
        try {
          const purchaseLog = await prisma.purchaseLog.findFirst({
            where: { saleId: sale.id, success: true }
          });
          
          if (purchaseLog && purchaseLog.completedAt && sale.updatedAt) {
            const days = Math.floor(
              (sale.updatedAt.getTime() - purchaseLog.completedAt.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (days > 0) recoveryDays.push(days);
          }
        } catch (error) {
          // Ignorar errores en búsqueda individual
        }
      }
      
      if (recoveryDays.length > 0) {
        avgRecoveryDays = recoveryDays.reduce((a, b) => a + b, 0) / recoveryDays.length;
      }
    }

    // 4. Ventas pendientes vs cobradas
    const pendingSalesValue = pendingSales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
    const paidSalesValue = paidSales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
    const cashFlow = paidSalesValue - totalCosts; // Flujo real de caja (solo ventas cobradas)

    const summary = {
      revenue: totalSales, // Alias para compatibilidad con frontend
      totalSales,
      expenses: totalCosts, // Alias para compatibilidad con frontend
      totalCosts,
      totalBaseCosts,
      totalShippingCosts,
      totalImportTaxes,
      totalMarketplaceFees,
      profit: grossProfit, // Alias para compatibilidad con frontend
      grossProfit,
      netProfit: totalProfit,
      totalProfit,
      commissions: totalCommissions, // Alias para compatibilidad con frontend
      totalCommissions,
      margin: netMargin, // Alias para compatibilidad con frontend
      grossMargin: Number(grossMargin.toFixed(2)),
      netMargin: Number(netMargin.toFixed(2)),
      taxes: totalImportTaxes, // Alias para compatibilidad con frontend
      salesCount: sales.length,
      pendingSalesCount: pendingSales.length,
      productsCount: products.length,
      commissionsCount: commissions.length,
      
      // ✅ NUEVO: Métricas financieras avanzadas
      workingCapital: {
        total: totalWorkingCapital,
        committed: committedCapital,
        available: availableCapital,
        utilizationRate: totalWorkingCapital > 0 
          ? Number(((committedCapital / totalWorkingCapital) * 100).toFixed(2))
          : 0
      },
      capitalMetrics: {
        capitalTurnover: Number(capitalTurnover.toFixed(2)), // Rotación de capital
        averageRecoveryDays: Number(avgRecoveryDays.toFixed(1)), // Tiempo promedio de recuperación
        averageWorkingCapital: averageWorkingCapital
      },
      cashFlowMetrics: {
        pendingSalesValue, // Valor de ventas pendientes
        paidSalesValue, // Valor de ventas cobradas
        realCashFlow: cashFlow, // Flujo real de caja (ingresos cobrados - gastos)
        pendingSalesCount: pendingSales.length,
        paidSalesCount: paidSales.length
      },
      
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

