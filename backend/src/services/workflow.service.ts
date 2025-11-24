import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import logger from '../config/logger';
import { workflowConfigService } from './workflow-config.service';
import * as cron from 'node-cron';

const prisma = new PrismaClient();

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  type: 'search' | 'analyze' | 'publish' | 'reprice' | 'custom';
  enabled?: boolean;
  schedule?: string; // Cron expression
  conditions?: Record<string, any>;
  actions?: Record<string, any>;
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  type?: 'search' | 'analyze' | 'publish' | 'reprice' | 'custom';
  enabled?: boolean;
  schedule?: string;
  conditions?: Record<string, any>;
  actions?: Record<string, any>;
}

/**
 * ✅ FASE 2: Servicio para gestionar workflows personalizados de Autopilot
 * 
 * Este servicio permite crear, leer, actualizar y eliminar workflows personalizados
 * sin afectar el autopilot básico ni la configuración global de workflow.
 */
export class WorkflowService {
  /**
   * Validar expresión cron básica usando node-cron
   * Formato: minuto hora día mes día-semana
   * Ejemplos válidos:
   * - "0 */6 * * *" para cada 6 horas
   * - "0 0 * * *" para diario a medianoche
   * - "*/15 * * * *" para cada 15 minutos
   * - "manual" para solo ejecución manual
   */
  private validateCronExpression(schedule?: string): boolean {
    if (!schedule || schedule === 'manual') {
      return true; // manual es válido
    }

    // Usar node-cron para validar la expresión
    // node-cron.validate puede lanzar error o retornar boolean según la versión
    try {
      if (typeof cron.validate === 'function') {
        const result = cron.validate(schedule);
        return result === true || result === undefined;
      }
      // Si no existe validate, intentar crear un schedule para validar
      const testTask = cron.schedule(schedule, () => {});
      if (testTask) {
        testTask.stop();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * ✅ Q1: Calcular próxima ejecución basada en cron expression
   * Usa node-cron para validar y estimar próxima ejecución
   */
  private calculateNextRun(schedule?: string): Date | null {
    if (!schedule || schedule === 'manual') {
      return null; // Sin próxima ejecución para manual
    }

    try {
      // Usar node-cron para validar y estimar próxima ejecución aproximada
      // Para cálculo preciso, el scheduler usa su propia lógica
      // Por ahora retornamos una estimación basada en el patrón
      const now = new Date();
      
      // Intentar parsear el cron expression básico
      const parts = schedule.trim().split(/\s+/);
      if (parts.length !== 5) {
        logger.warn('Cron expression no válida para calcular nextRun', { schedule });
        return null;
      }

      // Estimación simple: para expresiones comunes, calcular próxima ejecución aproximada
      // El scheduler calculará el tiempo exacto
      const [minute, hour, day, month, weekday] = parts;
      
      // Si es "cada X minutos", estimar próxima ejecución
      if (minute.startsWith('*/')) {
        const interval = parseInt(minute.substring(2), 10);
        if (!isNaN(interval) && interval > 0) {
          const next = new Date(now);
          next.setMinutes(next.getMinutes() + interval);
          return next;
        }
      }
      
      // Si es "cada X horas"
      if (minute === '0' && hour.startsWith('*/')) {
        const interval = parseInt(hour.substring(2), 10);
        if (!isNaN(interval) && interval > 0) {
          const next = new Date(now);
          next.setHours(next.getHours() + interval);
          next.setMinutes(0);
          next.setSeconds(0);
          return next;
        }
      }
      
      // Para otros patrones, dejar que el scheduler calcule
      // Retornar null para que el scheduler lo calcule después
      return null;
    } catch (error: any) {
      logger.warn('Error calculando nextRun, el scheduler lo calculará', {
        schedule,
        error: error.message
      });
      return null;
    }
  }

  /**
   * ✅ Crear workflow personalizado
   */
  async createWorkflow(userId: number, data: CreateWorkflowDto) {
    // Validar que el usuario existe
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    // Validar tipo
    const validTypes = ['search', 'analyze', 'publish', 'reprice', 'custom'];
    if (!validTypes.includes(data.type)) {
      throw new AppError(`Tipo de workflow inválido. Debe ser uno de: ${validTypes.join(', ')}`, 400);
    }

    // Validar cron expression si se proporciona
    if (data.schedule && !this.validateCronExpression(data.schedule)) {
      throw new AppError('Expresión cron inválida. Formato: "minuto hora día mes día-semana" o "manual"', 400);
    }

    // Validar que el nombre no esté vacío
    if (!data.name || data.name.trim().length === 0) {
      throw new AppError('El nombre del workflow es requerido', 400);
    }

    // Validar que no exista otro workflow con el mismo nombre para este usuario
    const existing = await prisma.autopilotWorkflow.findFirst({
      where: {
        userId,
        name: data.name.trim()
      }
    });

    if (existing) {
      throw new AppError('Ya existe un workflow con este nombre para tu usuario', 400);
    }

    // Calcular nextRun si hay schedule
    const nextRun = data.schedule && data.schedule !== 'manual' 
      ? this.calculateNextRun(data.schedule) 
      : null;

    // Crear workflow
    const workflow = await prisma.autopilotWorkflow.create({
      data: {
        userId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        type: data.type,
        enabled: data.enabled !== undefined ? data.enabled : true,
        schedule: data.schedule || null,
        conditions: data.conditions || null,
        actions: data.actions || null,
        nextRun,
        runCount: 0
      }
    });

    logger.info('Workflow creado', {
      workflowId: workflow.id,
      userId,
      name: workflow.name,
      type: workflow.type
    });

    // ✅ Q1: Si el workflow tiene schedule válido y está habilitado, programarlo en el scheduler
    if (workflow.enabled && workflow.schedule && workflow.schedule !== 'manual') {
      try {
        const { workflowSchedulerService } = await import('./workflow-scheduler.service');
        await workflowSchedulerService.scheduleWorkflow(workflow.id, userId, workflow.schedule);
      } catch (error: any) {
        // No fallar si el scheduler no está disponible (puede estar iniciando)
        logger.warn('No se pudo programar el workflow en el scheduler al crearlo', {
          workflowId: workflow.id,
          error: error.message
        });
      }
    }

    return workflow;
  }

  /**
   * ✅ Obtener todos los workflows del usuario
   */
  async getUserWorkflows(userId: number) {
    const workflows = await prisma.autopilotWorkflow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return workflows;
  }

  /**
   * ✅ Obtener workflow por ID (con validación de ownership)
   */
  async getWorkflowById(id: number, userId: number) {
    const workflow = await prisma.autopilotWorkflow.findUnique({
      where: { id }
    });

    if (!workflow) {
      throw new AppError('Workflow no encontrado', 404);
    }

    // Validar ownership
    if (workflow.userId !== userId) {
      throw new AppError('No tienes permiso para acceder a este workflow', 403);
    }

    return workflow;
  }

  /**
   * ✅ Actualizar workflow
   */
  async updateWorkflow(id: number, userId: number, data: UpdateWorkflowDto) {
    // Verificar que el workflow existe y pertenece al usuario
    const existing = await this.getWorkflowById(id, userId);

    // Validar tipo si se proporciona
    if (data.type) {
      const validTypes = ['search', 'analyze', 'publish', 'reprice', 'custom'];
      if (!validTypes.includes(data.type)) {
        throw new AppError(`Tipo de workflow inválido. Debe ser uno de: ${validTypes.join(', ')}`, 400);
      }
    }

    // Validar cron expression si se proporciona
    if (data.schedule !== undefined && !this.validateCronExpression(data.schedule)) {
      throw new AppError('Expresión cron inválida. Formato: "minuto hora día mes día-semana" o "manual"', 400);
    }

    // Validar nombre único si se cambia
    if (data.name && data.name.trim() !== existing.name) {
      const duplicate = await prisma.autopilotWorkflow.findFirst({
        where: {
          userId,
          name: data.name.trim(),
          id: { not: id }
        }
      });

      if (duplicate) {
        throw new AppError('Ya existe un workflow con este nombre para tu usuario', 400);
      }
    }

    // Calcular nextRun si se cambia el schedule
    let nextRun = existing.nextRun;
    if (data.schedule !== undefined) {
      nextRun = data.schedule && data.schedule !== 'manual' 
        ? this.calculateNextRun(data.schedule) 
        : null;
    }

    // Actualizar workflow
    const updated = await prisma.autopilotWorkflow.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.type && { type: data.type }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.schedule !== undefined && { schedule: data.schedule || null }),
        ...(data.conditions !== undefined && { conditions: data.conditions || null }),
        ...(data.actions !== undefined && { actions: data.actions || null }),
        ...(nextRun !== existing.nextRun && { nextRun })
      }
    });

