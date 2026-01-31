import { trace } from '../utils/boot-trace';
trace('loading financial-alerts.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { notificationService } from './notification.service';

/**
 * Financial Alerts Service
 * Sistema de alertas financieras para prevenir pérdidas y mejorar retención
 */
export class FinancialAlertsService {
  /**
   * Verificar y alertar sobre balance negativo de usuarios
   */
  async checkNegativeBalances(): Promise<{
    alerted: number;
    usersWithNegativeBalance: Array<{
      userId: number;
      username: string;
      email: string;
      balance: number;
    }>;
  }> {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true,
          balance: {
            lt: 0
          }
        },
        select: {
          id: true,
          username: true,
          email: true,
          balance: true
        }
      });

      const { toNumber } = require('../utils/decimal.utils');
      const usersWithNegativeBalance = users.map(user => ({
        userId: user.id,
        username: user.username,
        email: user.email,
        balance: toNumber(user.balance)
      }));

      // Enviar alertas a admin
      const adminUsers = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
      });

      for (const user of users) {
        // Notificar a todos los admins
        for (const admin of adminUsers) {
          notificationService.sendToUser(admin.id, {
            type: 'SYSTEM_ALERT',
            title: 'Balance Negativo Detectado',
            message: `Usuario ${user.username} tiene balance negativo: $${user.balance.toFixed(2)}`,
            priority: 'HIGH',
            category: 'SYSTEM',
            data: {
              alertType: 'negative_balance',
              userId: user.id,
              username: user.username,
              balance: user.balance
            }
          });
        }

        // Notificar al usuario
        notificationService.sendToUser(user.id, {
          type: 'SYSTEM_ALERT',
          title: 'Balance Negativo',
          message: `Tu balance es negativo: $${user.balance.toFixed(2)}. Por favor, recarga tu cuenta para continuar operando.`,
          priority: 'HIGH',
          category: 'SYSTEM',
          data: {
            alertType: 'negative_balance',
            balance: user.balance
          }
        });
      }

      logger.info('Financial Alerts: Negative balances checked', {
        count: users.length,
        users: usersWithNegativeBalance
      });

      return {
        alerted: users.length,
        usersWithNegativeBalance
      };
    } catch (error) {
      logger.error('Financial Alerts: Error checking negative balances', { error });
      throw error;
    }
  }

  /**
   * Verificar y alertar sobre comisiones acumuladas altas
   */
  async checkAccumulatedCommissions(threshold: number = 100): Promise<{
    alerted: number;
    usersWithHighCommissions: Array<{
      userId: number;
      username: string;
      email: string;
      pendingCommissions: number;
    }>;
  }> {
    try {
      const pendingCommissions = await prisma.commission.findMany({
        where: {
          status: 'PENDING'
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      });

      // Agrupar por usuario
      const commissionsByUser = pendingCommissions.reduce((acc, commission) => {
        const userId = commission.userId;
        if (!acc[userId]) {
          acc[userId] = {
            userId,
            username: commission.user.username,
            email: commission.user.email,
            pendingCommissions: 0
          };
        }
        const { toNumber } = require('../utils/decimal.utils');
        acc[userId].pendingCommissions += toNumber(commission.amount);
        return acc;
      }, {} as Record<number, { userId: number; username: string; email: string; pendingCommissions: number }>);

      // Filtrar usuarios con comisiones acumuladas > threshold
      const usersWithHighCommissions = Object.values(commissionsByUser).filter(
        user => user.pendingCommissions >= threshold
      );

      // Enviar alertas
      const adminUsers = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
      });

      for (const user of usersWithHighCommissions) {
        // Notificar a todos los admins
        for (const admin of adminUsers) {
          notificationService.sendToUser(admin.id, {
            type: 'SYSTEM_ALERT',
            title: 'Comisiones Acumuladas Altas',
            message: `Usuario ${user.username} tiene $${user.pendingCommissions.toFixed(2)} en comisiones pendientes`,
            priority: 'NORMAL',
            category: 'SYSTEM',
            data: {
              alertType: 'high_commissions',
              userId: user.userId,
              username: user.username,
              amount: user.pendingCommissions
            }
          });
        }

        // Notificar al usuario
        notificationService.sendToUser(user.userId, {
          type: 'SYSTEM_ALERT',
          title: 'Comisiones Pendientes',
          message: `Tienes $${user.pendingCommissions.toFixed(2)} en comisiones pendientes. Se procesarán automáticamente.`,
          priority: 'NORMAL',
          category: 'SYSTEM',
          data: {
            alertType: 'high_commissions',
            amount: user.pendingCommissions
          }
        });
      }

      logger.info('Financial Alerts: High commissions checked', {
        threshold,
        count: usersWithHighCommissions.length
      });

      return {
        alerted: usersWithHighCommissions.length,
        usersWithHighCommissions
      };
    } catch (error) {
      logger.error('Financial Alerts: Error checking accumulated commissions', { error });
      throw error;
    }
  }

  /**
   * Verificar y alertar sobre capital de trabajo bajo
   */
  async checkLowWorkingCapital(thresholdPercent: number = 20): Promise<{
    alerted: number;
    usersWithLowCapital: Array<{
      userId: number;
      username: string;
      email: string;
      workingCapital: number;
      availableCapital: number;
      utilizationPercent: number;
    }>;
  }> {
    try {
      const { workflowConfigService } = await import('./workflow-config.service');
      
      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        },
        select: {
          id: true,
          username: true,
          email: true
        }
      });

      const usersWithLowCapital: Array<{
        userId: number;
        username: string;
        email: string;
        workingCapital: number;
        availableCapital: number;
        utilizationPercent: number;
      }> = [];

      for (const user of users) {
        try {
          const totalCapital = await workflowConfigService.getWorkingCapital(user.id);
          
          // Obtener capital comprometido
          const pendingOrders = await prisma.sale.findMany({
            where: {
              userId: user.id,
              status: {
                in: ['PENDING', 'PROCESSING']
              }
            }
          });

          const approvedProducts = await prisma.product.findMany({
            where: {
              userId: user.id,
              status: 'APPROVED',
              isPublished: false
            }
          });

          const { toNumber } = require('../utils/decimal.utils');
          const pendingCost = pendingOrders.reduce((sum, order) => 
            sum + toNumber(order.aliexpressCost || 0), 0
          );

          const approvedCost = approvedProducts.reduce((sum, product) => 
            sum + toNumber(product.aliexpressPrice || 0), 0
          );

          const committedCapital = pendingCost + approvedCost;
          const availableCapital = totalCapital - committedCapital;
          const utilizationPercent = totalCapital > 0 
            ? (committedCapital / totalCapital) * 100 
            : 0;

          // Si el capital disponible es menor al threshold
          const availablePercent = totalCapital > 0 
            ? (availableCapital / totalCapital) * 100 
            : 0;

          if (availablePercent < thresholdPercent) {
            usersWithLowCapital.push({
              userId: user.id,
              username: user.username,
              email: user.email,
              workingCapital: totalCapital,
              availableCapital,
              utilizationPercent
            });

            // Enviar alerta a admin
            const adminUsers = await prisma.user.findMany({
              where: { role: 'ADMIN' },
              select: { id: true }
            });

            for (const admin of adminUsers) {
              notificationService.sendToUser(admin.id, {
                type: 'SYSTEM_ALERT',
                title: 'Capital de Trabajo Bajo',
                message: `Usuario ${user.username} tiene solo ${availablePercent.toFixed(1)}% de capital disponible ($${availableCapital.toFixed(2)} de $${totalCapital.toFixed(2)})`,
                priority: 'NORMAL',
                category: 'SYSTEM',
                data: {
                  alertType: 'low_working_capital',
                  userId: user.id,
                  username: user.username,
                  availableCapital,
                  totalCapital,
                  utilizationPercent
                }
              });
            }

            // Notificar al usuario
            notificationService.sendToUser(user.id, {
              type: 'SYSTEM_ALERT',
              title: 'Capital de Trabajo Bajo',
              message: `Tu capital disponible es bajo (${availablePercent.toFixed(1)}%). Considera aumentar tu capital de trabajo para continuar operando.`,
              priority: 'NORMAL',
              category: 'SYSTEM',
              data: {
                alertType: 'low_working_capital',
                availableCapital,
                totalCapital,
                utilizationPercent
              }
            });
          }
        } catch (error) {
          logger.error(`Financial Alerts: Error checking capital for user ${user.id}`, { error });
        }
      }

      logger.info('Financial Alerts: Low working capital checked', {
        thresholdPercent,
        count: usersWithLowCapital.length
      });

      return {
        alerted: usersWithLowCapital.length,
        usersWithLowCapital
      };
    } catch (error) {
      logger.error('Financial Alerts: Error checking low working capital', { error });
      throw error;
    }
  }

  /**
   * Verificar y alertar sobre usuarios inactivos
   */
  async checkInactiveUsers(daysThreshold: number = 30): Promise<{
    alerted: number;
    inactiveUsers: Array<{
      userId: number;
      username: string;
      email: string;
      daysInactive: number;
      lastLoginAt: Date | null;
    }>;
  }> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true,
          OR: [
            { lastLoginAt: null },
            { lastLoginAt: { lt: thresholdDate } }
          ]
        },
        select: {
          id: true,
          username: true,
          email: true,
          lastLoginAt: true
        }
      });

      const inactiveUsers = users.map(user => {
        const daysInactive = user.lastLoginAt
          ? Math.floor((Date.now() - user.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
          : 999; // Nunca ha iniciado sesión

        return {
          userId: user.id,
          username: user.username,
          email: user.email,
          daysInactive,
          lastLoginAt: user.lastLoginAt
        };
      });

      // Enviar alertas a admin
      const adminUsers = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
      });

      for (const user of inactiveUsers) {
        for (const admin of adminUsers) {
          notificationService.sendToUser(admin.id, {
            type: 'SYSTEM_ALERT',
            title: 'Usuario Inactivo Detectado',
            message: `Usuario ${user.username} inactivo por ${user.daysInactive} días`,
            priority: 'NORMAL',
            category: 'SYSTEM',
            data: {
              alertType: 'inactive_user',
              userId: user.userId,
              username: user.username,
              daysInactive: user.daysInactive
            }
          });
        }
      }

      logger.info('Financial Alerts: Inactive users checked', {
        daysThreshold,
        count: inactiveUsers.length
      });

      return {
        alerted: inactiveUsers.length,
        inactiveUsers
      };
    } catch (error) {
      logger.error('Financial Alerts: Error checking inactive users', { error });
      throw error;
    }
  }

  /**
   * Verificar y alertar sobre usuarios con riesgo de churn (pocas ventas)
   */
  async checkChurnRisk(minSalesThreshold: number = 2): Promise<{
    alerted: number;
    usersAtRisk: Array<{
      userId: number;
      username: string;
      email: string;
      monthlySales: number;
      daysSinceLastSale: number | null;
    }>;
  }> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        },
        select: {
          id: true,
          username: true,
          email: true
        }
      });

      const usersAtRisk: Array<{
        userId: number;
        username: string;
        email: string;
        monthlySales: number;
        daysSinceLastSale: number | null;
      }> = [];

      for (const user of users) {
        // Contar ventas del mes
        const monthlySales = await prisma.sale.count({
          where: {
            userId: user.id,
            createdAt: {
              gte: startOfMonth
            }
          }
        });

        // Obtener última venta
        const lastSale = await prisma.sale.findFirst({
          where: {
            userId: user.id
          },
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            createdAt: true
          }
        });

        const daysSinceLastSale = lastSale
          ? Math.floor((Date.now() - lastSale.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        // Si tiene menos ventas que el threshold, está en riesgo
        if (monthlySales < minSalesThreshold) {
          usersAtRisk.push({
            userId: user.id,
            username: user.username,
            email: user.email,
            monthlySales,
            daysSinceLastSale
          });

          // Enviar alerta a admin
          const adminUsers = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true }
          });

          for (const admin of adminUsers) {
            notificationService.sendToUser(admin.id, {
              type: 'SYSTEM_ALERT',
              title: 'Usuario en Riesgo de Churn',
              message: `Usuario ${user.username} tiene solo ${monthlySales} ventas este mes (umbral: ${minSalesThreshold})`,
              priority: 'HIGH',
              category: 'SYSTEM',
              data: {
                alertType: 'churn_risk',
                userId: user.id,
                username: user.username,
                monthlySales,
                daysSinceLastSale
              }
            });
          }

          // Notificar al usuario con mensaje motivacional
          notificationService.sendToUser(user.id, {
            type: 'USER_ACTION',
            title: '¡Aumenta tus Ventas!',
            message: `Tienes ${monthlySales} ventas este mes. ¡Publica más productos para aumentar tus ganancias!`,
            priority: 'NORMAL',
            category: 'USER',
            data: {
              alertType: 'churn_risk',
              monthlySales,
              minSalesThreshold
            },
            actions: [
              {
                id: 'find_opportunities',
                label: 'Buscar Oportunidades',
                url: '/opportunities',
                variant: 'primary'
              },
              {
                id: 'publish_product',
                label: 'Publicar Producto',
                url: '/products',
                variant: 'success'
              }
            ]
          });
        }
      }

      logger.info('Financial Alerts: Churn risk checked', {
        minSalesThreshold,
        count: usersAtRisk.length
      });

      return {
        alerted: usersAtRisk.length,
        usersAtRisk
      };
    } catch (error) {
      logger.error('Financial Alerts: Error checking churn risk', { error });
      throw error;
    }
  }

  /**
   * Ejecutar todas las verificaciones de alertas financieras
   */
  async runAllChecks(): Promise<{
    negativeBalances: ReturnType<typeof this.checkNegativeBalances> extends Promise<infer T> ? T : never;
    highCommissions: ReturnType<typeof this.checkAccumulatedCommissions> extends Promise<infer T> ? T : never;
    lowCapital: ReturnType<typeof this.checkLowWorkingCapital> extends Promise<infer T> ? T : never;
    inactiveUsers: ReturnType<typeof this.checkInactiveUsers> extends Promise<infer T> ? T : never;
    churnRisk: ReturnType<typeof this.checkChurnRisk> extends Promise<infer T> ? T : never;
  }> {
    try {
      const [negativeBalances, highCommissions, lowCapital, inactiveUsers, churnRisk] = await Promise.all([
        this.checkNegativeBalances(),
        this.checkAccumulatedCommissions(),
        this.checkLowWorkingCapital(),
        this.checkInactiveUsers(),
        this.checkChurnRisk()
      ]);

      logger.info('Financial Alerts: All checks completed', {
        negativeBalances: negativeBalances.alerted,
        highCommissions: highCommissions.alerted,
        lowCapital: lowCapital.alerted,
        inactiveUsers: inactiveUsers.alerted,
        churnRisk: churnRisk.alerted
      });

      return {
        negativeBalances,
        highCommissions,
        lowCapital,
        inactiveUsers,
        churnRisk
      };
    } catch (error) {
      logger.error('Financial Alerts: Error running all checks', { error });
      throw error;
    }
  }
}

export const financialAlertsService = new FinancialAlertsService();

