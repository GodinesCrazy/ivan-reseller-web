import { redis, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';

const DEFAULT_INTERVAL_MS = 1600;
const DEFAULT_LOCK_TTL_MS = 5000;

let localTail: Promise<void> = Promise.resolve();
let localNextAt = 0;

function intervalMs(): number {
  const raw = Number(process.env.CJ_API_GLOBAL_MIN_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 1000 && raw <= 60_000 ? Math.floor(raw) : DEFAULT_INTERVAL_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reserveLocal(label: string): Promise<number> {
  let reservedWait = 0;
  const run = async () => {
    const now = Date.now();
    reservedWait = Math.max(0, localNextAt - now);
    localNextAt = now + reservedWait + intervalMs();
    if (reservedWait > 0) {
      logger.debug('[cj-api-rate-limiter] local wait', { label, waitMs: reservedWait });
      await sleep(reservedWait);
    }
  };
  const next = localTail.then(run, run);
  localTail = next.catch(() => undefined);
  await next;
  return reservedWait;
}

async function reserveRedis(label: string): Promise<number> {
  const nextKey = 'cj:api:global:next-at';
  const lockKey = 'cj:api:global:lock';
  const owner = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + 30_000;
  const spacing = intervalMs();

  while (Date.now() < deadline) {
    const locked = await redis.set(lockKey, owner, 'PX', DEFAULT_LOCK_TTL_MS, 'NX');
    if (locked === 'OK') {
      try {
        const now = Date.now();
        const rawNext = await redis.get(nextKey);
        const nextAt = Number(rawNext || 0);
        const waitMs = Number.isFinite(nextAt) ? Math.max(0, nextAt - now) : 0;
        const reservedNextAt = now + waitMs + spacing;
        await redis.set(nextKey, String(reservedNextAt), 'PX', Math.max(spacing * 10, 60_000));
        if (waitMs > 0) {
          logger.debug('[cj-api-rate-limiter] redis wait', { label, waitMs });
          await sleep(waitMs);
        }
        return waitMs;
      } finally {
        const currentOwner = await redis.get(lockKey).catch(() => null);
        if (currentOwner === owner) {
          await redis.del(lockKey).catch(() => undefined);
        }
      }
    }
    await sleep(100 + Math.floor(Math.random() * 150));
  }

  logger.warn('[cj-api-rate-limiter] redis lock timeout; falling back to local limiter', { label });
  return reserveLocal(label);
}

export const cjApiRateLimiterService = {
  async waitTurn(label = 'cj-api'): Promise<number> {
    if (!isRedisAvailable) {
      return reserveLocal(label);
    }
    try {
      return await reserveRedis(label);
    } catch (error) {
      logger.warn('[cj-api-rate-limiter] redis limiter failed; falling back to local limiter', {
        label,
        error: error instanceof Error ? error.message : String(error),
      });
      return reserveLocal(label);
    }
  },
};
