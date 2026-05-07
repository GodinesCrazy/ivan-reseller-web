import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { CJ_SHOPIFY_USA_TRACE_STEP } from '../cj-shopify-usa.constants';

type LockOwner = 'automation' | 'sales_agent';
type LockKey = 'catalog_mutation';

type ActiveLock = {
  owner: LockOwner;
  token: string;
  expiresAt: number;
};

const locks = new Map<string, ActiveLock>();

function lockId(userId: number, key: LockKey): string {
  return `${userId}:${key}`;
}

export class CjShopifyUsaOperationLockService {
  async withCatalogMutationLock<T>(
    userId: number,
    owner: LockOwner,
    fn: () => Promise<T>,
    options: { ttlMs?: number; onBusy?: (active: ActiveLock) => void | Promise<void> } = {},
  ): Promise<T> {
    const key: LockKey = 'catalog_mutation';
    const id = lockId(userId, key);
    const now = Date.now();
    const active = locks.get(id);
    if (active && active.expiresAt > now) {
      await options.onBusy?.(active);
      throw new Error(`Catalog mutation lock is busy by ${active.owner}. Try again when the current cycle finishes.`);
    }

    const token = `${owner}-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const lock: ActiveLock = {
      owner,
      token,
      expiresAt: now + Math.max(60_000, options.ttlMs ?? 45 * 60_000),
    };
    locks.set(id, lock);

    await this.trace(userId, 'cj_shopify_usa.operation_lock.acquired', {
      key,
      owner,
      token,
      expiresAt: new Date(lock.expiresAt).toISOString(),
    });

    try {
      return await fn();
    } finally {
      const current = locks.get(id);
      if (current?.token === token) {
        locks.delete(id);
        await this.trace(userId, 'cj_shopify_usa.operation_lock.released', {
          key,
          owner,
          token,
          releasedAt: new Date().toISOString(),
        });
      }
    }
  }

  private async trace(userId: number, message: string, meta: Prisma.InputJsonValue) {
    await prisma.cjShopifyUsaExecutionTrace.create({
      data: {
        userId,
        step: CJ_SHOPIFY_USA_TRACE_STEP.SALES_AGENT_ACTION,
        message,
        meta,
      },
    });
  }
}

export const cjShopifyUsaOperationLockService = new CjShopifyUsaOperationLockService();