    logger.info('Workflow actualizado', {
      workflowId: id,
      userId,
      changes: Object.keys(data)
    });

    // ✅ Q1: Si se actualizó el schedule o enabled, notificar al scheduler para recargar
    if (data.schedule !== undefined || data.enabled !== undefined) {
      try {
        const { workflowSchedulerService } = await import('./workflow-scheduler.service');
        // Si el workflow tiene schedule válido y está habilitado, programarlo
        if (updated.enabled && updated.schedule && updated.schedule !== 'manual') {
          await workflowSchedulerService.scheduleWorkflow(updated.id, updated.userId, updated.schedule);
        } else {
          // Si se deshabilitó o cambió a manual, desprogramarlo
          workflowSchedulerService.unscheduleWorkflow(updated.id);
        }
      } catch (error: any) {
        // No fallar si el scheduler no está disponible (puede estar iniciando)
        logger.warn('No se pudo notificar al scheduler sobre cambio de workflow', {
          workflowId: id,
          error: error.message
        });
      }
    }

    return updated;
  }

  /**
   * ✅ Eliminar workflow
   */
  async deleteWorkflow(id: number, userId: number) {
    // Verificar que el workflow existe y pertenece al usuario
    await this.getWorkflowById(id, userId);

    // Eliminar workflow
    await prisma.autopilotWorkflow.delete({
      where: { id }
    });

    logger.info('Workflow eliminado', {
      workflowId: id,
      userId
    });

    // ✅ Q1: Desprogramar el workflow del scheduler antes de eliminarlo
    try {
      const { workflowSchedulerService } = await import('./workflow-scheduler.service');
      workflowSchedulerService.unscheduleWorkflow(id);
    } catch (error: any) {
      // No fallar si el scheduler no está disponible
      logger.warn('No se pudo desprogramar el workflow del scheduler antes de eliminarlo', {
        workflowId: id,
        error: error.message
      });
    }

    return { success: true, message: 'Workflow eliminado correctamente' };
  }

  /**
   * ✅ Activar/desactivar workflow
   */
  async toggleWorkflow(id: number, userId: number, enabled: boolean) {
    // Verificar que el workflow existe y pertenece al usuario
    await this.getWorkflowById(id, userId);

    // Actualizar estado
    const updated = await prisma.autopilotWorkflow.update({
      where: { id },
      data: { enabled }
    });

    logger.info('Workflow activado/desactivado', {
      workflowId: id,
      userId,
      enabled
    });

    // ✅ Q1: Si se deshabilitó, desprogramarlo del scheduler. Si se habilitó y tiene schedule, programarlo
    try {
      const { workflowSchedulerService } = await import('./workflow-scheduler.service');
      if (enabled && updated.schedule && updated.schedule !== 'manual') {
        await workflowSchedulerService.scheduleWorkflow(id, userId, updated.schedule);
      } else {
        workflowSchedulerService.unscheduleWorkflow(id);
      }
    } catch (error: any) {
      // No fallar si el scheduler no está disponible
      logger.warn('No se pudo actualizar el scheduler al activar/desactivar workflow', {
        workflowId: id,
        error: error.message
      });
    }

    return updated;
  }

  /**
   * ✅ Ejecutar workflow manualmente
   * Delega la ejecución real al workflow-executor.service.ts
   */
  async executeWorkflow(id: number, userId: number) {
    // Verificar que el workflow existe y pertenece al usuario
    const workflow = await this.getWorkflowById(id, userId);

    // Verificar que esté habilitado
    if (!workflow.enabled) {
      throw new AppError('El workflow está deshabilitado. Actívalo antes de ejecutarlo', 400);
    }

    // Importar y usar el executor
    const { workflowExecutorService } = await import('./workflow-executor.service');
    const executionResult = await workflowExecutorService.executeWorkflow(id, userId);

    // Obtener workflow actualizado
    const updated = await prisma.autopilotWorkflow.findUnique({
      where: { id }
    });

    return {
      workflow: updated,
      executed: executionResult.success,
      message: executionResult.message,
      result: executionResult
    };
  }

  /**
   * ✅ Obtener workflows habilitados con schedule para el scheduler
   */
  async getScheduledWorkflows() {
    const workflows = await prisma.autopilotWorkflow.findMany({
      where: {
        enabled: true,
        schedule: { not: null },
        OR: [
          { schedule: { not: 'manual' } },
          { schedule: null }
        ]
      },
      orderBy: { nextRun: 'asc' }
    });

    // Filtrar solo los que tienen schedule válido (no null ni 'manual')
    return workflows.filter(w => w.schedule && w.schedule !== 'manual');
  }
}

export const workflowService = new WorkflowService();

