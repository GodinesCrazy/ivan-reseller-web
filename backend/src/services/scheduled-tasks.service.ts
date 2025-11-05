import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';
import { financialAlertsService } from './financial-alerts.service';
import { prisma } from '../config/database';
import { PayPalPayoutService } from './paypal-payout.service';
import { notificationService } from './notification.service';

/**
 * Scheduled Tasks Service
 * Maneja tareas programadas (cron jobs) usando BullMQ
 */
export class ScheduledTasksService {
  private financialAlertsQueue: Queue | null = null;
  private commissionProcessingQueue: Queue | null = null;
  private financialAlertsWorker: Worker | null = null;
  private commissionProcessingWorker: Worker | null = null;

  constructor() {
    if (isRedisAvailable) {
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
    this.financialAlertsQueue = new Queue('financial-alerts', {
      connection: redis
    });

    this.commissionProcessingQueue = new Queue('commission-processing', {
      connection: redis
    });
  }

  /**
   * Inicializar workers para procesar tareas
   */
  private initializeWorkers(): void {
    if (!isRedisAvailable) return;

    // Worker para alertas financieras
    this.financialAlertsWorker = new Worker(
      'financial-alerts',
      async (job) => {
        logger.info('Scheduled Tasks: Running financial alerts check', { jobId: job.id });
        return await financialAlertsService.runAllChecks();
      },
      {
        connection: redis,
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
        connection: redis,
        concurrency: 1
      }
    );

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
  }

  /**
   * Programar tareas recurrentes
   */
  private scheduleTasks(): void {
    if (!isRedisAvailable || !this.financialAlertsQueue || !this.commissionProcessingQueue) {
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

    logger.info('Scheduled Tasks: Tasks scheduled successfully');
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
          const commissionAmount = commission.amount;
          
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
              if (commission.user.balance >= commissionAmount) {
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
            if (commission.user.balance >= commissionAmount) {
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
    if (this.financialAlertsQueue) {
      await this.financialAlertsQueue.close();
    }
    if (this.commissionProcessingQueue) {
      await this.commissionProcessingQueue.close();
    }
  }
}

export const scheduledTasksService = new ScheduledTasksService();

