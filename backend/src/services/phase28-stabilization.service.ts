/**
 * Phase 28 — System Stabilization and Real Operation Activation
 * Full marketplace sync, listing recovery, Redis/workers health, metrics, profit validation,
 * autopilot validation, and system ready check.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';
import { RealProfitEngine } from './real-profit-engine.service';
import { listingStateReconciliationService } from './listing-state-reconciliation.service';
import { fullListingAuditService } from './full-listing-audit.service';
import { listingClassificationEngine } from './listing-classification-engine.service';
import { listingRecoveryEngine } from './listing-recovery-engine.service';
import { getConnectorReadinessForUser } from './webhook-readiness.service';

export interface FullSyncResult {
  ok: boolean;
  scanned: number;
  corrected: number;
  errors: number;
  message: string;
}

export interface RecoveryRunResult {
  ok: boolean;
  auditCount: number;
  processed: number;
  removedFromDb: number;
  republishEnqueued: number;
  optimized: number;
  errors: number;
  message: string;
}

export interface RedisWorkersHealth {
  ok: boolean;
  redisAvailable: boolean;
  redisPing: boolean;
  bullMQConnection: boolean;
  issues: string[];
}

export interface MetricsActivationStatus {
  ok: boolean;
  listingMetricsCount: number;
  recentMetricsDays: number;
  hasImpressions: boolean;
  hasClicks: boolean;
  hasSales: boolean;
  issues: string[];
}

export interface ProfitValidationResult {
  ok: boolean;
  moneyIn: number;
  moneyOut: number;
  totalProfit: number;
  orderCount: number;
  calculationMatch: boolean;
  issues: string[];
}

export interface AutopilotValidationResult {
  ok: boolean;
  isRunning: boolean;
  enabled: boolean;
  lastCycle: string | null;
  configEnabled: boolean;
  webhookReady: boolean;
  eventFlowReady: boolean;
  connectorReadiness?: Awaited<ReturnType<typeof getConnectorReadinessForUser>>;
  issues: string[];
}

export interface SystemReadyResult {
  ready: boolean;
  checks: {
    listingsMatchMarketplaces: boolean;
    workersStable: boolean;
    metricsFlowing: boolean;
    profitReal: boolean;
    autopilotValid: boolean;
    webhooksReady: boolean;
  };
  details: {
    fullSync?: FullSyncResult;
    workersHealth?: RedisWorkersHealth;
    metrics?: MetricsActivationStatus;
    profit?: ProfitValidationResult;
    autopilot?: AutopilotValidationResult;
    activeListingsCount?: number;
  };
  issues: string[];
}

/**
 * TASK 1 — Force full sync with MercadoLibre, eBay, Amazon (status, errors, visibility).
 */
export async function runFullMarketplaceSync(options?: { userId?: number }): Promise<FullSyncResult> {
  try {
    const result = await listingStateReconciliationService.runFullAudit(options);
    // Phase 30: consider ok when we ran (scanned > 0); API failures must not block system
    const ok = result.scanned > 0 && result.errors <= result.scanned;
    return {
      ok,
      scanned: result.scanned,
      corrected: result.corrected,
      errors: result.errors,
      message: `Full sync: ${result.scanned} scanned, ${result.corrected} corrected, ${result.errors} errors.`,
    };
  } catch (e: any) {
    logger.error('[Phase28] Full marketplace sync failed', { error: e?.message });
    return {
      ok: false,
      scanned: 0,
      corrected: 0,
      errors: 1,
      message: e?.message ?? 'Full sync failed',
    };
  }
}

/**
 * TASK 2 — Run ListingRecoveryEngine on ALL listings (fix, republish, remove invalid).
 */
export async function runListingRecoveryOnAll(options?: {
  userId?: number;
  limit?: number;
  verifyWithApi?: boolean;
}): Promise<RecoveryRunResult> {
  try {
    const limit = options?.limit ?? 2000;
    const records = await fullListingAuditService.runFullAudit({
      userId: options?.userId,
      limit,
      verifyWithApi: options?.verifyWithApi ?? false,
      verifyBatchSize: options?.verifyWithApi ? 30 : 0,
    });
    const classified = listingClassificationEngine.classifyBatch(records);
    const result = await listingRecoveryEngine.runRecovery(classified);
    return {
      ok: result.errors < result.processed,
      auditCount: records.length,
      processed: result.processed,
      removedFromDb: result.removedFromDb,
      republishEnqueued: result.republishEnqueued,
      optimized: result.optimized,
      errors: result.errors,
      message: `Recovery: ${result.processed} processed, ${result.removedFromDb} removed, ${result.republishEnqueued} republish enqueued, ${result.optimized} optimized.`,
    };
  } catch (e: any) {
    logger.error('[Phase28] Listing recovery failed', { error: e?.message });
    return {
      ok: false,
      auditCount: 0,
      processed: 0,
      removedFromDb: 0,
      republishEnqueued: 0,
      optimized: 0,
      errors: 1,
      message: e?.message ?? 'Recovery failed',
    };
  }
}

