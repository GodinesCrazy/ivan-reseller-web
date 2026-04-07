import { env } from '../config/env';

/** When true, ML inbound webhook must persist + enqueue to BullMQ (no silent sync-only success path). */
export function mercadoLibreWebhookRequiresBullmq(): boolean {
  if (env.ML_WEBHOOK_REQUIRE_ASYNC_QUEUE === true) return true;
  if (env.ML_WEBHOOK_REQUIRE_ASYNC_QUEUE === false) return false;
  return env.NODE_ENV === 'production' && !env.SAFE_BOOT;
}

/** When true, approve→Mercado Libre must use the publishing queue (blocks sync fallback). */
export function mercadoLibrePublishRequiresRedisQueue(): boolean {
  if (env.ML_PUBLISH_REQUIRE_REDIS_QUEUE === true) return true;
  if (env.ML_PUBLISH_REQUIRE_REDIS_QUEUE === false) return false;
  return env.NODE_ENV === 'production' && !env.SAFE_BOOT;
}
