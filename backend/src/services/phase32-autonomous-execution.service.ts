/**
 * Phase 32 — Autonomous Execution and Real Sales Validation
 * TASK 1: Initial activation (run Phase 31, set priority, controlled volume).
 * TASK 2: Continuous loop via scheduled-tasks (Phase 31 every 4–6h).
 * TASK 5–12: Validation cycle (metrics, listing quality, conversion, profit, marketplace reality, error correction, sales detection, safe scaling).
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

export interface Phase32ActivationResult {
  success: boolean;
  phase31Run: { success: boolean; winnersDetected: number; durationMs: number; errors: string[] };
  marketplacePrioritySet: string[];
  maxNewListingsPerDaySet: number;
  errors: string[];
}

export interface Phase32ValidationCycleResult {
  success: boolean;
  metricsOk: boolean;
  impressionsZeroTriggered: boolean;
  profitOk: boolean;
  profitTotal: number;
  marketplaceMismatch: boolean;
  syncAndRecoveryRun: boolean;
  phase31Run: boolean;
  errors: string[];
  durationMs: number;
}

/**
 * TASK 1 + 3 + 4 — Initial activation: run Phase 31 once, set marketplace priority, set max 15 new listings/day.
 */
export async function runPhase32Activation(): Promise<Phase32ActivationResult> {
  const errors: string[] = [];
  let phase31Run: Phase32ActivationResult['phase31Run'] = {
    success: false,
    winnersDetected: 0,
    durationMs: 0,
    errors: [],
  };
  let marketplacePrioritySet: string[] = [];
  let maxNewListingsPerDaySet = 15;

  try {
    // TASK 3 — Set marketplace priority
    const { setMarketplacePriority } = await import('./phase31-sales-generation-engine.service');
    await setMarketplacePriority(['mercadolibre', 'ebay', 'amazon']);
    marketplacePrioritySet = ['mercadolibre', 'ebay', 'amazon'];
    logger.info('[Phase32] Marketplace priority set', { priority: marketplacePrioritySet });

    // TASK 4 — Controlled volume: 15 new listings/day max
    const { setMaxNewListingsPerDay } = await import('./phase31-sales-generation-engine.service');
    await setMaxNewListingsPerDay(15);
    maxNewListingsPerDaySet = 15;
    logger.info('[Phase32] Max new listings per day set to 15');

    // TASK 1 — Run Phase 31 once and log
    const { runSalesGenerationCycle } = await import('./phase31-sales-generation-engine.service');
    const result = await runSalesGenerationCycle();
    phase31Run = {
      success: result.success,
      winnersDetected: result.winnersDetected,
      durationMs: result.durationMs,
      errors: result.errors ?? [],
    };
    logger.info('[Phase32] Initial Phase 31 run completed', {
      success: result.success,
      winnersDetected: result.winnersDetected,
      visibilityBoostEnqueued: result.visibilityBoostEnqueued,
      durationMs: result.durationMs,
    });
    if (result.errors?.length) errors.push(...result.errors);
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
    logger.error('[Phase32] Activation failed', { error: e?.message });
  }

  const activationResult: Phase32ActivationResult = {
    success: errors.length === 0,
    phase31Run,
    marketplacePrioritySet,
    maxNewListingsPerDaySet,
    errors,
  };

  await prisma.systemConfig.upsert({
    where: { key: 'phase32_last_activation' },
    create: { key: 'phase32_last_activation', value: JSON.stringify(activationResult) },
    update: { value: JSON.stringify(activationResult) },
  });

  return activationResult;
}

/**
 * TASK 5–9 + traffic loop — Validation cycle: metrics, profit, marketplace reality, then Phase 31 (conversion, scaling, visibility).
 */
