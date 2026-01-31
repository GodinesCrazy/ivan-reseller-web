import { trace } from '../utils/boot-trace';
trace('loading marketplace-auth-status.service');

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export type MarketplaceAuthState = 'unknown' | 'healthy' | 'refreshing' | 'manual_required' | 'error';

interface StatusOptions {
  message?: string | null;
  requiresManual?: boolean;
  lastAutomaticAttempt?: Date | string | null;
  lastAutomaticSuccess?: Date | string | null;
}

const normalizeDate = (value?: Date | string | null): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
};

class MarketplaceAuthStatusService {
  async setStatus(
    userId: number,
    marketplace: string,
    status: MarketplaceAuthState,
    options: StatusOptions = {}
  ) {
    const now = new Date();
    const updateData: Prisma.MarketplaceAuthStatusUpdateInput = {
      status,
      updatedAt: now,
    };

    if (typeof options.message !== 'undefined') {
      updateData.message = options.message;
    }

    if (typeof options.requiresManual !== 'undefined') {
      updateData.requiresManual = options.requiresManual;
    }

    const attempt = normalizeDate(options.lastAutomaticAttempt);
    const success = normalizeDate(options.lastAutomaticSuccess);

    if (attempt) {
      updateData.lastAutomaticAttempt = attempt;
    }

    if (success) {
      updateData.lastAutomaticSuccess = success;
    }

    switch (status) {
      case 'healthy': {
        updateData.requiresManual = false;
        updateData.lastAutomaticSuccess = success ?? now;
        break;
      }
      case 'refreshing': {
        updateData.lastAutomaticAttempt = attempt ?? now;
        break;
      }
      case 'manual_required': {
        updateData.requiresManual = true;
        break;
      }
      default:
        break;
    }

    return prisma.marketplaceAuthStatus.upsert({
      where: {
        userId_marketplace: {
          userId,
          marketplace,
        },
      },
      update: updateData,
      create: {
        userId,
        marketplace,
        status,
        message: typeof options.message !== 'undefined' ? options.message : null,
        requiresManual:
          typeof options.requiresManual !== 'undefined'
            ? options.requiresManual
            : status === 'manual_required',
        lastAutomaticAttempt: attempt,
        lastAutomaticSuccess: success ?? (status === 'healthy' ? now : undefined),
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async markHealthy(userId: number, marketplace: string, message?: string) {
    return this.setStatus(userId, marketplace, 'healthy', {
      message,
      requiresManual: false,
    });
  }

  async markRefreshing(userId: number, marketplace: string, message?: string) {
    return this.setStatus(userId, marketplace, 'refreshing', {
      message,
      requiresManual: false,
    });
  }

  async markManualRequired(userId: number, marketplace: string, message?: string) {
    return this.setStatus(userId, marketplace, 'manual_required', {
      message,
      requiresManual: true,
    });
  }

  async markError(
    userId: number,
    marketplace: string,
    message?: string,
    options: StatusOptions = {}
  ) {
    return this.setStatus(userId, marketplace, 'error', {
      message,
      requiresManual: options.requiresManual ?? false,
      lastAutomaticAttempt: options.lastAutomaticAttempt,
    });
  }

  async getStatus(userId: number, marketplace: string) {
    return prisma.marketplaceAuthStatus.findUnique({
      where: {
        userId_marketplace: {
          userId,
          marketplace,
        },
      },
    });
  }

  async listByUser(userId: number) {
    return prisma.marketplaceAuthStatus.findMany({
      where: { userId },
    });
  }

  async listByMarketplace(marketplace: string) {
    return prisma.marketplaceAuthStatus.findMany({
      where: { marketplace },
    });
  }
}

export const marketplaceAuthStatusService = new MarketplaceAuthStatusService();

