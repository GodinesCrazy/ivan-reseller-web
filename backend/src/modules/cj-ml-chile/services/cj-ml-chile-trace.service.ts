import { prisma } from '../../../config/database';
import { logger } from '../../../config/logger';

export interface CjMlChileTraceInput {
  userId: number;
  correlationId?: string;
  route?: string;
  step: string;
  message: string;
  meta?: unknown;
}

export const cjMlChileTraceService = {
  async record(input: CjMlChileTraceInput): Promise<void> {
    try {
      await prisma.cjMlChileExecutionTrace.create({
        data: {
          userId: input.userId,
          correlationId: input.correlationId ?? null,
          route: input.route ?? null,
          step: input.step,
          message: input.message,
          meta:
            input.meta === undefined
              ? undefined
              : (JSON.parse(JSON.stringify(input.meta)) as object),
        },
      });
    } catch (err) {
      logger.warn('[cj-ml-chile-trace] Failed to persist trace', {
        userId: input.userId,
        step: input.step,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
