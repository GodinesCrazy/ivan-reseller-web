/**
 * API Health Check Queue Service
 * Maneja verificaciones de salud de APIs de forma asíncrona usando BullMQ
 * Esto previene bloqueos y crashes SIGSEGV durante verificaciones
 */

import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';
import { APIAvailabilityService } from './api-availability.service';
import { notificationService } from './notification.service';
import { resolveToFrontend, resolveToCanonical } from '../utils/api-name-resolver';

export interface APIHealthCheckJobData {
  userId: number;
  apiName: string; // Nombre canónico del backend
  environment?: 'sandbox' | 'production';
}

const bullMQRedis = getBullMQRedisConnection();

// Queue para health checks asíncronos
export const apiHealthCheckQueue = isRedisAvailable && bullMQRedis
  ? new Queue('api-health-check', { connection: bullMQRedis as any })
  : null;

// Worker para procesar health checks
let apiHealthCheckWorker: Worker | null = null;

if (isRedisAvailable && bullMQRedis && apiHealthCheckQueue) {
  apiHealthCheckWorker = new Worker(
    'api-health-check',
    async (job: Job<APIHealthCheckJobData>) => {
      const { userId, apiName, environment = 'production' } = job.data;
      
      logger.info('[APIHealthCheckQueue] Processing health check job', {
        jobId: job.id,
        userId,
        apiName,
        environment
      });

      try {
        // ✅ FASE 1: Ejecutar health check con timeout estricto
        const apiAvailability = new APIAvailabilityService();
        let status;

        // ✅ FASE 1: Wrapper con timeout para prevenir bloqueos
        const healthCheckPromise = (async () => {
          // Ejecutar el health check apropiado según el nombre de la API
          switch (apiName.toLowerCase()) {
          case 'serpapi':
            status = await apiAvailability.checkSerpAPI(userId);
            break;
          case 'ebay':
            status = await apiAvailability.checkEbayAPI(userId, environment);
            break;
          case 'amazon':
            status = await apiAvailability.checkAmazonAPI(userId, environment);
            break;
          case 'mercadolibre':
            status = await apiAvailability.checkMercadoLibreAPI(userId, environment);
            break;
          case 'paypal':
            status = await apiAvailability.checkPayPalAPI(userId, environment);
            break;
          case 'groq':
            status = await apiAvailability.checkGroqAPI(userId);
            break;
          case 'scraperapi':
            status = await apiAvailability.checkScraperAPI(userId);
            break;
          case 'zenrows':
            status = await apiAvailability.checkZenRowsAPI(userId);
            break;
          case '2captcha':
            status = await apiAvailability.check2CaptchaAPI(userId);
            break;
          case 'aliexpress':
            status = await apiAvailability.checkAliExpressAPI(userId);
            break;
          case 'email':
            status = await apiAvailability.checkEmailAPI(userId);
            break;
          case 'twilio':
            status = await apiAvailability.checkTwilioAPI(userId);
            break;
          case 'slack':
            status = await apiAvailability.checkSlackAPI(userId);
            break;
          case 'openai':
            status = await apiAvailability.checkOpenAIAPI(userId);
            break;
          default:
            logger.warn('[APIHealthCheckQueue] Unknown API name', { apiName });
            throw new Error(`Unknown API: ${apiName}`);
          }
        })();

        // ✅ FASE 1: Timeout estricto de 25 segundos (menos que el timeout del worker)
        status = await Promise.race([
          healthCheckPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout after 25s')), 25000)
          ),
        ]);

        // Emitir actualización de estado vía WebSocket
        const frontendApiName = resolveToFrontend(apiName);
        notificationService.emitAPIStatusUpdate(userId, {
          ...status,
          apiName: frontendApiName, // Mapear a nombre de frontend
        });

        logger.info('[APIHealthCheckQueue] Health check completed', {
          jobId: job.id,
          userId,
          apiName,
          status: status.status,
          isConfigured: status.isConfigured,
          isAvailable: status.isAvailable
        });

        return {
          success: true,
          status,
        };
      } catch (error: any) {
        // ✅ FASE 1: Distinguir entre timeout y otros errores
        const isTimeout = error instanceof Error && error.message.includes('timeout');
        const logLevel = isTimeout ? 'warn' : 'error';
        
        logger[logLevel]('[APIHealthCheckQueue] Health check failed', {
          jobId: job.id,
          userId,
          apiName,
          error: error.message,
          isTimeout,
          ...(logLevel === 'error' && { stack: error.stack }),
        });

        // Emitir estado de error vía WebSocket
        const frontendApiName = resolveToFrontend(apiName);
        try {
          notificationService.emitAPIStatusUpdate(userId, {
            apiName: frontendApiName,
            name: `${apiName} API`,
            isConfigured: false,
            isAvailable: false,
            status: 'unhealthy',
            error: error.message,
            message: `Error verificando API: ${error.message}`,
            lastChecked: new Date(),
            environment,
          } as any);
        } catch (err: any) {
          logger.warn('[APIHealthCheckQueue] Failed to emit error status', { error: err });
        }

        throw error;
      }
    },
    {
      connection: bullMQRedis as any,
      concurrency: 2, // ✅ FASE 1: Reducir concurrencia para prevenir SIGSEGV (2 en lugar de 3)
      removeOnComplete: {
        age: 3600, // Mantener jobs completados por 1 hora
        count: 100, // Mantener máximo 100 jobs completados
      },
      removeOnFail: {
        age: 86400, // Mantener jobs fallidos por 24 horas
      },
      // ✅ FASE 1: Timeout global para jobs (30 segundos)
      // Si un health check tarda más, se marca como fallido
      timeout: 30000,
    }
  );

  // Event listeners para el worker
  apiHealthCheckWorker.on('completed', (job) => {
    logger.debug('[APIHealthCheckQueue] Job completed', {
      jobId: job.id,
      userId: job.data.userId,
      apiName: job.data.apiName
    });
  });

  apiHealthCheckWorker.on('failed', (job, err) => {
    logger.error('[APIHealthCheckQueue] Job failed', {
      jobId: job?.id,
      userId: job?.data?.userId,
      apiName: job?.data?.apiName,
      error: err.message,
      attempts: job?.attemptsMade
    });
  });

  logger.info('[APIHealthCheckQueue] Worker initialized');
}

