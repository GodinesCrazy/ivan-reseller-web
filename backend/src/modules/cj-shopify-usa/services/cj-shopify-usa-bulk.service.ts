/**
 * Concurrency Limiter for Bulk Operations
 * ────────────────────────────────────────
 * Provides controlled parallel execution with configurable concurrency limits
 * to prevent rate-limiting from external APIs (CJ, Shopify).
 *
 * Usage:
 *   const results = await bulkExecute(items, processItem, { concurrency: 5 });
 */

export interface BulkExecuteOptions {
  /** Maximum concurrent operations (default: 3) */
  concurrency?: number;
  /** Optional delay between batches in ms (default: 0) */
  batchDelayMs?: number;
  /** Stop all remaining tasks on first error (default: false) */
  stopOnError?: boolean;
}

export interface BulkResult<T> {
  /** Successfully completed results */
  fulfilled: Array<{ index: number; value: T }>;
  /** Failed operations with errors */
  rejected: Array<{ index: number; reason: string }>;
  /** Total items processed */
  totalProcessed: number;
  /** Whether execution was stopped early due to an error */
  stoppedEarly: boolean;
}

/**
 * Execute an async operation on a list of items with controlled concurrency.
 * Uses Promise.allSettled-style semantics — failures don't kill other operations.
 */
export async function bulkExecute<TItem, TResult>(
  items: TItem[],
  operation: (item: TItem, index: number) => Promise<TResult>,
  options: BulkExecuteOptions = {},
): Promise<BulkResult<TResult>> {
  const { concurrency = 3, batchDelayMs = 0, stopOnError = false } = options;

  const fulfilled: Array<{ index: number; value: TResult }> = [];
  const rejected: Array<{ index: number; reason: string }> = [];
  let stoppedEarly = false;

  // Process items in batches of `concurrency`
  for (let batchStart = 0; batchStart < items.length; batchStart += concurrency) {
    if (stoppedEarly) break;

    const batch = items.slice(batchStart, batchStart + concurrency);
    const batchPromises = batch.map(async (item, batchIndex) => {
      const globalIndex = batchStart + batchIndex;
      try {
        const value = await operation(item, globalIndex);
        fulfilled.push({ index: globalIndex, value });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        rejected.push({ index: globalIndex, reason });
        if (stopOnError) stoppedEarly = true;
      }
    });

    await Promise.all(batchPromises);

    // Optional delay between batches to reduce rate-limit pressure
    if (batchDelayMs > 0 && batchStart + concurrency < items.length && !stoppedEarly) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  return {
    fulfilled,
    rejected,
    totalProcessed: fulfilled.length + rejected.length,
    stoppedEarly,
  };
}

/**
 * Execute operations sequentially with optional delay between each.
 * Useful when strict ordering or very conservative rate-limiting is required.
 */
export async function sequentialExecute<TItem, TResult>(
  items: TItem[],
  operation: (item: TItem, index: number) => Promise<TResult>,
  options: { delayMs?: number; stopOnError?: boolean } = {},
): Promise<BulkResult<TResult>> {
  return bulkExecute(items, operation, {
    concurrency: 1,
    batchDelayMs: options.delayMs ?? 0,
    stopOnError: options.stopOnError ?? false,
  });
}
