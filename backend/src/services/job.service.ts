import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';
import { AdvancedScrapingService } from '../services/scraping.service';
import { MarketplaceService } from '../services/marketplace.service';
import { ProductService } from '../services/product.service';
import { notificationService } from './notification.service';
import { PrismaClient } from '@prisma/client';
import logger from '../config/logger';

const prisma = new PrismaClient();

// Get BullMQ Redis connection (with maxRetriesPerRequest: null)
const bullMQRedis = getBullMQRedisConnection();

// Job queues - only create if Redis is available
export const scrapingQueue = isRedisAvailable && bullMQRedis
  ? new Queue('scraping', { connection: bullMQRedis as any })
  : null;
export const publishingQueue = isRedisAvailable && bullMQRedis
  ? new Queue('publishing', { connection: bullMQRedis as any })
  : null;
export const payoutQueue = isRedisAvailable && bullMQRedis
  ? new Queue('payout', { connection: bullMQRedis as any })
  : null;
export const syncQueue = isRedisAvailable && bullMQRedis
  ? new Queue('sync', { connection: bullMQRedis as any })
  : null;

// Job data interfaces
export interface ScrapingJobData {
  userId: number;
  aliexpressUrl: string;
  customData?: {
    margin?: number;
    category?: string;
    title?: string;
    quantity?: number;
  };
}

export interface PublishingJobData {
  userId: number;
  productId: number;
  marketplaces: string[];
  customData?: any;
}

export interface PayoutJobData {
  userId?: number;
  commissionIds?: number[];
  amount?: number;
}

export interface SyncJobData {
  userId: number;
  productId: number;
  type: 'inventory' | 'price' | 'status';
  data: any;
}

// Job Services
class JobService {
  private scrapingService = new AdvancedScrapingService();
  private marketplaceService = new MarketplaceService();
  private productService = new ProductService();

