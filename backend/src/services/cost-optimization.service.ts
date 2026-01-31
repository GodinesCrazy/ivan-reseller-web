import { trace } from '../utils/boot-trace';
trace('loading cost-optimization.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

/**
 * Cost Optimization Service
 * Monitoreo de costos por usuario, alertas de costo, optimización
 */
export class CostOptimizationService {
  /**
   * Calcular costos por usuario
   */
  async calculateUserCosts(userId: number, period: 'daily' | 'weekly' | 'monthly' = 'monthly'): Promise<{
    userId: number;
    period: string;
    infrastructureCosts: number;
    apiCosts: number;
    storageCosts: number;
    totalCosts: number;
    revenue: number;
    profitMargin: number;
    costPerSale: number;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          sales: {
            where: {
              createdAt: {
                gte: this.getPeriodStart(period)
              }
            }
          }
        }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Costos estimados (en producción, estos deberían venir de servicios de monitoreo)
      const infrastructureCosts = this.estimateInfrastructureCosts(userId, period);
      const apiCosts = this.estimateApiCosts(userId, period);
      const storageCosts = this.estimateStorageCosts(userId, period);

      const totalCosts = infrastructureCosts + apiCosts + storageCosts;

      // Ingresos del usuario (comisiones del admin)
      // ✅ FIX: Convert Decimal to number for arithmetic operations
      const revenue = user.sales.reduce((sum, sale) => sum + toNumber(sale.commissionAmount || 0), 0);

      // Calcular métricas
      const profitMargin = revenue > 0 ? ((revenue - totalCosts) / revenue) * 100 : 0;
      const costPerSale = user.sales.length > 0 ? totalCosts / user.sales.length : 0;

      return {
        userId,
        period,
        infrastructureCosts: Math.round(infrastructureCosts * 100) / 100,
        apiCosts: Math.round(apiCosts * 100) / 100,
        storageCosts: Math.round(storageCosts * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100,
        costPerSale: Math.round(costPerSale * 100) / 100
      };
    } catch (error) {
      logger.error('Cost Optimization: Error calculating user costs', { error, userId, period });
      throw error;
    }
  }

  /**
   * Estimar costos de infraestructura por usuario
   */
  private estimateInfrastructureCosts(userId: number, period: string): number {
    // Costos base estimados por usuario
    // En producción, esto debería venir de AWS CloudWatch, Azure Monitor, etc.
    const baseCostPerMonth = 0.50; // $0.50 USD por usuario al mes
    
    const multipliers: Record<string, number> = {
      daily: 1 / 30,
      weekly: 7 / 30,
      monthly: 1
    };

    return baseCostPerMonth * (multipliers[period] || 1);
  }

  /**
   * Estimar costos de APIs por usuario
   */
  private estimateApiCosts(userId: number, period: string): number {
    // Costos estimados de APIs externas (Groq, scraping, etc.)
    const baseCostPerMonth = 0.20; // $0.20 USD por usuario al mes
    
    const multipliers: Record<string, number> = {
      daily: 1 / 30,
      weekly: 7 / 30,
      monthly: 1
    };

    return baseCostPerMonth * (multipliers[period] || 1);
  }

  /**
   * Estimar costos de almacenamiento por usuario
   */
  private estimateStorageCosts(userId: number, period: string): number {
    // Costos de almacenamiento (imágenes, datos)
    const baseCostPerMonth = 0.10; // $0.10 USD por usuario al mes
    
    const multipliers: Record<string, number> = {
      daily: 1 / 30,
      weekly: 7 / 30,
      monthly: 1
    };

    return baseCostPerMonth * (multipliers[period] || 1);
  }

  /**
   * Obtener fecha de inicio del período
   */
  private getPeriodStart(period: string): Date {
    const now = new Date();
    const start = new Date();

    switch (period) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        start.setDate(now.getDate() - 7);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }

    return start;
  }

  /**
   * Calcular costos totales del sistema
   */
  async calculateTotalCosts(period: 'daily' | 'weekly' | 'monthly' = 'monthly'): Promise<{
    period: string;
    totalInfrastructure: number;
    totalApi: number;
    totalStorage: number;
    totalCosts: number;
    totalRevenue: number;
    netProfit: number;
    costRatio: number; // Costos como % de ingresos
    users: number;
    averageCostPerUser: number;
  }> {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        }
      });

      let totalInfrastructure = 0;
      let totalApi = 0;
      let totalStorage = 0;
      let totalRevenue = 0;

      for (const user of users) {
        const costs = await this.calculateUserCosts(user.id, period);
        totalInfrastructure += costs.infrastructureCosts;
        totalApi += costs.apiCosts;
        totalStorage += costs.storageCosts;
        totalRevenue += costs.revenue;
      }

      const totalCosts = totalInfrastructure + totalApi + totalStorage;
      const netProfit = totalRevenue - totalCosts;
      const costRatio = totalRevenue > 0 ? (totalCosts / totalRevenue) * 100 : 0;
      const averageCostPerUser = users.length > 0 ? totalCosts / users.length : 0;

      return {
        period,
        totalInfrastructure: Math.round(totalInfrastructure * 100) / 100,
        totalApi: Math.round(totalApi * 100) / 100,
        totalStorage: Math.round(totalStorage * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        costRatio: Math.round(costRatio * 100) / 100,
        users: users.length,
        averageCostPerUser: Math.round(averageCostPerUser * 100) / 100
      };
    } catch (error) {
      logger.error('Cost Optimization: Error calculating total costs', { error, period });
      throw error;
    }
  }

  /**
   * Verificar si costos superan umbral y alertar
   */
  async checkCostAlerts(thresholdPercent: number = 30): Promise<{
    alerted: number;
    alerts: Array<{
      userId: number;
      username: string;
      costRatio: number;
      totalCosts: number;
      revenue: number;
    }>;
  }> {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        }
      });

      const alerts: Array<{
        userId: number;
        username: string;
        costRatio: number;
        totalCosts: number;
        revenue: number;
      }> = [];

      for (const user of users) {
        try {
          const costs = await this.calculateUserCosts(user.id, 'monthly');
          const costRatio = costs.revenue > 0 ? (costs.totalCosts / costs.revenue) * 100 : 0;

          if (costRatio > thresholdPercent) {
            alerts.push({
              userId: user.id,
              username: user.username,
              costRatio: Math.round(costRatio * 100) / 100,
              totalCosts: costs.totalCosts,
              revenue: costs.revenue
            });
          }
        } catch (error) {
          logger.warn('Cost Optimization: Error checking user costs', { userId: user.id, error });
        }
      }

      logger.info('Cost Optimization: Cost alerts checked', {
        thresholdPercent,
        alerted: alerts.length
      });

      return {
        alerted: alerts.length,
        alerts
      };
    } catch (error) {
      logger.error('Cost Optimization: Error checking cost alerts', { error });
      throw error;
    }
  }

  /**
   * Obtener recomendaciones de optimización
   */
  async getOptimizationRecommendations(userId?: number): Promise<Array<{
    type: 'infrastructure' | 'api' | 'storage' | 'general';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    estimatedSavings: number;
    implementationEffort: 'low' | 'medium' | 'high';
  }>> {
    try {
      const recommendations: Array<{
        type: 'infrastructure' | 'api' | 'storage' | 'general';
        priority: 'low' | 'medium' | 'high';
        title: string;
        description: string;
        estimatedSavings: number;
        implementationEffort: 'low' | 'medium' | 'high';
      }> = [];

      if (userId) {
        // Recomendaciones específicas para usuario
        const costs = await this.calculateUserCosts(userId, 'monthly');

        if (costs.apiCosts > costs.infrastructureCosts) {
          recommendations.push({
            type: 'api',
            priority: 'medium',
            title: 'Optimizar uso de APIs',
            description: 'Considera cachear resultados de APIs para reducir llamadas',
            estimatedSavings: costs.apiCosts * 0.3,
            implementationEffort: 'medium'
          });
        }
      } else {
        // Recomendaciones generales del sistema
        const totalCosts = await this.calculateTotalCosts('monthly');

        if (totalCosts.costRatio > 30) {
          recommendations.push({
            type: 'general',
            priority: 'high',
            title: 'Costos altos detectados',
            description: `Los costos representan ${totalCosts.costRatio.toFixed(1)}% de los ingresos. Considera optimizar infraestructura.`,
            estimatedSavings: totalCosts.totalCosts * 0.2,
            implementationEffort: 'high'
          });
        }

        recommendations.push({
          type: 'infrastructure',
          priority: 'medium',
          title: 'Migrar a serverless',
          description: 'Considera migrar funciones a AWS Lambda o Azure Functions para reducir costos fijos',
          estimatedSavings: totalCosts.totalInfrastructure * 0.4,
          implementationEffort: 'high'
        });

        recommendations.push({
          type: 'storage',
          priority: 'low',
          title: 'Optimizar almacenamiento',
          description: 'Implementa CDN y compresión de imágenes para reducir costos de almacenamiento',
          estimatedSavings: totalCosts.totalStorage * 0.5,
          implementationEffort: 'medium'
        });
      }

      return recommendations;
    } catch (error) {
      logger.error('Cost Optimization: Error getting recommendations', { error, userId });
      throw error;
    }
  }
}

export const costOptimizationService = new CostOptimizationService();

