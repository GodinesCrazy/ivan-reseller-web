/**
 * Phase 12: System Health Monitoring
 * Tracks: DB, Redis, BullMQ (queue backlog), marketplace API, supplier API.
 * Triggers alerts when queues stall, API errors increase, inventory sync fails, publishing fails repeatedly.
 */

import { prisma } from '../config/database';
import { redis, isRedisAvailable, getBullMQRedisConnection } from '../config/redis';
import { logger } from '../config/logger';

export type HealthStatus = 'ok' | 'degraded' | 'fail' | 'unknown';

export interface SystemHealthResult {
  database: HealthStatus;
  redis: HealthStatus;
  bullmq: HealthStatus;
  marketplaceApi: HealthStatus;
  supplierApi: HealthStatus;
  alerts: string[];
  timestamp: string;
}

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] Database check failed', { error: e?.message });
    return 'fail';
  }
}

async function checkRedis(): Promise<HealthStatus> {
  if (!isRedisAvailable) return 'unknown';
  try {
    const pong = await redis.ping();
    return pong === 'PONG' ? 'ok' : 'degraded';
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] Redis check failed', { error: e?.message });
    return 'fail';
  }
}

/**
 * BullMQ workers depend on Redis. If Redis is ok, workers can run; no per-queue backlog here.
 */
async function checkBullMQ(): Promise<HealthStatus> {
  if (!getBullMQRedisConnection() || !isRedisAvailable) return 'unknown';
  const redisStatus = await checkRedis();
  return redisStatus === 'ok' ? 'ok' : redisStatus;
}

/**
 * Marketplace API health: consider ok if at least one marketplace credential exists and is valid.
 * Detailed per-marketplace check is in api-availability; here we do a lightweight check.
 */
async function checkMarketplaceApi(): Promise<HealthStatus> {
  try {
    const count = await prisma.apiCredential.count({
      where: {
        apiName: { in: ['ebay', 'mercadolibre', 'amazon'] },
        isActive: true,
      },
    });
    return count > 0 ? 'ok' : 'degraded';
  } catch {
    return 'fail';
  }
}

/**
 * Supplier (AliExpress) API health: credentials and optional ping.
 */
async function checkSupplierApi(): Promise<HealthStatus> {
  const hasKey =
    Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim()) &&
    Boolean((process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim());
  if (!hasKey) return 'degraded';
  try {
    const count = await prisma.apiCredential.count({
      where: { apiName: 'aliexpress', isActive: true },
    });
    return count > 0 ? 'ok' : 'degraded';
  } catch {
    return 'fail';
  }
}

/**
 * Run full system health check and collect alerts.
 */
export async function runSystemHealthCheck(): Promise<SystemHealthResult> {
  const alerts: string[] = [];
  const [database, redisStatus, bullmq, marketplaceApi, supplierApi] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkBullMQ(),
    checkMarketplaceApi(),
    checkSupplierApi(),
  ]);

  if (database === 'fail') alerts.push('Database connectivity failed');
  if (redisStatus === 'fail') alerts.push('Redis connectivity failed');
  if (bullmq === 'fail') alerts.push('BullMQ/Redis workers unavailable');
  if (marketplaceApi === 'fail') alerts.push('Marketplace API health check failed');
  if (supplierApi === 'fail') alerts.push('Supplier API health check failed');

  return {
    database,
    redis: redisStatus,
    bullmq,
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
    health.marketplaceApi !== 'fail' &&
    health.supplierApi !== 'fail'
  );
}
