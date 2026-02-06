/**
 * Account Rotation Service — Select lowest usage healthy account.
 * Skip blocked, increment usage after operation, mark unhealthy on failure.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

export interface AccountHealthResult {
  marketplace: { healthy: number; total: number; blocked: number };
  paypal: { healthy: number; total: number; blocked: number };
  aliexpress: { healthy: number; total: number; blocked: number };
}

export interface RotatedAccount {
  type: 'marketplace' | 'paypal' | 'aliexpress';
  accountId: number;
  identifier?: string;
}

export class AccountRotationService {
  /**
   * Get next account: select lowest usage healthy account.
   * Skip blocked, accounts over maxDailyUsage.
   */
  async getNextAccount(
    userId: number,
    type: 'marketplace' | 'paypal' | 'aliexpress',
    apiName?: string
  ): Promise<RotatedAccount | null> {
    const cluster = await prisma.accountCluster.findFirst({
      where: { userId },
      include: {
        marketplaceAccounts: { where: { isActive: true, isBlocked: false } },
        paypalAccounts: { where: { isActive: true, isBlocked: false } },
        aliexpressAccounts: { where: { isActive: true, isBlocked: false } },
      },
    });

    if (!cluster) return null;

    if (type === 'marketplace' && apiName) {
      const accounts = cluster.marketplaceAccounts
        .filter((a) => a.apiName === apiName)
        .filter((a) => (a.dailyUsage ?? 0) < (a.maxDailyUsage ?? 100))
        .sort((a, b) => (a.dailyUsage ?? 0) - (b.dailyUsage ?? 0));
      if (accounts.length === 0) return null;
      const next = accounts[0];
      return { type, accountId: next.id, identifier: String(next.credentialId) };
    }
    if (type === 'paypal') {
      const accounts = cluster.paypalAccounts
        .filter((a) => (a.dailyUsage ?? 0) < (a.maxDailyUsage ?? 100))
        .sort((a, b) => (a.dailyUsage ?? 0) - (b.dailyUsage ?? 0));
      if (accounts.length === 0) return null;
      const next = accounts[0];
      return { type, accountId: next.id, identifier: next.identifier };
    }
    if (type === 'aliexpress') {
      const accounts = cluster.aliexpressAccounts
        .filter((a) => (a.dailyUsage ?? 0) < (a.maxDailyUsage ?? 100))
        .sort((a, b) => (a.dailyUsage ?? 0) - (b.dailyUsage ?? 0));
      if (accounts.length === 0) return null;
      const next = accounts[0];
      return { type, accountId: next.id, identifier: next.identifier };
    }
    return null;
  }

  /**
   * Increment usage after successful operation.
   */
  async incrementUsage(
    accountId: number,
    type: 'marketplace' | 'paypal' | 'aliexpress'
  ): Promise<void> {
    try {
      if (type === 'marketplace') {
        await prisma.marketplaceAccount.update({
          where: { id: accountId },
          data: { dailyUsage: { increment: 1 } },
        });
      } else if (type === 'paypal') {
        await prisma.payPalAccount.update({
          where: { id: accountId },
          data: { dailyUsage: { increment: 1 } },
        });
      } else if (type === 'aliexpress') {
        await prisma.aliExpressAccount.update({
          where: { id: accountId },
          data: { dailyUsage: { increment: 1 } },
        });
      }
    } catch (e: any) {
      logger.warn('[ACCOUNT-ROTATION] Failed to increment usage', { accountId, type, error: e?.message });
    }
  }

  /**
   * Mark account unhealthy (isBlocked=true) on failure.
   */
  async markUnhealthy(
    accountId: number,
    type: 'marketplace' | 'paypal' | 'aliexpress'
  ): Promise<void> {
    try {
      if (type === 'marketplace') {
        await prisma.marketplaceAccount.update({
          where: { id: accountId },
          data: { isBlocked: true },
        });
      } else if (type === 'paypal') {
        await prisma.payPalAccount.update({
          where: { id: accountId },
          data: { isBlocked: true },
        });
      } else if (type === 'aliexpress') {
        await prisma.aliExpressAccount.update({
          where: { id: accountId },
          data: { isBlocked: true },
        });
      }
      logger.info('[ACCOUNT-ROTATION] Marked unhealthy', { accountId, type });
    } catch (e: any) {
      logger.warn('[ACCOUNT-ROTATION] Failed to mark unhealthy', { accountId, type, error: e?.message });
    }
  }

  /**
   * Health check for all account types.
   */
  async getAccountHealth(userId?: number): Promise<AccountHealthResult> {
    const where = userId ? { userId } : {};
    const clusters = await prisma.accountCluster.findMany({
      where,
      include: {
        marketplaceAccounts: true,
        paypalAccounts: true,
        aliexpressAccounts: true,
      },
    });

    let marketplaceTotal = 0,
      marketplaceBlocked = 0,
      marketplaceHealthy = 0;
    let paypalTotal = 0,
      paypalBlocked = 0,
      paypalHealthy = 0;
    let aliexpressTotal = 0,
      aliexpressBlocked = 0,
      aliexpressHealthy = 0;

    for (const c of clusters) {
      for (const a of c.marketplaceAccounts) {
        marketplaceTotal++;
        if (a.isBlocked) marketplaceBlocked++;
        else if (a.isActive) marketplaceHealthy++;
      }
      for (const a of c.paypalAccounts) {
        paypalTotal++;
        if (a.isBlocked) paypalBlocked++;
        else if (a.isActive) paypalHealthy++;
      }
      for (const a of c.aliexpressAccounts) {
        aliexpressTotal++;
        if (a.isBlocked) aliexpressBlocked++;
        else if (a.isActive) aliexpressHealthy++;
      }
    }

    return {
      marketplace: { healthy: marketplaceHealthy, total: marketplaceTotal, blocked: marketplaceBlocked },
      paypal: { healthy: paypalHealthy, total: paypalTotal, blocked: paypalBlocked },
      aliexpress: { healthy: aliexpressHealthy, total: aliexpressTotal, blocked: aliexpressBlocked },
    };
  }
}

export const accountRotationService = new AccountRotationService();
