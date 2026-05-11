import { Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';
import logger from '../config/logger';

const bullMQRedis = getBullMQRedisConnection();

export const CJ_SHOPIFY_USA_AUTOMATION_QUEUE_NAME = 'cj-shopify-usa-automation';

export const cjShopifyUsaAutomationQueue: Queue | null =
  isRedisAvailable && bullMQRedis
    ? new Queue(CJ_SHOPIFY_USA_AUTOMATION_QUEUE_NAME, {
        connection: bullMQRedis as any,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 12_000 },
          removeOnComplete: 25,
          removeOnFail: 40,
        },
      })
    : null;

export interface CjShopifyUsaAutomationJobData {
  userId: number;
}

/**
 * Enqueues a CJ→Shopify USA automation cycle when Redis/BullMQ is available.
 * Returns null when queues are disabled (caller should run in-process).
 */
export async function enqueueCjShopifyUsaAutomationCycle(userId: number): Promise<Job<CjShopifyUsaAutomationJobData> | null> {
  if (!cjShopifyUsaAutomationQueue) {
    return null;
  }
  try {
    return await cjShopifyUsaAutomationQueue.add(
      'run-cycle',
      { userId } satisfies CjShopifyUsaAutomationJobData,
      {
        jobId: `cj-shopify-usa-auto-${userId}-${Date.now()}`,
      },
    );
  } catch (error) {
    logger.warn('[cj-shopify-usa-automation] enqueue failed, will fall back to in-process cycle', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
