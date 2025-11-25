import { Queue, Worker, QueueEvents } from 'bullmq';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';
import { financialAlertsService } from './financial-alerts.service';
import { prisma } from '../config/database';
import { PayPalPayoutService } from './paypal-payout.service';
import { notificationService } from './notification.service';
import { aliExpressAuthMonitor } from './ali-auth-monitor.service';
import fxService from './fx.service';
import { toNumber } from '../utils/decimal.utils';

/**
 * Scheduled Tasks Service
 * Maneja tareas programadas (cron jobs) usando BullMQ
 */
export class ScheduledTasksService {
  private financialAlertsQueue: Queue | null = null;
  private commissionProcessingQueue: Queue | null = null;
  private authHealthQueue: Queue | null = null;
  private fxRatesQueue: Queue | null = null;
  private financialAlertsWorker: Worker | null = null;
  private commissionProcessingWorker: Worker | null = null;
  private authHealthWorker: Worker | null = null;
  private fxRatesWorker: Worker | null = null;

  private bullMQRedis: ReturnType<typeof getBullMQRedisConnection>;

  constructor() {
    this.bullMQRedis = getBullMQRedisConnection();
    
    if (isRedisAvailable && this.bullMQRedis) {
      this.initializeQueues();
      this.initializeWorkers();
      this.scheduleTasks();
    } else {
      logger.warn('Scheduled Tasks: Redis not available - scheduled tasks disabled');
    }
  }

  /**
   * Inicializar colas de trabajos
   */
  private initializeQueues(): void {
    if (!this.bullMQRedis) return;

    this.financialAlertsQueue = new Queue('financial-alerts', {
      connection: this.bullMQRedis as any
    });

    this.commissionProcessingQueue = new Queue('commission-processing', {
      connection: this.bullMQRedis as any
    });

    this.authHealthQueue = new Queue('ali-auth-health', {
      connection: this.bullMQRedis as any
    });

    if (fxService.isProviderEnabled()) {
      this.fxRatesQueue = new Queue('fx-rates-refresh', {
        connection: this.bullMQRedis as any
      });
    }
  }

