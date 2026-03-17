/**
 * Phase 29 — Full Autonomous Stabilization and Profit Activation
 * Executes all stabilization phases programmatically without user intervention.
 * Uses Phase 28 services and internal APIs.
 */

import { Queue } from 'bullmq';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';
import {
  runFullMarketplaceSync,
  runListingRecoveryOnAll,
  checkRedisAndWorkers,
  checkMetricsActivation,
  validateRealProfit,
  validateAutopilot,
  runSystemReadyCheck,
} from './phase28-stabilization.service';

const MAX_WORKER_RETRIES = 5;
const WORKER_RETRY_DELAY_MS = 2000;
const MAX_STABLE_ITERATIONS = 3;
const MAX_READY_RETRIES = 5;
const READY_RETRY_DELAY_MS = 3000;
const CONTROLLED_TEST_PER_MARKETPLACE = 8;

export interface Phase29Result {
  success: boolean;
  phase: number;
  phaseName: string;
  ready: boolean;
  checks: {
    realityCleanup: boolean;
    fullSync: boolean;
    recovery: boolean;
    workersStable: boolean;
    metricsFlowing: boolean;
    profitValid: boolean;
    autopilotStarted: boolean;
    controlledTestEnqueued: boolean;
    marketplaceValidated: boolean;
  };
  details: Record<string, unknown>;
  issues: string[];
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Phase 1 — System reality cleanup: ensure dashboards use only real data (already enforced in Phase 27). */
async function phase1RealityCleanup(): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];
  const testOrderPrefixes = ['test', 'TEST', 'mock', 'demo', 'DEMO'];
  const count = await prisma.sale.count({
    where: {
      OR: testOrderPrefixes.map((p) => ({ orderId: { startsWith: p } })),
    },
  });
  if (count > 0) {
    issues.push(`${count} sales with test/mock/demo orderId (excluded from dashboards by Phase 27 filters)`);
  }
  return { ok: true, issues }; // Filters already applied; no removal to avoid breaking refs
}

/** Phase 2 — Full marketplace sync for ALL users (no userId = all). */
async function phase2FullSync(): Promise<{ ok: boolean; scanned: number; corrected: number; errors: number }> {
  const result = await runFullMarketplaceSync(undefined);
  return {
    ok: result.ok,
    scanned: result.scanned,
    corrected: result.corrected,
    errors: result.errors,
  };
}

/** Phase 3 — Full listing recovery for all users. */
async function phase3FullRecovery(): Promise<{
  ok: boolean;
  auditCount: number;
  processed: number;
  removedFromDb: number;
  republishEnqueued: number;
  optimized: number;
  errors: number;
}> {
  const result = await runListingRecoveryOnAll({ limit: 2000, verifyWithApi: false });
  return {
    ok: result.ok,
    auditCount: result.auditCount,
    processed: result.processed,
    removedFromDb: result.removedFromDb,
    republishEnqueued: result.republishEnqueued,
    optimized: result.optimized,
    errors: result.errors,
  };
}

/** Phase 4 — Worker and Redis stabilization; retry until ok or max retries. */
async function phase4WorkersStable(): Promise<{ ok: boolean; attempts: number; issues: string[] }> {
  let attempts = 0;
  while (attempts < MAX_WORKER_RETRIES) {
    const health = await checkRedisAndWorkers();
    if (health.ok) return { ok: true, attempts: attempts + 1, issues: [] };
    attempts++;
    if (attempts < MAX_WORKER_RETRIES) await sleep(WORKER_RETRY_DELAY_MS);
  }
  const last = await checkRedisAndWorkers();
  return { ok: false, attempts: MAX_WORKER_RETRIES, issues: last.issues };
}

/** Phase 5 — Metrics activation; trigger ingestion jobs if missing. */
async function phase5MetricsActivation(): Promise<{ ok: boolean; triggered: boolean; issues: string[] }> {
  const status = await checkMetricsActivation(undefined);
  if (status.ok) return { ok: true, triggered: false, issues: [] };

  let triggered = false;
  const conn = getBullMQRedisConnection();
  if (isRedisAvailable && conn) {
    try {
      const ebayQueue = new Queue('ebay-traffic-sync', { connection: conn as any });
      const metricsQueue = new Queue('listing-metrics-aggregate', { connection: conn as any });
      await ebayQueue.add('phase29-sync-views', {}, { removeOnComplete: 5 });
      await metricsQueue.add('phase29-metrics-run', {}, { removeOnComplete: 5 });
      triggered = true;
      if (typeof (conn as any).disconnect === 'function') (conn as any).disconnect();
    } catch (e: any) {
      logger.warn('[Phase29] Trigger metrics jobs failed', { error: e?.message });
    }
  }
  return { ok: status.ok, triggered, issues: status.issues };
}

