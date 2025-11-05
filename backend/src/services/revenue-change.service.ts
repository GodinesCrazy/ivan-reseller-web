import { prisma } from '../config/database';
import { logger } from '../config/logger';

/**
 * Revenue Change Service
 * Calcula cambios de ingresos/ganancias comparando con período anterior
 */
export class RevenueChangeService {
  /**
   * Calcular cambios de ingresos y ganancias
   */
  async calculateRevenueChanges(
    userId?: number,
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' = 'monthly'
  ): Promise<{
    period: string;
    current: {
      revenue: number;
      profit: number;
      sales: number;
      commissions: number;
      averageOrderValue: number;
    };
    previous: {
      revenue: number;
      profit: number;
      sales: number;
      commissions: number;
      averageOrderValue: number;
    };
    changes: {
      revenue: { value: number; percent: number; trend: 'up' | 'down' | 'stable' };
      profit: { value: number; percent: number; trend: 'up' | 'down' | 'stable' };
      sales: { value: number; percent: number; trend: 'up' | 'down' | 'stable' };
      commissions: { value: number; percent: number; trend: 'up' | 'down' | 'stable' };
      averageOrderValue: { value: number; percent: number; trend: 'up' | 'down' | 'stable' };
    };
    growthRate: number;
    insights: Array<{
      type: 'success' | 'warning' | 'info';
      message: string;
    }>;
  }> {
    try {
      const { currentStart, currentEnd, previousStart, previousEnd } = this.getPeriodDates(period);

      // Período actual
      const currentSales = await prisma.sale.findMany({
        where: {
          ...(userId && { userId }),
          createdAt: {
            gte: currentStart,
            lte: currentEnd
          }
        }
      });

      const current = {
        revenue: currentSales.reduce((sum, s) => sum + s.salePrice, 0),
        profit: currentSales.reduce((sum, s) => sum + (s.netProfit || s.grossProfit || 0), 0),
        sales: currentSales.length,
        commissions: currentSales.reduce((sum, s) => sum + (s.commissionAmount || 0), 0),
        averageOrderValue: currentSales.length > 0
          ? currentSales.reduce((sum, s) => sum + s.salePrice, 0) / currentSales.length
          : 0
      };

      // Período anterior
      const previousSales = await prisma.sale.findMany({
        where: {
          ...(userId && { userId }),
          createdAt: {
            gte: previousStart,
            lte: previousEnd
          }
        }
      });

      const previous = {
        revenue: previousSales.reduce((sum, s) => sum + s.salePrice, 0),
        profit: previousSales.reduce((sum, s) => sum + (s.netProfit || s.grossProfit || 0), 0),
        sales: previousSales.length,
        commissions: previousSales.reduce((sum, s) => sum + (s.commissionAmount || 0), 0),
        averageOrderValue: previousSales.length > 0
          ? previousSales.reduce((sum, s) => sum + s.salePrice, 0) / previousSales.length
          : 0
      };

      // Calcular cambios
      const calculateChange = (current: number, previous: number) => {
        const value = current - previous;
        const percent = previous > 0 ? (value / previous) * 100 : 0;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (percent > 5) trend = 'up';
        else if (percent < -5) trend = 'down';

        return {
          value: Math.round(value * 100) / 100,
          percent: Math.round(percent * 100) / 100,
          trend
        };
      };

      const changes = {
        revenue: calculateChange(current.revenue, previous.revenue),
        profit: calculateChange(current.profit, previous.profit),
        sales: calculateChange(current.sales, previous.sales),
        commissions: calculateChange(current.commissions, previous.commissions),
        averageOrderValue: calculateChange(current.averageOrderValue, previous.averageOrderValue)
      };

      // Calcular tasa de crecimiento (CAGR simplificado)
      const growthRate = previous.revenue > 0
        ? ((current.revenue / previous.revenue) - 1) * 100
        : 0;

      // Generar insights
      const insights: Array<{
        type: 'success' | 'warning' | 'info';
        message: string;
      }> = [];

      if (changes.revenue.trend === 'up' && changes.revenue.percent > 20) {
        insights.push({
          type: 'success',
          message: `🎉 Ingresos aumentaron ${changes.revenue.percent}% vs período anterior`
        });
      } else if (changes.revenue.trend === 'down' && changes.revenue.percent < -20) {
        insights.push({
          type: 'warning',
          message: `⚠️ Ingresos disminuyeron ${Math.abs(changes.revenue.percent)}% vs período anterior`
        });
      }

      if (changes.profit.percent > changes.revenue.percent && changes.revenue.percent > 0) {
        insights.push({
          type: 'success',
          message: `✅ Ganancias crecieron más rápido que ingresos (${changes.profit.percent}% vs ${changes.revenue.percent}%)`
        });
      } else if (changes.profit.percent < changes.revenue.percent && changes.revenue.percent > 0) {
        insights.push({
          type: 'warning',
          message: `⚠️ Ganancias crecieron menos que ingresos. Revisa costos y márgenes.`
        });
      }

      if (changes.sales.trend === 'up' && changes.averageOrderValue.trend === 'up') {
        insights.push({
          type: 'success',
          message: `📈 Aumento en volumen de ventas y valor promedio de orden`
        });
      }

      if (changes.commissions.percent > 0) {
        insights.push({
          type: 'info',
          message: `💰 Comisiones aumentaron ${changes.commissions.percent}% (más usuarios activos)`
        });
      }

      if (insights.length === 0) {
        insights.push({
          type: 'info',
          message: '📊 Métricas relativamente estables comparado con período anterior'
        });
      }

      return {
        period,
        current: {
          revenue: Math.round(current.revenue * 100) / 100,
          profit: Math.round(current.profit * 100) / 100,
          sales: current.sales,
          commissions: Math.round(current.commissions * 100) / 100,
          averageOrderValue: Math.round(current.averageOrderValue * 100) / 100
        },
        previous: {
          revenue: Math.round(previous.revenue * 100) / 100,
          profit: Math.round(previous.profit * 100) / 100,
          sales: previous.sales,
          commissions: Math.round(previous.commissions * 100) / 100,
          averageOrderValue: Math.round(previous.averageOrderValue * 100) / 100
        },
        changes,
        growthRate: Math.round(growthRate * 100) / 100,
        insights
      };
    } catch (error) {
      logger.error('Revenue Change: Error calculating changes', { error, userId, period });
      throw error;
    }
  }

