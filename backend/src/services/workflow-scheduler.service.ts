import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import logger from '../config/logger';
import { workflowService } from './workflow.service';
import { workflowExecutorService } from './workflow-executor.service';

const prisma = new PrismaClient();

interface ScheduledTask {
  workflowId: number;
  userId: number;
  cronTask: cron.ScheduledTask;
  schedule: string;
}

/**
 * ✅ Q2: Scheduler de Workflows Personalizados
 * 
 * Este servicio programa y ejecuta workflows automáticamente según su cron expression,
 * sin interferir con el autopilot básico.
 * 
 * COEXISTENCIA CON AUTOPILOT BÁSICO:
 * - Autopilot básico: usa setTimeout() para ciclos recurrentes (controlado por autopilotSystem)
 * - Workflows personalizados: usa node-cron para ejecuciones programadas (controlado por este scheduler)
 * - Ambos sistemas son independientes y no comparten recursos ni conflictos
 * - Cada workflow personalizado puede ejecutarse independientemente según su schedule
 */
export class WorkflowSchedulerService {
  private scheduledTasks: Map<number, ScheduledTask> = new Map();
  private isInitialized: boolean = false;

  /**
   * ✅ Q2: Inicializar scheduler con manejo robusto de errores
   * No lanza errores para no bloquear el inicio del servidor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('WorkflowScheduler: Ya está inicializado');
      return;
    }

    try {
      logger.info('WorkflowScheduler: Inicializando scheduler de workflows personalizados...');

      // ✅ Q2: Cargar workflows habilitados con schedule desde BD
      await this.reloadScheduledWorkflows();

      this.isInitialized = true;
      logger.info('WorkflowScheduler: Inicializado correctamente', {
        scheduledWorkflows: this.scheduledTasks.size,
        initialized: true
      });
    } catch (error: any) {
      // ✅ Q2: No lanzar error para no bloquear el servidor
      // El scheduler puede inicializarse más tarde si es necesario
      logger.error('WorkflowScheduler: Error al inicializar (continuando sin scheduler)', {
        error: error.message || String(error),
        stack: error.stack
      });
      
      // Marcar como no inicializado pero continuar
      this.isInitialized = false;
      // No lanzar error - el servidor puede funcionar sin el scheduler
    }
  }

  /**
   * ✅ Q2: Recargar workflows programados desde BD con manejo robusto de errores
   */
  async reloadScheduledWorkflows(): Promise<void> {
    try {
      // Detener todas las tareas actuales
      this.stopAll();

      // Obtener workflows habilitados con schedule válido
      const workflows = await workflowService.getScheduledWorkflows();

      logger.info('WorkflowScheduler: Cargando workflows programados', {
        count: workflows.length
      });

      let scheduledCount = 0;
      let errorCount = 0;

      // Programar cada workflow con manejo individual de errores
      for (const workflow of workflows) {
        if (workflow.schedule && workflow.schedule !== 'manual') {
          try {
            // Validar expresión cron antes de programar
            if (!cron.validate(workflow.schedule)) {
              logger.error('WorkflowScheduler: Expresión cron inválida, omitiendo workflow', {
                workflowId: workflow.id,
                userId: workflow.userId,
                schedule: workflow.schedule
              });
              errorCount++;
              continue;
            }

            await this.scheduleWorkflow(workflow.id, workflow.userId, workflow.schedule);
            scheduledCount++;

            logger.debug('WorkflowScheduler: Workflow cargado y programado', {
              workflowId: workflow.id,
              userId: workflow.userId,
              schedule: workflow.schedule
            });
          } catch (error: any) {
            // Error individual no debe detener la carga de otros workflows
            logger.error('WorkflowScheduler: Error programando workflow individual', {
              workflowId: workflow.id,
              userId: workflow.userId,
              schedule: workflow.schedule,
              error: error.message || String(error)
            });
            errorCount++;
          }
        }
      }

      logger.info('WorkflowScheduler: Workflows programados', {
        total: this.scheduledTasks.size,
        scheduled: scheduledCount,
        errors: errorCount,
        totalWorkflows: workflows.length
      });
    } catch (error: any) {
      // Error crítico al recargar - loggear pero no lanzar para no bloquear el servidor
      logger.error('WorkflowScheduler: Error crítico al recargar workflows', {
        error: error.message || String(error),
        stack: error.stack
      });
      // No lanzar error para que el servidor pueda continuar
    }
  }