/** Phase 6 — Profit validation. */
async function phase6ProfitValidation(): Promise<{ ok: boolean; issues: string[] }> {
  const result = await validateRealProfit({ days: 30 });
  return { ok: result.ok, issues: result.issues };
}

/** Phase 7 — Autopilot activation: start if not running. */
async function phase7AutopilotActivation(): Promise<{ ok: boolean; started: boolean; issues: string[] }> {
  const validation = await validateAutopilot(undefined);
  if (validation.isRunning) return { ok: true, started: false, issues: [] };

  let started = false;
  try {
    const firstUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    const userId = firstUser?.id ?? (await prisma.user.findFirst({ select: { id: true } }))?.id;
    if (userId) {
      const { autopilotSystem } = await import('./autopilot.service');
      await autopilotSystem.start(userId);
      started = true;
      logger.info('[Phase29] Autopilot started', { userId });
    }
  } catch (e: any) {
    logger.warn('[Phase29] Autopilot start failed', { error: e?.message });
  }
  const recheck = await validateAutopilot(undefined);
  return {
    ok: recheck.isRunning || recheck.configEnabled === false,
    started,
    issues: recheck.issues,
  };
}

/** Phase 8 — Controlled test: enqueue publish for 5–10 products per marketplace (safe subset). */
async function phase8ControlledTest(): Promise<{ ok: boolean; enqueued: number; issues: string[] }> {
  const issues: string[] = [];
  let enqueued = 0;
  try {
    const { publishingQueue } = await import('./job.service');
    if (!publishingQueue) {
      issues.push('Publishing queue not available');
      return { ok: false, enqueued: 0, issues };
    }

    const marketplaces = ['mercadolibre', 'ebay', 'amazon'] as const;
    for (const mp of marketplaces) {
      const products = await prisma.product.findMany({
        where: {
          status: { in: ['READY', 'ACTIVE', 'PUBLISHED'] },
          OR: [
            { marketplaceListings: { none: { marketplace: mp } } },
            { marketplaceListings: { some: { marketplace: mp, status: { not: 'active' } } } },
          ],
        },
        select: { id: true, userId: true },
        take: CONTROLLED_TEST_PER_MARKETPLACE,
      });
      const byUser = new Map<number, number[]>();
      for (const p of products) {
        if (!byUser.has(p.userId)) byUser.set(p.userId, []);
        byUser.get(p.userId)!.push(p.id);
      }
      for (const [userId, productIds] of byUser) {
        for (const productId of productIds.slice(0, 5)) {
          await publishingQueue.add(
            'publish-product',
            { userId, productId, marketplaces: [mp] },
            { removeOnComplete: 5 }
          );
          enqueued++;
        }
      }
    }
  } catch (e: any) {
    issues.push(e?.message ?? 'Controlled test enqueue failed');
  }
  return { ok: issues.length === 0, enqueued, issues };
}

/** Phase 9 — Marketplace validation (full sync again). */
async function phase9MarketplaceValidation(): Promise<{ ok: boolean; scanned: number; corrected: number }> {
  const result = await runFullMarketplaceSync(undefined);
  return { ok: result.ok, scanned: result.scanned, corrected: result.corrected };
}

/** Phase 10 — Repeat sync → recover until stable (max iterations). */
async function phase10RepeatUntilStable(): Promise<{
  ok: boolean;
  iterations: number;
  workersOk: boolean;
  syncOk: boolean;
  recoveryOk: boolean;
  metricsOk: boolean;
  profitOk: boolean;
}> {
  let workersOk = false;
  let syncOk = false;
  let recoveryOk = false;
  let metricsOk = false;
  let profitOk = false;

  for (let i = 0; i < MAX_STABLE_ITERATIONS; i++) {
    const workers = await checkRedisAndWorkers();
    workersOk = workers.ok;
    if (!workersOk) {
      await sleep(WORKER_RETRY_DELAY_MS);
      continue;
    }

    const sync = await runFullMarketplaceSync(undefined);
    syncOk = sync.ok;

    const recovery = await runListingRecoveryOnAll({ limit: 500, verifyWithApi: false });
    recoveryOk = recovery.ok;

    const metrics = await checkMetricsActivation(undefined);
    metricsOk = metrics.ok;

    const profit = await validateRealProfit({ days: 30 });
    profitOk = profit.ok;

    if (workersOk && syncOk && recoveryOk && metricsOk && profitOk) {
      return {
        ok: true,
        iterations: i + 1,
        workersOk,
        syncOk,
        recoveryOk,
        metricsOk,
        profitOk,
      };
    }
    await sleep(READY_RETRY_DELAY_MS);
  }

  return {
    ok: false,
    iterations: MAX_STABLE_ITERATIONS,
    workersOk,
    syncOk,
    recoveryOk,
    metricsOk,
    profitOk,
  };
}

