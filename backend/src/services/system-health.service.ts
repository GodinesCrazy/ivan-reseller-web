/**
 * Phase 12: System Health Monitoring
 * Phase 23: Redis and Worker health return ok/fail/degraded (no "unknown" when REDIS_URL set).
 * Tracks: DB, Redis, BullMQ (workers), marketplace API, supplier API.
 */

import { prisma } from '../config/database';
import { redis, getBullMQRedisConnection } from '../config/redis';
import { logger } from '../config/logger';

const REDIS_URL = process.env.REDIS_URL;

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
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (e: any) {
    logger.warn('[SYSTEM-HEALTH] Database check failed', { error: e?.message });
    return 'fail';
  }
}

/**
 * Phase 23: Always attempt Redis ping; return ok when connected, fail when error, degraded when no URL.
 */
async function checkRedis(): Promise<HealthStatus> {
  if (!REDIS_URL || REDIS_URL.trim() === '') {
    return 'degraded'; // No Redis configured (was "unknown")
  }
  try {
    const pong = await redis.ping();
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
    const pong = await conn.ping();
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
    health.marketplaceApi !== 'fail' &&
    health.supplierApi !== 'fail'
  );
}