  /**
   * Inicializar workers para procesar tareas
   */
  private initializeWorkers(): void {
    if (!isRedisAvailable) return;

    if (!this.bullMQRedis) return;

    // Worker para alertas financieras
    this.financialAlertsWorker = new Worker(
      'financial-alerts',
      async (job) => {
        logger.info('Scheduled Tasks: Running financial alerts check', { jobId: job.id });
        return await financialAlertsService.runAllChecks();
      },
      {
        connection: this.bullMQRedis as any,
        concurrency: 1
      }
    );

    // Worker para procesamiento de comisiones
    this.commissionProcessingWorker = new Worker(
      'commission-processing',
      async (job) => {
        logger.info('Scheduled Tasks: Processing commissions', { jobId: job.id });
        return await this.processCommissions();
      },
      {
        connection: this.bullMQRedis as any,
        concurrency: 1
      }
    );

    this.authHealthWorker = new Worker(
      'ali-auth-health',
      async (job) => {
        logger.info('Scheduled Tasks: Running AliExpress auth health check', { jobId: job.id });
        return await this.runAliExpressHealthCheck();
      },
      {
        connection: this.bullMQRedis as any,
        concurrency: 1
      }
    );

    if (this.fxRatesQueue) {
      this.fxRatesWorker = new Worker(
        'fx-rates-refresh',
        async (job) => {
          logger.info('Scheduled Tasks: Refreshing FX rates', { jobId: job.id });
          await fxService.refreshRates();
          return fxService.getRates();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1
        }
      );
    }

    // Event listeners
    this.financialAlertsWorker.on('completed', (job) => {
      logger.info('Scheduled Tasks: Financial alerts check completed', { jobId: job.id });
    });

    this.financialAlertsWorker.on('failed', (job, err) => {
      logger.error('Scheduled Tasks: Financial alerts check failed', {
        jobId: job?.id,
        error: err.message
      });
    });

    this.commissionProcessingWorker.on('completed', (job) => {
      logger.info('Scheduled Tasks: Commission processing completed', { jobId: job.id });
    });

    this.commissionProcessingWorker.on('failed', (job, err) => {
      logger.error('Scheduled Tasks: Commission processing failed', {
        jobId: job?.id,
        error: err.message
      });
    });

    this.authHealthWorker.on('completed', (job) => {
      logger.info('Scheduled Tasks: AliExpress auth health check completed', { jobId: job.id });
    });

    this.authHealthWorker.on('failed', (job, err) => {
      logger.error('Scheduled Tasks: AliExpress auth health check failed', {
        jobId: job?.id,
        error: err.message
      });
    });

    if (this.fxRatesWorker) {
      this.fxRatesWorker.on('completed', (job) => {
        logger.info('Scheduled Tasks: FX rates refresh completed', { jobId: job.id });
      });

      this.fxRatesWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: FX rates refresh failed', {
          jobId: job?.id,
          error: err.message,
        });
      });
    }
  }

  /**
   * Programar tareas recurrentes
   */
  private scheduleTasks(): void {
    if (!isRedisAvailable || !this.financialAlertsQueue || !this.commissionProcessingQueue || !this.authHealthQueue) {
      return;
    }

    // Alertas financieras: cada día a las 6:00 AM
    this.financialAlertsQueue.add(
      'daily-financial-alerts',
      {},
      {
        repeat: {
          pattern: '0 6 * * *' // 6:00 AM todos los días
        },
        removeOnComplete: 10,
        removeOnFail: 5
      }
    );

    // Procesamiento de comisiones: cada día a las 2:00 AM
    this.commissionProcessingQueue.add(
      'daily-commission-processing',
      {},
      {
        repeat: {
          pattern: '0 2 * * *' // 2:00 AM todos los días
        },
        removeOnComplete: 10,
        removeOnFail: 5
      }
    );

    // Verificación de AliExpress: cada día a las 4:00 AM
    this.authHealthQueue.add(
      'daily-aliexpress-auth-health',
      {},
      {
        repeat: {
          pattern: '0 4 * * *' // 4:00 AM todos los días
        },
        removeOnComplete: 5,
        removeOnFail: 5
      }
    );

    if (this.fxRatesQueue) {
      this.fxRatesQueue.add(
        'daily-fx-refresh',
        {},
        {
          repeat: {
            pattern: process.env.FX_REFRESH_CRON || '0 1 * * *', // 1:00 AM todos los días por defecto
          },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    logger.info('Scheduled Tasks: Tasks scheduled successfully');
  }

  private async runAliExpressHealthCheck(): Promise<{
    processed: number;
    success: number;
    manualRequired: Array<{ userId: number; username: string; reason?: string }>;
    skipped: Array<{ userId: number; username: string; reason?: string }>;
    errors: Array<{ userId: number; username: string; error: string }>;
  }> {
    const credentials = await prisma.apiCredential.findMany({
      where: {
        apiName: 'aliexpress',
        scope: 'user',
        isActive: true,
      },
      select: {
        userId: true,
        user: {
          select: {
            username: true,
            role: true,
          },
        },
      },
    });

    const uniqueUsers = new Map<number, { username: string }>();
    credentials.forEach((entry) => {
      const username = entry.user?.username || `user-${entry.userId}`;
      uniqueUsers.set(entry.userId, { username });
    });

    const manualRequired: Array<{ userId: number; username: string; reason?: string }> = [];
    const skipped: Array<{ userId: number; username: string; reason?: string }> = [];
    const errors: Array<{ userId: number; username: string; error: string }> = [];
    let success = 0;

    for (const [userId, meta] of uniqueUsers.entries()) {
      try {
        const result = await aliExpressAuthMonitor.refreshNow(userId, {
          force: true,
          reason: 'daily-health-check',
        });

        if (result?.success) {
          success += 1;
          continue;
        }

        const reason = (result && 'reason' in result && typeof result.reason === 'string') ? result.reason : undefined;

        if (result?.manualRequired || reason === 'manual_required' || reason === 'missing' || reason === 'expired') {
          manualRequired.push({ userId, username: meta.username, reason });
        } else if (result?.skipped) {
          skipped.push({ userId, username: meta.username, reason });
        } else {
          errors.push({
            userId,
            username: meta.username,
            error: reason || 'unknown-state',
          });
        }
      } catch (error: any) {
        errors.push({
          userId,
          username: meta.username,
          error: error?.message || String(error),
        });
      }
    }

    const totalProcessed = uniqueUsers.size;

    if (totalProcessed === 0) {
      notificationService.sendToRole('ADMIN', {
        type: 'SYSTEM_ALERT',
        title: 'Reporte diario AliExpress',
        message: 'No se encontraron usuarios con credenciales personales de AliExpress activas para verificar.',
        priority: 'NORMAL',
        category: 'SYSTEM',
      });

      return {
        processed: 0,
        success: 0,
        manualRequired,
        skipped,
        errors,
      };
    }

    const summaryLines = [
      `Usuarios verificados: ${totalProcessed}`,
      `• Sesión saludable: ${success}`,
      `• Acción manual requerida: ${manualRequired.length}`,
      `• Saltados: ${skipped.length}`,
      `• Errores: ${errors.length}`,
    ];

    if (manualRequired.length > 0) {
      summaryLines.push(
        `👤 Manual: ${manualRequired
          .map((item) => `${item.username}${item.reason ? ` (${item.reason})` : ''}`)
          .join(', ')}`
      );
    }

    if (errors.length > 0) {
      summaryLines.push(
        `⚠️ Errores: ${errors
          .map((item) => `${item.username}: ${item.error}`)
          .join('; ')}`
      );
    }

    const priority =
      manualRequired.length > 0 || errors.length > 0
        ? 'HIGH'
        : 'NORMAL';

    notificationService.sendToRole('ADMIN', {
      type: 'SYSTEM_ALERT',
      title: 'Reporte diario AliExpress',
      message: summaryLines.join('\n'),
      priority,
      category: 'SYSTEM',
    });

    return {
      processed: totalProcessed,
      success,
      manualRequired,
      skipped,
      errors,
    };
  }

  /**
   * Procesar comisiones pendientes automáticamente con PayPal
   */
  private async processCommissions(): Promise<{
    processed: number;
    totalAmount: number;
    paypalProcessed: number;
    paypalAmount: number;
    errors: Array<{ commissionId: string; error: string }>;
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
              email: true,
              balance: true,
              fixedMonthlyCost: true,
              commissionRate: true
            }
          },
          sale: {
            select: {
              id: true,
              orderId: true,
              grossProfit: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc' // Procesar las más antiguas primero
        },
        take: 100 // Limitar a 100 comisiones por ejecución para evitar timeouts
      });

      let processed = 0;
      let totalAmount = 0;
      let paypalProcessed = 0;
      let paypalAmount = 0;
      const errors: Array<{ commissionId: string; error: string }> = [];

      // Intentar inicializar PayPal Payout Service
      let paypalService: PayPalPayoutService | null = null;
      try {
        paypalService = PayPalPayoutService.fromEnv();
      } catch (error) {
        logger.warn('Scheduled Tasks: PayPal service not available, processing without PayPal', { error });
      }

      for (const commission of pendingCommissions) {
        try {
          // ✅ Convertir Decimal a number para operaciones aritméticas
          const commissionAmount = toNumber(commission.amount);
          
          // Si PayPal está disponible y el monto es mayor a $1, procesar con PayPal
          if (paypalService && commissionAmount >= 1.0) {
            try {
              const payoutResult = await paypalService.sendPayout({
                recipientEmail: commission.user.email,
                amount: commissionAmount,
                currency: 'USD',
                note: `Comisión por venta - Order: ${commission.sale.orderId}`,
                senderItemId: `commission_${commission.id}`
              });

              if (payoutResult.success && payoutResult.items && payoutResult.items.length > 0) {
                const payoutItem = payoutResult.items[0];
                
                // Actualizar comisión como pagada con PayPal
                await prisma.commission.update({
                  where: { id: commission.id },
                  data: {
                    status: 'PAID',
                    paidAt: new Date()
                    // Nota: Si el schema tiene paypalTransactionId, agregarlo aquí
                    // paypalTransactionId: payoutItem.transactionId
                  }
                });

                // Notificar al usuario
                notificationService.sendToUser(commission.userId, {
                  type: 'SALE_CREATED',
                  title: 'Comisión Pagada',
                  message: `Has recibido $${commissionAmount.toFixed(2)} en tu cuenta PayPal`,
                  priority: 'HIGH',
                  category: 'SALE',
                  data: {
                    commissionId: commission.id,
                    amount: commissionAmount,
                    paypalTransactionId: payoutItem.transactionId
                  }
                });

                paypalProcessed++;
                paypalAmount += commissionAmount;
                processed++;
                totalAmount += commissionAmount;

                logger.info('Scheduled Tasks: Commission processed with PayPal', {
                  commissionId: commission.id,
                  userId: commission.userId,
                  amount: commissionAmount,
                  paypalTransactionId: payoutItem.transactionId
                });
              } else {
                throw new Error('PayPal payout no completado correctamente');
              }
            } catch (paypalError: any) {
              // Si falla PayPal, procesar normalmente (descontar del balance)
              logger.warn('Scheduled Tasks: PayPal payout failed, processing normally', {
                commissionId: commission.id,
                error: paypalError.message
              });

              // Continuar con procesamiento normal
              const userBalance = toNumber(commission.user.balance);
              if (userBalance >= commissionAmount) {
                await prisma.user.update({
                  where: { id: commission.userId },
                  data: {
                    balance: {
                      decrement: commissionAmount
                    }
                  }
                });

                await prisma.commission.update({
                  where: { id: commission.id },
                  data: {
                    status: 'PAID',
                    paidAt: new Date()
                  }
                });

                processed++;
                totalAmount += commissionAmount;
              } else {
                errors.push({
                  commissionId: String(commission.id),
                  error: 'Insufficient balance and PayPal failed'
                });
              }
            }
          } else {
            // Procesamiento normal sin PayPal (descontar del balance)
            const userBalance = toNumber(commission.user.balance);
            if (userBalance >= commissionAmount) {
              await prisma.user.update({
                where: { id: commission.userId },
                data: {
                  balance: {
                    decrement: commissionAmount
                  }
                }
              });

              await prisma.commission.update({
                where: { id: commission.id },
                data: {
                  status: 'PAID',
                  paidAt: new Date()
                }
              });

              processed++;
              totalAmount += commissionAmount;
            } else {
              logger.warn('Scheduled Tasks: Insufficient balance for commission', {
                commissionId: commission.id,
                userId: commission.userId,
                balance: commission.user.balance,
                commissionAmount
              });
              errors.push({
                commissionId: String(commission.id),
                error: 'Insufficient balance'
              });
            }
          }
        } catch (error: any) {
          errors.push({
            commissionId: String(commission.id),
            error: error.message
          });
          logger.error('Scheduled Tasks: Error processing commission', {
            commissionId: commission.id,
            error: error.message
          });
        }
      }

      return {
        processed,
        totalAmount,
        paypalProcessed,
        paypalAmount,
        errors
      };
    } catch (error) {
      logger.error('Scheduled Tasks: Error in processCommissions', { error });
      throw error;
    }
  }

  /**
   * Ejecutar verificación de alertas manualmente
   */
  async runFinancialAlertsManually(): Promise<void> {
    if (!isRedisAvailable || !this.financialAlertsQueue) {
      throw new Error('Redis not available');
    }

    await this.financialAlertsQueue.add('manual-financial-alerts', {});
  }

  /**
   * Ejecutar procesamiento de comisiones manualmente
   */
  async processCommissionsManually(): Promise<void> {
    if (!isRedisAvailable || !this.commissionProcessingQueue) {
      throw new Error('Redis not available');
    }

    await this.commissionProcessingQueue.add('manual-commission-processing', {});
  }

  /**
   * Obtener estado de las tareas programadas
   */
  async getScheduledTasksStatus(): Promise<{
    financialAlerts: {
      nextRun: Date | null;
      lastRun: Date | null;
    };
    commissionProcessing: {
      nextRun: Date | null;
      lastRun: Date | null;
    };
  }> {
    if (!isRedisAvailable || !this.financialAlertsQueue || !this.commissionProcessingQueue) {
      return {
        financialAlerts: { nextRun: null, lastRun: null },
        commissionProcessing: { nextRun: null, lastRun: null }
      };
    }

    // Obtener información de las colas (requiere acceso a Redis directamente)
    // Por ahora retornamos estructura básica
    return {
      financialAlerts: {
        nextRun: null, // TODO: Implementar usando QueueEvents
        lastRun: null
      },
      commissionProcessing: {
        nextRun: null,
        lastRun: null
      }
    };
  }

  /**
   * Cerrar workers y limpiar recursos
   */
  async shutdown(): Promise<void> {
    if (this.financialAlertsWorker) {
      await this.financialAlertsWorker.close();
    }
    if (this.commissionProcessingWorker) {
      await this.commissionProcessingWorker.close();
    }
    if (this.authHealthWorker) {
      await this.authHealthWorker.close();
    }
    if (this.fxRatesWorker) {
      await this.fxRatesWorker.close();
    }
    if (this.financialAlertsQueue) {
      await this.financialAlertsQueue.close();
    }
    if (this.commissionProcessingQueue) {
      await this.commissionProcessingQueue.close();
    }
    if (this.authHealthQueue) {
      await this.authHealthQueue.close();
    }
    if (this.fxRatesQueue) {
      await this.fxRatesQueue.close();
    }
  }
}

export const scheduledTasksService = new ScheduledTasksService();

