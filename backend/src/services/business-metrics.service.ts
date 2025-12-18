import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

/**
 * Business Metrics Service
 * Calcula métricas clave de negocio: MRR, ARR, LTV, CAC, Churn Rate, etc.
 */
export class BusinessMetricsService {
  /**
   * Calcular MRR (Monthly Recurring Revenue)
   */
  async calculateMRR(): Promise<{
    mrr: number;
    breakdown: {
      fixedCosts: number;
      estimatedCommissions: number;
    };
  }> {
    try {
      const activeUsers = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        },
        select: {
          fixedMonthlyCost: true
        }
      });

      const fixedCosts = activeUsers.reduce((sum, user) => sum + toNumber(user.fixedMonthlyCost || 0), 0);

      // Estimar comisiones basadas en promedio histórico
      // Esto se puede mejorar con datos reales
      const estimatedCommissions = fixedCosts * 2; // Estimación conservadora

      const mrr = fixedCosts + estimatedCommissions;

      return {
        mrr,
        breakdown: {
          fixedCosts,
          estimatedCommissions
        }
      };
    } catch (error) {
      logger.error('Business Metrics: Error calculating MRR', { error });
      throw error;
    }
  }

  /**
   * Calcular ARR (Annual Recurring Revenue)
   */
  async calculateARR(): Promise<number> {
    try {
      const { mrr } = await this.calculateMRR();
      return mrr * 12;
    } catch (error) {
      logger.error('Business Metrics: Error calculating ARR', { error });
      throw error;
    }
  }

  /**
   * Calcular LTV (Lifetime Value) por usuario
   */
  async calculateLTV(userId?: number): Promise<{
    averageLTV: number;
    byUser?: Array<{
      userId: number;
      username: string;
      ltv: number;
      totalRevenue: number;
      monthsActive: number;
    }>;
  }> {
    try {
      if (userId) {
        // Calcular LTV para un usuario específico
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            createdAt: true,
            totalEarnings: true,
            fixedMonthlyCost: true
          }
        });

        if (!user) {
          throw new Error('Usuario no encontrado');
        }

        const monthsActive = Math.max(1, Math.floor(
          (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
        ));

        // LTV = (Ingresos promedio por mes) / Churn rate
        // Para simplificar: LTV = totalEarnings (ya incluye comisiones) + (fixedMonthlyCost * meses activo)
        const totalRevenue = toNumber(user.totalEarnings || 0) + (toNumber(user.fixedMonthlyCost || 0) * monthsActive);
        const ltv = totalRevenue;

        return {
          averageLTV: ltv,
          byUser: [{
            userId: user.id,
            username: user.username,
            ltv,
            totalRevenue,
            monthsActive
          }]
        };
      }

      // Calcular LTV promedio de todos los usuarios
      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        },
        select: {
          id: true,
          username: true,
          createdAt: true,
          totalEarnings: true,
          fixedMonthlyCost: true
        }
      });

      const ltvData = users.map(user => {
        const monthsActive = Math.max(1, Math.floor(
          (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
        ));
        const totalRevenue = toNumber(user.totalEarnings || 0) + (toNumber(user.fixedMonthlyCost || 0) * monthsActive);
        return {
          userId: user.id,
          username: user.username,
          ltv: totalRevenue,
          totalRevenue,
          monthsActive
        };
      });

      const averageLTV = ltvData.length > 0
        ? ltvData.reduce((sum, data) => sum + data.ltv, 0) / ltvData.length
        : 0;

      return {
        averageLTV,
        byUser: ltvData
      };
    } catch (error) {
      logger.error('Business Metrics: Error calculating LTV', { error });
      throw error;
    }
  }

  /**
   * Calcular Churn Rate
   */
  async calculateChurnRate(period: 'monthly' | 'annual' = 'monthly'): Promise<{
    churnRate: number;
    churnedUsers: number;
    totalUsers: number;
    period: string;
  }> {
    try {
      const now = new Date();
      const startDate = new Date();
      
      if (period === 'monthly') {
        startDate.setMonth(startDate.getMonth() - 1);
      } else {
        startDate.setFullYear(startDate.getFullYear() - 1);
      }

      // Usuarios que estaban activos al inicio del período
      const usersAtStart = await prisma.user.count({
        where: {
          role: 'USER',
          createdAt: {
            lte: startDate
          }
        }
      });

      // Usuarios que se desactivaron en el período
      const churnedUsers = await prisma.user.count({
        where: {
          role: 'USER',
          isActive: false,
          updatedAt: {
            gte: startDate,
            lte: now
          }
        }
      });

      const churnRate = usersAtStart > 0
        ? (churnedUsers / usersAtStart) * 100
        : 0;

      const totalUsers = await prisma.user.count({
        where: {
          role: 'USER'
        }
      });

      return {
        churnRate: Math.round(churnRate * 100) / 100,
        churnedUsers,
        totalUsers,
        period
      };
    } catch (error) {
      logger.error('Business Metrics: Error calculating churn rate', { error });
      throw error;
    }
  }

  /**
   * Calcular CAC (Customer Acquisition Cost)
   * Nota: Esto requiere tracking de costos de marketing
   */
  async calculateCAC(): Promise<{
    cac: number;
    note: string;
  }> {
    try {
      // Por ahora, asumimos CAC = 0 (sin marketing tracking)
      // En el futuro, esto debería calcularse como:
      // CAC = Total Marketing Costs / New Users Acquired

      return {
        cac: 0,
        note: 'CAC tracking no implementado. Se requiere tracking de costos de marketing.'
      };
    } catch (error) {
      logger.error('Business Metrics: Error calculating CAC', { error });
      throw error;
    }
  }

  /**
   * Calcular Revenue per User (RPU)
   */
  async calculateRPU(): Promise<{
    rpu: number;
    breakdown: {
      fixedCosts: number;
      commissions: number;
    };
  }> {
    try {
      const activeUsers = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        },
        select: {
          fixedMonthlyCost: true,
          totalEarnings: true
        }
      });

      if (activeUsers.length === 0) {
        return {
          rpu: 0,
          breakdown: {
            fixedCosts: 0,
            commissions: 0
          }
        };
      }

      const totalFixedCosts = activeUsers.reduce((sum, user) => sum + toNumber(user.fixedMonthlyCost || 0), 0);
      const totalCommissions = activeUsers.reduce((sum, user) => sum + toNumber(user.totalEarnings || 0), 0);
      const totalRevenue = totalFixedCosts + totalCommissions;

      const rpu = totalRevenue / activeUsers.length;

      return {
        rpu: Math.round(rpu * 100) / 100,
        breakdown: {
          fixedCosts: totalFixedCosts / activeUsers.length,
          commissions: totalCommissions / activeUsers.length
        }
      };
    } catch (error) {
      logger.error('Business Metrics: Error calculating RPU', { error });
      throw error;
    }
  }

  /**
   * Calcular Gross Margin
   */
  async calculateGrossMargin(estimatedCosts?: number): Promise<{
    grossMargin: number;
    revenue: number;
    costs: number;
    marginPercent: number;
  }> {
    try {
      const { mrr } = await this.calculateMRR();
      const revenue = mrr;

      // Costos estimados (si no se proporcionan)
      const costs = estimatedCosts || 400; // Estimación conservadora

      const grossMargin = revenue - costs;
      const marginPercent = revenue > 0
        ? (grossMargin / revenue) * 100
        : 0;

      return {
        grossMargin: Math.round(grossMargin * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        costs: Math.round(costs * 100) / 100,
        marginPercent: Math.round(marginPercent * 100) / 100
      };
    } catch (error) {
      logger.error('Business Metrics: Error calculating gross margin', { error });
      throw error;
    }
  }

  /**
   * Análisis de Cohortes (por mes de registro)
   */
  async analyzeCohorts(): Promise<Array<{
    cohort: string; // YYYY-MM
    users: number;
    activeUsers: number;
    totalRevenue: number;
    averageLTV: number;
    churnRate: number;
  }>> {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: 'USER'
        },
        select: {
          id: true,
          createdAt: true,
          isActive: true,
          totalEarnings: true,
          fixedMonthlyCost: true
        }
      });

      // Agrupar por cohort (mes de registro)
      const cohortsMap = new Map<string, typeof users>();

      users.forEach(user => {
        const cohort = `${user.createdAt.getFullYear()}-${String(user.createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (!cohortsMap.has(cohort)) {
          cohortsMap.set(cohort, []);
        }
        cohortsMap.get(cohort)!.push(user);
      });

      // Calcular métricas por cohort
      const cohorts = Array.from(cohortsMap.entries()).map(([cohort, cohortUsers]) => {
        const activeUsers = cohortUsers.filter(u => u.isActive).length;
        const totalRevenue = cohortUsers.reduce((sum, u) => 
          sum + toNumber(u.totalEarnings || 0) + (toNumber(u.fixedMonthlyCost || 0) * Math.max(1, Math.floor(
            (Date.now() - u.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
          ))), 0
        );
        const averageLTV = totalRevenue / cohortUsers.length;
        const churnRate = cohortUsers.length > 0
          ? ((cohortUsers.length - activeUsers) / cohortUsers.length) * 100
          : 0;

        return {
          cohort,
          users: cohortUsers.length,
          activeUsers,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          averageLTV: Math.round(averageLTV * 100) / 100,
          churnRate: Math.round(churnRate * 100) / 100
        };
      });

      // Ordenar por cohort (más reciente primero)
      cohorts.sort((a, b) => b.cohort.localeCompare(a.cohort));

      return cohorts;
    } catch (error) {
      logger.error('Business Metrics: Error analyzing cohorts', { error });
      throw error;
    }
  }

  /**
   * Obtener todas las métricas de negocio
   */
  async getAllMetrics(): Promise<{
    mrr: ReturnType<typeof this.calculateMRR> extends Promise<infer T> ? T : never;
    arr: number;
    ltv: ReturnType<typeof this.calculateLTV> extends Promise<infer T> ? T : never;
    churnRate: ReturnType<typeof this.calculateChurnRate> extends Promise<infer T> ? T : never;
    cac: ReturnType<typeof this.calculateCAC> extends Promise<infer T> ? T : never;
    rpu: ReturnType<typeof this.calculateRPU> extends Promise<infer T> ? T : never;
    grossMargin: ReturnType<typeof this.calculateGrossMargin> extends Promise<infer T> ? T : never;
    cohorts: ReturnType<typeof this.analyzeCohorts> extends Promise<infer T> ? T : never;
  }> {
    try {
      const [mrr, arr, ltv, churnRate, cac, rpu, grossMargin, cohorts] = await Promise.all([
        this.calculateMRR(),
        this.calculateARR(),
        this.calculateLTV(),
        this.calculateChurnRate(),
        this.calculateCAC(),
        this.calculateRPU(),
        this.calculateGrossMargin(),
        this.analyzeCohorts()
      ]);

      return {
        mrr,
        arr,
        ltv,
        churnRate,
        cac,
        rpu,
        grossMargin,
        cohorts
      };
    } catch (error) {
      logger.error('Business Metrics: Error getting all metrics', { error });
      throw error;
    }
  }
}

export const businessMetricsService = new BusinessMetricsService();

