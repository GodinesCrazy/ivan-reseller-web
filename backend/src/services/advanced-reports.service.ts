import { trace } from '../utils/boot-trace';
trace('loading advanced-reports.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

/**
 * Advanced Reports Service
 * Analytics avanzado, análisis de tendencias, exportación mejorada
 */
export class AdvancedReportsService {
  /**
   * Análisis de tendencias temporales
   */
  async analyzeTrends(
    userId?: number,
    startDate?: Date,
    endDate?: Date,
    metric: 'sales' | 'revenue' | 'profit' | 'users' = 'sales'
  ): Promise<{
    trends: Array<{
      period: string; // YYYY-MM-DD
      value: number;
      change: number; // % cambio vs período anterior
      trend: 'up' | 'down' | 'stable';
    }>;
    overallTrend: 'up' | 'down' | 'stable';
    averageGrowth: number;
    peakPeriod: {
      period: string;
      value: number;
    };
    lowestPeriod: {
      period: string;
      value: number;
    };
  }> {
    try {
      const end = endDate || new Date();
      const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 días por defecto

      const trends: Array<{
        period: string;
        value: number;
        change: number;
        trend: 'up' | 'down' | 'stable';
      }> = [];

      // Agrupar por día
      const currentDate = new Date(start);
      let previousValue = 0;

      while (currentDate <= end) {
        const periodStart = new Date(currentDate);
        periodStart.setHours(0, 0, 0, 0);
        const periodEnd = new Date(currentDate);
        periodEnd.setHours(23, 59, 59, 999);

        let value = 0;

        switch (metric) {
          case 'sales':
            value = await prisma.sale.count({
              where: {
                ...(userId && { userId }),
                createdAt: {
                  gte: periodStart,
                  lte: periodEnd
                }
              }
            });
            break;
          case 'revenue':
            const revenueSales = await prisma.sale.findMany({
              where: {
                ...(userId && { userId }),
                createdAt: {
                  gte: periodStart,
                  lte: periodEnd
                }
              },
              select: {
                salePrice: true
              }
            });
            value = revenueSales.reduce((sum, s) => sum + toNumber(s.salePrice), 0);
            break;
          case 'profit':
            const profitSales = await prisma.sale.findMany({
              where: {
                ...(userId && { userId }),
                createdAt: {
                  gte: periodStart,
                  lte: periodEnd
                }
              },
              select: {
                netProfit: true,
                grossProfit: true
              }
            });
            value = profitSales.reduce((sum, s) => sum + toNumber(s.netProfit || s.grossProfit || 0), 0);
            break;
          case 'users':
            value = await prisma.user.count({
              where: {
                role: 'USER',
                createdAt: {
                  gte: periodStart,
                  lte: periodEnd
                }
              }
            });
            break;
        }

        const change = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (change > 5) trend = 'up';
        else if (change < -5) trend = 'down';

        trends.push({
          period: currentDate.toISOString().split('T')[0],
          value: Math.round(value * 100) / 100,
          change: Math.round(change * 100) / 100,
          trend
        });

        previousValue = value;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Calcular tendencia general
      const firstHalf = trends.slice(0, Math.floor(trends.length / 2));
      const secondHalf = trends.slice(Math.floor(trends.length / 2));

      const firstAvg = firstHalf.reduce((sum, t) => sum + t.value, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, t) => sum + t.value, 0) / secondHalf.length;

      const overallChange = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
      const overallTrend: 'up' | 'down' | 'stable' = overallChange > 5 ? 'up' : overallChange < -5 ? 'down' : 'stable';

      // Encontrar pico y mínimo
      const peakPeriod = trends.reduce((max, t) => t.value > max.value ? t : max, trends[0]);
      const lowestPeriod = trends.reduce((min, t) => t.value < min.value ? t : min, trends[0]);

      return {
        trends,
        overallTrend,
        averageGrowth: Math.round(overallChange * 100) / 100,
        peakPeriod: {
          period: peakPeriod.period,
          value: peakPeriod.value
        },
        lowestPeriod: {
          period: lowestPeriod.period,
          value: lowestPeriod.value
        }
      };
    } catch (error) {
      logger.error('Advanced Reports: Error analyzing trends', { error, userId, metric });
      throw error;
    }
  }

  /**
   * Comparar período actual con período anterior
   */
  async comparePeriods(
    currentStart: Date,
    currentEnd: Date,
    previousStart: Date,
    previousEnd: Date,
    userId?: number
  ): Promise<{
    current: {
      sales: number;
      revenue: number;
      profit: number;
      commissions: number;
      averageOrderValue: number;
      activeUsers: number;
    };
    previous: {
      sales: number;
      revenue: number;
      profit: number;
      commissions: number;
      averageOrderValue: number;
      activeUsers: number;
    };
    changes: {
      sales: { value: number; percent: number };
      revenue: { value: number; percent: number };
      profit: { value: number; percent: number };
      commissions: { value: number; percent: number };
      averageOrderValue: { value: number; percent: number };
      activeUsers: { value: number; percent: number };
    };
    insights: string[];
  }> {
    try {
      // Período actual
      const currentSales = await prisma.sale.findMany({
        where: {
          ...(userId && { userId }),
          createdAt: {
            gte: currentStart,
            lte: currentEnd
          }
        },
        include: {
          user: {
            select: {
              id: true
            }
          }
        }
      });

      const current = {
        sales: currentSales.length,
        revenue: currentSales.reduce((sum, s) => sum + toNumber(s.salePrice), 0),
        profit: currentSales.reduce((sum, s) => sum + toNumber(s.netProfit || s.grossProfit || 0), 0),
        commissions: currentSales.reduce((sum, s) => sum + toNumber(s.commissionAmount || 0), 0),
        averageOrderValue: currentSales.length > 0
          ? currentSales.reduce((sum, s) => sum + toNumber(s.salePrice), 0) / currentSales.length
          : 0,
        activeUsers: new Set(currentSales.map(s => s.userId)).size
      };

      // Período anterior
      const previousSales = await prisma.sale.findMany({
        where: {
          ...(userId && { userId }),
          createdAt: {
            gte: previousStart,
            lte: previousEnd
          }
        },
        include: {
          user: {
            select: {
              id: true
            }
          }
        }
      });

      const previous = {
        sales: previousSales.length,
        revenue: previousSales.reduce((sum, s) => sum + toNumber(s.salePrice), 0),
        profit: previousSales.reduce((sum, s) => sum + toNumber(s.netProfit || s.grossProfit || 0), 0),
        commissions: previousSales.reduce((sum, s) => sum + toNumber(s.commissionAmount || 0), 0),
        averageOrderValue: previousSales.length > 0
          ? previousSales.reduce((sum, s) => sum + toNumber(s.salePrice), 0) / previousSales.length
          : 0,
        activeUsers: new Set(previousSales.map(s => s.userId)).size
      };

      // Calcular cambios
      const calculateChange = (current: number, previous: number) => ({
        value: Math.round((current - previous) * 100) / 100,
        percent: previous > 0 ? Math.round(((current - previous) / previous) * 100 * 100) / 100 : 0
      });

      const changes = {
        sales: calculateChange(current.sales, previous.sales),
        revenue: calculateChange(current.revenue, previous.revenue),
        profit: calculateChange(current.profit, previous.profit),
        commissions: calculateChange(current.commissions, previous.commissions),
        averageOrderValue: calculateChange(current.averageOrderValue, previous.averageOrderValue),
        activeUsers: calculateChange(current.activeUsers, previous.activeUsers)
      };

      // Generar insights
      const insights: string[] = [];

      if (changes.sales.percent > 20) {
        insights.push(`📈 Ventas aumentaron ${changes.sales.percent}% vs período anterior`);
      } else if (changes.sales.percent < -20) {
        insights.push(`📉 Ventas disminuyeron ${Math.abs(changes.sales.percent)}% vs período anterior`);
      }

      if (changes.revenue.percent > 15 && changes.profit.percent < changes.revenue.percent) {
        insights.push(`💰 Ingresos aumentaron pero márgenes se redujeron`);
      }

      if (changes.activeUsers.percent > 10) {
        insights.push(`👥 Usuarios activos aumentaron ${changes.activeUsers.percent}%`);
      }

      if (changes.averageOrderValue.percent > 10) {
        insights.push(`🛒 Valor promedio de orden aumentó ${changes.averageOrderValue.percent}%`);
      }

      if (insights.length === 0) {
        insights.push('📊 Métricas relativamente estables comparado con período anterior');
      }

      return {
        current: {
          sales: Math.round(current.sales * 100) / 100,
          revenue: Math.round(current.revenue * 100) / 100,
          profit: Math.round(current.profit * 100) / 100,
          commissions: Math.round(current.commissions * 100) / 100,
          averageOrderValue: Math.round(current.averageOrderValue * 100) / 100,
          activeUsers: Math.round(current.activeUsers * 100) / 100
        },
        previous: {
          sales: Math.round(previous.sales * 100) / 100,
          revenue: Math.round(previous.revenue * 100) / 100,
          profit: Math.round(previous.profit * 100) / 100,
          commissions: Math.round(previous.commissions * 100) / 100,
          averageOrderValue: Math.round(previous.averageOrderValue * 100) / 100,
          activeUsers: Math.round(previous.activeUsers * 100) / 100
        },
        changes,
        insights
      };
    } catch (error) {
      logger.error('Advanced Reports: Error comparing periods', { error, userId });
      throw error;
    }
  }

  /**
   * Análisis predictivo basado en datos históricos
   */
  async predictiveAnalysis(
    userId?: number,
    forecastDays: number = 30
  ): Promise<{
    forecast: Array<{
      date: string;
      predictedSales: number;
      predictedRevenue: number;
      confidence: number;
    }>;
    recommendations: Array<{
      type: 'opportunity' | 'warning' | 'info';
      title: string;
      description: string;
      priority: 'low' | 'medium' | 'high';
    }>;
  }> {
    try {
      // Obtener datos históricos (últimos 90 días)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

      const historicalSales = await prisma.sale.findMany({
        where: {
          ...(userId && { userId }),
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Calcular tendencia
      const dailySales = new Map<string, number>();
      const dailyRevenue = new Map<string, number>();

      for (const sale of historicalSales) {
        const date = sale.createdAt.toISOString().split('T')[0];
        dailySales.set(date, (dailySales.get(date) || 0) + 1);
        dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + toNumber(sale.salePrice));
      }

      const salesArray = Array.from(dailySales.values());
      const revenueArray = Array.from(dailyRevenue.values());

      const avgDailySales = salesArray.length > 0
        ? salesArray.reduce((a, b) => a + b, 0) / salesArray.length
        : 0;
      const avgDailyRevenue = revenueArray.length > 0
        ? revenueArray.reduce((a, b) => a + b, 0) / revenueArray.length
        : 0;

      // Calcular tendencia (simple regresión lineal)
      let salesTrend = 0;
      if (salesArray.length > 1) {
        const firstHalf = salesArray.slice(0, Math.floor(salesArray.length / 2));
        const secondHalf = salesArray.slice(Math.floor(salesArray.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        salesTrend = (secondAvg - firstAvg) / firstHalf.length;
      }

      // Generar forecast
      const forecast: Array<{
        date: string;
        predictedSales: number;
        predictedRevenue: number;
        confidence: number;
      }> = [];

      const today = new Date();
      for (let i = 1; i <= forecastDays; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(forecastDate.getDate() + i);

        const predictedSales = Math.max(0, avgDailySales + (salesTrend * i));
        const predictedRevenue = predictedSales * avgDailyRevenue / (avgDailySales || 1);
        
        // Confidence disminuye con el tiempo
        const confidence = Math.max(30, 90 - (i * 2));

        forecast.push({
          date: forecastDate.toISOString().split('T')[0],
          predictedSales: Math.round(predictedSales * 100) / 100,
          predictedRevenue: Math.round(predictedRevenue * 100) / 100,
          confidence: Math.round(confidence * 100) / 100
        });
      }

      // Generar recomendaciones
      const recommendations: Array<{
        type: 'opportunity' | 'warning' | 'info';
        title: string;
        description: string;
        priority: 'low' | 'medium' | 'high';
      }> = [];

      if (salesTrend > 0.1) {
        recommendations.push({
          type: 'opportunity',
          title: 'Tendencia Positiva Detectada',
          description: `Las ventas están aumentando. Considera aumentar tu inventario o publicar más productos.`,
          priority: 'high'
        });
      } else if (salesTrend < -0.1) {
        recommendations.push({
          type: 'warning',
          title: 'Tendencia Negativa Detectada',
          description: `Las ventas están disminuyendo. Revisa tus productos y precios para mejorar el rendimiento.`,
          priority: 'high'
        });
      }

      if (avgDailySales < 1) {
        recommendations.push({
          type: 'warning',
          title: 'Bajo Volumen de Ventas',
          description: `El promedio diario de ventas es bajo. Considera optimizar tus productos o buscar nuevas oportunidades.`,
          priority: 'medium'
        });
      }

      if (forecast.reduce((sum, f) => sum + f.predictedRevenue, 0) > avgDailyRevenue * forecastDays * 1.2) {
        recommendations.push({
          type: 'opportunity',
          title: 'Crecimiento Esperado',
          description: `El forecast predice un crecimiento del 20%+. Prepárate para aumentar capacidad.`,
          priority: 'medium'
        });
      }

      return {
        forecast,
        recommendations
      };
    } catch (error) {
      logger.error('Advanced Reports: Error in predictive analysis', { error, userId });
      throw error;
    }
  }

  /**
   * Exportar reporte avanzado a múltiples formatos
   */
  async exportAdvancedReport(
    reportType: 'trends' | 'comparison' | 'forecast',
    data: any,
    format: 'json' | 'csv' | 'excel' = 'json'
  ): Promise<Buffer | string> {
    try {
      switch (format) {
        case 'csv':
          return this.exportToCSV(data, reportType);
        case 'excel':
          return await this.exportToExcelAdvanced(data, reportType);
        case 'json':
        default:
          return JSON.stringify(data, null, 2);
      }
    } catch (error) {
      logger.error('Advanced Reports: Error exporting report', { error, reportType, format });
      throw error;
    }
  }

  /**
   * Exportar a CSV
   */
  private exportToCSV(data: any, reportType: string): string {
    let csv = '';

    if (reportType === 'trends' && data.trends) {
      csv = 'Period,Value,Change,Trend\n';
      for (const trend of data.trends) {
        csv += `${trend.period},${trend.value},${trend.change},${trend.trend}\n`;
      }
    } else if (reportType === 'comparison') {
      csv = 'Metric,Current,Previous,Change,Percent Change\n';
      csv += `Sales,${data.current.sales},${data.previous.sales},${data.changes.sales.value},${data.changes.sales.percent}%\n`;
      csv += `Revenue,${data.current.revenue},${data.previous.revenue},${data.changes.revenue.value},${data.changes.revenue.percent}%\n`;
      csv += `Profit,${data.current.profit},${data.previous.profit},${data.changes.profit.value},${data.changes.profit.percent}%\n`;
    } else if (reportType === 'forecast' && data.forecast) {
      csv = 'Date,Predicted Sales,Predicted Revenue,Confidence\n';
      for (const item of data.forecast) {
        csv += `${item.date},${item.predictedSales},${item.predictedRevenue},${item.confidence}%\n`;
      }
    }

    return csv;
  }

  /**
   * Exportar a Excel (simplificado)
   */
  private async exportToExcelAdvanced(data: any, reportType: string): Promise<Buffer> {
    // En producción, usar librería como xlsx o exceljs
    // Por ahora, retornar CSV como Excel
    const csv = this.exportToCSV(data, reportType);
    return Buffer.from(csv, 'utf-8');
  }
}

export const advancedReportsService = new AdvancedReportsService();