export async function runPhase32ValidationCycle(options?: { userId?: number }): Promise<Phase32ValidationCycleResult> {
  const start = Date.now();
  const errors: string[] = [];
  let metricsOk = false;
  let impressionsZeroTriggered = false;
  let profitOk = false;
  let profitTotal = 0;
  let marketplaceMismatch = false;
  let syncAndRecoveryRun = false;
  let phase31Run = false;

  try {
    // TASK 5 — Metrics validation
    const { checkMetricsActivation } = await import('./phase28-stabilization.service');
    const metrics = await checkMetricsActivation({ userId: options?.userId });
    metricsOk = metrics.ok;
    if (!metrics.hasImpressions && metrics.listingMetricsCount > 0) {
      impressionsZeroTriggered = true;
      // Trigger republish/SEO via Phase 31 (visibility boost)
      try {
        const { runSalesGenerationCycle } = await import('./phase31-sales-generation-engine.service');
        await runSalesGenerationCycle();
        phase31Run = true;
      } catch (e: any) {
        errors.push(`Phase31 after zero impressions: ${e?.message ?? String(e)}`);
      }
    }

    // TASK 8 — Profit validation
    const { validateRealProfit } = await import('./phase28-stabilization.service');
    const profitResult = await validateRealProfit({ userId: options?.userId, days: 30 });
    profitOk = profitResult.ok;
    profitTotal = profitResult.totalProfit ?? 0;
    if (!profitOk && profitResult.issues?.length) {
      errors.push(...profitResult.issues);
    }

    // TASK 9 — Marketplace reality check: if mismatch, trigger Phase 28 full sync + recovery
    const { runSystemReadyCheck } = await import('./phase28-stabilization.service');
    const ready = await runSystemReadyCheck({ userId: options?.userId });
    if (!ready.checks.listingsMatchMarketplaces) {
      marketplaceMismatch = true;
      try {
        const { runFullMarketplaceSync, runListingRecoveryOnAll } = await import('./phase28-stabilization.service');
        await runFullMarketplaceSync(options);
        await runListingRecoveryOnAll(options);
        syncAndRecoveryRun = true;
        logger.info('[Phase32] Full sync + recovery run due to marketplace mismatch');
      } catch (e: any) {
        errors.push(`Sync/recovery: ${e?.message ?? String(e)}`);
      }
    }

    // If we didn't run Phase 31 yet (no zero-impressions trigger), run it once for conversion/scaling/traffic loop
    if (!phase31Run) {
      try {
        const { runSalesGenerationCycle } = await import('./phase31-sales-generation-engine.service');
        await runSalesGenerationCycle();
        phase31Run = true;
      } catch (e: any) {
        errors.push(`Phase31: ${e?.message ?? String(e)}`);
      }
    }
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
    logger.error('[Phase32] Validation cycle failed', { error: e?.message });
  }

  const durationMs = Date.now() - start;
  logger.info('[Phase32] Validation cycle complete', {
    metricsOk,
    profitOk,
    profitTotal,
    marketplaceMismatch,
    syncAndRecoveryRun,
    phase31Run,
    durationMs,
  });

  const result: Phase32ValidationCycleResult = {
    success: errors.length === 0,
    metricsOk,
    impressionsZeroTriggered,
    profitOk,
    profitTotal,
    marketplaceMismatch,
    syncAndRecoveryRun,
    phase31Run,
    errors,
    durationMs,
  };

  await prisma.systemConfig.upsert({
    where: { key: 'phase32_last_validation_cycle' },
    create: { key: 'phase32_last_validation_cycle', value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  return result;
}

/**
 * Get Phase 32 status: last activation, last validation cycle, scheduler info.
 */
export async function getPhase32Status(): Promise<{
  lastActivation: Phase32ActivationResult | null;
  lastValidationCycle: Phase32ValidationCycleResult | null;
  schedulerCron: string;
  maxNewListingsPerDay: number;
}> {
  const [activationRec, validationRec, maxRec] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'phase32_last_activation' } }),
    prisma.systemConfig.findUnique({ where: { key: 'phase32_last_validation_cycle' } }),
    prisma.systemConfig.findUnique({ where: { key: 'phase31_max_new_listings_per_day' } }),
  ]);

  let lastActivation: Phase32ActivationResult | null = null;
  let lastValidationCycle: Phase32ValidationCycleResult | null = null;
  if (activationRec?.value) {
    try {
      lastActivation = JSON.parse(activationRec.value as string) as Phase32ActivationResult;
    } catch {
      /* ignore */
    }
  }
  if (validationRec?.value) {
    try {
      lastValidationCycle = JSON.parse(validationRec.value as string) as Phase32ValidationCycleResult;
    } catch {
      /* ignore */
    }
  }

  const maxNewListingsPerDay = maxRec?.value ? Number(maxRec.value) || 15 : 15;
  const schedulerCron = process.env.PHASE31_SALES_GENERATION_CRON || '0 */5 * * *'; // every 5 hours

  return {
    lastActivation,
    lastValidationCycle,
    schedulerCron,
    maxNewListingsPerDay,
  };
}

export const Phase32AutonomousExecution = {
  runActivation: runPhase32Activation,
  runValidationCycle: runPhase32ValidationCycle,
  getStatus: getPhase32Status,
};
