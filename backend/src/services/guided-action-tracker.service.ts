/**
 * Servicio centralizado para rastrear acciones guided pendientes
 * 
 * Este servicio permite:
 * - Registrar acciones guided con timeouts
 * - Cancelar acciones si el usuario responde
 * - Verificar estado de acciones pendientes
 * - Limpiar acciones expiradas
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface GuidedAction {
  id: string;
  userId: number;
  stage: 'scrape' | 'analyze' | 'publish' | 'purchase' | 'fulfillment' | 'customerService';
  actionType: 'confirm' | 'skip' | 'cancel';
  data: any;
  expiresAt: Date;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'executed';
  createdAt: Date;
  executedAt?: Date;
  callback?: () => Promise<void>;
}

export class GuidedActionTrackerService {
  private static instance: GuidedActionTrackerService;
  private pendingActions = new Map<string, GuidedAction>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  private constructor() {
    // Limpiar acciones expiradas cada 10 minutos
    setInterval(() => {
      this.cleanupExpiredActions();
    }, 10 * 60 * 1000);
  }

  static getInstance(): GuidedActionTrackerService {
    if (!GuidedActionTrackerService.instance) {
      GuidedActionTrackerService.instance = new GuidedActionTrackerService();
    }
    return GuidedActionTrackerService.instance;
  }

  /**
   * Registrar una acción guided con timeout
   */
  async registerAction(
    userId: number,
    stage: GuidedAction['stage'],
    actionType: 'confirm' | 'skip' | 'cancel',
    data: any,
    timeoutMinutes: number = 5,
    callback?: () => Promise<void>
  ): Promise<string> {
    const actionId = `${stage}_${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

    const action: GuidedAction = {
      id: actionId,
      userId,
      stage,
      actionType,
      data,
      expiresAt,
      status: 'pending',
      createdAt: new Date(),
      callback
    };

    // Guardar en memoria
    this.pendingActions.set(actionId, action);

    // Programar timeout
    const timeout = setTimeout(async () => {
      await this.handleTimeout(actionId);
    }, timeoutMinutes * 60 * 1000);

    this.timeouts.set(actionId, timeout);

    // ✅ FIX: GuidedAction model no existe en Prisma aún, usando solo in-memory storage
    // Guardar en base de datos (opcional, para persistencia) - DESHABILITADO hasta que se agregue el modelo
    // try {
    //   await prisma.guidedAction.create({
    //     data: {
    //       actionId,
    //       userId,
    //       stage,
    //       actionType,
    //       data: JSON.stringify(data),
    //       expiresAt,
    //       status: 'PENDING',
    //       createdAt: new Date()
    //     }
    //   });
    // } catch (error: any) {
    //   // Si la tabla no existe, solo loguear warning (no crítico)
    //   logger.warn('GuidedActionTracker: Could not save to database (table may not exist)', {
    //     error: error?.message,
    //     actionId
    //   });
    // }

    logger.info('GuidedActionTracker: Action registered', {
      actionId,
      userId,
      stage,
      actionType,
      timeoutMinutes,
      expiresAt: expiresAt.toISOString()
    });

    return actionId;
  }

  /**
   * Confirmar una acción guided
   */
  async confirmAction(userId: number, actionId: string, data?: any): Promise<boolean> {
    const action = this.pendingActions.get(actionId);

    if (!action) {
      logger.warn('GuidedActionTracker: Action not found', { actionId, userId });
      return false;
    }
    
    if (action.userId !== userId) {
      logger.warn('GuidedActionTracker: Action userId mismatch', { actionId, userId, actionUserId: action.userId });
      return false;
    }

    if (action.status !== 'pending') {
      logger.warn('GuidedActionTracker: Action already processed', {
        actionId,
        status: action.status
      });
      return false;
    }

    // Cancelar timeout
    const timeout = this.timeouts.get(actionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(actionId);
    }

    // Actualizar estado
    action.status = 'confirmed';
    action.executedAt = new Date();

    // Ejecutar callback si existe
    if (action.callback) {
      try {
        await action.callback();
        action.status = 'executed';
      } catch (error: any) {
        logger.error('GuidedActionTracker: Error executing callback', {
          error: error?.message,
          actionId
        });
        throw error;
      }
    }

    // ✅ FIX: GuidedAction model no existe en Prisma aún
    // Actualizar en base de datos - DESHABILITADO hasta que se agregue el modelo
    // try {
    //   await prisma.guidedAction.updateMany({
    //     where: { actionId },
    //     data: {
    //       status: 'CONFIRMED',
    //       executedAt: new Date()
    //     }
    //   });
    // } catch (error: any) {
    //   logger.warn('GuidedActionTracker: Could not update database', {
    //     error: error?.message,
    //     actionId
    //   });
    // }

    // Remover de memoria después de un tiempo
    setTimeout(() => {
      this.pendingActions.delete(actionId);
    }, 60 * 1000); // 1 minuto

    logger.info('GuidedActionTracker: Action confirmed', { actionId });

    return true;
  }

  /**
   * Cancelar una acción guided
   */
  async cancelAction(userId: number, actionId: string, data?: any): Promise<boolean> {
    const action = this.pendingActions.get(actionId);

    if (!action) {
      logger.warn('GuidedActionTracker: Action not found', { actionId, userId });
      return false;
    }
    
    if (action.userId !== userId) {
      logger.warn('GuidedActionTracker: Action userId mismatch', { actionId, userId, actionUserId: action.userId });
      return false;
    }

    if (action.status !== 'pending') {
      logger.warn('GuidedActionTracker: Action already processed', {
        actionId,
        status: action.status
      });
      return false;
    }

    // Cancelar timeout
    const timeout = this.timeouts.get(actionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(actionId);
    }

    // Actualizar estado
    action.status = 'cancelled';

    // ✅ FIX: GuidedAction model no existe en Prisma aún
    // Actualizar en base de datos - DESHABILITADO hasta que se agregue el modelo
    // try {
    //   await prisma.guidedAction.updateMany({
    //     where: { actionId },
    //     data: {
    //       status: 'CANCELLED',
    //       executedAt: new Date()
    //     }
    //   });
    // } catch (error: any) {
    //   logger.warn('GuidedActionTracker: Could not update database', {
    //     error: error?.message,
    //     actionId
    //   });
    // }

    // Remover de memoria
    this.pendingActions.delete(actionId);

    logger.info('GuidedActionTracker: Action cancelled', { actionId });

    return true;
  }

  /**
   * Manejar timeout de una acción
   */
  private async handleTimeout(actionId: string): Promise<void> {
    const action = this.pendingActions.get(actionId);

    if (!action) {
      return; // Ya fue procesada
    }

    if (action.status !== 'pending') {
      return; // Ya fue procesada
    }

    // Actualizar estado
    action.status = 'expired';

    // Ejecutar callback si existe (ejecución automática por timeout)
    if (action.callback) {
      try {
        await action.callback();
        action.status = 'executed';
        action.executedAt = new Date();
        logger.info('GuidedActionTracker: Action executed after timeout', { actionId });
      } catch (error: any) {
        logger.error('GuidedActionTracker: Error executing timeout callback', {
          error: error?.message,
          actionId
        });
      }
    }

    // ✅ FIX: GuidedAction model no existe en Prisma aún
    // Actualizar en base de datos - DESHABILITADO hasta que se agregue el modelo
    // try {
    //   await prisma.guidedAction.updateMany({
    //     where: { actionId },
    //     data: {
    //       status: 'EXPIRED',
    //       executedAt: new Date()
    //     }
    //   });
    // } catch (error: any) {
    //   logger.warn('GuidedActionTracker: Could not update database', {
    //     error: error?.message,
    //     actionId
    //   });
    // }

    // Remover timeout
    this.timeouts.delete(actionId);

    // Remover de memoria después de un tiempo
    setTimeout(() => {
      this.pendingActions.delete(actionId);
    }, 60 * 1000); // 1 minuto
  }

  /**
   * Obtener acciones pendientes de un usuario
   */
  async getPendingActions(userId: number, stage?: GuidedAction['stage']): Promise<GuidedAction[]> {
    const actions: GuidedAction[] = [];

    for (const [id, action] of this.pendingActions.entries()) {
      if (action.userId === userId && action.status === 'pending') {
        if (!stage || action.stage === stage) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  /**
   * Verificar si una acción existe y está pendiente
   */
  async isActionPending(actionId: string): Promise<boolean> {
    const action = this.pendingActions.get(actionId);
    return action !== undefined && action.status === 'pending';
  }

  /**
   * Limpiar acciones expiradas
   */
  private async cleanupExpiredActions(): Promise<void> {
    const now = new Date();
    const expiredActions: string[] = [];

    for (const [id, action] of this.pendingActions.entries()) {
      if (action.expiresAt < now && action.status === 'pending') {
        expiredActions.push(id);
      }
    }

    for (const actionId of expiredActions) {
      await this.handleTimeout(actionId);
    }

    if (expiredActions.length > 0) {
      logger.info('GuidedActionTracker: Cleaned up expired actions', {
        count: expiredActions.length
      });
    }
  }

  /**
   * Obtener estadísticas de acciones
   */
  async getStats(userId?: number): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    expired: number;
    executed: number;
  }> {
    const stats = {
      total: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      expired: 0,
      executed: 0
    };

    for (const [id, action] of this.pendingActions.entries()) {
      if (userId && action.userId !== userId) {
        continue;
      }

      stats.total++;
      
      switch (action.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'confirmed':
          stats.confirmed++;
          break;
        case 'cancelled':
          stats.cancelled++;
          break;
        case 'expired':
          stats.expired++;
          break;
        case 'executed':
          stats.executed++;
          break;
      }
    }

    return stats;
  }
}

export const guidedActionTracker = GuidedActionTrackerService.getInstance();