  /**
   * Obtener fechas de períodos
   */
  private getPeriodDates(period: string): {
    currentStart: Date;
    currentEnd: Date;
    previousStart: Date;
    previousEnd: Date;
  } {
    const now = new Date();
    let currentStart: Date;
    let currentEnd: Date = new Date(now);
    currentEnd.setHours(23, 59, 59, 999);

    let previousEnd: Date;
    let previousStart: Date;

    switch (period) {
      case 'daily':
        currentStart = new Date(now);
        currentStart.setHours(0, 0, 0, 0);
        previousEnd = new Date(currentStart);
        previousEnd.setMilliseconds(-1);
        previousStart = new Date(previousEnd);
        previousStart.setHours(0, 0, 0, 0);
        break;

      case 'weekly':
        const dayOfWeek = now.getDay();
        currentStart = new Date(now);
        currentStart.setDate(now.getDate() - dayOfWeek);
        currentStart.setHours(0, 0, 0, 0);
        previousEnd = new Date(currentStart);
        previousEnd.setMilliseconds(-1);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 6);
        previousStart.setHours(0, 0, 0, 0);
        break;

      case 'monthly':
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentStart.setHours(0, 0, 0, 0);
        previousEnd = new Date(currentStart);
        previousEnd.setMilliseconds(-1);
        previousStart = new Date(previousEnd.getFullYear(), previousEnd.getMonth(), 1);
        previousStart.setHours(0, 0, 0, 0);
        break;

      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        currentStart = new Date(now.getFullYear(), quarter * 3, 1);
        currentStart.setHours(0, 0, 0, 0);
        previousEnd = new Date(currentStart);
        previousEnd.setMilliseconds(-1);
        const prevQuarter = quarter === 0 ? 3 : quarter - 1;
        const prevYear = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
        previousStart = new Date(prevYear, prevQuarter * 3, 1);
        previousStart.setHours(0, 0, 0, 0);
        break;

      case 'yearly':
        currentStart = new Date(now.getFullYear(), 0, 1);
        currentStart.setHours(0, 0, 0, 0);
        previousEnd = new Date(currentStart);
        previousEnd.setMilliseconds(-1);
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        previousStart.setHours(0, 0, 0, 0);
        break;

      default:
        // Default to monthly
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentStart.setHours(0, 0, 0, 0);
        previousEnd = new Date(currentStart);
        previousEnd.setMilliseconds(-1);
        previousStart = new Date(previousEnd.getFullYear(), previousEnd.getMonth(), 1);
        previousStart.setHours(0, 0, 0, 0);
    }

    return {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd
    };
  }

  /**
   * Obtener cambios para múltiples períodos
   */
  async getMultiPeriodComparison(
    userId?: number,
    periods: number = 6
  ): Promise<Array<{
    period: string;
    revenue: number;
    profit: number;
    sales: number;
    changeFromPrevious: {
      revenue: number;
      profit: number;
      sales: number;
    };
  }>> {
    try {
      const now = new Date();
      const results: Array<{
        period: string;
        revenue: number;
        profit: number;
        sales: number;
        changeFromPrevious: {
          revenue: number;
          profit: number;
          sales: number;
        };
      }> = [];

      for (let i = 0; i < periods; i++) {
        const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        periodStart.setHours(0, 0, 0, 0);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        periodEnd.setHours(23, 59, 59, 999);

        const sales = await prisma.sale.findMany({
          where: {
            ...(userId && { userId }),
            createdAt: {
              gte: periodStart,
              lte: periodEnd
            }
          }
        });

        const revenue = sales.reduce((sum, s) => sum + s.salePrice, 0);
        const profit = sales.reduce((sum, s) => sum + (s.netProfit || s.grossProfit || 0), 0);

        const previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
        previousPeriodStart.setHours(0, 0, 0, 0);
        const previousPeriodEnd = new Date(now.getFullYear(), now.getMonth() - i, 0);
        previousPeriodEnd.setHours(23, 59, 59, 999);

        const previousSales = await prisma.sale.findMany({
          where: {
            ...(userId && { userId }),
            createdAt: {
              gte: previousPeriodStart,
              lte: previousPeriodEnd
            }
          }
        });

        const previousRevenue = previousSales.reduce((sum, s) => sum + s.salePrice, 0);
        const previousProfit = previousSales.reduce((sum, s) => sum + (s.netProfit || s.grossProfit || 0), 0);

        results.push({
          period: `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`,
          revenue: Math.round(revenue * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          sales: sales.length,
          changeFromPrevious: {
            revenue: Math.round((revenue - previousRevenue) * 100) / 100,
            profit: Math.round((profit - previousProfit) * 100) / 100,
            sales: sales.length - previousSales.length
          }
        });
      }

      return results.reverse(); // Ordenar del más antiguo al más reciente
    } catch (error) {
      logger.error('Revenue Change: Error in multi-period comparison', { error, userId });
      throw error;
    }
  }
}

export const revenueChangeService = new RevenueChangeService();

