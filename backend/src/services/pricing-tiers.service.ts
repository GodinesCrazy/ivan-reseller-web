import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Pricing Tiers Service
 * Sistema de planes de precios: Basic, Pro, Enterprise
 */
export type PlanType = 'BASIC' | 'PRO' | 'ENTERPRISE';

export interface PricingPlan {
  id: PlanType;
  name: string;
  description: string;
  monthlyCost: number;
  commissionRate: number; // Comisión del admin (porcentaje de gross profit)
  features: string[];
  maxActiveProducts?: number;
  maxMonthlySales?: number;
  supportLevel: 'standard' | 'priority' | 'dedicated';
  apiAccess: boolean;
  whiteLabel: boolean;
}

export const PRICING_PLANS: Record<PlanType, PricingPlan> = {
  BASIC: {
    id: 'BASIC',
    name: 'Plan Básico',
    description: 'Perfecto para comenzar',
    monthlyCost: 17.00,
    commissionRate: 0.20, // 20% comisión
    features: [
      'Hasta 50 productos activos',
      'Hasta 100 ventas mensuales',
      'Soporte estándar',
      'Autopilot básico',
      'Reportes básicos'
    ],
    maxActiveProducts: 50,
    maxMonthlySales: 100,
    supportLevel: 'standard',
    apiAccess: false,
    whiteLabel: false
  },
  PRO: {
    id: 'PRO',
    name: 'Plan Pro',
    description: 'Para usuarios que buscan escalar',
    monthlyCost: 49.00,
    commissionRate: 0.15, // 15% comisión (ahorro de 5%)
    features: [
      'Hasta 200 productos activos',
      'Ventas ilimitadas',
      'Soporte prioritario',
      'Autopilot avanzado',
      'Reportes avanzados',
      'API access',
      'Análisis de productos exitosos'
    ],
    maxActiveProducts: 200,
    supportLevel: 'priority',
    apiAccess: true,
    whiteLabel: false
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Plan Enterprise',
    description: 'Para negocios establecidos',
    monthlyCost: 149.00,
    commissionRate: 0.10, // 10% comisión (ahorro de 10%)
    features: [
      'Productos ilimitados',
      'Ventas ilimitadas',
      'Soporte dedicado',
      'Autopilot completo',
      'Reportes personalizados',
      'API completa',
      'White-label',
      'Múltiples cuentas',
      'Análisis avanzado con IA'
    ],
    supportLevel: 'dedicated',
    apiAccess: true,
    whiteLabel: true
  }
};

export class PricingTiersService {
  /**
   * Obtener todos los planes disponibles
   */
  getAvailablePlans(): PricingPlan[] {
    return Object.values(PRICING_PLANS);
  }

  /**
   * Obtener plan por ID
   */
  getPlan(planId: PlanType): PricingPlan {
    const plan = PRICING_PLANS[planId];
    if (!plan) {
      throw new AppError(`Plan ${planId} no encontrado`, 404);
    }
    return plan;
  }

