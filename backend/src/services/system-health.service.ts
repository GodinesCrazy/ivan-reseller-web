/**
 * Phase 12: System Health Monitoring
 * Phase 23: Redis and Worker health return ok/fail/degraded (no "unknown" when REDIS_URL set).
 * Tracks: DB, Redis, BullMQ (workers), marketplace API, supplier API.
 */

import { prisma } from '../config/database';
import { redis, getBullMQRedisConnection } from '../config/redis';
import { logger } from '../config/logger';
import { APIAvailabilityService } from './api-availability.service';

const REDIS_URL = process.env.REDIS_URL;
const apiAvailability = new APIAvailabilityService();
const HEALTH_CHECK_TIMEOUT_MS = 1200;

export type HealthStatus = 'ok' | 'degraded' | 'fail' | 'unknown';

export interface SystemHealthResult {
  database: HealthStatus;
  redis: HealthStatus;
  bullmq: HealthStatus;
  workers: HealthStatus;
  marketplaceApi: HealthStatus;
  supplierApi: HealthStatus;
  alerts: string[];
  timestamp: string;
}

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('database_health_timeout')), HEALTH_CHECK_TIMEOUT_MS)
      ),
    ]);
    return 'ok';
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] Database check failed', { error: e?.message });
    return 'fail';
  }
}

async function getHealthApiStatuses(options?: {
  userId?: number;
  apiStatuses?: Awaited<ReturnType<APIAvailabilityService['getAllAPIStatus']>>;
}) {
  if (Array.isArray(options?.apiStatuses)) {
    return options.apiStatuses;
  }

  const preferredUserId = options?.userId;
  if (preferredUserId) {
    return apiAvailability.getAllAPIStatus(preferredUserId);
  }

  const primaryUser = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: [{ role: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (!primaryUser) return [];
  return apiAvailability.getAllAPIStatus(primaryUser.id);
}

/**
 * Phase 23: Always attempt Redis ping; return ok when connected, fail when error, degraded when no URL.
 */
async function checkRedis(): Promise<HealthStatus> {
  if (!REDIS_URL || REDIS_URL.trim() === '') {
    return 'degraded'; // No Redis configured (was "unknown")
  }
  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('redis_health_timeout')), HEALTH_CHECK_TIMEOUT_MS)
      ),
    ]);
    return pong === 'PONG' ? 'ok' : 'degraded';
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] Redis check failed', { error: e?.message });
    return 'fail';
  }
}

/**
 * BullMQ depends on Redis. When REDIS_URL set and Redis ping ok, BullMQ can run.
 */
async function checkBullMQ(): Promise<HealthStatus> {
  if (!REDIS_URL || REDIS_URL.trim() === '') return 'degraded';
  const conn = getBullMQRedisConnection();
  if (!conn) return 'degraded';
  try {
    const pong = await Promise.race([
      conn.ping(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('bullmq_health_timeout')), HEALTH_CHECK_TIMEOUT_MS)
      ),
    ]);
    return pong === 'PONG' ? 'ok' : 'degraded';
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] BullMQ Redis check failed', { error: e?.message });
    return 'fail';
  }
}

/**
 * Phase 23: Worker health derived from Redis + BullMQ (workers use same Redis).
 */
function deriveWorkersStatus(redisStatus: HealthStatus, bullmq: HealthStatus): HealthStatus {
  if (redisStatus === 'ok' && bullmq === 'ok') return 'ok';
  if (redisStatus === 'fail' || bullmq === 'fail') return 'fail';
  return 'degraded';
}

/**
 * Marketplace API health: consider ok if at least one marketplace credential exists and is valid.
 * Detailed per-marketplace check is in api-availability; here we do a lightweight check.
 */
function deriveApiHealthFromStatuses(
  statuses: any[],
  apiNames: string[]
): HealthStatus {
  const relevant = (Array.isArray(statuses) ? statuses : []).filter((status) =>
    apiNames.includes(String(status.apiName).toLowerCase()) && status.environment !== 'sandbox'
  );
  if (relevant.some((status) => status.isConfigured && status.isAvailable)) {
    return 'ok';
  }
  if (relevant.some((status) => status.isConfigured && !status.isAvailable)) {
    return 'fail';
  }
  return 'degraded';
}

async function checkMarketplaceApi(options?: {
  userId?: number;
  apiStatuses?: Awaited<ReturnType<APIAvailabilityService['getAllAPIStatus']>>;
}): Promise<HealthStatus> {
  try {
    const statuses = await getHealthApiStatuses(options);
    return deriveApiHealthFromStatuses(statuses, ['ebay', 'mercadolibre', 'amazon']);
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] Marketplace API real check failed', { error: e?.message });
    return 'fail';
  }
}

/**
 * Supplier (AliExpress) API health: credentials and optional ping.
 */
async function checkSupplierApi(options?: {
  userId?: number;
  apiStatuses?: Awaited<ReturnType<APIAvailabilityService['getAllAPIStatus']>>;
}): Promise<HealthStatus> {
  try {
    const statuses = await getHealthApiStatuses(options);
    return deriveApiHealthFromStatuses(statuses, [
      'aliexpress-dropshipping',
      'aliexpress-affiliate',
      'aliexpress',
    ]);
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] Supplier API real check failed', { error: e?.message });
    return 'fail';
  }
}

/**
 * Run full system health check and collect alerts.
 */
export async function runSystemHealthCheck(options?: {
  userId?: number;
  apiStatuses?: Awaited<ReturnType<APIAvailabilityService['getAllAPIStatus']>>;
}): Promise<SystemHealthResult> {
  const alerts: string[] = [];
  const [database, redisStatus, bullmq, marketplaceApi, supplierApi] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkBullMQ(),
    checkMarketplaceApi(options),
    checkSupplierApi(options),
  ]);
  const workers = deriveWorkersStatus(redisStatus, bullmq);

  if (database === 'fail') alerts.push('Database connectivity failed');
  if (redisStatus === 'fail') alerts.push('Redis connectivity failed');
  if (bullmq === 'fail') alerts.push('BullMQ/Redis workers unavailable');
  if (workers === 'fail') alerts.push('Workers unavailable');
  if (marketplaceApi === 'fail') alerts.push('Marketplace API health check failed');
  if (supplierApi === 'fail') alerts.push('Supplier API health check failed');

  return {
    database,
    redis: redisStatus,
    bullmq,
    workers,
    marketplaceApi,
    supplierApi,
    alerts,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Returns true if all critical deps are ok (for autonomous mode readiness).
 */
export function isSystemReadyForAutonomous(health: SystemHealthResult): boolean {
  return (
    health.database === 'ok' &&
    health.redis !== 'fail' &&
    health.marketplaceApi === 'ok' &&
    health.supplierApi === 'ok'
  );
}