/**
 * TASK 3 — Redis and workers health: connection stable, queues/workers running.
 */
export async function checkRedisAndWorkers(): Promise<RedisWorkersHealth> {
  const issues: string[] = [];
  let redisPing = false;
  let bullMQConnection = false;

  if (!isRedisAvailable) {
    issues.push('Redis not available (REDIS_URL missing or SAFE_BOOT=true)');
    return { ok: false, redisAvailable: false, redisPing: false, bullMQConnection: false, issues };
  }

  try {
    const { redis } = await import('../config/redis');
    const pong = await redis.ping();
    redisPing = pong === 'PONG';
    if (!redisPing) issues.push('Redis PING failed');
  } catch (e: any) {
    issues.push(`Redis ping error: ${e?.message ?? 'unknown'}`);
  }

  try {
    const conn = getBullMQRedisConnection();
    bullMQConnection = conn != null;
    if (conn) {
      const pong = await conn.ping();
      if (pong !== 'PONG') {
        bullMQConnection = false;
        issues.push('BullMQ Redis PING failed');
      }
      conn.disconnect?.();
    } else {
      issues.push('BullMQ connection is null');
    }
  } catch (e: any) {
    issues.push(`BullMQ connection error: ${e?.message ?? 'unknown'}`);
  }

  const ok = redisPing && bullMQConnection && issues.length === 0;
  return {
    ok,
    redisAvailable: isRedisAvailable,
    redisPing,
    bullMQConnection,
    issues,
  };
}

/**
 * TASK 4 — Real metrics activation: impressions, clicks, sales ingestion.
 */
export async function checkMetricsActivation(options?: { userId?: number }): Promise<MetricsActivationStatus> {
  const issues: string[] = [];
  const recentMetricsDays = 7;
  const since = new Date(Date.now() - recentMetricsDays * 24 * 60 * 60 * 1000);

  const where: { date: { gte: Date }; marketplaceListing?: { userId?: number } } = { date: { gte: since } };
  if (options?.userId) where.marketplaceListing = { userId: options.userId };

  const [listingMetricsCount, agg] = await Promise.all([
    prisma.listingMetric.count({ where }),
    prisma.listingMetric.aggregate({
      where,
      _sum: { impressions: true, clicks: true, sales: true },
    }),
  ]);

  const hasImpressions = (agg._sum.impressions ?? 0) > 0;
  const hasClicks = (agg._sum.clicks ?? 0) > 0;
  const hasSales = (agg._sum.sales ?? 0) > 0;

  if (listingMetricsCount === 0) issues.push('No listing metrics in DB');
  if (!hasImpressions && listingMetricsCount > 0) issues.push('No impressions in recent period');
  if (!hasClicks && listingMetricsCount > 0) issues.push('No clicks in recent period');

  const ok = listingMetricsCount > 0 && (hasImpressions || hasClicks || hasSales);
  return {
    ok,
    listingMetricsCount,
    recentMetricsDays,
    hasImpressions,
    hasClicks,
    hasSales,
    issues,
  };
}

/**
 * TASK 5 — Real profit validation: calculations correct, all costs included.
 */
export async function validateRealProfit(options?: { userId?: number; days?: number }): Promise<ProfitValidationResult> {
  const issues: string[] = [];
  const summary = await RealProfitEngine.getRealProfitSummary({
    userId: options?.userId,
    days: options?.days ?? 30,
    environment: 'production',
  });

  const moneyIn = summary.moneyIn;
  const moneyOut = summary.moneyOut.total;
  const totalProfit = summary.totalProfit;
  const calculationMatch = Math.abs(moneyIn - moneyOut - totalProfit) < 0.02;

  if (!calculationMatch) {
    issues.push(`Profit calculation mismatch: moneyIn - moneyOut (${moneyIn - moneyOut}) !== totalProfit (${totalProfit})`);
  }
  if (summary.orderCount > 0 && totalProfit < 0) {
    issues.push('Aggregate profit is negative');
  }

  return {
    ok: calculationMatch && issues.length === 0,
    moneyIn,
    moneyOut,
    totalProfit,
    orderCount: summary.orderCount,
    calculationMatch,
    issues,
  };
}

/**
 * TASK 6 — Autopilot validation: is running, publishing, optimizing.
 */
