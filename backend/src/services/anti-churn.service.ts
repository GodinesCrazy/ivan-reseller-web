// @ts-nocheck
import { trace } from '../utils/boot-trace';
trace('loading anti-churn.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { notificationService } from './notification.service';

/**
 * Anti-Churn Service
 * Sistema para identificar y prevenir churn de usuarios
 */
export class AntiChurnService {
  /**
   * Identificar usuarios en riesgo de churn
   */
  async identifyAtRiskUsers(): Promise<Array<{
    userId: number;
    username: string;
    email: string;
    riskScore: number;
    riskFactors: string[];
    recommendedActions: string[];
  }>> {
    try {
      const activeUsers = await prisma.user.findMany({
        where: {
          role: 'USER',
          isActive: true
        },
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true,
          lastLoginAt: true,
          balance: true,
          totalEarnings: true,
          totalSales: true
        }
      });

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const atRiskUsers: Array<{
        userId: number;
        username: string;
        email: string;
        riskScore: number;
        riskFactors: string[];
        recommendedActions: string[];
      }> = [];

      for (const user of activeUsers) {
        const riskFactors: string[] = [];
        let riskScore = 0;

        // Factor 1: Inactividad (días sin login)
        const daysSinceLastLogin = user.lastLoginAt
          ? Math.floor((Date.now() - user.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        if (daysSinceLastLogin > 30) {
          riskFactors.push(`Inactivo por ${daysSinceLastLogin} días`);
          riskScore += 30;
        } else if (daysSinceLastLogin > 14) {
          riskFactors.push(`Inactivo por ${daysSinceLastLogin} días`);
          riskScore += 15;
        }

        // Factor 2: Ventas del mes
        const monthlySales = await prisma.sale.count({
          where: {
            userId: user.id,
            createdAt: {
              gte: startOfMonth
            }
          }
        });

        if (monthlySales === 0) {
          riskFactors.push('Sin ventas este mes');
          riskScore += 40;
        } else if (monthlySales < 2) {
          riskFactors.push(`Solo ${monthlySales} venta(s) este mes`);
          riskScore += 20;
        }

        // Factor 3: Balance bajo o negativo
        if (user.balance < 0) {
          riskFactors.push('Balance negativo');
          riskScore += 25;
        } else if (user.balance < 10) {
          riskFactors.push('Balance muy bajo');
          riskScore += 15;
        }

        // Factor 4: Tiempo desde última venta
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

        if (lastSale) {
          const daysSinceLastSale = Math.floor(
            (Date.now() - lastSale.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceLastSale > 30) {
            riskFactors.push(`Sin ventas por ${daysSinceLastSale} días`);
            riskScore += 30;
          } else if (daysSinceLastSale > 14) {
            riskFactors.push(`Sin ventas por ${daysSinceLastSale} días`);
            riskScore += 15;
          }
        } else {
          // Usuario nunca ha tenido una venta
          const daysSinceSignup = Math.floor(
            (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceSignup > 30) {
            riskFactors.push('Nunca ha realizado una venta');
            riskScore += 35;
          }
        }

        // Factor 5: Bajo total de ganancias
        if (user.totalEarnings < 50) {
          const monthsActive = Math.max(1, Math.floor(
            (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
          ));

          if (monthsActive > 2 && user.totalEarnings < 50) {
            riskFactors.push('Bajas ganancias totales');
            riskScore += 20;
          }
        }

        // Si el usuario tiene un risk score > 50, está en riesgo
        if (riskScore > 50) {
          const recommendedActions = this.generateRecommendedActions(riskFactors);

          atRiskUsers.push({
            userId: user.id,
            username: user.username,
            email: user.email,
            riskScore,
            riskFactors,
            recommendedActions
          });
        }
      }

      // Ordenar por risk score (mayor a menor)
      atRiskUsers.sort((a, b) => b.riskScore - a.riskScore);

      logger.info('Anti-Churn: At-risk users identified', {
        count: atRiskUsers.length,
        users: atRiskUsers.map(u => ({
          userId: u.userId,
          username: u.username,
          riskScore: u.riskScore
        }))
      });

      return atRiskUsers;
    } catch (error) {
      logger.error('Anti-Churn: Error identifying at-risk users', { error });
      throw error;
    }
  }

  /**
   * Generar acciones recomendadas basadas en factores de riesgo
   */
  private generateRecommendedActions(riskFactors: string[]): string[] {
    const actions: string[] = [];

    if (riskFactors.some(f => f.includes('Inactivo'))) {
      actions.push('Enviar email de re-engagement');
      actions.push('Ofrecer tutorial personalizado');
      actions.push('Proporcionar recursos de ayuda');
    }

    if (riskFactors.some(f => f.includes('venta') || f.includes('Sin ventas'))) {
      actions.push('Enviar notificación motivacional');
      actions.push('Sugerir productos populares');
      actions.push('Ofrecer asistencia para publicar productos');
    }

    if (riskFactors.some(f => f.includes('Balance'))) {
      actions.push('Recordar recargar balance');
      actions.push('Explicar beneficios del sistema');
    }

    if (riskFactors.some(f => f.includes('Bajas ganancias'))) {
      actions.push('Revisar estrategia de productos');
      actions.push('Analizar productos más rentables');
      actions.push('Ajustar precios');
    }

    // Acciones genéricas
    actions.push('Programar seguimiento personalizado');
    actions.push('Revisar configuración de autopilot');

    return actions;
  }

  /**
   * Intervenir proactivamente con usuarios en riesgo
   */
  async interveneWithAtRiskUsers(): Promise<{
    intervened: number;
    users: Array<{
      userId: number;
      username: string;
      actions: string[];
    }>;
  }> {
    try {
      const atRiskUsers = await this.identifyAtRiskUsers();
      const intervened: Array<{
        userId: number;
        username: string;
        actions: string[];
      }> = [];

      for (const user of atRiskUsers) {
        const actions: string[] = [];

        // Enviar notificación motivacional
        notificationService.sendToUser(user.userId, {
          type: 'USER_ACTION',
          title: '¡Te extrañamos!',
          message: 'Hemos notado que no has estado activo últimamente. ¡Hay muchas oportunidades esperándote!',
          priority: 'NORMAL',
          category: 'USER',
          data: {
            interventionType: 're_engagement',
            riskScore: user.riskScore,
            riskFactors: user.riskFactors
          },
          actions: [
            {
              id: 'find_opportunities',
              label: 'Buscar Oportunidades',
              url: '/opportunities',
              variant: 'primary'
            },
            {
              id: 'view_tutorial',
              label: 'Ver Tutorial',
              url: '/help',
              variant: 'secondary'
            }
          ]
        });
        actions.push('Notificación enviada');

        // Si no tiene ventas este mes, enviar sugerencias
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlySales = await prisma.sale.count({
          where: {
            userId: user.userId,
            createdAt: {
              gte: startOfMonth
            }
          }
        });

        if (monthlySales === 0) {
          // Obtener productos populares para sugerir
          const popularProducts = await prisma.product.findMany({
            where: {
              status: 'APPROVED',
              isPublished: false
            },
            orderBy: {
              profit: 'desc'
            },
            take: 5,
            select: {
              id: true,
              title: true,
              profit: true
            }
          });

          if (popularProducts.length > 0) {
            notificationService.sendToUser(user.userId, {
              type: 'USER_ACTION',
              title: 'Productos Recomendados',
              message: `Hemos encontrado ${popularProducts.length} productos rentables que podrías publicar. ¡Revisa tus oportunidades!`,
              priority: 'NORMAL',
              category: 'USER',
              data: {
                interventionType: 'product_suggestions',
                products: popularProducts
              },
              actions: [
                {
                  id: 'view_products',
                  label: 'Ver Productos',
                  url: '/products',
                  variant: 'primary'
                }
              ]
            });
            actions.push('Sugerencias de productos enviadas');
          }
        }

        intervened.push({
          userId: user.userId,
          username: user.username,
          actions
        });
      }

      logger.info('Anti-Churn: Intervention completed', {
        intervened: intervened.length
      });

      return {
        intervened: intervened.length,
        users: intervened
      };
    } catch (error) {
      logger.error('Anti-Churn: Error in intervention', { error });
      throw error;
    }
  }

  /**
   * Mejorar onboarding para nuevos usuarios
   */
  async improveOnboarding(userId: number): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          createdAt: true
        }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      const daysSinceSignup = Math.floor(
        (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Enviar tutorial paso a paso
      if (daysSinceSignup === 0) {
        notificationService.sendToUser(userId, {
          type: 'USER_ACTION',
          title: '¡Bienvenido!',
          message: 'Te guiaremos paso a paso para que comiences a ganar dinero. ¡Comienza con el tutorial!',
          priority: 'HIGH',
          category: 'USER',
          actions: [
            {
              id: 'start_tutorial',
              label: 'Comenzar Tutorial',
              url: '/onboarding',
              variant: 'primary'
            }
          ]
        });
      }

      // Recordatorio después de 3 días si no ha publicado nada
      if (daysSinceSignup === 3) {
        const hasProducts = await prisma.product.count({
          where: {
            userId: user.id
          }
        });

        if (hasProducts === 0) {
          notificationService.sendToUser(userId, {
            type: 'USER_ACTION',
            title: '¡Es hora de comenzar!',
            message: 'Publica tu primer producto para comenzar a ganar. ¡Te ayudaremos en cada paso!',
            priority: 'NORMAL',
            category: 'USER',
            actions: [
              {
                id: 'find_opportunities',
                label: 'Buscar Oportunidades',
                url: '/opportunities',
                variant: 'primary'
              },
              {
                id: 'view_tutorial',
                label: 'Ver Tutorial',
                url: '/help',
                variant: 'secondary'
              }
            ]
          });
        }
      }
    } catch (error) {
      logger.error('Anti-Churn: Error improving onboarding', { error, userId });
      throw error;
    }
  }
}

export const antiChurnService = new AntiChurnService();

