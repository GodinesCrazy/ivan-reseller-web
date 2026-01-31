/**
 * ✅ FASE 5: Product State Machine Service
 * Máquina de estados para productos con transiciones válidas
 * Previene estados inconsistentes
 */

import { trace } from '../utils/boot-trace';
trace('loading product-state-machine.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';

export type ProductStatus = 
  | 'PENDING'      // Pendiente de revisión
  | 'APPROVED'     // Aprobado, listo para publicar
  | 'PUBLISHED'    // Publicado en marketplace(s)
  | 'REJECTED'     // Rechazado
  | 'ARCHIVED'     // Archivado
  | 'DELISTED';    // Deslistado (ya no disponible)

export interface ProductStateTransition {
  from: ProductStatus;
  to: ProductStatus;
  reason?: string;
}

/**
 * ✅ FASE 5: Validar si una transición de estado es válida
 */
const VALID_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'PENDING', 'ARCHIVED'], // Puede volver a PENDING si necesita revisión
  PUBLISHED: ['DELISTED', 'ARCHIVED'], // Una vez publicado, solo puede deslistarse o archivarse
  REJECTED: ['PENDING', 'ARCHIVED'], // Puede volver a PENDING si se corrige
  ARCHIVED: [], // Estado final (no se puede salir)
  DELISTED: ['PUBLISHED', 'ARCHIVED'], // Puede republicarse o archivarse
};

export class ProductStateMachineService {
  /**
   * ✅ FASE 5: Validar transición de estado
   */
  static isValidTransition(
    from: ProductStatus,
    to: ProductStatus
  ): boolean {
    if (from === to) {
      return true; // Mantener el mismo estado es válido
    }

    const allowedStates = VALID_TRANSITIONS[from] || [];
    return allowedStates.includes(to);
  }

  /**
   * ✅ FASE 5: Transicionar estado de producto con validación
   */
  static async transitionProduct(
    productId: number,
    newStatus: ProductStatus,
    userId?: number,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Obtener producto actual
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, status: true, userId: true },
      });

      if (!product) {
        return { success: false, error: 'Product not found' };
      }

      // Validar permisos (solo el dueño o admin puede cambiar estado)
      if (userId && product.userId !== userId) {
        // Verificar si es admin
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });

        if (user?.role !== 'ADMIN') {
          return { success: false, error: 'Unauthorized' };
        }
      }

      const currentStatus = product.status as ProductStatus;

      // Validar transición
      if (!this.isValidTransition(currentStatus, newStatus)) {
        return {
          success: false,
          error: `Invalid transition from ${currentStatus} to ${newStatus}`,
        };
      }

      // Ejecutar transición en transacción
      await prisma.$transaction(async (tx) => {
        // Actualizar producto
        await tx.product.update({
          where: { id: productId },
          data: {
            status: newStatus,
            updatedAt: new Date(),
          },
        });

        // Registrar transición en log (si existe tabla de logs)
        // Esto permite auditoría de cambios de estado
        // ✅ FIX: Tabla productUpdateLog no existe en schema, usar logger estructurado
        logger.info('[ProductStateMachine] Status transition logged', {
          productId,
          fromStatus: currentStatus,
          toStatus: newStatus,
          reason: reason || 'Status transition',
          userId: userId || product.userId,
        });
      });

      logger.info('[ProductStateMachine] Product status transitioned', {
        productId,
        from: currentStatus,
        to: newStatus,
        userId: userId || product.userId,
        reason,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('[ProductStateMachine] Error transitioning product status', {
        error: error.message,
        productId,
        newStatus,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * ✅ FASE 5: Obtener estados válidos desde un estado actual
   */
  static getValidNextStates(currentStatus: ProductStatus): ProductStatus[] {
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  /**
   * ✅ FASE 5: Aprobar producto (transición común)
   */
  static async approveProduct(
    productId: number,
    userId?: number
  ): Promise<{ success: boolean; error?: string }> {
    return this.transitionProduct(productId, 'APPROVED', userId, 'Product approved');
  }

  /**
   * ✅ FASE 5: Rechazar producto (transición común)
   */
  static async rejectProduct(
    productId: number,
    userId?: number,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.transitionProduct(
      productId,
      'REJECTED',
      userId,
      reason || 'Product rejected'
    );
  }

  /**
   * ✅ FASE 5: Publicar producto (transición común)
   */
  static async publishProduct(
    productId: number,
    userId?: number
  ): Promise<{ success: boolean; error?: string }> {
    return this.transitionProduct(productId, 'PUBLISHED', userId, 'Product published');
  }
}

export default ProductStateMachineService;

