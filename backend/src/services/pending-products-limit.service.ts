import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Servicio para gestionar el límite de productos pendientes
 */
export class PendingProductsLimitService {
  private static readonly DEFAULT_LIMIT = 100;
  private static readonly CONFIG_KEY = 'max_pending_products';
  private static readonly MIN_LIMIT = 10;
  private static readonly MAX_LIMIT = 5000;

  /**
   * Obtener el límite máximo de productos pendientes configurado
   * @returns Límite configurado o valor por defecto (100)
   */
  async getMaxPendingProducts(): Promise<number> {
    try {
      // ✅ Validar que CONFIG_KEY esté definido
      if (!this.CONFIG_KEY || typeof this.CONFIG_KEY !== 'string' || this.CONFIG_KEY.trim().length === 0) {
        logger.warn('PendingProductsLimitService: CONFIG_KEY no válido, usando valor por defecto');
        return this.DEFAULT_LIMIT;
      }
      
      const config = await prisma.systemConfig.findUnique({
        where: { key: this.CONFIG_KEY }
      });

      if (config?.value) {
        const limit = parseInt(String(config.value), 10);
        if (!isNaN(limit) && limit >= this.MIN_LIMIT && limit <= this.MAX_LIMIT) {
          return limit;
        }
      }

      // Si no hay configuración o es inválida, retornar valor por defecto
      return this.DEFAULT_LIMIT;
    } catch (error: any) {
      logger.error('Error getting max pending products limit', { 
        error: error?.message || error,
        errorCode: error?.code,
        configKey: this.CONFIG_KEY
      });
      return this.DEFAULT_LIMIT;
    }
  }

  /**
   * Configurar el límite máximo de productos pendientes
   * @param limit Nuevo límite (debe estar entre MIN_LIMIT y MAX_LIMIT)
   * @throws AppError si el límite está fuera del rango válido
   */
  async setMaxPendingProducts(limit: number): Promise<void> {
    if (limit < this.MIN_LIMIT || limit > this.MAX_LIMIT) {
      throw new AppError(
        `El límite debe estar entre ${this.MIN_LIMIT} y ${this.MAX_LIMIT}`,
        400
      );
    }

    try {
      await prisma.systemConfig.upsert({
        where: { key: PendingProductsLimitService.CONFIG_KEY },
        update: {
          value: String(limit),
          updatedAt: new Date()
        },
        create: {
          key: PendingProductsLimitService.CONFIG_KEY,
          value: String(limit)
        }
      });

      logger.info('Max pending products limit updated', { limit });
    } catch (error) {
      logger.error('Error setting max pending products limit', { error, limit });
      throw new AppError('Error al guardar la configuración del límite', 500);
    }
  }

  /**
   * Contar productos pendientes actuales
   * @param userId ID del usuario (opcional, si es admin puede ver todos)
   * @param isAdmin Si es admin, cuenta todos los productos pendientes
   * @returns Número de productos pendientes
   */
  async countPendingProducts(userId?: number, isAdmin: boolean = false): Promise<number> {
    try {
      const count = await prisma.product.count({
        where: {
          status: 'PENDING',
          ...(isAdmin ? {} : userId ? { userId } : {})
        }
      });

      return count;
    } catch (error) {
      logger.error('Error counting pending products', { error, userId, isAdmin });
      return 0;
    }
  }

  /**
   * Verificar si se puede crear un nuevo producto pendiente
   * @param userId ID del usuario que intenta crear el producto
   * @param isAdmin Si es admin
   * @throws AppError si se alcanzó el límite
   */
  async ensurePendingLimitNotExceeded(userId?: number, isAdmin: boolean = false): Promise<void> {
    const currentPending = await this.countPendingProducts(userId, isAdmin);
    const maxLimit = await this.getMaxPendingProducts();

    if (currentPending >= maxLimit) {
      throw new AppError(
        `Has alcanzado el límite de productos pendientes de publicación (${maxLimit}). Publica o elimina algunos productos antes de agregar nuevos.`,
        429, // 429 Too Many Requests
        ErrorCode.VALIDATION_ERROR // ✅ FIX: ErrorCode enum
      );
    }

    logger.debug('Pending products limit check passed', {
      currentPending,
      maxLimit,
      userId,
      isAdmin
    });
  }

  /**
   * Obtener información del límite (para mostrar en UI)
   * @param userId ID del usuario
   * @param isAdmin Si es admin
   * @returns Información del límite y estado actual
   */
  async getLimitInfo(userId?: number, isAdmin: boolean = false): Promise<{
    current: number;
    limit: number;
    remaining: number;
    percentage: number;
  }> {
    const current = await this.countPendingProducts(userId, isAdmin);
    const limit = await this.getMaxPendingProducts();
    const remaining = Math.max(0, limit - current);
    const percentage = limit > 0 ? Math.round((current / limit) * 100) : 0;

    return {
      current,
      limit,
      remaining,
      percentage
    };
  }
}

// Exportar instancia singleton
export const pendingProductsLimitService = new PendingProductsLimitService();

