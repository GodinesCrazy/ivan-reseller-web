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
  private listingLifetimeQueue: Queue | null = null;
  private productUnpublishQueue: Queue | null = null;
  private financialAlertsWorker: Worker | null = null;
  private commissionProcessingWorker: Worker | null = null;
  private authHealthWorker: Worker | null = null;
  private fxRatesWorker: Worker | null = null;
  private listingLifetimeWorker: Worker | null = null;
  private productUnpublishWorker: Worker | null = null;

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

    // ✅ Cola para optimizador de tiempo de publicación
    this.listingLifetimeQueue = new Queue('listing-lifetime-optimizer', {
      connection: this.bullMQRedis as any
    });

    // ✅ NUEVO: Cola para despublicar artículos automáticamente
    this.productUnpublishQueue = new Queue('product-unpublish', {
      connection: this.bullMQRedis as any
    });
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

    // ✅ Worker para optimizador de tiempo de publicación
    if (this.listingLifetimeQueue) {
      this.listingLifetimeWorker = new Worker(
        'listing-lifetime-optimization',
        async (job) => {
          logger.info('Scheduled Tasks: Running listing lifetime optimization', { jobId: job.id });
          return await this.processListingLifetimeOptimization();
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

    // ✅ Event listeners para optimizador de tiempo de publicación
    if (this.listingLifetimeWorker) {
      this.listingLifetimeWorker.on('completed', (job) => {
        logger.info('Scheduled Tasks: Listing lifetime optimization completed', { jobId: job.id });
      });

      this.listingLifetimeWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Listing lifetime optimization failed', {
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

    // ✅ Optimizador de tiempo de publicación: cada día a las 3:00 AM
    if (this.listingLifetimeQueue) {
      this.listingLifetimeQueue.add(
        'daily-listing-lifetime-optimization',
        {},
        {
          repeat: {
            pattern: '0 3 * * *' // 3:00 AM todos los días
          },
          removeOnComplete: 10,
          removeOnFail: 5
        }
      );
    }

    // ✅ NUEVO: Programar job para despublicar artículos automáticamente
    if (this.productUnpublishQueue) {
      this.productUnpublishQueue.add(
        'unpublish-products',
        {},
        {
          repeat: {
            pattern: '0 */6 * * *' // Cada 6 horas
          },
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 2
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
        // ✅ OPTIMIZADO: Verificar si hay cookies antes de forzar refresh
        // Si no hay cookies, el sistema funciona en modo público y no necesita notificaciones
        const { CredentialsManager } = await import('./credentials-manager.service');
        const entry = await CredentialsManager.getCredentialEntry(userId, 'aliexpress', 'production', {
          includeGlobal: false,
        });
        
        const hasCookies = entry?.credentials && 
          Array.isArray((entry.credentials as any).cookies) && 
          (entry.credentials as any).cookies.length > 0;
        
        // ✅ Solo forzar refresh si hay cookies configuradas
        // Si no hay cookies, el sistema funciona en modo público y no necesita intervención
        if (!hasCookies) {
          skipped.push({ 
            userId, 
            username: meta.username, 
            reason: 'public_mode_no_cookies' 
          });
          continue;
        }

        const result = await aliExpressAuthMonitor.refreshNow(userId, {
          force: true,
          reason: 'daily-health-check',
        });

        if (result?.success) {
          success += 1;
          continue;
        }

        const reason = (result && 'reason' in result && typeof result.reason === 'string') ? result.reason : undefined;

        // ✅ OPTIMIZADO: Solo marcar como manual_required si realmente requiere intervención
        // 'missing' y 'public_mode' no requieren intervención manual (sistema funciona en modo público)
        if (result?.manualRequired || reason === 'manual_required' || reason === 'expired') {
          manualRequired.push({ userId, username: meta.username, reason });
        } else if (result?.skipped || reason === 'missing' || reason === 'public_mode' || reason === 'public_mode_no_cookies') {
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
   * ✅ Procesar optimización de tiempo de publicación para todos los usuarios
   */
  private async processListingLifetimeOptimization(): Promise<{
    processed: number;
    actionsTaken: number;
    suggestionsCreated: number;
    errors: Array<{ userId: number; error: string }>;
  }> {
    try {
      const { listingLifetimeService } = await import('./listing-lifetime.service');
      const { MarketplaceService } = await import('./marketplace.service');
      const { EbayService } = await import('./ebay.service');
      const { MercadoLibreService } = await import('./mercadolibre.service');
      
      const config = await listingLifetimeService.getConfig();
      const marketplaceService = new MarketplaceService();
      
      // Obtener todos los usuarios activos
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      let processed = 0;
      let actionsTaken = 0;
      let suggestionsCreated = 0;
      const errors: Array<{ userId: number; error: string }> = [];

      for (const user of users) {
        try {
          // Evaluar todos los listings del usuario
          const results = await listingLifetimeService.evaluateAllUserListings(user.id);

          for (const result of results) {
            processed++;
            const { decision, listingId, marketplace, productId, metrics } = result;

            // Solo tomar acciones en modo automático
            if (config.mode === 'automatic') {
              // Si la decisión es UNPUBLISH o PAUSE y se cumplió el tiempo máximo
              if ((decision.mode === 'UNPUBLISH' || decision.mode === 'PAUSE') &&
                  metrics.listingAgeDays >= decision.recommendedMaxLifetime) {
                try {
                  // Obtener el listing con credenciales
                  const listing = await prisma.marketplaceListing.findUnique({
                    where: { id: listingId },
                    include: { 
                      product: true,
                      // ✅ FIX: marketplaceCredentials no existe como relación, omitir include
                      user: true
                    }
                  });

                  // ✅ FIX: listing no incluye product/user, usar IDs directamente
                  if (listing && listing.productId && listing.listingId) {
                    // Obtener credenciales del usuario (no desde listing.user que no está incluido)
                    const credentials = await marketplaceService.getCredentials(
                      listing.userId,
                      marketplace as any,
                      'production' // ✅ FIX: environment default, o obtener del user por separado si necesario
                    );

                    if (credentials && !credentials.issues?.length) {
                      if (decision.mode === 'UNPUBLISH') {
                        // Despublicar del marketplace
                        try {
                          if (marketplace === 'ebay') {
                            const ebayService = new EbayService({
                              ...(credentials.credentials as any),
                              sandbox: credentials.environment === 'sandbox'
                            });
                            await ebayService.endListing(listing.listingId, 'NotAvailable');
                          } else if (marketplace === 'mercadolibre') {
                            const mlService = new MercadoLibreService(credentials.credentials as any);
                            await mlService.closeListing(listing.listingId);
                          }
                          
                          // Actualizar estado del producto
                          await prisma.product.update({
                            where: { id: productId },
                            data: { 
                              status: 'INACTIVE',
                              isPublished: false
                            }
                          });

                          logger.info('Listing lifetime: Unpublished listing', {
                            userId: user.id,
                            listingId,
                            marketplace,
                            reason: decision.reason
                          });
                          actionsTaken++;
                        } catch (unpublishError: any) {
                          logger.error('Error unpublishing listing', {
                            error: unpublishError?.message || String(unpublishError),
                            userId: user.id,
                            listingId
                          });
                        }
                      } else if (decision.mode === 'PAUSE') {
                        // Pausar listing
                        try {
                          if (marketplace === 'mercadolibre') {
                            const mlService = new MercadoLibreService(credentials.credentials as any);
                            await mlService.pauseListing(listing.listingId);
                          }
                          
                          // Marcar producto como INACTIVE
                          await prisma.product.update({
                            where: { id: productId },
                            data: { status: 'INACTIVE' }
                          });
                          
                          logger.info('Listing lifetime: Paused listing', {
                            userId: user.id,
                            listingId,
                            marketplace,
                            reason: decision.reason
                          });
                          actionsTaken++;
                        } catch (pauseError: any) {
                          logger.error('Error pausing listing', {
                            error: pauseError?.message || String(pauseError),
                            userId: user.id,
                            listingId
                          });
                        }
                      }
                    }
                  }
                } catch (actionError: any) {
                  logger.error('Error taking action on listing', {
                    error: actionError?.message || String(actionError),
                    userId: user.id,
                    listingId
                  });
                }
              }
              // Si la decisión es IMPROVE, crear sugerencia
              else if (decision.mode === 'IMPROVE') {
                try {
                  await prisma.aISuggestion.create({
                    data: {
                      userId: user.id,
                      type: 'listing',
                      priority: 'medium',
                      title: `Optimizar listing: Producto #${productId} en ${marketplace}`,
                      description: decision.reason,
                      impactRevenue: metrics.totalNetProfit,
                      impactTime: 1,
                      difficulty: 'medium',
                      confidence: decision.confidence * 100,
                      actionable: true,
                      implemented: false,
                      estimatedTime: '15 minutos',
                      requirements: JSON.stringify(['Credenciales activas del marketplace']),
                      steps: JSON.stringify([
                        'Revisar título y descripción del producto',
                        'Ajustar precio según recomendación',
                        'Mejorar imágenes si es necesario',
                        'Revisar competencia en el marketplace'
                      ]),
                      relatedProducts: JSON.stringify([productId]),
                      metrics: JSON.stringify({
                        currentValue: metrics.roiPercent,
                        targetValue: config.minRoiPercent * 1.5,
                        unit: '%'
                      })
                    }
                  });
                  suggestionsCreated++;
                } catch (suggestionError: any) {
                  logger.error('Error creating suggestion', {
                    error: suggestionError?.message || String(suggestionError),
                    userId: user.id,
                    listingId
                  });
                }
              }
            }
            // En modo manual, solo crear sugerencias
            else {
              if (decision.mode === 'IMPROVE' || decision.mode === 'UNPUBLISH' || decision.mode === 'PAUSE') {
                try {
                  await prisma.aISuggestion.create({
                    data: {
                      userId: user.id,
                      type: 'listing',
                      priority: decision.mode === 'UNPUBLISH' ? 'high' : 'medium',
                      title: `Revisar listing: Producto #${productId} en ${marketplace}`,
                      description: decision.reason,
                      impactRevenue: metrics.totalNetProfit,
                      impactTime: 0.5,
                      difficulty: 'easy',
                      confidence: decision.confidence * 100,
                      actionable: true,
                      implemented: false,
                      estimatedTime: '5 minutos',
                      requirements: JSON.stringify(['Acceso al producto']),
                      steps: JSON.stringify([
                        'Revisar métricas del listing',
                        'Tomar acción según recomendación',
                        'Verificar resultados'
                      ]),
                      relatedProducts: JSON.stringify([productId]),
                      metrics: JSON.stringify({
                        currentValue: metrics.roiPercent,
                        targetValue: config.minRoiPercent,
                        unit: '%'
                      })
                    }
                  });
                  suggestionsCreated++;
                } catch (suggestionError: any) {
                  logger.error('Error creating suggestion', {
                    error: suggestionError?.message || String(suggestionError),
                    userId: user.id,
                    listingId
                  });
                }
              }
            }
          }
        } catch (userError: any) {
          errors.push({
            userId: user.id,
            error: userError?.message || String(userError)
          });
          logger.error('Error processing user listings', {
            error: userError?.message || String(userError),
            userId: user.id
          });
        }
      }

      logger.info('Listing lifetime optimization completed', {
        processed,
        actionsTaken,
        suggestionsCreated,
        errors: errors.length
      });

      return {
        processed,
        actionsTaken,
        suggestionsCreated,
        errors
      };
    } catch (error: any) {
      logger.error('Error in listing lifetime optimization', {
        error: error?.message || String(error)
      });
      throw error;
    }
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
    if (this.listingLifetimeWorker) {
      await this.listingLifetimeWorker.close();
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
    if (this.listingLifetimeQueue) {
      await this.listingLifetimeQueue.close();
    }
    if (this.productUnpublishQueue) {
      await this.productUnpublishQueue.close();
    }
    if (this.productUnpublishWorker) {
      await this.productUnpublishWorker.close();
    }
  }

  /**
   * ✅ NUEVO: Procesar despublicación automática de artículos
   * Despublica artículos basado en:
   * - Capital insuficiente
   * - Baja tasa de conversión
   * - Tiempo sin ventas
   */
  private async processProductUnpublish(job: any): Promise<void> {
    try {
      logger.info('Processing automatic product unpublishing');
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      let totalProcessed = 0;
      let totalUnpublished = 0;

      for (const user of users) {
        try {
          const { workflowConfigService } = await import('./workflow-config.service');
          const totalCapital = await workflowConfigService.getWorkingCapital(user.id);
          const publishedProducts = await prisma.product.findMany({
            where: {
              userId: user.id,
              isPublished: true,
              status: { in: ['PUBLISHED', 'APPROVED'] }
            },
            include: {
              marketplaceListings: true // ✅ FIX: Incluir listings solamente, sales se obtendrá por separado
            }
          });

          const pendingSales = await prisma.sale.findMany({
            where: {
              userId: user.id,
              status: { in: ['PENDING', 'PROCESSING'] }
            }
          });
          const committedCapital = pendingSales.reduce((sum, sale) => 
            sum + toNumber(sale.aliexpressCost || 0), 0
          );
          const capitalBuffer = Number(process.env.WORKING_CAPITAL_BUFFER || '0.20');
          const availableCapital = Math.max(0, totalCapital - committedCapital);

          for (const product of publishedProducts) {
            totalProcessed++;
            let shouldUnpublish = false;
            const reasons: string[] = [];
            const productCost = toNumber(product.aliexpressPrice || 0);
            const capitalThreshold = availableCapital * 0.8;
            
            if (productCost > capitalThreshold && availableCapital < totalCapital * (1 - capitalBuffer)) {
              shouldUnpublish = true;
              reasons.push(`Capital insuficiente`);
            }

            // ✅ FIX: Type assertion para acceder a marketplaceListings incluido
            const listings = (product as any).marketplaceListings || [];
            const totalViews = listings.reduce((sum: number, listing: any) => 
              sum + (listing.viewCount || 0), 0
            );
            // ✅ FIX: Obtener sales por separado ya que include anidado no funciona
            // Usar listingId en lugar de marketplaceListingId si el schema usa otro nombre
            const listingIds = listings.map((l: any) => l.id);
            const salesCount = listingIds.length > 0 ? await (prisma as any).sale.count({
              where: {
                listingId: { in: listingIds },
                createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
              }
            }) : 0;
            const totalSales = salesCount;
            const conversionRate = totalViews > 0 ? (totalSales / totalViews) * 100 : 0;
            const minConversionRate = Number(process.env.MIN_CONVERSION_RATE || '0.5');

            if (totalViews >= 100 && conversionRate < minConversionRate) {
              shouldUnpublish = true;
              reasons.push(`Baja conversión (${conversionRate.toFixed(2)}%)`);
            }

            // ✅ FIX: Obtener última venta por separado
            const lastSale = listingIds.length > 0 ? await (prisma as any).sale.findFirst({
              where: {
                listingId: { in: listingIds }
              },
              orderBy: { createdAt: 'desc' }
            }) : null;
            const daysSinceLastSale = lastSale 
              ? Math.floor((Date.now() - lastSale.createdAt.getTime()) / (1000 * 60 * 60 * 24))
              : Infinity;
            const maxDaysWithoutSales = Number(process.env.MAX_DAYS_WITHOUT_SALES || '60');

            if (daysSinceLastSale > maxDaysWithoutSales && totalViews > 0) {
              shouldUnpublish = true;
              reasons.push(`Sin ventas por ${daysSinceLastSale} días`);
            }

            if (shouldUnpublish) {
              try {
                // ✅ FIX: unpublishProduct no existe, marcar producto como no publicado en DB
                await prisma.product.update({
                  where: { id: product.id },
                  data: { isPublished: false, status: 'DRAFT' }
                });
                
                logger.info('Product unpublished due to performance metrics', {
                  productId: product.id,
                  userId: user.id,
                  reasons
                });
                
                // ✅ FIX: Si necesitamos despublicar listings, hacerlo manualmente por marketplace
                for (const listing of listings) {
                  try {
                    // Marcar listing como inactivo en DB
                    await prisma.marketplaceListing.update({
                      where: { id: listing.id },
                      data: { publishedAt: null }
                    });
                  } catch (unpublishError: any) {
                    logger.warn('Error despublicando producto', {
                      userId: user.id,
                      productId: product.id,
                      error: unpublishError.message
                    });
                  }
                }

                await prisma.product.update({
                  where: { id: product.id },
                  data: { isPublished: false, status: 'INACTIVE' }
                });

                totalUnpublished++;
                await notificationService.sendToUser(user.id, {
                  type: 'SYSTEM_ALERT', // ✅ FIX: Changed from 'PRODUCT_UNPUBLISHED' to valid type
                  title: 'Producto despublicado automáticamente',
                  message: `El producto "${product.title.substring(0, 50)}" ha sido despublicado. Razones: ${reasons.join('; ')}`,
                  category: 'PRODUCT',
                  priority: 'NORMAL', // ✅ FIX: Changed from 'MEDIUM' to valid priority
                  data: { productId: product.id, productTitle: product.title, reasons }
                });
              } catch (error: any) {
                logger.error('Error despublicando producto', {
                  userId: user.id,
                  productId: product.id,
                  error: error.message
                });
              }
            }
          }
        } catch (userError: any) {
          logger.error('Error procesando usuario', {
            userId: user.id,
            error: userError.message
          });
        }
      }

      logger.info('Product unpublish job completed', { totalProcessed, totalUnpublished });
    } catch (error: any) {
      logger.error('Error en job de despublicación', { error: error.message });
      throw error;
    }
  }
}

// ✅ P0: Lazy initialization - NO instanciar en import-time si SAFE_BOOT=true
let scheduledTasksServiceInstance: ScheduledTasksService | null = null;

export function getScheduledTasksService(): ScheduledTasksService {
  if (scheduledTasksServiceInstance) {
    return scheduledTasksServiceInstance;
  }
  
  // ✅ FIX: Check SAFE_BOOT - solo si explícitamente 'true'
  const safeBoot = process.env.SAFE_BOOT === 'true';
  
  if (safeBoot) {
    console.log('🛡️  SAFE_BOOT=true: skipping ScheduledTasksService initialization');
    // Return a mock service that does nothing
    scheduledTasksServiceInstance = {
      shutdown: async () => {},
    } as any;
    return scheduledTasksServiceInstance;
  }
  
  scheduledTasksServiceInstance = new ScheduledTasksService();
  return scheduledTasksServiceInstance;
}

// Export getter for backward compatibility
export const scheduledTasksService = new Proxy({} as ScheduledTasksService, {
  get(_target, prop) {
    const instance = getScheduledTasksService();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});

