import { prisma } from '../../../config/database';
import { logger } from '../../../config/logger';

export interface CjEbayTraceInput {
  userId: number;
  correlationId?: string;
  route?: string;
  step: string;
  message: string;
  meta?: unknown;
}

/**
 * Persists execution traces for the CJ→eBay module (UI Logs / debugging).
 * Failures are swallowed so tracing never breaks API responses.
 */
export const cjEbayTraceService = {
  async record(input: CjEbayTraceInput): Promise<void> {
    try {
      await prisma.cjEbayExecutionTrace.create({
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
      logger.warn('[cj-ebay-trace] Failed to persist trace', {
        userId: input.userId,
        step: input.step,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