  /**
   * Asignar plan a usuario (Admin only)
   */
  async assignPlanToUser(adminId: number, userId: number, planType: PlanType): Promise<{
    success: boolean;
    user: any;
    plan: PricingPlan;
    savings: {
      monthlySavings: number;
      commissionSavings: number; // Ahorro en comisiones por cada $100 de ventas
    };
  }> {
    try {
      // Verificar que el admin existe
      const admin = await prisma.user.findUnique({
        where: { id: adminId }
      });

      if (!admin || admin.role !== 'ADMIN') {
        throw new AppError('Solo administradores pueden asignar planes', 403);
      }

      // Verificar que el usuario existe
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      const plan = this.getPlan(planType);

      // Calcular ahorros comparado con plan básico
      const basicPlan = PRICING_PLANS.BASIC;
      const monthlySavings = basicPlan.monthlyCost - plan.monthlyCost; // Puede ser negativo si es más caro
      const commissionSavings = (basicPlan.commissionRate - plan.commissionRate) * 100; // Por cada $100

      // Actualizar usuario con nuevo plan
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          fixedMonthlyCost: plan.monthlyCost,
          commissionRate: plan.commissionRate,
          // Nota: Si necesitas guardar el planType, agrega un campo planType al schema
        }
      });

      logger.info('Pricing Tiers: Plan assigned to user', {
        adminId,
        userId,
        planType,
        monthlyCost: plan.monthlyCost,
        commissionRate: plan.commissionRate
      });

      return {
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          fixedMonthlyCost: updatedUser.fixedMonthlyCost,
          commissionRate: updatedUser.commissionRate
        },
        plan,
        savings: {
          monthlySavings,
          commissionSavings
        }
      };
    } catch (error) {
      logger.error('Pricing Tiers: Error assigning plan', { error, adminId, userId, planType });
      throw error;
    }
  }

  /**
   * Obtener plan actual del usuario
   */
  async getUserPlan(userId: number): Promise<{
    plan: PricingPlan | null;
    currentCost: number;
    currentCommissionRate: number;
    recommendedPlan?: PricingPlan;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          fixedMonthlyCost: true,
          commissionRate: true
        }
      });

      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Identificar plan basado en costo y comisión
      let userPlan: PricingPlan | null = null;
      for (const plan of Object.values(PRICING_PLANS)) {
        if (
          Math.abs(plan.monthlyCost - user.fixedMonthlyCost) < 0.01 &&
          Math.abs(plan.commissionRate - user.commissionRate) < 0.001
        ) {
          userPlan = plan;
          break;
        }
      }

      // Si no coincide exactamente, es un plan personalizado
      if (!userPlan) {
        userPlan = null;
      }

      // Recomendar plan basado en uso
      const recommendedPlan = await this.recommendPlan(userId);

      return {
        plan: userPlan,
        currentCost: user.fixedMonthlyCost,
        currentCommissionRate: user.commissionRate,
        recommendedPlan
      };
    } catch (error) {
      logger.error('Pricing Tiers: Error getting user plan', { error, userId });
      throw error;
    }
  }

  /**
   * Recomendar plan basado en uso del usuario
   */
  async recommendPlan(userId: number): Promise<PricingPlan> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          products: {
            where: {
              isPublished: true
            }
          },
          sales: {
            where: {
              createdAt: {
                gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
              }
            }
          }
        }
      });

      if (!user) {
        return PRICING_PLANS.BASIC;
      }

      const activeProducts = user.products.length;
      const monthlySales = user.sales.length;

      // Lógica de recomendación
      if (activeProducts > 200 || monthlySales > 100) {
        return PRICING_PLANS.ENTERPRISE;
      } else if (activeProducts > 50 || monthlySales > 50) {
        return PRICING_PLANS.PRO;
      } else {
        return PRICING_PLANS.BASIC;
      }
    } catch (error) {
      logger.error('Pricing Tiers: Error recommending plan', { error, userId });
      return PRICING_PLANS.BASIC;
    }
  }

  /**
   * Calcular ahorro potencial si cambia de plan
   */
  async calculateSavings(userId: number, targetPlan: PlanType): Promise<{
    currentPlan: PricingPlan | null;
    targetPlan: PricingPlan;
    monthlySavings: number;
    commissionSavings: number; // Por cada $100 de ventas
    annualSavings: number;
    breakEvenSales: number; // Ventas necesarias para que el upgrade sea rentable
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          sales: {
            where: {
              createdAt: {
                gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
              }
            }
          }
        }
      });

      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      const currentPlanInfo = await this.getUserPlan(userId);
      const currentPlan = currentPlanInfo.plan || PRICING_PLANS.BASIC;
      const target = this.getPlan(targetPlan);

      // Calcular ahorros mensuales
      const monthlySavings = currentPlan.monthlyCost - target.monthlyCost;
      const commissionSavings = (currentPlan.commissionRate - target.commissionRate) * 100;
      const annualSavings = monthlySavings * 12;

      // Calcular ventas necesarias para break-even
      // Si el plan es más caro mensualmente, necesita ahorrar en comisiones
      const monthlyCostDifference = target.monthlyCost - currentPlan.monthlyCost;
      const commissionDifference = currentPlan.commissionRate - target.commissionRate;

      let breakEvenSales = 0;
      if (monthlyCostDifference > 0 && commissionDifference > 0) {
        // Necesita ahorrar en comisiones para compensar el costo mensual
        // monthlyCostDifference = (sales * averageProfit) * commissionDifference
        // Asumiendo profit promedio de $10 por venta
        const averageProfit = 10;
        breakEvenSales = monthlyCostDifference / (averageProfit * commissionDifference);
      }

      return {
        currentPlan,
        targetPlan: target,
        monthlySavings: -monthlySavings, // Invertir para mostrar positivo si ahorra
        commissionSavings,
        annualSavings: -annualSavings,
        breakEvenSales: Math.ceil(breakEvenSales)
      };
    } catch (error) {
      logger.error('Pricing Tiers: Error calculating savings', { error, userId, targetPlan });
      throw error;
    }
  }

  /**
   * Obtener estadísticas de planes
   */
  async getPlanStatistics(): Promise<{
    basic: { users: number; revenue: number };
    pro: { users: number; revenue: number };
    enterprise: { users: number; revenue: number };
    total: { users: number; revenue: number };
  }> {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        },
        select: {
          fixedMonthlyCost: true,
          commissionRate: true
        }
      });

      const stats = {
        basic: { users: 0, revenue: 0 },
        pro: { users: 0, revenue: 0 },
        enterprise: { users: 0, revenue: 0 },
        total: { users: 0, revenue: 0 }
      };

      for (const user of users) {
        // Identificar plan
        let planType: PlanType | null = null;
        for (const [id, plan] of Object.entries(PRICING_PLANS)) {
          if (
            Math.abs(plan.monthlyCost - user.fixedMonthlyCost) < 0.01 &&
            Math.abs(plan.commissionRate - user.commissionRate) < 0.001
          ) {
            planType = id as PlanType;
            break;
          }
        }

        if (planType) {
          stats[planType].users++;
          stats[planType].revenue += user.fixedMonthlyCost;
        }

        stats.total.users++;
        stats.total.revenue += user.fixedMonthlyCost;
      }

      return stats;
    } catch (error) {
      logger.error('Pricing Tiers: Error getting statistics', { error });
      throw error;
    }
  }
}

export const pricingTiersService = new PricingTiersService();