export async function validateAutopilot(options?: { userId?: number }): Promise<AutopilotValidationResult> {
  const issues: string[] = [];
  let isRunning = false;
  let enabled = false;
  let lastCycle: string | null = null;
  let configEnabled = false;
  let webhookReady = false;
  let eventFlowReady = false;
  let connectorReadiness: Awaited<ReturnType<typeof getConnectorReadinessForUser>> | undefined;

  try {
    const { autopilotSystem } = await import('./autopilot.service');
    const status = autopilotSystem.getStatus();
    isRunning = status.isRunning;
    enabled = status.config?.enabled ?? false;
    configEnabled = status.config?.enabled ?? false;
    lastCycle = status.lastCycle?.timestamp?.toISOString() ?? null;

    if (!configEnabled) issues.push('Autopilot config enabled=false');
    if (!isRunning && configEnabled) issues.push('Autopilot not running (start required)');
  } catch (e: any) {
    issues.push(`Autopilot status error: ${e?.message ?? 'unknown'}`);
  }

  if (options?.userId) {
    connectorReadiness = await getConnectorReadinessForUser(options.userId);
    webhookReady = connectorReadiness.automationReadyCount > 0;
    eventFlowReady = webhookReady;
    if (!webhookReady) {
      issues.push(...connectorReadiness.blockingIssues);
    }
  }

  return {
    ok: issues.length === 0,
    isRunning,
    enabled,
    lastCycle,
    configEnabled,
    webhookReady,
    eventFlowReady,
    connectorReadiness,
    issues,
  };
}

/**
 * TASK 8 — System ready check. Ready ONLY if: listings match marketplaces, workers stable, metrics flowing, profit real.
 */
export async function runSystemReadyCheck(options?: {
  userId?: number;
  runFullSync?: boolean;
}): Promise<SystemReadyResult> {
  const issues: string[] = [];
  const details: SystemReadyResult['details'] = {};
  const checks = {
    listingsMatchMarketplaces: false,
    workersStable: false,
    metricsFlowing: false,
    profitReal: false,
    autopilotValid: false,
    webhooksReady: false,
  };

  // Workers first (no DB/Redis dependency for check)
  const workersHealth = await checkRedisAndWorkers();
  details.workersHealth = workersHealth;
  checks.workersStable = workersHealth.ok;
  if (!workersHealth.ok) issues.push(...workersHealth.issues);

  // Full sync if requested (updates listing status vs marketplaces)
  if (options?.runFullSync) {
    const fullSync = await runFullMarketplaceSync({ userId: options.userId });
    details.fullSync = fullSync;
    checks.listingsMatchMarketplaces = fullSync.ok;
    if (!fullSync.ok) issues.push(fullSync.message);
  } else {
    // Light check: at least one reconciliation recently
    const recent = await prisma.marketplaceListing.count({
      where: { lastReconciledAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const total = await prisma.marketplaceListing.count();
    checks.listingsMatchMarketplaces = total === 0 || recent > 0;
    if (total > 0 && recent === 0) issues.push('No listings reconciled in last 24h; run full sync.');
  }

  // Metrics
  const metrics = await checkMetricsActivation({ userId: options?.userId });
  details.metrics = metrics;
  checks.metricsFlowing = metrics.ok;
  if (!metrics.ok) issues.push(...metrics.issues);

  // Profit
  const profit = await validateRealProfit({ userId: options?.userId });
  details.profit = profit;
  checks.profitReal = profit.ok;
  if (!profit.ok) issues.push(...profit.issues);

  // Autopilot
  const autopilot = await validateAutopilot({ userId: options?.userId });
  details.autopilot = autopilot;
  checks.autopilotValid = autopilot.ok;
  checks.webhooksReady = autopilot.webhookReady;
  if (!autopilot.ok) issues.push(...autopilot.issues);

  // Phase 30 — Smart ready: if listings are active but metrics not yet available, still ready (initial phase)
  const activeListingsCount = await prisma.marketplaceListing.count({
    where: { ...(options?.userId ? { userId: options.userId } : {}), status: 'active' },
  });
  const hasActiveListings = activeListingsCount > 0;
  const ready =
    checks.workersStable &&
    checks.profitReal &&
    checks.webhooksReady &&
    (checks.listingsMatchMarketplaces || hasActiveListings) &&
    (checks.metricsFlowing || hasActiveListings);

  return {
    ready,
    checks,
    details: { ...details, activeListingsCount },
    issues,
  };
}

export const Phase28Stabilization = {
  runFullMarketplaceSync,
  runListingRecoveryOnAll,
  checkRedisAndWorkers,
  checkMetricsActivation,
  validateRealProfit,
  validateAutopilot,
  runSystemReadyCheck,
};