  /**
   * ✅ Programar un workflow
   */
  async scheduleWorkflow(workflowId: number, userId: number, cronExpression: string): Promise<void> {
    try {
      // Validar expresión cron
      if (!cron.validate(cronExpression)) {
        logger.error('WorkflowScheduler: Expresión cron inválida', {
          workflowId,
          cronExpression
        });
        throw new Error(`Expresión cron inválida: ${cronExpression}`);
      }

      // Si ya está programado, detenerlo primero
      if (this.scheduledTasks.has(workflowId)) {
        this.unscheduleWorkflow(workflowId);
      }

      // ✅ Q2: Crear tarea cron con manejo robusto de errores
      const cronTask = cron.schedule(cronExpression, async () => {
        const executionStartTime = Date.now();
        try {
          logger.info('WorkflowScheduler: Ejecutando workflow programado', {
            workflowId,
            userId,
            schedule: cronExpression,
            timestamp: new Date().toISOString()
          });

          // ✅ Q2: Verificar que el workflow todavía existe y está habilitado
          const workflow = await prisma.autopilotWorkflow.findUnique({
            where: { id: workflowId }
          });

          if (!workflow) {
            logger.warn('WorkflowScheduler: Workflow no encontrado, desprogramando', { workflowId });
            this.unscheduleWorkflow(workflowId);
            return;
          }

          if (!workflow.enabled) {
            logger.info('WorkflowScheduler: Workflow deshabilitado, omitiendo ejecución', { workflowId });
            // Desprogramar temporalmente
            this.unscheduleWorkflow(workflowId);
            return;
          }

          // ✅ Q2: Verificar que el schedule no haya cambiado
          if (workflow.schedule !== cronExpression && workflow.schedule !== 'manual') {
            logger.info('WorkflowScheduler: Schedule del workflow cambió, reprogramando', {
              workflowId,
              oldSchedule: cronExpression,
              newSchedule: workflow.schedule
            });
            // Reprogramar con el nuevo schedule
            this.unscheduleWorkflow(workflowId);
            await this.scheduleWorkflow(workflowId, workflow.userId, workflow.schedule);
            return;
          }

          if (workflow.schedule === 'manual') {
            logger.info('WorkflowScheduler: Workflow cambió a manual, desprogramando', { workflowId });
            this.unscheduleWorkflow(workflowId);
            return;
          }

          // ✅ Q2: Ejecutar workflow usando el executor (integración correcta)
          const result = await workflowExecutorService.executeWorkflow(workflowId, userId);

          const executionTime = Date.now() - executionStartTime;

          if (result.success) {
            logger.info('WorkflowScheduler: Workflow ejecutado exitosamente', {
              workflowId,
              userId,
              message: result.message,
              executionTime: `${executionTime}ms`,
              timestamp: new Date().toISOString()
            });
          } else {
            logger.warn('WorkflowScheduler: Workflow ejecutado con errores', {
              workflowId,
              userId,
              message: result.message,
              errors: result.errors,
              executionTime: `${executionTime}ms`,
              timestamp: new Date().toISOString()
            });
          }

          // ✅ Q2: Calcular próxima ejecución y actualizar nextRun en BD
          await this.updateNextRun(workflowId, cronExpression);

        } catch (error: any) {
          // ✅ Q2: Manejo robusto de errores - no bloquear el scheduler ni el servidor
          logger.error('WorkflowScheduler: Error ejecutando workflow programado', {
            workflowId,
            userId,
            error: error.message || String(error),
            stack: error.stack
          });
          
          // Actualizar workflow con el error en los logs (sin actualizar lastRun para no marcar como ejecutado)
          try {
            const workflow = await prisma.autopilotWorkflow.findUnique({ where: { id: workflowId } });
            if (workflow) {
              const existingLogs = (workflow.logs as any[]) || [];
              const errorLog = {
                timestamp: new Date().toISOString(),
                success: false,
                message: `Error ejecutando workflow programado: ${error.message || String(error)}`,
                errors: [error.message || String(error)],
                executionTime: 0,
                data: null
              };
              const updatedLogs = [errorLog, ...existingLogs].slice(0, 50);
              await prisma.autopilotWorkflow.update({
                where: { id: workflowId },
                data: { logs: updatedLogs }
              });
            }
          } catch (logError: any) {
            logger.error('WorkflowScheduler: Error guardando log de error', {
              workflowId,
              error: logError.message
            });
          }
          
          // No lanzar error para que el scheduler continúe con otros workflows
        }
      }, {
        scheduled: true,
        timezone: 'America/New_York' // FUTURE: Usar timezone del usuario desde UserSettings
      });

      // Guardar tarea programada
      this.scheduledTasks.set(workflowId, {
        workflowId,
        userId,
        cronTask,
        schedule: cronExpression
      });

      logger.info('WorkflowScheduler: Workflow programado', {
        workflowId,
        userId,
        cronExpression
      });
    } catch (error: any) {
      logger.error('WorkflowScheduler: Error programando workflow', {
        workflowId,
        userId,
        error: error.message || String(error)
      });
      throw error;
    }
  }

  /**
   * ✅ Desprogramar un workflow
   */
  unscheduleWorkflow(workflowId: number): void {
    const task = this.scheduledTasks.get(workflowId);
    if (task) {
      task.cronTask.stop();
      this.scheduledTasks.delete(workflowId);
      logger.info('WorkflowScheduler: Workflow desprogramado', { workflowId });
    }
  }