/**
 * Servicio para encolar health checks de APIs
 */
class APIHealthCheckQueueService {
  /**
   * Encolar un health check asíncrono
   */
  async enqueueHealthCheck(
    userId: number,
    apiName: string,
    environment: 'sandbox' | 'production' = 'production',
    options?: {
      priority?: number;
      delay?: number;
    }
  ): Promise<string | null> {
    if (!apiHealthCheckQueue) {
      logger.warn('[APIHealthCheckQueue] Queue not available (Redis disabled)');
      return null;
    }

    // Normalizar nombre de API a canónico
    const canonicalApiName = resolveToCanonical(apiName);

    try {
      const job = await apiHealthCheckQueue.add(
        'check-api-health',
        {
          userId,
          apiName: canonicalApiName,
          environment,
        } as APIHealthCheckJobData,
        {
          priority: options?.priority || 5,
          delay: options?.delay || 0,
          attempts: 3, // Reintentar hasta 3 veces
          backoff: {
            type: 'exponential',
            delay: 2000, // 2s, 4s, 8s
          },
        }
      );

      logger.debug('[APIHealthCheckQueue] Health check enqueued', {
        jobId: job.id,
        userId,
        apiName: canonicalApiName,
        environment
      });

      return job.id;
    } catch (error: any) {
      logger.error('[APIHealthCheckQueue] Failed to enqueue health check', {
        error: error.message,
        userId,
        apiName: canonicalApiName,
        environment
      });
      return null;
    }
  }

  /**
   * Obtener el estado de un job de health check
   */
  async getJobStatus(jobId: string): Promise<any> {
    if (!apiHealthCheckQueue) {
      return null;
    }

    try {
      const job = await apiHealthCheckQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      return {
        id: job.id,
        state,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      };
    } catch (error: any) {
      logger.error('[APIHealthCheckQueue] Failed to get job status', {
        error: error.message,
        jobId
      });
      return null;
    }
  }
}

// Export singleton instance
export const apiHealthCheckQueueService = new APIHealthCheckQueueService();