  /**
   * Add scraping job to queue
   */
  async addScrapingJob(data: ScrapingJobData, options?: any) {
    if (!isRedisAvailable || !scrapingQueue) {
      logger.warn('Redis not available - job queues disabled');
      return null;
    }
    return await scrapingQueue.add('scrape-product', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options,
    });
  }

  /**
   * Add publishing job to queue
   */
  async addPublishingJob(data: PublishingJobData, options?: any) {
    if (!isRedisAvailable || !publishingQueue) {
      logger.warn('Redis not available - job queues disabled');
      return null;
    }
    return await publishingQueue.add('publish-product', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options,
    });
  }

  /**
   * Add payout job to queue
   */
  async addPayoutJob(data: PayoutJobData, options?: any) {
    if (!isRedisAvailable || !payoutQueue) {
      logger.warn('Redis not available - job queues disabled');
      return null;
    }
    return await payoutQueue.add('process-payout', data, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: 50,
      removeOnFail: 10,
      ...options,
    });
  }

  /**
   * Add sync job to queue
   */
  async addSyncJob(data: SyncJobData, options?: any) {
    if (!isRedisAvailable || !syncQueue) {
      logger.warn('Redis not available - job queues disabled');
      return null;
    }
    return await syncQueue.add('sync-marketplace', data, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: 20,
      removeOnFail: 5,
      ...options,
    });
  }

  /**
   * Schedule recurring payout job
   */
  async schedulePayoutJob(cronPattern: string = '0 0 * * FRI') {
    if (!isRedisAvailable || !payoutQueue) {
      logger.warn('Redis not available - scheduled jobs disabled');
      return null;
    }
    return await payoutQueue.add(
      'weekly-payout',
      {},
      {
        repeat: { pattern: cronPattern },
        removeOnComplete: 5,
      }
    );
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const stats = await Promise.all([
      scrapingQueue.getJobCounts(),
      publishingQueue.getJobCounts(),
      payoutQueue.getJobCounts(),
      syncQueue.getJobCounts(),
    ]);

    return {
      scraping: stats[0],
      publishing: stats[1],
      payout: stats[2],
      sync: stats[3],
    };
  }

  /**
   * Process scraping job
   */
  async processScrapeJob(job: Job<ScrapingJobData>) {
    const { userId, aliexpressUrl, customData } = job.data;

    try {
      // Notify job started
      notificationService.notifyJobStarted(userId, 'scraping', job.id!);

      // Update job progress
      await job.updateProgress(10);

      // Scrape product
      const scrapedData = await this.scrapingService.scrapeAliExpressProduct(aliexpressUrl, userId);
      await job.updateProgress(50);

      // ✅ LÍMITE DE PRODUCTOS PENDIENTES: Validar antes de crear
      const { pendingProductsLimitService } = await import('./pending-products-limit.service');
      await pendingProductsLimitService.ensurePendingLimitNotExceeded(userId, false);

      // Create product in database
      // ✅ CORREGIDO: Pasar todas las imágenes disponibles, no solo la primera
      const product = await this.productService.createProduct(
        userId,
        {
          title: scrapedData.title || 'Producto sin título',
          description: scrapedData.description,
          aliexpressUrl: aliexpressUrl,
          aliexpressPrice: scrapedData.price || 0,
          suggestedPrice: (scrapedData.price || 0) * 2,
          category: scrapedData.category,
          imageUrl: scrapedData.images?.[0], // Primera imagen como principal
          imageUrls: scrapedData.images || [], // ✅ TODAS las imágenes disponibles
          ...customData
        },
        false // isAdmin = false para jobs
      );
      await job.updateProgress(90);

      // Log activity
      await prisma.activity.create({
        data: {
          userId,
          action: 'PRODUCT_SCRAPED',
          description: `Scraped and created product: ${product.title}`,
          ipAddress: 'system',
        },
      });

      // Notify product scraped
      notificationService.notifyProductScraped(userId, product.id, product.title);

      await job.updateProgress(100);

      // Notify job completed
      const result = {
        success: true,
        productId: product.id,
        title: product.title,
      };
      
      notificationService.notifyJobCompleted(userId, 'scraping', job.id!, result);
      return result;
    } catch (error) {
      logger.error('Scraping job failed', { jobId: job.id, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      // Notify job failed
      notificationService.notifyJobFailed(userId, 'scraping', job.id!, error.message);
      throw error;
    }
  }

  /**
   * Process publishing job
   */
  async processPublishJob(job: Job<PublishingJobData>) {
    const { userId, productId, marketplaces, customData } = job.data;

    try {
      // Notify job started
      notificationService.notifyJobStarted(userId, 'publishing', job.id!);
      
      await job.updateProgress(10);

      const results = [];
      const totalMarketplaces = marketplaces.length;

      for (let i = 0; i < marketplaces.length; i++) {
        const marketplace = marketplaces[i];
        
        try {
          const result = await this.marketplaceService.publishProduct(userId, {
            productId,
            marketplace: marketplace as any,
            customData,
          });

          results.push(result);
          
          // Notify individual marketplace publication
          if (result.success && result.listingUrl) {
            notificationService.notifyProductPublished(
              userId, 
              productId, 
              marketplace, 
              result.listingUrl
            );
          }
          
          // Update progress
          const progress = Math.round(((i + 1) / totalMarketplaces) * 80) + 10;
          await job.updateProgress(progress);

          // Notify progress to user
          notificationService.sendToUser(userId, {
            type: 'JOB_PROGRESS',
            title: 'Publicación en progreso',
            message: `(${i + 1}/${totalMarketplaces}) ${marketplace} procesado`,
            priority: 'LOW',
            category: 'JOB',
            data: { jobType: 'publishing', jobId: job.id, step: i + 1, total: totalMarketplaces, marketplace }
          });

          // Wait between marketplace calls to avoid rate limits
          if (i < marketplaces.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          logger.error('Failed to publish to marketplace', { marketplace, jobId: job.id, error: error instanceof Error ? error.message : String(error) });
          results.push({
            success: false,
            marketplace,
            error: error.message,
          });
        }
      }

      // Log activity
      const successCount = results.filter(r => r.success).length;
      await prisma.activity.create({
        data: {
          userId,
          action: 'PRODUCT_PUBLISHED',
          description: `Published product ${productId} to ${successCount}/${totalMarketplaces} marketplaces`,
          ipAddress: 'system',
        },
      });

      await job.updateProgress(100);

      const jobResult = {
        success: successCount > 0,
        results,
        successCount,
        totalCount: totalMarketplaces,
      };

      // Notify job completed
      notificationService.notifyJobCompleted(userId, 'publishing', job.id!, jobResult);

      return jobResult;
    } catch (error) {
      logger.error('Publishing job failed', { jobId: job.id, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      // Notify job failed
      notificationService.notifyJobFailed(userId, 'publishing', job.id!, error.message);
      throw error;
    }
  }

  /**
   * Process payout job
   */
  async processPayoutJob(job: Job<PayoutJobData>) {
    const { userId, commissionIds } = job.data;

    try {
      await job.updateProgress(10);

      // Get pending commissions
      const commissions = await prisma.commission.findMany({
        where: {
          ...(userId && { userId }),
          ...(commissionIds && { id: { in: commissionIds } }),
          status: 'PENDING',
        },
        include: {
          user: true,
        },
      });

      await job.updateProgress(30);

      if (commissions.length === 0) {
        return { success: true, message: 'No pending commissions found' };
      }

      const results = [];
      
      for (let i = 0; i < commissions.length; i++) {
        const commission = commissions[i];
        
        try {
          // ✅ INTEGRAR CON PAYPAL API REAL
          // Obtener email del usuario para el pago
          if (!commission.user.email) {
            throw new Error(`Usuario ${commission.userId} no tiene email configurado para pagos`);
          }

          // Intentar crear servicio PayPal desde credenciales
          const PayPalPayoutService = (await import('./paypal-payout.service')).default;
          const paypalService = PayPalPayoutService.fromEnv();

          if (!paypalService) {
            // Si PayPal no está configurado, marcar como programado
            await prisma.commission.update({
              where: { id: commission.id },
              data: {
                status: 'SCHEDULED',
                scheduledAt: new Date(),
              },
            });
            
            results.push({
              success: true,
              commissionId: commission.id,
              amount: commission.amount,
              userId: commission.userId,
              note: 'PayPal no configurado - programado para pago manual'
            });
          } else {
            // Realizar pago real con PayPal
            try {
              const payoutResult = await paypalService.sendPayout({
                recipientEmail: commission.user.email,
                amount: commission.amount,
                currency: 'USD', // Commission siempre en USD
                note: `Comisión por venta - Commission ID: ${commission.id}`,
                senderItemId: `commission_${commission.id}`
              });

              if (payoutResult.success && payoutResult.items && payoutResult.items.length > 0) {
                const payoutItem = payoutResult.items[0];
                
                // Actualizar comisión como pagada con ID de transacción PayPal
                await prisma.commission.update({
                  where: { id: commission.id },
                  data: {
                    status: 'PAID',
                    paidAt: new Date(),
                    // paypalTransactionId se guarda en Activity metadata
                  },
                });

                results.push({
                  success: true,
                  commissionId: commission.id,
                  amount: commission.amount,
                  userId: commission.userId,
                  paypalTransactionId: payoutItem.transactionId,
                  paypalBatchId: payoutResult.batchId
                });
              } else {
                throw new Error('PayPal payout no completado correctamente');
              }
            } catch (paypalError: any) {
              // Si falla PayPal, marcar como programado para reintento
              await prisma.commission.update({
                where: { id: commission.id },
                data: {
                  status: 'SCHEDULED',
                  scheduledAt: new Date(),
                },
              });
              
              results.push({
                success: false,
                commissionId: commission.id,
                error: `PayPal error: ${paypalError.message}`,
                note: 'Programado para reintento'
              });
            }
          }

          // Update progress
          const progress = Math.round(((i + 1) / commissions.length) * 60) + 30;
          await job.updateProgress(progress);
        } catch (error: any) {
          logger.error('Failed to process payout for commission', { commissionId: commission.id, jobId: job.id, error: error instanceof Error ? error.message : String(error) });
          results.push({
            success: false,
            commissionId: commission.id,
            error: error.message || 'Error desconocido',
          });
        }
      }

      // Log activity
      const successCount = results.filter(r => r.success).length;
      await prisma.activity.create({
        data: {
          userId: userId || 0,
          action: 'PAYOUT_PROCESSED',
          description: `Processed ${successCount}/${commissions.length} payouts`,
          ipAddress: 'system',
        },
      });

      await job.updateProgress(100);

      return {
        success: successCount > 0,
        results,
        successCount,
        totalCount: commissions.length,
      };
    } catch (error) {
      logger.error('Payout job failed', { jobId: job.id, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Process sync job
   */
  async processSyncJob(job: Job<SyncJobData>) {
    const { userId, productId, type, data } = job.data;

    try {
      await job.updateProgress(10);

      switch (type) {
        case 'inventory':
          await this.marketplaceService.syncInventory(userId, productId, data.quantity);
          break;

        // Add more sync types as needed
        default:
          throw new Error(`Unknown sync type: ${type}`);
      }

      await job.updateProgress(100);

      return {
        success: true,
        type,
        productId,
      };
    } catch (error) {
      logger.error('Sync job failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        jobData: job.data
      });
      throw error;
    }
  }
}

// Create job service instance
export const jobService = new JobService();

// Workers - only create when Redis is available
let scrapingWorker: Worker | null = null;
let publishingWorker: Worker | null = null;
let payoutWorker: Worker | null = null;
let syncWorker: Worker | null = null;

if (isRedisAvailable && bullMQRedis) {
  scrapingWorker = new Worker(
    'scraping',
    async (job: Job<ScrapingJobData>) => {
      return await jobService.processScrapeJob(job);
    },
    {
      connection: bullMQRedis as any,
      concurrency: 2,
    }
  );

  publishingWorker = new Worker(
    'publishing',
    async (job: Job<PublishingJobData>) => {
      return await jobService.processPublishJob(job);
    },
    {
      connection: bullMQRedis as any,
      concurrency: 1, // Limit concurrency to avoid rate limits
    }
  );

  payoutWorker = new Worker(
    'payout',
    async (job: Job<PayoutJobData>) => {
      return await jobService.processPayoutJob(job);
    },
    {
      connection: bullMQRedis as any,
      concurrency: 1,
    }
  );

  syncWorker = new Worker(
    'sync',
    async (job: Job<SyncJobData>) => {
      return await jobService.processSyncJob(job);
    },
    {
      connection: bullMQRedis as any,
      concurrency: 3,
    }
  );
}

// Worker event listeners
const setupWorkerEvents = (worker: Worker, name: string) => {
  worker.on('completed', (job) => {
    logger.info('Job completed', { jobType: name, jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobType: name, jobId: job?.id, error: err.message, stack: err.stack });
  });

  worker.on('progress', (job, progress) => {
    logger.debug('Job progress', { jobType: name, jobId: job.id, progress });
  });
};

// Setup event listeners - only if workers were created
if (isRedisAvailable) {
  if (scrapingWorker) setupWorkerEvents(scrapingWorker, 'Scraping');
  if (publishingWorker) setupWorkerEvents(publishingWorker, 'Publishing');
  if (payoutWorker) setupWorkerEvents(payoutWorker, 'Payout');
  if (syncWorker) setupWorkerEvents(syncWorker, 'Sync');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down workers...');
  
    if (isRedisAvailable && bullMQRedis) {
    const closePromises = [];
    if (scrapingWorker) closePromises.push(scrapingWorker.close());
    if (publishingWorker) closePromises.push(publishingWorker.close());
    if (payoutWorker) closePromises.push(payoutWorker.close());
    if (syncWorker) closePromises.push(syncWorker.close());
    
    await Promise.all(closePromises);
    
    // BullMQ maneja la desconexión de sus propias conexiones
    if (bullMQRedis && typeof (bullMQRedis as any).disconnect === 'function') {
      await (bullMQRedis as any).disconnect();
    }
  }
  logger.info('All workers stopped');
  process.exit(0);
});

export default jobService;