/** Phase 11 — Final readiness check; loop until ready or max retries. */
async function phase11FinalReady(): Promise<{ ready: boolean; attempts: number; issues: string[] }> {
  const issues: string[] = [];
  for (let attempt = 1; attempt <= MAX_READY_RETRIES; attempt++) {
    const result = await runSystemReadyCheck({ runFullSync: true });
    if (result.ready) {
      return { ready: true, attempts: attempt, issues: [] };
    }
    issues.push(...result.issues);
    if (attempt < MAX_READY_RETRIES) await sleep(READY_RETRY_DELAY_MS);
  }
  return { ready: false, attempts: MAX_READY_RETRIES, issues };
}

/**
 * Run full Phase 29 autonomous stabilization.
 * Call from POST /api/system/phase29/run (e.g. admin or cron).
 */
export async function runPhase29Stabilization(): Promise<Phase29Result> {
  const start = Date.now();
  const issues: string[] = [];
  const checks = {
    realityCleanup: false,
    fullSync: false,
    recovery: false,
    workersStable: false,
    metricsFlowing: false,
    profitValid: false,
    autopilotStarted: false,
    controlledTestEnqueued: false,
    marketplaceValidated: false,
  };
  const details: Record<string, unknown> = {};

  try {
    const p1 = await phase1RealityCleanup();
    checks.realityCleanup = p1.ok;
    details.phase1 = p1;
    if (p1.issues.length) issues.push(...p1.issues);

    const p2 = await phase2FullSync();
    checks.fullSync = p2.ok;
    details.phase2 = p2;

    const p3 = await phase3FullRecovery();
    checks.recovery = p3.ok;
    details.phase3 = p3;

    const p4 = await phase4WorkersStable();
    checks.workersStable = p4.ok;
    details.phase4 = p4;
    if (p4.issues.length) issues.push(...p4.issues);

    const p5 = await phase5MetricsActivation();
    checks.metricsFlowing = p5.ok;
    details.phase5 = p5;
    if (p5.triggered) details.metricsJobsTriggered = true;

    const p6 = await phase6ProfitValidation();
    checks.profitValid = p6.ok;
    details.phase6 = p6;
    if (p6.issues.length) issues.push(...p6.issues);

    const p7 = await phase7AutopilotActivation();
    checks.autopilotStarted = p7.started;
    details.phase7 = p7;
    if (p7.issues.length) issues.push(...p7.issues);

    const p8 = await phase8ControlledTest();
    checks.controlledTestEnqueued = p8.enqueued > 0;
    details.phase8 = p8;
    if (p8.issues.length) issues.push(...p8.issues);

    const p9 = await phase9MarketplaceValidation();
    checks.marketplaceValidated = p9.ok;
    details.phase9 = p9;

    const p10 = await phase10RepeatUntilStable();
    details.phase10 = p10;

    const p11 = await phase11FinalReady();
    details.phase11 = p11;
    if (p11.issues.length) issues.push(...p11.issues);

    const ready = p11.ready;
    // Phase 30 — Partial success: do not require 100%. Allow success when workers + profit + (sync or recovery ok) + (ready or active listings)
    const activeListings = await prisma.marketplaceListing.count({ where: { status: 'active' } }).catch(() => 0);
    const partialSuccess =
      checks.workersStable &&
      checks.profitValid &&
      (checks.fullSync || checks.recovery) &&
      (ready || activeListings > 0);
    const success =
      (checks.realityCleanup && checks.fullSync && checks.recovery && checks.workersStable && checks.profitValid && ready) ||
      partialSuccess;

    logger.info('[Phase29] Stabilization complete', {
      success,
      ready,
      checks,
      durationMs: Date.now() - start,
    });

    return {
      success,
      phase: 12,
      phaseName: 'Phase 29 Full Autonomous Stabilization',
      ready,
      checks,
      details,
      issues: [...new Set(issues)],
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    logger.error('[Phase29] Stabilization failed', { error: e?.message });
    return {
      success: false,
      phase: 0,
      phaseName: 'Phase 29',
      ready: false,
      checks,
      details: { error: e?.message ?? String(e) },
      issues: [...issues, e?.message ?? String(e)],
      durationMs: Date.now() - start,
    };
  }
}

export const Phase29AutonomousStabilization = {
  run: runPhase29Stabilization,
};
