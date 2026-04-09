import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { toNumber } from '../../utils/decimal.utils';
import { getSalesLedger } from '../../services/sales-ledger.service';
import { RealProfitEngine } from '../../services/real-profit-engine.service';
import { getWorkingCapitalDetail } from '../../services/working-capital-detail.service';
import { getPayPalBalance } from '../../services/balance-verification.service';
import { calculateMaxNewListingsAllowed } from '../../services/capital-allocation.engine';
import { getProductPerformance } from '../../services/product-performance.engine';
import { computeFinanceRisk } from '../../services/finance-risk.engine';
import { getMonthlyProfitProjection } from '../../services/profit-projection.service';

const router = Router();
router.use(authenticate);

/** Resolve environment from query (default production). */
function getEnvironment(req: Request): 'production' | 'sandbox' | 'all' {
  const v = req.query.environment as string | undefined;
  return v === 'sandbox' || v === 'all' ? v : 'production';
}

/** Filter object for Sale/Commission by environment; use in where. */
function envFilter(env: string): Record<string, string> | object {
  return env === 'all' ? {} : { environment: env };
}

/**
 * GET /api/finance/sales-ledger
 * Phase 1: Forensic complete sales ledger per sale.
 * Query: environment=production|sandbox|all (default production, real data only).
 * Excludes simulated orders (TEST_SIMULATED, etc.).
 */
