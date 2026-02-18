/**
 * Autopilot Cycle Log Service
 * Persists every cycle execution, decision, failure for observability
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface CycleLogInput {
  userId: number;
  cycleId: string;
  stage: string;
  success: boolean;
  message?: string;
  opportunitiesFound?: number;
  opportunitiesProcessed?: number;
  productsPublished?: number;
  productsApproved?: number;
  capitalUsed?: number;
  errors?: string[];
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

export const autopilotCycleLogService = {
  async logCycle(input: CycleLogInput): Promise<void> {
    try {
      await prisma.autopilotCycleLog.create({
        data: {
          userId: input.userId,
          cycleId: input.cycleId,
          stage: input.stage,
          success: input.success,
          message: input.message ?? null,
          opportunitiesFound: input.opportunitiesFound ?? 0,
          opportunitiesProcessed: input.opportunitiesProcessed ?? 0,
          productsPublished: input.productsPublished ?? 0,
          productsApproved: input.productsApproved ?? 0,
          capitalUsed: input.capitalUsed ?? 0,
          errors: input.errors ? JSON.parse(JSON.stringify(input.errors)) : null,
          metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : null,
          durationMs: input.durationMs ?? null,
        },
      });
      logger.debug('[AutopilotCycleLog] Logged cycle', {
        userId: input.userId,
        cycleId: input.cycleId,
        stage: input.stage,
        success: input.success,
      });
    } catch (error: unknown) {
      logger.error('[AutopilotCycleLog] Failed to log cycle', {
        error: error instanceof Error ? error.message : String(error),
        userId: input.userId,
        cycleId: input.cycleId,
      });
    }
  },

  async getStageMetrics(userId: number, since?: Date): Promise<Record<string, { success: number; failed: number }>> {
    const where: { userId: number; createdAt?: { gte: Date } } = { userId };
    if (since) where.createdAt = { gte: since };

    const logs = await prisma.autopilotCycleLog.findMany({
      where,
      select: { stage: true, success: true },
    });

    const metrics: Record<string, { success: number; failed: number }> = {};
    for (const log of logs) {
      if (!metrics[log.stage]) metrics[log.stage] = { success: 0, failed: 0 };
      if (log.success) metrics[log.stage].success++;
      else metrics[log.stage].failed++;
    }
    return metrics;
  },
};
