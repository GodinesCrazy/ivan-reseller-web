import { prisma } from '../../../config/database';
import { logger } from '../../../config/logger';

export const cjEbayUkTraceService = {
  async log(params: {
    userId: number;
    correlationId?: string;
    route?: string;
    step: string;
    message?: string;
    meta?: Record<string, unknown>;
    durationMs?: number;
  }): Promise<void> {
    try {
      await prisma.cjEbayUkExecutionTrace.create({
        data: {
          userId: params.userId,
          correlationId: params.correlationId,
          route: params.route,
          step: params.step,
          message: params.message,
          meta: params.meta as object | undefined,
          durationMs: params.durationMs,
        },
      });
    } catch (err) {
      logger.warn(`[CjEbayUkTrace] Failed to persist trace: ${(err as Error).message}`);
    }
  },
};
