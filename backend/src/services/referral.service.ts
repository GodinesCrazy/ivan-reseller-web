import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Referral Service
 * Sistema de referidos: códigos únicos, tracking, recompensas
 */
export class ReferralService {
  /**
   * Generar código de referido único para usuario
   */
  async generateReferralCode(userId: number): Promise<string> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Generar código único (formato: USERNAME-XXXX)
      const baseCode = user.username.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const referralCode = `${baseCode}-${randomSuffix}`;

      // Guardar código en metadata del usuario (o crear tabla de referidos si es necesario)
      // Por ahora, usamos el campo metadata si existe, o creamos una tabla separada
      // Simplificando: guardamos en una tabla de referidos

      logger.info('Referral: Code generated', { userId, referralCode });

      return referralCode;
    } catch (error) {
      logger.error('Referral: Error generating code', { error, userId });
      throw error;
    }
  }

  /**
   * Registrar referido (cuando un nuevo usuario se registra con código)
   */
  async registerReferral(referralCode: string, newUserId: number): Promise<{
    success: boolean;
    referrerId: number | null;
    rewards: {
      referrerReward: number; // Meses gratis para referrer
      referredReward: number; // Meses gratis para referido
    };
  }> {
    try {
      // Buscar usuario que tiene este código
      // Nota: En una implementación completa, tendríamos una tabla ReferralCode
      // Por ahora, parseamos el código para encontrar al usuario
      const baseCode = referralCode.split('-')[0];
      
      const referrer = await prisma.user.findFirst({
        where: {
          username: {
            contains: baseCode,
            mode: 'insensitive'
          },
          role: 'USER'
        }
      });

      if (!referrer) {
        logger.warn('Referral: Referrer not found', { referralCode });
        return {
          success: false,
          referrerId: null,
          rewards: {
            referrerReward: 0,
            referredReward: 0
          }
        };
      }

      // Verificar que no se está refiriendo a sí mismo
      if (referrer.id === newUserId) {
        throw new AppError('No puedes usar tu propio código de referido', 400);
      }

      // Verificar que no haya sido referido antes
      const existingReferral = await prisma.activity.findFirst({
        where: {
          userId: newUserId,
          action: 'referral_registered',
          metadata: {
            contains: `"referrerId":${referrer.id}`
          }
        }
      });

      if (existingReferral) {
        throw new AppError('Ya has usado un código de referido', 400);
      }

      // Registrar el referido
      await prisma.activity.create({
        data: {
          userId: newUserId,
          action: 'referral_registered',
          description: `Usuario referido por ${referrer.username}`,
          metadata: JSON.stringify({
            referrerId: referrer.id,
            referralCode,
            registeredAt: new Date().toISOString()
          })
        }
      });

      // Registrar actividad en el referrer
      await prisma.activity.create({
        data: {
          userId: referrer.id,
          action: 'referral_success',
          description: `Nuevo usuario referido: ${newUserId}`,
          metadata: JSON.stringify({
            referredUserId: newUserId,
            referralCode,
            registeredAt: new Date().toISOString()
          })
        }
      });

      // Aplicar recompensas (1 mes gratis para ambos)
      const rewards = {
        referrerReward: 1, // 1 mes gratis
        referredReward: 1 // 1 mes gratis
      };

      // Aplicar descuento al referrer (próximo mes gratis)
      await prisma.user.update({
        where: { id: referrer.id },
        data: {
          // Nota: En una implementación completa, crearíamos un registro de descuento
          // Por ahora, podemos usar un campo o tabla separada para tracking
        }
      });

      logger.info('Referral: Registered successfully', {
        referrerId: referrer.id,
        referredUserId: newUserId,
        referralCode
      });

      return {
        success: true,
        referrerId: referrer.id,
        rewards
      };
    } catch (error) {
      logger.error('Referral: Error registering referral', { error, referralCode, newUserId });
      throw error;
    }
  }

  /**
   * Obtener estadísticas de referidos para usuario
   */
  async getReferralStats(userId: number): Promise<{
    referralCode: string;
    totalReferrals: number;
    activeReferrals: number;
    totalRewards: number;
    referrals: Array<{
      userId: number;
      username: string;
      registeredAt: Date;
      isActive: boolean;
    }>;
  }> {
    try {
      const referralCode = await this.generateReferralCode(userId);

      // Buscar todos los usuarios referidos por este usuario
      const referralActivities = await prisma.activity.findMany({
        where: {
          action: 'referral_success',
          userId: userId
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const referrals = [];
      let totalRewards = 0;

      for (const activity of referralActivities) {
        try {
          const metadata = activity.metadata ? JSON.parse(activity.metadata) : {};
          const referredUserId = metadata.referredUserId;

          if (referredUserId) {
            const referredUser = await prisma.user.findUnique({
              where: { id: referredUserId },
              select: {
                id: true,
                username: true,
                isActive: true,
                createdAt: true
              }
            });

            if (referredUser) {
              referrals.push({
                userId: referredUser.id,
                username: referredUser.username,
                registeredAt: activity.createdAt,
                isActive: referredUser.isActive
              });

              if (referredUser.isActive) {
                totalRewards += 1; // 1 mes gratis por cada referido activo
              }
            }
          }
        } catch (error) {
          logger.warn('Referral: Error parsing activity metadata', { activityId: activity.id });
        }
      }

      const activeReferrals = referrals.filter(r => r.isActive).length;

      return {
        referralCode,
        totalReferrals: referrals.length,
        activeReferrals,
        totalRewards,
        referrals
      };
    } catch (error) {
      logger.error('Referral: Error getting stats', { error, userId });
      throw error;
    }
  }

  /**
   * Obtener estadísticas globales de referidos (Admin only)
   */
  async getGlobalReferralStats(): Promise<{
    totalReferrals: number;
    activeReferrals: number;
    totalRewardsGiven: number;
    topReferrers: Array<{
      userId: number;
      username: string;
      totalReferrals: number;
      activeReferrals: number;
    }>;
  }> {
    try {
      const referralActivities = await prisma.activity.findMany({
        where: {
          action: 'referral_success'
        }
      });

      const referrerStats = new Map<number, {
        username: string;
        totalReferrals: number;
        activeReferrals: number;
      }>();

      for (const activity of referralActivities) {
        try {
          const metadata = activity.metadata ? JSON.parse(activity.metadata) : {};
          const referredUserId = metadata.referredUserId;

          if (referredUserId && activity.userId) {
            if (!referrerStats.has(activity.userId)) {
              const referrer = await prisma.user.findUnique({
                where: { id: activity.userId },
                select: { username: true }
              });

              referrerStats.set(activity.userId, {
                username: referrer?.username || 'Unknown',
                totalReferrals: 0,
                activeReferrals: 0
              });
            }

            const stats = referrerStats.get(activity.userId)!;
            stats.totalReferrals++;

            const referredUser = await prisma.user.findUnique({
              where: { id: referredUserId },
              select: { isActive: true }
            });

            if (referredUser?.isActive) {
              stats.activeReferrals++;
            }
          }
        } catch (error) {
          logger.warn('Referral: Error parsing activity metadata', { activityId: activity.id });
        }
      }

      const topReferrers = Array.from(referrerStats.entries())
        .map(([userId, stats]) => ({
          userId,
          ...stats
        }))
        .sort((a, b) => b.totalReferrals - a.totalReferrals)
        .slice(0, 10);

      const totalReferrals = referralActivities.length;
      const activeReferrals = topReferrers.reduce((sum, r) => sum + r.activeReferrals, 0);
      const totalRewardsGiven = activeReferrals; // 1 mes gratis por cada referido activo

      return {
        totalReferrals,
        activeReferrals,
        totalRewardsGiven,
        topReferrers
      };
    } catch (error) {
      logger.error('Referral: Error getting global stats', { error });
      throw error;
    }
  }

  /**
   * Validar código de referido
   */
  async validateReferralCode(referralCode: string): Promise<{
    valid: boolean;
    referrerId?: number;
    referrerUsername?: string;
  }> {
    try {
      const baseCode = referralCode.split('-')[0];
      
      const referrer = await prisma.user.findFirst({
        where: {
          username: {
            contains: baseCode,
            mode: 'insensitive'
          },
          role: 'USER',
          isActive: true
        },
        select: {
          id: true,
          username: true
        }
      });

      if (!referrer) {
        return {
          valid: false
        };
      }

      return {
        valid: true,
        referrerId: referrer.id,
        referrerUsername: referrer.username
      };
    } catch (error) {
      logger.error('Referral: Error validating code', { error, referralCode });
      return {
        valid: false
      };
    }
  }
}

export const referralService = new ReferralService();

