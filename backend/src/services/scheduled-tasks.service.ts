import { trace } from '../utils/boot-trace';
trace('loading scheduled-tasks.service');

import { Queue, Worker, QueueEvents } from 'bullmq';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';
import { financialAlertsService } from './financial-alerts.service';
import { prisma } from '../config/database';
import { PayPalPayoutService } from './paypal-payout.service';
import { notificationService } from './notification.service';
import { aliExpressAuthMonitor } from './ali-auth-monitor.service';
import { refreshAccessToken } from './aliexpress-oauth.service';
import { getToken } from './aliexpress-token.store';
import { aliexpressAffiliateAPIService } from './aliexpress-affiliate-api.service';
import fxService from './fx.service';
import { toNumber } from '../utils/decimal.utils';
import { retryFailedOrdersDueToFunds } from './retry-failed-orders.service';
import { processPaidOrders } from './process-paid-orders.service';
import { listingStateReconciliationService } from './listing-state-reconciliation.service';

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
  private dynamicPricingQueue: Queue | null = null;
  private aliExpressTokenRefreshQueue: Queue | null = null;
  private retryFailedOrdersQueue: Queue | null = null;
  private fulfillmentRetryEngineQueue: Queue | null = null;
  private processPaidOrdersQueue: Queue | null = null;
  private marketplaceOrderSyncQueue: Queue | null = null;
  private mercadolibreOrderSyncQueue: Queue | null = null;
  private amazonOrderSyncQueue: Queue | null = null;
  private ebayTrafficSyncQueue: Queue | null = null;
    private listingOptimization48hQueue: Queue | null = null;
    private winnerDetectionQueue: Queue | null = null;
    private winnerFollowUpQueue: Queue | null = null;
    private inventorySyncQueue: Queue | null = null;
    private listingMetricsAggregateQueue: Queue | null = null;
    private marketIntelligenceQueue: Queue | null = null;
    private autoListingStrategyQueue: Queue | null = null;
    private dynamicMarketplaceOptimizationQueue: Queue | null = null;
    private globalDemandRadarQueue: Queue | null = null;
    private aiStrategyBrainQueue: Queue | null = null;
    private autonomousScalingQueue: Queue | null = null;
    private conversionRateOptimizationQueue: Queue | null = null;
    private listingStateReconciliationQueue: Queue | null = null;
    private fullListingRecoveryQueue: Queue | null = null;
    private competitorIntelligenceQueue: Queue | null = null;
    private autonomousRevenueMonitorQueue: Queue | null = null;
    private salesAccelerationQueue: Queue | null = null;
    private phase31SalesGenerationQueue: Queue | null = null;
    private financialAlertsWorker: Worker | null = null;
  private commissionProcessingWorker: Worker | null = null;
  private authHealthWorker: Worker | null = null;
  private fxRatesWorker: Worker | null = null;
  private listingLifetimeWorker: Worker | null = null;
  private productUnpublishWorker: Worker | null = null;
  private dynamicPricingWorker: Worker | null = null;
  private aliExpressTokenRefreshWorker: Worker | null = null;
  private retryFailedOrdersWorker: Worker | null = null;
  private fulfillmentRetryEngineWorker: Worker | null = null;
  private processPaidOrdersWorker: Worker | null = null;
  private marketplaceOrderSyncWorker: Worker | null = null;
  private mercadolibreOrderSyncWorker: Worker | null = null;
  private amazonOrderSyncWorker: Worker | null = null;
  private ebayTrafficSyncWorker: Worker | null = null;
    private listingOptimization48hWorker: Worker | null = null;
    private winnerDetectionWorker: Worker | null = null;
    private winnerFollowUpWorker: Worker | null = null;
    private inventorySyncWorker: Worker | null = null;
    private listingMetricsAggregateWorker: Worker | null = null;
    private marketIntelligenceWorker: Worker | null = null;
    private autoListingStrategyWorker: Worker | null = null;
    private dynamicMarketplaceOptimizationWorker: Worker | null = null;
    private globalDemandRadarWorker: Worker | null = null;
    private aiStrategyBrainWorker: Worker | null = null;
    private autonomousScalingWorker: Worker | null = null;
    private conversionRateOptimizationWorker: Worker | null = null;
    private listingStateReconciliationWorker: Worker | null = null;
    private fullListingRecoveryWorker: Worker | null = null;
    private competitorIntelligenceWorker: Worker | null = null;
    private autonomousRevenueMonitorWorker: Worker | null = null;
    private salesAccelerationWorker: Worker | null = null;
    private phase31SalesGenerationWorker: Worker | null = null;

  private bullMQRedis: ReturnType<typeof getBullMQRedisConnection>;

  constructor() {
    this.bullMQRedis = getBullMQRedisConnection();
    
    if (isRedisAvailable && this.bullMQRedis) {
      this.initializeQueues();
      this.initializeWorkers().catch((err) => {
        logger.error('Scheduled Tasks: initializeWorkers failed (workers disabled)', { error: err?.message || String(err) });
      });
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

    // ✅ Evolution: Dynamic pricing every 6 hours
    this.dynamicPricingQueue = new Queue('dynamic-pricing', {
      connection: this.bullMQRedis as any
    });

    // AliExpress OAuth token refresh: cada 1 hora
    this.aliExpressTokenRefreshQueue = new Queue('ali-express-token-refresh', {
      connection: this.bullMQRedis as any
    });

    // Retry orders that failed due to insufficient funds: cada 30 min
    this.retryFailedOrdersQueue = new Queue('retry-failed-orders', {
      connection: this.bullMQRedis as any
    });

    // Phase 41: Fulfillment retry engine — every 24h, max 5 retries, marks NEEDS_MANUAL_INTERVENTION
    this.fulfillmentRetryEngineQueue = new Queue('fulfillment-retry-engine', {
      connection: this.bullMQRedis as any
    });

    // Process all PAID orders (pending purchases): cada 5 min
    this.processPaidOrdersQueue = new Queue('process-paid-orders', {
      connection: this.bullMQRedis as any
    });

    // Phase 40: Marketplace order sync (eBay/ML/Amazon) — fetch real orders every 5–10 min
    this.marketplaceOrderSyncQueue = new Queue('marketplace-order-sync', {
      connection: this.bullMQRedis as any
    });

    // Mercado Libre order sync — fetch ML orders every ~10 min
    this.mercadolibreOrderSyncQueue = new Queue('mercadolibre-order-sync', {
      connection: this.bullMQRedis as any
    });

    // Amazon order sync — fetch Amazon orders every ~10 min
    this.amazonOrderSyncQueue = new Queue('amazon-order-sync', {
      connection: this.bullMQRedis as any
    });

    // eBay Analytics: sync view counts for listing lifetime optimization
    this.ebayTrafficSyncQueue = new Queue('ebay-traffic-sync', {
      connection: this.bullMQRedis as any
    });

    // Spec: listing optimization every 48h (impressions>200 and sales==0 -> reprice, optional title refresh)
    this.listingOptimization48hQueue = new Queue('listing-optimization-48h', {
      connection: this.bullMQRedis as any
    });

    // Spec: winner detection every 24h (sales in last 3 days >= 5 -> mark winner)
    this.winnerDetectionQueue = new Queue('winner-detection', {
      connection: this.bullMQRedis as any
    });

    // Phase 3: winner follow-up (optional optimization / scaling when WINNER_TRIGGER_FOLLOW_UP=true)
    this.winnerFollowUpQueue = new Queue('winner-follow-up', {
      connection: this.bullMQRedis as any
    });

    // Phase 1: Inventory sync every 6 hours (check AliExpress stock, pause/resume listings)
    this.inventorySyncQueue = new Queue('inventory-sync', {
      connection: this.bullMQRedis as any
    });

    // Phase 5: Listing metrics aggregate (sales + conversion into listing_metrics) daily
    this.listingMetricsAggregateQueue = new Queue('listing-metrics-aggregate', {
      connection: this.bullMQRedis as any
    });

    // Phase 4: Market Intelligence Engine — daily opportunity discovery
    this.marketIntelligenceQueue = new Queue('market-intelligence', {
      connection: this.bullMQRedis as any
    });

    // Phase 5: Auto Listing Strategy — daily listing decisions + publish jobs
    this.autoListingStrategyQueue = new Queue('auto-listing-strategy', {
      connection: this.bullMQRedis as any
    });

    // Phase 6: Dynamic Marketplace Optimization — every 12h
    this.dynamicMarketplaceOptimizationQueue = new Queue('dynamic-marketplace-optimization', {
      connection: this.bullMQRedis as any
    });

    // Phase 7: Global Demand Radar — daily
    this.globalDemandRadarQueue = new Queue('global-demand-radar', {
      connection: this.bullMQRedis as any
    });

    // Phase 8: AI Strategy Brain — daily
    this.aiStrategyBrainQueue = new Queue('ai-strategy-brain', {
      connection: this.bullMQRedis as any
    });

    // Phase 9: Autonomous Scaling Engine — daily
    this.autonomousScalingQueue = new Queue('autonomous-scaling-engine', {
      connection: this.bullMQRedis as any
    });

    // Phase 11: Conversion Rate Optimization — every 12 hours
    this.conversionRateOptimizationQueue = new Queue('conversion-rate-optimization', {
      connection: this.bullMQRedis as any
    });

    // Phase 15: Listing state reconciliation — every 30 minutes
    this.listingStateReconciliationQueue = new Queue('listing-state-reconciliation', {
      connection: this.bullMQRedis as any
    });

    // Phase 26: Full Listing Recovery — audit + classification + recovery (every few hours)
    this.fullListingRecoveryQueue = new Queue('full-listing-recovery', {
      connection: this.bullMQRedis as any
    });

    // Phase 18: Competitor Intelligence — daily
    this.competitorIntelligenceQueue = new Queue('competitor-intelligence', {
      connection: this.bullMQRedis as any
    });

    // Phase 22: Autonomous Revenue Monitor — every 6 hours
    this.autonomousRevenueMonitorQueue = new Queue('autonomous-revenue-monitor', {
      connection: this.bullMQRedis as any
    });

    // Phase 23: Sales Acceleration Mode — every 3 hours
    this.salesAccelerationQueue = new Queue('sales-acceleration', {
      connection: this.bullMQRedis as any
    });

    // Phase 32: Phase 31 Sales Generation — every 4–6 hours (default 5)
    this.phase31SalesGenerationQueue = new Queue('phase31-sales-generation', {
      connection: this.bullMQRedis as any
    });
  }

  /**
   * Inicializar workers para procesar tareas
   */
  private async initializeWorkers(): Promise<void> {
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

    // ✅ Worker para optimizador de tiempo de publicación (name must match queue: listing-lifetime-optimizer)
    if (this.listingLifetimeQueue) {
      this.listingLifetimeWorker = new Worker(
        'listing-lifetime-optimizer',
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

    // ✅ Worker para despublicación automática de productos (capital/conversión)
    if (this.productUnpublishQueue) {
      this.productUnpublishWorker = new Worker(
        'product-unpublish',
        async (job) => {
          logger.info('Scheduled Tasks: Running product unpublish', { jobId: job.id });
          await this.processProductUnpublish(job);
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.productUnpublishWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Product unpublish failed', { jobId: job?.id, error: err?.message });
      });
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

    // ✅ Evolution: Dynamic pricing worker (every 6 hours)
    if (this.dynamicPricingQueue) {
      this.dynamicPricingWorker = new Worker(
        'dynamic-pricing',
        async (job) => {
          logger.info('Scheduled Tasks: Running dynamic pricing', { jobId: job.id });
          return await this.runDynamicPricing();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.dynamicPricingWorker.on('completed', (job) => {
        logger.info('Scheduled Tasks: Dynamic pricing completed', { jobId: job.id });
      });
      this.dynamicPricingWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Dynamic pricing failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    // AliExpress OAuth token refresh worker
    if (this.aliExpressTokenRefreshQueue) {
      this.aliExpressTokenRefreshWorker = new Worker(
        'ali-express-token-refresh',
        async (job) => {
          logger.info('Scheduled Tasks: Running AliExpress token refresh', { jobId: job.id });
          return await this.runAliExpressTokenRefresh();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    // Retry failed orders (insufficient funds) worker — every 30 min, max 3 retries
    if (this.retryFailedOrdersQueue) {
      this.retryFailedOrdersWorker = new Worker(
        'retry-failed-orders',
        async (job) => {
          logger.info('Scheduled Tasks: Running retry failed orders', { jobId: job.id });
          return await retryFailedOrdersDueToFunds({ maxAgeHours: 72, maxRetriesPerOrder: 3 });
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    // Phase 41: Fulfillment retry engine — every 24h, max 5 retries, oldest first
    if (this.fulfillmentRetryEngineQueue) {
      this.fulfillmentRetryEngineWorker = new Worker(
        'fulfillment-retry-engine',
        async (job) => {
          logger.info('Scheduled Tasks: Running fulfillment retry engine', { jobId: job.id });
          return await retryFailedOrdersDueToFunds({
            maxAgeHours: 168,
            maxRetriesPerOrder: 5,
          });
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    // Process paid orders (pending purchases) worker
    if (this.processPaidOrdersQueue) {
      this.processPaidOrdersWorker = new Worker(
        'process-paid-orders',
        async (job) => {
          logger.info('Scheduled Tasks: Running process paid orders', { jobId: job.id });
          return await processPaidOrders({ batchSize: 30 });
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    // Phase 40: Marketplace order sync worker (eBay real orders → Order table)
    if (this.marketplaceOrderSyncQueue) {
      this.marketplaceOrderSyncWorker = new Worker(
        'marketplace-order-sync',
        async (job) => {
          logger.info('Scheduled Tasks: Running marketplace order sync', { jobId: job.id });
          const { runMarketplaceOrderSync } = await import('./marketplace-order-sync.service');
          return await runMarketplaceOrderSync('production');
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    // Mercado Libre order sync worker
    if (this.mercadolibreOrderSyncQueue) {
      this.mercadolibreOrderSyncWorker = new Worker(
        'mercadolibre-order-sync',
        async (job) => {
          logger.info('Scheduled Tasks: Running Mercado Libre order sync', { jobId: job.id });
          const { runMercadoLibreOrderSync } = await import('./mercadolibre-order-sync.service');
          return await runMercadoLibreOrderSync('production');
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    // Amazon order sync worker
    if (this.amazonOrderSyncQueue) {
      this.amazonOrderSyncWorker = new Worker(
        'amazon-order-sync',
        async (job) => {
          logger.info('Scheduled Tasks: Running Amazon order sync', { jobId: job.id });
          const { runAmazonOrderSync } = await import('./amazon-order-sync.service');
          return await runAmazonOrderSync('production');
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    // eBay traffic sync worker (view counts for listing lifetime)
    if (this.ebayTrafficSyncQueue) {
      this.ebayTrafficSyncWorker = new Worker(
        'ebay-traffic-sync',
        async (job) => {
          logger.info('Scheduled Tasks: Running eBay traffic sync', { jobId: job.id });
          const { syncAllUsersViewCounts } = await import('./ebay-traffic-sync.service');
          return await syncAllUsersViewCounts();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    if (this.listingOptimization48hQueue) {
      this.listingOptimization48hWorker = new Worker(
        'listing-optimization-48h',
        async (job) => {
          logger.info('Scheduled Tasks: Running listing optimization 48h', { jobId: job.id });
          const { runListingOptimization48h } = await import('./listing-optimization-loop.service');
          return await runListingOptimization48h();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    if (this.winnerDetectionQueue) {
      this.winnerDetectionWorker = new Worker(
        'winner-detection',
        async (job) => {
          logger.info('Scheduled Tasks: Running winner detection', { jobId: job.id });
          const { runWinnerDetection } = await import('./winner-detector.service');
          return await runWinnerDetection();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
    }

    if (this.winnerFollowUpQueue) {
      this.winnerFollowUpWorker = new Worker(
        'winner-follow-up',
        async (job) => {
          const { productId, listingId, marketplace, userId } = job.data as { productId: number; listingId: number; marketplace: string; userId: number };
          logger.info('Scheduled Tasks: Winner follow-up', { productId, listingId, marketplace, userId });
          if (process.env.WINNER_FOLLOW_UP_RUN_OPTIMIZATION === 'true') {
            try {
              const { runListingOptimization48h } = await import('./listing-optimization-loop.service');
              await runListingOptimization48h();
            } catch (e: any) {
              logger.warn('Scheduled Tasks: Winner follow-up optimization skipped', { error: e?.message });
            }
          }
          return { productId, listingId, marketplace };
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 2,
        }
      );
    }

    if (this.inventorySyncQueue) {
      this.inventorySyncWorker = new Worker(
        'inventory-sync',
        async (job) => {
          logger.info('Scheduled Tasks: Running inventory sync', { jobId: job.id });
          const { runInventorySync } = await import('./inventory-sync.service');
          return await runInventorySync();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.inventorySyncWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Inventory sync failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.listingMetricsAggregateQueue) {
      this.listingMetricsAggregateWorker = new Worker(
        'listing-metrics-aggregate',
        async (job) => {
          logger.info('Scheduled Tasks: Running listing metrics aggregate', { jobId: job.id });
          const { runMercadoLibreMetricsIngestion } = await import('./mercadolibre-metrics-ingestion.service');
          try {
            await runMercadoLibreMetricsIngestion();
          } catch (mlErr: any) {
            logger.warn('Scheduled Tasks: ML metrics ingestion failed (continuing aggregate)', {
              error: mlErr?.message,
            });
          }
          const { aggregateSalesIntoListingMetricsForDate } = await import('./listing-metrics-writer.service');
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          return await aggregateSalesIntoListingMetricsForDate(yesterday);
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.listingMetricsAggregateWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Listing metrics aggregate failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.marketIntelligenceQueue) {
      const { runMarketIntelligence } = await import('./market-intelligence.service');
      this.marketIntelligenceWorker = new Worker(
        'market-intelligence',
        async (job) => {
          logger.info('Scheduled Tasks: Running market intelligence', { jobId: job.id });
          const userId = job.data?.userId as number | undefined;
          return await runMarketIntelligence(userId);
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.marketIntelligenceWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Market intelligence failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.autoListingStrategyQueue) {
      const { runAutoListingStrategy } = await import('./auto-listing-strategy.service');
      this.autoListingStrategyWorker = new Worker(
        'auto-listing-strategy',
        async (job) => {
          logger.info('Scheduled Tasks: Running auto listing strategy', { jobId: job.id });
          const enqueue = job.data?.enqueueJobs !== false;
          return await runAutoListingStrategy(enqueue);
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.autoListingStrategyWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Auto listing strategy failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.dynamicMarketplaceOptimizationQueue) {
      const { runDynamicMarketplaceOptimization } = await import('./dynamic-marketplace-optimization.service');
      this.dynamicMarketplaceOptimizationWorker = new Worker(
        'dynamic-marketplace-optimization',
        async (job) => {
          logger.info('Scheduled Tasks: Running dynamic marketplace optimization', { jobId: job.id });
          const execute = job.data?.executeActions !== false;
          return await runDynamicMarketplaceOptimization(execute);
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.dynamicMarketplaceOptimizationWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Dynamic marketplace optimization failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.globalDemandRadarQueue) {
      const { runGlobalDemandRadar } = await import('./global-demand-radar.service');
      this.globalDemandRadarWorker = new Worker(
        'global-demand-radar',
        async (job) => {
          logger.info('Scheduled Tasks: Running global demand radar', { jobId: job.id });
          return await runGlobalDemandRadar();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.globalDemandRadarWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Global demand radar failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.aiStrategyBrainQueue) {
      const { runAIStrategyBrain } = await import('./ai-strategy-brain.service');
      this.aiStrategyBrainWorker = new Worker(
        'ai-strategy-brain',
        async (job) => {
          logger.info('Scheduled Tasks: Running AI Strategy Brain', { jobId: job.id });
          return await runAIStrategyBrain();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.aiStrategyBrainWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: AI Strategy Brain failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.autonomousScalingQueue) {
      const { runAutonomousScalingEngine } = await import('./autonomous-scaling-engine.service');
      this.autonomousScalingWorker = new Worker(
        'autonomous-scaling-engine',
        async (job) => {
          logger.info('Scheduled Tasks: Running Autonomous Scaling Engine', { jobId: job.id });
          return await runAutonomousScalingEngine();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.autonomousScalingWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Autonomous Scaling Engine failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.conversionRateOptimizationQueue) {
      const { runConversionRateOptimization } = await import('./conversion-rate-optimization.service');
      this.conversionRateOptimizationWorker = new Worker(
        'conversion-rate-optimization',
        async (job) => {
          logger.info('Scheduled Tasks: Running Conversion Rate Optimization', { jobId: job.id });
          return await runConversionRateOptimization(true);
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.conversionRateOptimizationWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Conversion Rate Optimization failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    // Phase 15: Listing state reconciliation — verify published listings match marketplace
    if (this.listingStateReconciliationQueue) {
      this.listingStateReconciliationWorker = new Worker(
        'listing-state-reconciliation',
        async (job) => {
          logger.info('Scheduled Tasks: Running listing state reconciliation', { jobId: job.id });
          return await listingStateReconciliationService.reconcileAll({ batchSize: 100 });
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.listingStateReconciliationWorker.on('completed', (job, result) => {
        logger.info('Scheduled Tasks: Listing state reconciliation completed', {
          jobId: job?.id,
          scanned: result?.scanned,
          updated: result?.updated,
          republishEnqueued: result?.republishEnqueued,
        });
      });
      this.listingStateReconciliationWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Listing state reconciliation failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    // Phase 26: Full Listing Recovery — audit + classification + recovery (Task 6: continuous reality sync)
    if (this.fullListingRecoveryQueue) {
      this.fullListingRecoveryWorker = new Worker(
        'full-listing-recovery',
        async (job) => {
          logger.info('Scheduled Tasks: Running Phase 26 full listing recovery', { jobId: job.id });
          const { fullListingAuditService } = await import('./full-listing-audit.service');
          const { listingClassificationEngine } = await import('./listing-classification-engine.service');
          const { listingRecoveryEngine } = await import('./listing-recovery-engine.service');
          const records = await fullListingAuditService.runFullAudit({
            limit: 1000,
            verifyWithApi: false,
            metricsDays: 30,
          });
          const classified = listingClassificationEngine.classifyBatch(records);
          const result = await listingRecoveryEngine.runRecovery(classified);
          return {
            auditCount: records.length,
            processed: result.processed,
            removedFromDb: result.removedFromDb,
            republishEnqueued: result.republishEnqueued,
            optimized: result.optimized,
            errors: result.errors,
          };
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.fullListingRecoveryWorker.on('completed', (job, result) => {
        logger.info('Scheduled Tasks: Full listing recovery completed', {
          jobId: job?.id,
          processed: result?.processed,
          removedFromDb: result?.removedFromDb,
          republishEnqueued: result?.republishEnqueued,
        });
      });
      this.fullListingRecoveryWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Full listing recovery failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    if (this.competitorIntelligenceQueue) {
      this.competitorIntelligenceWorker = new Worker(
        'competitor-intelligence',
        async (job) => {
          logger.info('Scheduled Tasks: Running competitor intelligence', { jobId: job.id });
          const { runCompetitorAnalysisForUser } = await import('./competitor-intelligence.service');
          const users = await prisma.user.findMany({
            where: { isActive: true },
            select: { id: true },
          });
          let analyzed = 0;
          const errors: string[] = [];
          for (const u of users) {
            try {
              const r = await runCompetitorAnalysisForUser(u.id);
              analyzed += r.analyzed;
              errors.push(...r.errors);
            } catch (e: any) {
              errors.push(`User ${u.id}: ${e?.message || String(e)}`);
            }
          }
          return { analyzed, usersProcessed: users.length, errors: errors.length };
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.competitorIntelligenceWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Competitor intelligence failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    // Phase 22: Autonomous Revenue Monitor — every 6 hours
    if (this.autonomousRevenueMonitorQueue) {
      this.autonomousRevenueMonitorWorker = new Worker(
        'autonomous-revenue-monitor',
        async (job) => {
          logger.info('Scheduled Tasks: Running autonomous revenue monitor', { jobId: job.id });
          const { runAutonomousRevenueMonitor } = await import('./autonomous-revenue-monitor.service');
          const report = await runAutonomousRevenueMonitor({ triggerOptimizations: true });
          const triggered = report.optimizationActions.some((a) => a.triggered);
          if (triggered) {
            if (this.dynamicPricingQueue) {
              await this.dynamicPricingQueue.add('revenue-monitor-trigger', {}, { removeOnComplete: 5 });
            }
            if (this.conversionRateOptimizationQueue) {
              this.conversionRateOptimizationQueue.add('revenue-monitor-trigger', {}, { removeOnComplete: 5 }).catch(() => {});
            }
            if (this.dynamicMarketplaceOptimizationQueue) {
              this.dynamicMarketplaceOptimizationQueue.add('revenue-monitor-trigger', { executeActions: true }, { removeOnComplete: 5 }).catch(() => {});
            }
          }
          return { reportTimestamp: report.timestamp, actionsTriggered: triggered };
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.autonomousRevenueMonitorWorker.on('completed', (job, result) => {
        logger.info('Scheduled Tasks: Autonomous revenue monitor completed', {
          jobId: job?.id,
          actionsTriggered: result?.actionsTriggered,
        });
      });
      this.autonomousRevenueMonitorWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Autonomous revenue monitor failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    // Phase 23: Sales Acceleration Mode — every 3 hours
    if (this.salesAccelerationQueue) {
      this.salesAccelerationWorker = new Worker(
        'sales-acceleration',
        async (job) => {
          logger.info('Scheduled Tasks: Running sales acceleration mode', { jobId: job.id });
          const { runSalesAccelerationMode } = await import('./sales-acceleration-mode.service');
          return await runSalesAccelerationMode();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.salesAccelerationWorker.on('completed', (job, result) => {
        logger.info('Scheduled Tasks: Sales acceleration completed', {
          jobId: job?.id,
          ran: result?.ran,
          optimizations: result?.optimizationsTriggered?.length,
        });
      });
      this.salesAccelerationWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Sales acceleration failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }

    // Phase 32: Phase 31 Sales Generation — run every 4–6 hours
    if (this.phase31SalesGenerationQueue) {
      this.phase31SalesGenerationWorker = new Worker(
        'phase31-sales-generation',
        async (job) => {
          logger.info('Scheduled Tasks: Running Phase 31 sales generation', { jobId: job.id });
          const { runSalesGenerationCycle } = await import('./phase31-sales-generation-engine.service');
          return await runSalesGenerationCycle();
        },
        {
          connection: this.bullMQRedis as any,
          concurrency: 1,
        }
      );
      this.phase31SalesGenerationWorker.on('completed', (job, result) => {
        logger.info('Scheduled Tasks: Phase 31 sales generation completed', {
          jobId: job?.id,
          winnersDetected: result?.winnersDetected,
          durationMs: result?.durationMs,
        });
        const payload = {
          at: new Date().toISOString(),
          success: result?.success ?? true,
          winnersDetected: result?.winnersDetected ?? 0,
          durationMs: result?.durationMs ?? 0,
        };
        void prisma.systemConfig
          .upsert({
            where: { key: 'phase31_last_scheduled_run' },
            create: { key: 'phase31_last_scheduled_run', value: JSON.stringify(payload) },
            update: { value: JSON.stringify(payload) },
          })
          .catch((err) => logger.error('Scheduled Tasks: failed to persist phase31_last_scheduled_run', { error: err?.message }));
      });
      this.phase31SalesGenerationWorker.on('failed', (job, err) => {
        logger.error('Scheduled Tasks: Phase 31 sales generation failed', {
          jobId: job?.id,
          error: err?.message,
        });
      });
    }
  }

  private async runAliExpressTokenRefresh(): Promise<{ refreshed: boolean; reason?: string }> {
    let token = getToken();
    if (!token) {
      try {
        await aliexpressAffiliateAPIService.loadTokenFromDatabase();
        token = getToken();
      } catch {
        return { refreshed: false, reason: 'load_from_db_failed' };
      }
    }
    if (!token?.refreshToken) {
      return { refreshed: false, reason: 'no_refresh_token' };
    }
    const expiresIn = token.expiresAt - Date.now();
    if (expiresIn > 2 * 60 * 60 * 1000) {
      return { refreshed: false, reason: 'token_still_valid' };
    }
    try {
      await refreshAccessToken(token.refreshToken);
      return { refreshed: true };
    } catch (err: any) {
      logger.error('Scheduled Tasks: AliExpress token refresh failed', { error: err?.message });
      return { refreshed: false, reason: err?.message };
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

    // Dynamic pricing: interval from DYNAMIC_PRICING_INTERVAL_HOURS (default 6)
    const repricingHours = Math.max(1, Math.min(24, Number(process.env.DYNAMIC_PRICING_INTERVAL_HOURS || '6') || 6));
    const dynamicPricingCron = `0 */${repricingHours} * * *`;
    if (this.dynamicPricingQueue) {
      this.dynamicPricingQueue.add(
        'reprice-products',
        {},
        {
          repeat: {
            pattern: dynamicPricingCron
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );
      logger.info('Scheduled Tasks: Dynamic pricing interval', { hours: repricingHours, cron: dynamicPricingCron });
    }

    // AliExpress OAuth token refresh: cada 1 hora
    if (this.aliExpressTokenRefreshQueue) {
      this.aliExpressTokenRefreshQueue.add(
        'refresh-ali-token',
        {},
        {
          repeat: {
            pattern: '0 * * * *' // Cada hora en el minuto 0
          },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Retry failed orders (insufficient funds): cada 30 min
    if (this.retryFailedOrdersQueue) {
      this.retryFailedOrdersQueue.add(
        'retry-failed-orders-job',
        {},
        {
          repeat: {
            pattern: '*/30 * * * *' // Every 30 minutes
          },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 41: Fulfillment retry engine — every 24 hours (2:00 AM)
    if (this.fulfillmentRetryEngineQueue) {
      this.fulfillmentRetryEngineQueue.add(
        'fulfillment-retry-engine-job',
        {},
        {
          repeat: {
            pattern: '0 2 * * *' // Every day at 2:00 AM
          },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Process paid orders (pending purchases): every 5 minutes
    if (this.processPaidOrdersQueue) {
      this.processPaidOrdersQueue.add(
        'process-paid-orders-job',
        {},
        {
          repeat: {
            pattern: '*/5 * * * *' // Every 5 minutes
          },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 40: Marketplace order sync (eBay real orders) every 10 minutes
    if (this.marketplaceOrderSyncQueue) {
      this.marketplaceOrderSyncQueue.add(
        'marketplace-order-sync-job',
        {},
        {
          repeat: { pattern: process.env.MARKETPLACE_ORDER_SYNC_CRON || '*/10 * * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Mercado Libre order sync every 10 minutes
    if (this.mercadolibreOrderSyncQueue) {
      this.mercadolibreOrderSyncQueue.add(
        'mercadolibre-order-sync-job',
        {},
        {
          repeat: { pattern: process.env.MERCADOLIBRE_ORDER_SYNC_CRON || '*/10 * * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Amazon order sync every 10 minutes
    if (this.amazonOrderSyncQueue) {
      this.amazonOrderSyncQueue.add(
        'amazon-order-sync-job',
        {},
        {
          repeat: { pattern: process.env.AMAZON_ORDER_SYNC_CRON || '*/10 * * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // eBay traffic sync: cada 12h (configurable via EBAY_TRAFFIC_SYNC_CRON, default 0 */12 * * *)
    const ebaySyncCron = process.env.EBAY_TRAFFIC_SYNC_CRON || '0 */12 * * *';
    if (this.ebayTrafficSyncQueue) {
      this.ebayTrafficSyncQueue.add(
        'sync-view-counts',
        {},
        {
          repeat: { pattern: ebaySyncCron },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Spec: listing optimization every 48h (impressions>200 and sales==0 -> reprice, optional title refresh)
    if (this.listingOptimization48hQueue) {
      this.listingOptimization48hQueue.add(
        'listing-optimization-48h-run',
        {},
        {
          repeat: { pattern: process.env.LISTING_OPTIMIZATION_48H_CRON || '0 0 */2 * *' }, // Every 2 days at midnight
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Spec: winner detection every 24h (sales in last 3 days >= 5 -> mark winner)
    if (this.winnerDetectionQueue) {
      this.winnerDetectionQueue.add(
        'winner-detection-run',
        {},
        {
          repeat: { pattern: process.env.WINNER_DETECTION_CRON || '0 2 * * *' }, // 2:00 AM daily
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 1: Inventory sync every 6 hours (Phase 18: attempts for recovery)
    if (this.inventorySyncQueue) {
      this.inventorySyncQueue.add(
        'inventory-sync-run',
        {},
        {
          repeat: { pattern: process.env.INVENTORY_SYNC_CRON || '0 */6 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
          attempts: 2,
          backoff: { type: 'exponential', delay: 120000 },
        }
      );
    }

    // Phase 5: Listing metrics aggregate (sales → listing_metrics) daily at 3:30 AM
    if (this.listingMetricsAggregateQueue) {
      this.listingMetricsAggregateQueue.add(
        'listing-metrics-aggregate-run',
        {},
        {
          repeat: { pattern: process.env.LISTING_METRICS_AGGREGATE_CRON || '30 3 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 4: Market Intelligence — daily at 5:00 AM
    if (this.marketIntelligenceQueue) {
      this.marketIntelligenceQueue.add(
        'market-intelligence-run',
        {},
        {
          repeat: { pattern: process.env.MARKET_INTELLIGENCE_CRON || '0 5 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 5: Auto Listing Strategy — daily at 6:00 AM (after market intelligence)
    if (this.autoListingStrategyQueue) {
      this.autoListingStrategyQueue.add(
        'auto-listing-strategy-run',
        { enqueueJobs: true },
        {
          repeat: { pattern: process.env.AUTO_LISTING_STRATEGY_CRON || '0 6 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 6: Dynamic Marketplace Optimization — every 12 hours
    if (this.dynamicMarketplaceOptimizationQueue) {
      this.dynamicMarketplaceOptimizationQueue.add(
        'dynamic-marketplace-optimization-run',
        { executeActions: true },
        {
          repeat: { pattern: process.env.DYNAMIC_OPTIMIZATION_CRON || '0 */12 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 7: Global Demand Radar — daily at 4:00 AM
    if (this.globalDemandRadarQueue) {
      this.globalDemandRadarQueue.add(
        'global-demand-radar-run',
        {},
        {
          repeat: { pattern: process.env.GLOBAL_DEMAND_RADAR_CRON || '0 4 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 8: AI Strategy Brain — daily at 7:00 AM
    if (this.aiStrategyBrainQueue) {
      this.aiStrategyBrainQueue.add(
        'ai-strategy-brain-run',
        {},
        {
          repeat: { pattern: process.env.AI_STRATEGY_BRAIN_CRON || '0 7 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 9: Autonomous Scaling Engine — daily at 8:00 AM
    if (this.autonomousScalingQueue) {
      this.autonomousScalingQueue.add(
        'autonomous-scaling-run',
        {},
        {
          repeat: { pattern: process.env.AUTONOMOUS_SCALING_CRON || '0 8 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 11: Conversion Rate Optimization — every 12 hours
    if (this.conversionRateOptimizationQueue) {
      this.conversionRateOptimizationQueue.add(
        'conversion-rate-optimization-run',
        {},
        {
          repeat: { pattern: process.env.CRO_CRON || '0 */12 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
    }

    // Phase 15: Listing state reconciliation — every 30 minutes (Phase 18: attempts for recovery)
    if (this.listingStateReconciliationQueue) {
      this.listingStateReconciliationQueue.add(
        'listing-state-reconciliation-run',
        {},
        {
          repeat: { pattern: process.env.LISTING_RECONCILIATION_CRON || '*/30 * * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
          attempts: 2,
          backoff: { type: 'exponential', delay: 60000 },
        }
      );
      // Optional: one reconciliation pass on startup (env RUN_LISTING_RECONCILIATION_ON_STARTUP=true)
      if (process.env.RUN_LISTING_RECONCILIATION_ON_STARTUP === 'true') {
        this.listingStateReconciliationQueue.add(
          'startup-reconciliation',
          {},
          { jobId: 'startup-reconciliation', removeOnComplete: 3, removeOnFail: 3 }
        ).then(() => {
          logger.info('Scheduled Tasks: Startup reconciliation job enqueued (RUN_LISTING_RECONCILIATION_ON_STARTUP=true)');
        }).catch((err: any) => {
          logger.warn('Scheduled Tasks: Failed to enqueue startup reconciliation', { error: err?.message });
        });
      }
    }

    // Phase 26: Full Listing Recovery — every 6 hours (Task 6: continuous reality sync)
    const fullListingRecoveryCron = process.env.FULL_LISTING_RECOVERY_CRON || '0 */6 * * *';
    if (this.fullListingRecoveryQueue) {
      this.fullListingRecoveryQueue.add(
        'full-listing-recovery-run',
        {},
        {
          repeat: { pattern: fullListingRecoveryCron },
          removeOnComplete: 5,
          removeOnFail: 5,
          attempts: 2,
          backoff: { type: 'exponential', delay: 120000 },
        }
      );
      logger.info('Scheduled Tasks: Full listing recovery (Phase 26) scheduled', { cron: fullListingRecoveryCron });
    }

    // Phase 18: Competitor Intelligence — daily at 5:30 AM (after market intelligence)
    if (this.competitorIntelligenceQueue) {
      this.competitorIntelligenceQueue.add(
        'competitor-intelligence-run',
        {},
        {
          repeat: { pattern: process.env.COMPETITOR_INTELLIGENCE_CRON || '30 5 * * *' },
          removeOnComplete: 5,
          removeOnFail: 5,
          attempts: 2,
          backoff: { type: 'exponential', delay: 120000 },
        }
      );
    }

    // Phase 22: Autonomous Revenue Monitor — every 6 hours
    const revenueMonitorCron = process.env.REVENUE_MONITOR_CRON || '0 */6 * * *';
    if (this.autonomousRevenueMonitorQueue) {
      this.autonomousRevenueMonitorQueue.add(
        'autonomous-revenue-monitor-run',
        {},
        {
          repeat: { pattern: revenueMonitorCron },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
      logger.info('Scheduled Tasks: Autonomous revenue monitor scheduled', { cron: revenueMonitorCron });
    }

    // Phase 23: Sales Acceleration Mode — every 3 hours
    const salesAccelerationCron = process.env.SALES_ACCELERATION_CRON || '0 */3 * * *';
    if (this.salesAccelerationQueue) {
      this.salesAccelerationQueue.add(
        'sales-acceleration-run',
        {},
        {
          repeat: { pattern: salesAccelerationCron },
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );
      logger.info('Scheduled Tasks: Sales acceleration scheduled', { cron: salesAccelerationCron });
    }

    // Phase 32: Phase 31 every 4–6 hours (env PHASE31_SALES_GENERATION_CRON, default every 5h)
    const phase31SalesGenerationCron = process.env.PHASE31_SALES_GENERATION_CRON || '0 */5 * * *';
    if (this.phase31SalesGenerationQueue) {
      this.phase31SalesGenerationQueue.add(
        'phase31-sales-generation-run',
        {},
        {
          repeat: { pattern: phase31SalesGenerationCron },
          removeOnComplete: 5,
          removeOnFail: 5,
          attempts: 2,
        }
      );
      logger.info('Scheduled Tasks: Phase 31 sales generation (Phase 32) scheduled', { cron: phase31SalesGenerationCron });
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

      for (const commission of pendingCommissions) {
        try {
          // ✅ Convertir Decimal a number para operaciones aritméticas
          const commissionAmount = toNumber(commission.amount);
          // PayPal por comisión: usar environment de la comisión (production/sandbox)
          const commissionEnv = (commission as any).environment === 'production' ? 'production' : 'sandbox';
          let paypalService: PayPalPayoutService | null = null;
          try {
            paypalService = await PayPalPayoutService.fromUserCredentials(commission.userId, commissionEnv);
          } catch (error) {
            logger.warn('Scheduled Tasks: PayPal service not available for commission', { commissionId: commission.id, environment: commissionEnv });
          }

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
   * Phase 3: Enqueue winner follow-up job (optional optimization / scaling).
   * Called from winner-detection.service when WINNER_TRIGGER_FOLLOW_UP=true.
   */
  async addWinnerFollowUpJob(payload: { productId: number; listingId: number; marketplace: string; userId: number }): Promise<void> {
    if (!this.winnerFollowUpQueue) return;
    await this.winnerFollowUpQueue.add('winner-follow-up-one', payload, {
      removeOnComplete: 50,
      removeOnFail: 10,
    });
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
    if (this.dynamicPricingQueue) {
      await this.dynamicPricingQueue.close();
    }
    if (this.dynamicPricingWorker) {
      await this.dynamicPricingWorker.close();
    }
    if (this.ebayTrafficSyncWorker) {
      await this.ebayTrafficSyncWorker.close();
    }
    if (this.listingOptimization48hWorker) {
      await this.listingOptimization48hWorker.close();
    }
    if (this.winnerDetectionWorker) {
      await this.winnerDetectionWorker.close();
    }
    if (this.winnerFollowUpWorker) {
      await this.winnerFollowUpWorker.close();
    }
    if (this.winnerFollowUpQueue) {
      await this.winnerFollowUpQueue.close();
    }
    if (this.ebayTrafficSyncQueue) {
      await this.ebayTrafficSyncQueue.close();
    }
    if (this.listingOptimization48hQueue) {
      await this.listingOptimization48hQueue.close();
    }
    if (this.winnerDetectionQueue) {
      await this.winnerDetectionQueue.close();
    }
    if (this.inventorySyncWorker) {
      await this.inventorySyncWorker.close();
    }
    if (this.inventorySyncQueue) {
      await this.inventorySyncQueue.close();
    }
    if (this.listingMetricsAggregateWorker) {
      await this.listingMetricsAggregateWorker.close();
    }
    if (this.listingMetricsAggregateQueue) {
      await this.listingMetricsAggregateQueue.close();
    }
    if (this.competitorIntelligenceWorker) {
      await this.competitorIntelligenceWorker.close();
    }
    if (this.competitorIntelligenceQueue) {
      await this.competitorIntelligenceQueue.close();
    }
    if (this.autonomousRevenueMonitorWorker) {
      await this.autonomousRevenueMonitorWorker.close();
    }
    if (this.autonomousRevenueMonitorQueue) {
      await this.autonomousRevenueMonitorQueue.close();
    }
    if (this.salesAccelerationWorker) {
      await this.salesAccelerationWorker.close();
    }
    if (this.salesAccelerationQueue) {
      await this.salesAccelerationQueue.close();
    }
    if (this.phase31SalesGenerationWorker) {
      await this.phase31SalesGenerationWorker.close();
    }
    if (this.phase31SalesGenerationQueue) {
      await this.phase31SalesGenerationQueue.close();
    }
    if (this.fullListingRecoveryWorker) {
      await this.fullListingRecoveryWorker.close();
    }
    if (this.fullListingRecoveryQueue) {
      await this.fullListingRecoveryQueue.close();
    }
  }

  /**
   * ✅ Evolution: Run dynamic pricing for published products
   */
  private async runDynamicPricing(): Promise<{ processed: number; errors: number }> {
    const { dynamicPricingService } = await import('./dynamic-pricing.service');
    const products = await prisma.product.findMany({
      where: { isPublished: true, status: { in: ['PUBLISHED', 'APPROVED'] } },
      select: { id: true, userId: true, aliexpressPrice: true, totalCost: true },
      take: 50,
    });
    let processed = 0;
    let errors = 0;
    for (const p of products) {
      try {
        const supplierPrice = Number(p.totalCost ?? p.aliexpressPrice ?? 0);
        if (supplierPrice <= 0) continue;
        const result = await dynamicPricingService.repriceByProduct(
          p.id,
          supplierPrice,
          'ebay',
          p.userId
        );
        if (result.success) processed++;
        else errors++;
      } catch (e) {
        errors++;
      }
    }
    return { processed, errors };
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
        let userUnpublished = 0;
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
            // ✅ FIX: Sale has productId (not listingId). Count sales for this product in last 30 days.
            const salesCount = await prisma.sale.count({
              where: {
                userId: user.id,
                productId: product.id,
                createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
              }
            });
            const totalSales = salesCount;
            const conversionRate = totalViews > 0 ? (totalSales / totalViews) * 100 : 0;
            const minConversionRate = Number(process.env.MIN_CONVERSION_RATE || '0.5');

            if (totalViews >= 100 && conversionRate < minConversionRate) {
              shouldUnpublish = true;
              reasons.push(`Baja conversión (${conversionRate.toFixed(2)}%)`);
            }

            // ✅ FIX: Sale has productId. Get last sale for this product.
            const lastSale = await prisma.sale.findFirst({
              where: {
                userId: user.id,
                productId: product.id
              },
              orderBy: { createdAt: 'desc' }
            });
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
                userUnpublished++;
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

          // ✅ 2-1-trigger: Run autopilot cycle to replace unpublished product
          if (userUnpublished > 0) {
            try {
              const { autopilotSystem } = await import('./autopilot.service');
              await autopilotSystem.runSingleCycle(undefined, user.id);
              logger.info('Autopilot replacement cycle triggered after unpublish', {
                userId: user.id,
                unpublishedCount: userUnpublished,
              });
            } catch (cycleErr: any) {
              logger.warn('Autopilot replacement cycle failed after unpublish', {
                userId: user.id,
                error: cycleErr?.message || String(cycleErr),
              });
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

