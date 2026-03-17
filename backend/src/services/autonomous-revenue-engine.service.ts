/**
 * Phase 27 — Autonomous Revenue Engine
 * When no sales OR low revenue: automatically trigger price adjustment, listing optimization,
 * increase publishing rate, and marketplace optimization (via existing queues).
 * Wraps Autonomous Revenue Monitor and ensures triggered actions enqueue real jobs.
 */

import { runAutonomousRevenueMonitor, getLastRevenueMonitorReport } from './autonomous-revenue-monitor.service';
import { getRealProfitSummary } from './real-profit-engine.service';
import logger from '../config/logger';

export interface AutonomousRevenueEngineResult {
  ran: boolean;
  realProfitSummary: { moneyIn: number; totalProfit: number; orderCount: number };
  reportTimestamp: string | null;
  recommendations: string[];
  actionsTriggered: boolean;
}

/**
 * Run the autonomous revenue engine: use real profit data, then run monitor which
 * triggers dynamic pricing, conversion optimization, and marketplace optimization when needed.
 * Call this from cron or manually; when run from ScheduledTasks worker, jobs are enqueued.
 */
export async function runAutonomousRevenueEngine(options?: {
  userId?: number;
  days?: number;
  triggerOptimizations?: boolean;
}): Promise<AutonomousRevenueEngineResult> {
  const { userId, days = 7, triggerOptimizations = true } = options ?? {};
  const realSummary = await getRealProfitSummary({
    userId,
    days,
    environment: 'production',
  });
  const report = await runAutonomousRevenueMonitor({ triggerOptimizations });
  const actionsTriggered = report.optimizationActions.some((a) => a.triggered);

  logger.info('[AUTONOMOUS-REVENUE-ENGINE] Run complete', {
    moneyIn: realSummary.moneyIn,
    totalProfit: realSummary.totalProfit,
    orderCount: realSummary.orderCount,
    actionsTriggered,
  });

  return {
    ran: true,
    realProfitSummary: {
      moneyIn: realSummary.moneyIn,
      totalProfit: realSummary.totalProfit,
      orderCount: realSummary.orderCount,
    },
    reportTimestamp: report.timestamp,
    recommendations: report.recommendations,
    actionsTriggered,
  };
}

export const AutonomousRevenueEngine = {
  run: runAutonomousRevenueEngine,
  getLastReport: getLastRevenueMonitorReport,
};
