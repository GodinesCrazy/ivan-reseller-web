/**
 * Phase 23: Sales Acceleration Mode
 * Increases early sales velocity: competitive pricing, SEO/titles, more publishing, optimization triggers.
 * Runs every 3 hours when enabled. Uses Competitor Intelligence, Dynamic Optimization, CRO, Dynamic Pricing.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';

const SYSTEM_CONFIG_KEY = 'sales_acceleration_mode';
const RECENT_OPTIMIZATIONS_MAX = 10;

export interface SalesAccelerationStatus {
  enabled: boolean;
  strategy: string;
  recentOptimizations: string[];
  lastRunAt: string | null;
  nextRunHint: string;
}

/**
 * Check if Sales Acceleration Mode is enabled (env or system config).
 */
export async function isSalesAccelerationEnabled(): Promise<boolean> {
  if (process.env.SALES_ACCELERATION_MODE === 'true') return true;
  try {
    const rec = await prisma.systemConfig.findUnique({ where: { key: SYSTEM_CONFIG_KEY } });
    if (!rec?.value) return false;
    const parsed = JSON.parse(rec.value as string) as { enabled?: boolean };
    return parsed.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Get current status for Control Center.
 */
export async function getSalesAccelerationStatus(): Promise<SalesAccelerationStatus> {
  const enabled = await isSalesAccelerationEnabled();
  let lastRunAt: string | null = null;
  let recentOptimizations: string[] = [];

  try {
    const rec = await prisma.systemConfig.findUnique({ where: { key: SYSTEM_CONFIG_KEY } });
    if (rec?.value) {
      const parsed = JSON.parse(rec.value as string) as {
        lastRunAt?: string;
        recentOptimizations?: string[];
      };
      lastRunAt = parsed.lastRunAt ?? null;
      recentOptimizations = Array.isArray(parsed.recentOptimizations)
        ? parsed.recentOptimizations.slice(0, RECENT_OPTIMIZATIONS_MAX)
        : [];
    }
  } catch {
    // non-fatal
  }

  return {
    enabled,
    strategy: enabled
      ? 'Increase listing competitiveness, aggressive pricing (top 25% cheapest), SEO/titles, higher publishing rate (up to 40/day, 15/hour).'
      : 'Disabled',
    recentOptimizations,
    lastRunAt,
    nextRunHint: enabled ? 'Runs every 3 hours.' : 'Enable via SALES_ACCELERATION_MODE=true or system config.',
  };
}

/**
 * Run Sales Acceleration: trigger dynamic marketplace optimization, conversion optimization, dynamic pricing.
 * When sales are low: improve SEO titles, rotate images, lower price slightly, use competitor insights.
 */
export async function runSalesAccelerationMode(): Promise<{
  enabled: boolean;
  ran: boolean;
  optimizationsTriggered: string[];
  errors: string[];
}> {
  const result = {
    enabled: false,
    ran: false,
    optimizationsTriggered: [] as string[],
    errors: [] as string[],
  };

  try {
    result.enabled = await isSalesAccelerationEnabled();
    if (!result.enabled) {
      return result;
    }

    const start = new Date().toISOString();

    // 1) Dynamic Marketplace Optimization (titles, images, price, expansion)
    try {
      const { runDynamicMarketplaceOptimization } = await import('./dynamic-marketplace-optimization.service');
      const dmo = await runDynamicMarketplaceOptimization(true);
      if (dmo.actionsCreated > 0 || dmo.actionsExecuted > 0) {
        result.optimizationsTriggered.push(
          `Dynamic optimization: ${dmo.actionsCreated} actions created, ${dmo.actionsExecuted} executed`
        );
      }
    } catch (e: any) {
      result.errors.push(`DMO: ${e?.message || String(e)}`);
    }

    // 2) Conversion Rate Optimization
    try {
      const { runConversionRateOptimization } = await import('./conversion-rate-optimization.service');
      await runConversionRateOptimization(true);
      result.optimizationsTriggered.push('Conversion rate optimization run');
    } catch (e: any) {
      result.errors.push(`CRO: ${e?.message || String(e)}`);
    }

    // 3) Dynamic pricing (aggressive: target top 25% cheapest; MIN_ALLOWED_MARGIN respected by existing service)
    try {
      const { getScheduledTasksService } = await import('./scheduled-tasks.service');
      const svc = getScheduledTasksService();
      const q = (svc as any)?.dynamicPricingQueue;
      if (q) {
        await q.add('sales-acceleration-trigger', {}, { removeOnComplete: 5 });
        result.optimizationsTriggered.push('Dynamic pricing job enqueued');
      }
    } catch (e: any) {
      result.errors.push(`Dynamic pricing: ${e?.message || String(e)}`);
    }

    result.ran = true;

    // Persist status for Control Center
    const existing = await prisma.systemConfig.findUnique({ where: { key: SYSTEM_CONFIG_KEY } });
    const existingData = existing?.value ? (JSON.parse(existing.value as string) as Record<string, unknown>) : {};
    const recentOptimizations = [
      ...result.optimizationsTriggered,
      ...(Array.isArray(existingData.recentOptimizations) ? existingData.recentOptimizations : []),
    ].slice(0, RECENT_OPTIMIZATIONS_MAX);

    await prisma.systemConfig.upsert({
      where: { key: SYSTEM_CONFIG_KEY },
      create: {
        key: SYSTEM_CONFIG_KEY,
        value: JSON.stringify({
          enabled: true,
          lastRunAt: start,
          recentOptimizations,
        }),
      },
      update: {
        value: JSON.stringify({
          ...existingData,
          lastRunAt: start,
          recentOptimizations,
        }),
      },
    });

    logger.info('[SALES-ACCELERATION] Run complete', {
      optimizationsTriggered: result.optimizationsTriggered.length,
      errors: result.errors.length,
    });
  } catch (e: any) {
    result.errors.push(e?.message || String(e));
    logger.error('[SALES-ACCELERATION] Run failed', { error: e?.message });
  }

  return result;
}