  /**
   * ✅ Detener todas las tareas programadas
   */
  stopAll(): void {
    for (const [workflowId, task] of this.scheduledTasks.entries()) {
      task.cronTask.stop();
      logger.debug('WorkflowScheduler: Tarea detenida', { workflowId });
    }
    this.scheduledTasks.clear();
    logger.info('WorkflowScheduler: Todas las tareas detenidas');
  }

  /**
   * ✅ Q2: Calcular y actualizar próxima ejecución en BD
   */
  private async updateNextRun(workflowId: number, cronExpression: string): Promise<void> {
    try {
      // Calcular próxima ejecución basada en cron expression
      const nextRun = this.calculateNextRunTime(cronExpression);

      if (nextRun) {
        await prisma.autopilotWorkflow.update({
          where: { id: workflowId },
          data: { nextRun }
        });
        
        logger.debug('WorkflowScheduler: nextRun actualizado', {
          workflowId,
          nextRun: nextRun.toISOString()
        });
      } else {
        logger.debug('WorkflowScheduler: No se pudo calcular nextRun, se actualizará en próxima ejecución', {
          workflowId,
          cronExpression
        });
      }
    } catch (error: any) {
      // No fallar si no se puede actualizar nextRun - es informativo
      logger.warn('WorkflowScheduler: Error actualizando nextRun', {
        workflowId,
        error: error.message || String(error)
      });
    }
  }

  /**
   * ✅ Q2: Calcular próxima ejecución basada en cron expression
   * Calcula una estimación de la próxima ejecución para patrones comunes
   */
  private calculateNextRunTime(cronExpression: string): Date | null {
    try {
      const now = new Date();
      const parts = cronExpression.trim().split(/\s+/);
      
      if (parts.length !== 5) {
        logger.warn('WorkflowScheduler: Formato cron inválido para calcular nextRun', { cronExpression });
        return null;
      }

      const [minute, hour, day, month, weekday] = parts;
      const nextRun = new Date(now);

      // Caso 1: Cada X minutos (*/X * * * *)
      if (minute.startsWith('*/')) {
        const interval = parseInt(minute.substring(2), 10);
        if (!isNaN(interval) && interval > 0) {
          nextRun.setMinutes(nextRun.getMinutes() + interval);
          nextRun.setSeconds(0);
          nextRun.setMilliseconds(0);
          return nextRun;
        }
      }

      // Caso 2: Minuto específico, cada X horas (minute */X * * *)
      if (minute !== '*' && !minute.includes('/') && hour.startsWith('*/')) {
        const hourInterval = parseInt(hour.substring(2), 10);
        const minuteValue = parseInt(minute, 10);
        if (!isNaN(hourInterval) && hourInterval > 0 && !isNaN(minuteValue)) {
          nextRun.setHours(nextRun.getHours() + hourInterval);
          nextRun.setMinutes(minuteValue);
          nextRun.setSeconds(0);
          nextRun.setMilliseconds(0);
          // Si ya pasó la hora de hoy, programar para mañana
          if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
          }
          return nextRun;
        }
      }

      // Caso 3: Diario a hora específica (minute hour * * *)
      if (minute !== '*' && !minute.includes('/') && hour !== '*' && !hour.includes('/') && day === '*' && month === '*') {
        const minuteValue = parseInt(minute, 10);
        const hourValue = parseInt(hour, 10);
        if (!isNaN(minuteValue) && !isNaN(hourValue)) {
          nextRun.setHours(hourValue);
          nextRun.setMinutes(minuteValue);
          nextRun.setSeconds(0);
          nextRun.setMilliseconds(0);
          // Si ya pasó la hora de hoy, programar para mañana
          if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
          }
          return nextRun;
        }
      }

      // Para otros patrones complejos, retornar null
      // El workflow se ejecutará cuando cron lo dispare
      logger.debug('WorkflowScheduler: Patrón cron complejo, no se calcula nextRun', { cronExpression });
      return null;
    } catch (error: any) {
      logger.warn('WorkflowScheduler: Error calculando nextRun', {
        cronExpression,
        error: error.message
      });
      return null;
    }
  }

  /**
   * ✅ Obtener estado del scheduler
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      scheduledWorkflows: this.scheduledTasks.size,
      workflows: Array.from(this.scheduledTasks.values()).map(task => ({
        workflowId: task.workflowId,
        userId: task.userId,
        schedule: task.schedule
      }))
    };
  }

  /**
   * ✅ Shutdown graceful
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('WorkflowScheduler: Deteniendo scheduler...');
      this.stopAll();
      this.isInitialized = false;
      logger.info('WorkflowScheduler: Scheduler detenido');
    } catch (error: any) {
      logger.error('WorkflowScheduler: Error durante shutdown', {
        error: error.message || String(error)
      });
    }
  }
}

export const workflowSchedulerService = new WorkflowSchedulerService();