router.get('/sales-ledger', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const range = (req.query.range as string) || 'month';
    const env = getEnvironment(req);
    const entries = await getSalesLedger(userId, range as any, env);
    res.json({ success: true, sales: entries });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/real-profit
 * Phase 27: Real Profit Engine — money_in, money_out, profit per order/product, ROI (real data only).
 * Query: days=30, environment=production|sandbox|all, type=summary|orders|products (default summary).
 */
router.get('/real-profit', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || 30), 10) || 30));
    const env = getEnvironment(req);
    const type = (req.query.type as string) || 'summary';
    if (type === 'orders') {
      const orders = await RealProfitEngine.getRealProfitPerOrder({ userId, days, environment: env });
      return res.json({ success: true, type: 'orders', data: orders });
    }
    if (type === 'products') {
      const products = await RealProfitEngine.getRealProfitPerProduct({ userId, days, environment: env });
      return res.json({ success: true, type: 'products', data: products });
    }
    const summary = await RealProfitEngine.getRealProfitSummary({ userId, days, environment: env });
    res.json({ success: true, type: 'summary', data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/working-capital-detail
 * Phase 2: Working capital intelligence
 * Query: environment=production|sandbox (default production, aligns with dashboard overview).
 */
router.get('/working-capital-detail', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const env = getEnvironment(req);
    const envForPayPal = env === 'sandbox' ? 'sandbox' : 'production';
    const detail = await getWorkingCapitalDetail(userId, envForPayPal);
    res.json({ success: true, detail });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/finance/paypal-balance-debug
 * Diagnostic: raw PayPal balance result and whether it came from PayPal API or fallback.
 * Query: environment=production|sandbox (default production).
 */
router.get('/paypal-balance-debug', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const env = getEnvironment(req);
    const envForPayPal = env === 'sandbox' ? 'sandbox' : 'production';
    const raw = await getPayPalBalance(userId, envForPayPal);
    const fromPayPalAPI =
      raw != null &&
      'source' in raw &&
      (raw.source === 'paypal' || raw.source === 'paypal_estimated');
    res.json({
      success: true,
      debug: {
        raw,
        fromPayPalAPI,
        message: fromPayPalAPI
          ? 'Saldo obtenido desde PayPal API (wallet_api o reporting_api_estimated)'
          : raw != null && 'unavailableReason' in raw
            ? `PayPal API falló: ${raw.unavailableReason}`
            : raw == null
              ? 'PayPal balance check retornó null (error o excepción)'
              : 'PayPal API no devolvió saldo',
      },
    });
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
    const env = getEnvironment(req);
    const envForPayPal = env === 'sandbox' ? 'sandbox' : 'production';
    const wc = await getWorkingCapitalDetail(userId, envForPayPal);
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
    const env = getEnvironment(req);
    const envForPayPal = env === 'sandbox' ? 'sandbox' : 'production';
    const wc = await getWorkingCapitalDetail(userId, envForPayPal);
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
 * GET /api/finance/profit-projection
 * Monthly profit projection (historical or default methodology)
 */
router.get('/profit-projection', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const projection = await getMonthlyProfitProjection(userId);
    res.json({ success: true, projection });
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
    const environment = getEnvironment(req);
    const envWhere = envFilter(environment);

    // Rango como ventana fija de días (alineado con Sales Ledger y UI "Last 30 Days")
    const now = new Date();
    const daysMap: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };
    const days = daysMap[range] ?? 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Obtener datos consolidados (sales con product para shipping/import de productos vendidos)
    // Phase 35: exclude test/mock/demo orders in production so finance shows only real data
    const realFilter = RealProfitEngine.realSalesFilter(environment);
    const [sales, commissions, products] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
          ...envWhere,
          ...realFilter
        },
        include: {
          product: { select: { shippingCost: true, importTax: true } }
        }
      }),
      prisma.commission.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
          ...envWhere
        }
      }),
      prisma.product.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        }
      })
    ]);

    // totalSales aquí = suma de precios de venta (revenue); salesCount = número de ventas (más abajo)
    const totalSales = sales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
    const totalBaseCosts = sales.reduce((sum, s) => sum + toNumber(s.aliexpressCost || 0), 0);
    
    // Shipping e import tax solo de productos vendidos (no de todos los productos)
    const totalShippingCosts = sales.reduce((sum, s) => sum + toNumber((s as any).product?.shippingCost ?? 0), 0);
    const totalImportTaxes = sales.reduce((sum, s) => sum + toNumber((s as any).product?.importTax ?? 0), 0);
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

    // ✅ Obtener ventas pendientes (Phase 35: real sales only in production)
    const pendingSales = await prisma.sale.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'PROCESSING'] },
        ...envWhere,
        ...realFilter
      },
      include: {
        product: true
      }
    });

    // ✅ Métricas financieras avanzadas
    // 1. Capital comprometido vs disponible — fuente real (PayPal API), no valor manual
    const envForWC = environment === 'sandbox' ? 'sandbox' : 'production';
    const wcDetail = await getWorkingCapitalDetail(userId, envForWC);
    const totalWorkingCapital = wcDetail.totalCapital;
    const committedCapital = wcDetail.committedToOrders;
    const availableCapital = Math.max(0, wcDetail.availableCash - committedCapital);

    // 2. Rotación de capital (revenue / capital total)
    const averageWorkingCapital = Math.max(totalWorkingCapital, 1);
    const capitalTurnover = totalSales / averageWorkingCapital;

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
    // Fix: costos calculados solo sobre ventas cobradas (no sobre todas las ventas del período)
    const paidSalesCosts = paidSales.reduce((sum, s) => {
      return sum
        + toNumber(s.aliexpressCost || 0)
        + toNumber((s as any).product?.shippingCost ?? 0)
        + toNumber((s as any).product?.importTax ?? 0)
        + toNumber(s.marketplaceFee || 0);
    }, 0);
    const cashFlow = paidSalesValue - paidSalesCosts;

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
      
      workingCapital: {
        total: totalWorkingCapital,
        committed: committedCapital,
        available: availableCapital,
        utilizationRate: totalWorkingCapital > 0
          ? Number(((committedCapital / totalWorkingCapital) * 100).toFixed(2))
          : 0,
        source: wcDetail.inPayPalSource,
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
    const environment = getEnvironment(req);
    const envWhere = envFilter(environment);
    const realFilter = RealProfitEngine.realSalesFilter(environment);

    const now = new Date();
    const daysMapBreakdown: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };
    const daysBreakdown = daysMapBreakdown[range] ?? 30;
    const startDateBreakdown = new Date(now.getTime() - daysBreakdown * 24 * 60 * 60 * 1000);

    const sales = await prisma.sale.findMany({
      where: {
        userId,
        createdAt: { gte: startDateBreakdown },
        ...envWhere,
        ...realFilter
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
    const environment = getEnvironment(req);
    const envWhere = envFilter(environment);
    const realFilter = RealProfitEngine.realSalesFilter(environment);

    const now = new Date();
    const daysMapCashflow: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };
    const daysCashflow = daysMapCashflow[range] ?? 30;
    const startDateCashflow = new Date(now.getTime() - daysCashflow * 24 * 60 * 60 * 1000);

    const [sales, commissions] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId,
          createdAt: { gte: startDateCashflow },
          ...envWhere,
          ...realFilter
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.commission.findMany({
        where: {
          userId,
          createdAt: { gte: startDateCashflow },
          ...envWhere
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
    const environment = getEnvironment(req);
    const envWhere = envFilter(environment);
    const realFilter = RealProfitEngine.realSalesFilter(environment);

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
          createdAt: { gte: startDate },
          ...envWhere,
          ...realFilter
        }
      }),
      prisma.commission.findMany({
        where: {
          userId,
          status: 'PAID',
          paidAt: { gte: startDate },
          ...envWhere
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
 * Exportar reporte financiero real.
 * Formats: csv (descarga), excel (.xlsx con 2 sheets), pdf (HTML imprimible).
 */
router.get('/export/:format', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const format = req.params.format as 'pdf' | 'excel' | 'csv';
    const range = (req.query.range as string) || 'month';
    const environment = getEnvironment(req);
    const envWhere = envFilter(environment);
    const realFilter = RealProfitEngine.realSalesFilter(environment);

    if (!['pdf', 'excel', 'csv'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Invalid format. Use pdf, excel, or csv' });
    }

    const now = new Date();
    let startDate = new Date();
    switch (range) {
      case 'week':  startDate.setDate(now.getDate() - 7); break;
      case 'month': startDate.setMonth(now.getMonth() - 1); break;
      case 'quarter': startDate.setMonth(now.getMonth() - 3); break;
      case 'year':  startDate.setFullYear(now.getFullYear() - 1); break;
      default:      startDate.setMonth(now.getMonth() - 1);
    }
    const periodStr = `${startDate.toLocaleDateString('es-CL')} – ${now.toLocaleDateString('es-CL')}`;

    const [salesRaw, commissionsRaw] = await Promise.all([
      prisma.sale.findMany({
        where: { userId, createdAt: { gte: startDate }, ...envWhere, ...realFilter },
        include: { product: { select: { title: true, aliexpressUrl: true, shippingCost: true, importTax: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.commission.findMany({
        where: { userId, status: 'PAID', paidAt: { gte: startDate }, ...envWhere },
      }),
    ]);

    const totalRevenue      = salesRaw.reduce((s, r) => s + toNumber(r.salePrice), 0);
    const totalSupplierCost = salesRaw.reduce((s, r) => s + toNumber(r.aliexpressCost), 0);
    const totalMPFees       = salesRaw.reduce((s, r) => s + toNumber(r.marketplaceFee || 0), 0);
    const totalShipping     = salesRaw.reduce((s, r) => s + toNumber((r as any).product?.shippingCost ?? 0), 0);
    const totalImportTax    = salesRaw.reduce((s, r) => s + toNumber((r as any).product?.importTax ?? 0), 0);
    const totalCommissions  = commissionsRaw.reduce((s, c) => s + toNumber(c.amount), 0);
    const totalCosts        = totalSupplierCost + totalMPFees + totalShipping + totalImportTax + totalCommissions;
    const grossProfit       = totalRevenue - totalSupplierCost - totalMPFees;
    const netProfit         = totalRevenue - totalCosts;
    const grossMargin       = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin         = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // ─── CSV ─────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const headers = [
        'Fecha','Orden','Producto','Marketplace',
        'Precio Venta','Costo Proveedor','Fee Marketplace','Envío','Impuesto Import','Comisión Plataforma',
        'Total Costos','Ganancia Bruta','Ganancia Neta','Margen %','ROI %','Estado','Payout',
      ];
      const rows = salesRaw.map(s => {
        const sp = toNumber(s.salePrice);
        const sc = toNumber(s.aliexpressCost);
        const mf = toNumber(s.marketplaceFee || 0);
        const sh = toNumber((s as any).product?.shippingCost ?? 0);
        const tx = toNumber((s as any).product?.importTax ?? 0);
        const cm = toNumber(s.commissionAmount || 0);
        const tc = sc + mf + sh + tx + cm;
        const gp = sp - tc;
        const np = toNumber(s.netProfit || gp);
        return [
          new Date(s.createdAt).toLocaleDateString('es-CL'),
          s.orderId,
          `"${((s.product as any)?.title || '').replace(/"/g, '""')}"`,
          s.marketplace,
          sp.toFixed(2), sc.toFixed(2), mf.toFixed(2), sh.toFixed(2), tx.toFixed(2), cm.toFixed(2),
          tc.toFixed(2), gp.toFixed(2), np.toFixed(2),
          sp > 0 ? (gp / sp * 100).toFixed(2) : '0',
          sc > 0 ? (gp / sc * 100).toFixed(2) : '0',
          s.status,
          s.payoutExecuted ? 'Si' : 'No',
        ].join(',');
      });
      const summaryLines = [
        '', '-- RESUMEN --',
        `Período,${periodStr}`,
        `Total Ingresos,${totalRevenue.toFixed(2)}`,
        `Costo Proveedor,${totalSupplierCost.toFixed(2)}`,
        `Fee Marketplace,${totalMPFees.toFixed(2)}`,
        `Envío,${totalShipping.toFixed(2)}`,
        `Impuesto Importación,${totalImportTax.toFixed(2)}`,
        `Comisiones Plataforma,${totalCommissions.toFixed(2)}`,
        `Total Costos,${totalCosts.toFixed(2)}`,
        `Ganancia Bruta,${grossProfit.toFixed(2)}`,
        `Ganancia Neta,${netProfit.toFixed(2)}`,
        `Margen Bruto,${grossMargin.toFixed(2)}%`,
        `Margen Neto,${netMargin.toFixed(2)}%`,
        `Núm. Ventas,${salesRaw.length}`,
      ];
      const csv = [headers.join(','), ...rows, ...summaryLines].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=financial-report-${range}.csv`);
      return res.send('\uFEFF' + csv); // BOM para compatibilidad Excel
    }

    // ─── EXCEL ───────────────────────────────────────────────────────────────
    if (format === 'excel') {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Ivan Reseller';
      workbook.created = now;

      // Sheet 1: Resumen
      const ws1 = workbook.addWorksheet('Resumen');
      ws1.columns = [
        { header: 'Métrica', key: 'metric', width: 32 },
        { header: 'Valor (USD)', key: 'value', width: 20 },
      ];
      ws1.getRow(1).font = { bold: true, size: 11 };
      ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      ws1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      const summaryRows = [
        { metric: 'Período', value: periodStr },
        { metric: 'Total Ingresos', value: totalRevenue },
        { metric: 'Costo Proveedor (AliExpress)', value: totalSupplierCost },
        { metric: 'Fee Marketplace', value: totalMPFees },
        { metric: 'Envío / Flete', value: totalShipping },
        { metric: 'Impuesto Importación', value: totalImportTax },
        { metric: 'Comisiones Plataforma', value: totalCommissions },
        { metric: 'Total Costos', value: totalCosts },
        { metric: 'Ganancia Bruta', value: grossProfit },
        { metric: 'Ganancia Neta', value: netProfit },
        { metric: 'Margen Bruto (%)', value: `${grossMargin.toFixed(2)}%` },
        { metric: 'Margen Neto (%)', value: `${netMargin.toFixed(2)}%` },
        { metric: 'Número de Ventas', value: salesRaw.length },
      ];
      summaryRows.forEach(r => {
        const row = ws1.addRow(r);
        if (typeof r.value === 'number') row.getCell(2).numFmt = '"$"#,##0.00';
      });
      // Highlight profit rows
      [9, 10].forEach(r => {
        ws1.getRow(r + 1).getCell(2).font = { bold: true, color: { argb: netProfit >= 0 ? 'FF16A34A' : 'FFDC2626' } };
      });

      // Sheet 2: Ventas
      const ws2 = workbook.addWorksheet('Ventas');
      ws2.columns = [
        { header: 'Fecha',         key: 'fecha',       width: 13 },
        { header: 'Orden',         key: 'orden',       width: 30 },
        { header: 'Producto',      key: 'producto',    width: 38 },
        { header: 'Marketplace',   key: 'mp',          width: 14 },
        { header: 'Venta',         key: 'venta',       width: 11 },
        { header: 'Costo Prov.',   key: 'costo',       width: 11 },
        { header: 'Fee MP',        key: 'fee',         width: 10 },
        { header: 'Envío',         key: 'envio',       width: 10 },
        { header: 'Import Tax',    key: 'tax',         width: 11 },
        { header: 'Comisión',      key: 'comision',    width: 10 },
        { header: 'Total Costos',  key: 'totalCosto',  width: 12 },
        { header: 'G. Bruta',      key: 'gBruta',      width: 11 },
        { header: 'G. Neta',       key: 'gNeta',       width: 11 },
        { header: 'Margen %',      key: 'margen',      width: 10 },
        { header: 'ROI %',         key: 'roi',         width: 10 },
        { header: 'Estado',        key: 'estado',      width: 12 },
        { header: 'Payout',        key: 'payout',      width: 8  },
      ];
      const hdr2 = ws2.getRow(1);
      hdr2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hdr2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

      for (const s of salesRaw) {
        const sp = toNumber(s.salePrice);
        const sc = toNumber(s.aliexpressCost);
        const mf = toNumber(s.marketplaceFee || 0);
        const sh = toNumber((s as any).product?.shippingCost ?? 0);
        const tx = toNumber((s as any).product?.importTax ?? 0);
        const cm = toNumber(s.commissionAmount || 0);
        const tc = sc + mf + sh + tx + cm;
        const gp = sp - tc;
        const np = toNumber(s.netProfit || gp);
        const row = ws2.addRow({
          fecha: new Date(s.createdAt).toLocaleDateString('es-CL'),
          orden: s.orderId,
          producto: (s.product as any)?.title || '',
          mp: s.marketplace,
          venta: sp, costo: sc, fee: mf, envio: sh, tax: tx, comision: cm,
          totalCosto: tc, gBruta: gp, gNeta: np,
          margen: sp > 0 ? gp / sp * 100 : 0,
          roi: sc > 0 ? gp / sc * 100 : 0,
          estado: s.status,
          payout: s.payoutExecuted ? 'Sí' : 'No',
        });
        ['E','F','G','H','I','J','K','L','M'].forEach(col => {
          const cell = row.getCell(col);
          if (typeof cell.value === 'number') cell.numFmt = '"$"#,##0.00';
        });
        ['N','O'].forEach(col => {
          const cell = row.getCell(col);
          if (typeof cell.value === 'number') cell.numFmt = '#,##0.00"%"';
        });
      }

      if (salesRaw.length === 0) {
        ws2.addRow({ fecha: 'Sin ventas en este período' });
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=financial-report-${range}.xlsx`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ─── PDF (HTML imprimible) ────────────────────────────────────────────────
    if (format === 'pdf') {
      const pct = (n: number) => totalRevenue > 0 ? `${(n / totalRevenue * 100).toFixed(1)}%` : '0%';
      const usd = (n: number) => `$${n.toFixed(2)}`;

      const saleTRs = salesRaw.map(s => {
        const sp = toNumber(s.salePrice);
        const sc = toNumber(s.aliexpressCost);
        const tc = sc
          + toNumber(s.marketplaceFee || 0)
          + toNumber((s as any).product?.shippingCost ?? 0)
          + toNumber((s as any).product?.importTax ?? 0)
          + toNumber(s.commissionAmount || 0);
        const gp = sp - tc;
        const mg = sp > 0 ? (gp / sp * 100).toFixed(1) : '0';
        const color = gp >= 0 ? '#16a34a' : '#dc2626';
        return `<tr>
          <td>${new Date(s.createdAt).toLocaleDateString('es-CL')}</td>
          <td style="font-size:9px;max-width:120px;overflow:hidden">${s.orderId.slice(0, 28)}</td>
          <td style="max-width:160px">${((s.product as any)?.title || '').slice(0, 38)}</td>
          <td>${s.marketplace}</td>
          <td>${usd(sp)}</td>
          <td>${usd(sc)}</td>
          <td>${usd(tc)}</td>
          <td style="color:${color};font-weight:600">${usd(gp)}</td>
          <td style="color:${color}">${mg}%</td>
          <td>${s.payoutExecuted ? '✓' : '—'}</td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte Financiero ${periodStr}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1e293b;padding:28px}
h1{font-size:22px;font-weight:700;color:#0f172a;margin-bottom:2px}
.sub{color:#64748b;font-size:11px;margin-bottom:20px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px}
.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px}
.kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:3px}
.kpi-value{font-size:18px;font-weight:700;color:#0f172a}
.green{color:#16a34a}.red{color:#dc2626}
h2{font-size:12px;font-weight:700;color:#0f172a;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid #e2e8f0}
table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:20px}
th{background:#1e293b;color:#f1f5f9;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:6px 8px;text-align:left}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#334155}
tr:nth-child(even) td{background:#f8fafc}
.cost-row td{background:#fff7ed!important}
.total-row td{font-weight:700;background:#f1f5f9!important;border-top:2px solid #cbd5e1}
.footer{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
@media print{
  body{padding:0}
  @page{margin:1.5cm;size:A4 landscape}
  table{page-break-inside:auto}
  tr{page-break-inside:avoid}
  .no-print{display:none}
}
</style>
</head>
<body>
<div class="no-print" style="background:#fef3c7;border:1px solid #f59e0b;padding:8px 14px;border-radius:6px;margin-bottom:16px;font-size:11px;color:#92400e">
  Para guardar como PDF: <strong>Archivo → Imprimir → Guardar como PDF</strong> (o Ctrl+P)
</div>
<h1>Reporte Financiero — Ivan Reseller</h1>
<p class="sub">Período: ${periodStr} &nbsp;·&nbsp; Generado: ${now.toLocaleString('es-CL')} &nbsp;·&nbsp; Entorno: ${environment}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-label">Ingresos Totales</div><div class="kpi-value">${usd(totalRevenue)}</div></div>
  <div class="kpi"><div class="kpi-label">Total Costos</div><div class="kpi-value">${usd(totalCosts)}</div></div>
  <div class="kpi"><div class="kpi-label">Ganancia Neta</div><div class="kpi-value ${netProfit >= 0 ? 'green' : 'red'}">${usd(netProfit)}</div></div>
  <div class="kpi"><div class="kpi-label">Margen Neto</div><div class="kpi-value ${netMargin >= 0 ? 'green' : 'red'}">${netMargin.toFixed(1)}%</div></div>
</div>

<h2>Desglose de P&amp;L</h2>
<table>
  <tr><th>Concepto</th><th>Monto (USD)</th><th>% del Ingreso</th></tr>
  <tr><td>Ingresos por ventas</td><td><strong>${usd(totalRevenue)}</strong></td><td>100%</td></tr>
  <tr class="cost-row"><td>&nbsp;&nbsp;— Costo proveedor (AliExpress)</td><td>${usd(totalSupplierCost)}</td><td>${pct(totalSupplierCost)}</td></tr>
  <tr class="cost-row"><td>&nbsp;&nbsp;— Fee marketplace</td><td>${usd(totalMPFees)}</td><td>${pct(totalMPFees)}</td></tr>
  <tr class="cost-row"><td>&nbsp;&nbsp;— Envío / Flete</td><td>${usd(totalShipping)}</td><td>${pct(totalShipping)}</td></tr>
  <tr class="cost-row"><td>&nbsp;&nbsp;— Impuesto importación</td><td>${usd(totalImportTax)}</td><td>${pct(totalImportTax)}</td></tr>
  <tr class="cost-row"><td>&nbsp;&nbsp;— Comisiones plataforma</td><td>${usd(totalCommissions)}</td><td>${pct(totalCommissions)}</td></tr>
  <tr class="total-row"><td>Ganancia Bruta</td><td>${usd(grossProfit)}</td><td>${grossMargin.toFixed(1)}%</td></tr>
  <tr class="total-row"><td>Ganancia Neta (después comisiones)</td><td>${usd(netProfit)}</td><td>${netMargin.toFixed(1)}%</td></tr>
</table>

${salesRaw.length > 0 ? `
<h2>Detalle de Ventas (${salesRaw.length})</h2>
<table>
  <tr><th>Fecha</th><th>Orden</th><th>Producto</th><th>Marketplace</th><th>Venta</th><th>Costo</th><th>Total Costos</th><th>G. Bruta</th><th>Margen</th><th>Payout</th></tr>
  ${saleTRs}
</table>
` : '<p style="color:#94a3b8;padding:12px 0">Sin ventas en este período.</p>'}

<div class="footer">Ivan Reseller &nbsp;·&nbsp; Reporte generado automáticamente &nbsp;·&nbsp; Solo datos reales (excluye simulaciones)</div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename=financial-report-${range}.html`);
      return res.send(html);
    }
  } catch (error) {
    next(error);
  }
});

export default router;

