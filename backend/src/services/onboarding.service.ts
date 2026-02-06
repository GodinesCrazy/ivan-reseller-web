/**
 * Onboarding Service ? Wizard state and steps.
 * Step 1: Account created
 * Step 2: PayPal email saved
 * Step 3: At least one marketplace connected
 * Step 4: onboardingCompleted = true
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

export type MarketplaceType = 'ebay' | 'amazon' | 'mercadolibre';

export interface OnboardingStatus {
  onboardingStep: number;
  onboardingCompleted: boolean;
  paypalPayoutEmail: string | null;
  marketplacesConnected: {
    ebayConnected: boolean;
    amazonConnected: boolean;
    mercadolibreConnected: boolean;
  };
  canFinish: boolean;
}

export class OnboardingService {
  async getStatus(userId: number): Promise<OnboardingStatus> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingStep: true,
        onboardingCompleted: true,
        paypalPayoutEmail: true,
        ebayConnected: true,
        amazonConnected: true,
        mercadolibreConnected: true,
      } as any,
    });
    if (!user) {
      return {
        onboardingStep: 0,
        onboardingCompleted: false,
        paypalPayoutEmail: null,
        marketplacesConnected: {
          ebayConnected: false,
          amazonConnected: false,
          mercadolibreConnected: false,
        },
        canFinish: false,
      };
    }
    const u = user as any;
    const atLeastOneMarketplace =
      u.ebayConnected || u.amazonConnected || u.mercadolibreConnected;
    const canFinish =
      !!u.paypalPayoutEmail?.trim() &&
      atLeastOneMarketplace &&
      !u.onboardingCompleted;

    return {
      onboardingStep: u.onboardingStep ?? 0,
      onboardingCompleted: u.onboardingCompleted ?? false,
      paypalPayoutEmail: u.paypalPayoutEmail ?? null,
      marketplacesConnected: {
        ebayConnected: u.ebayConnected ?? false,
        amazonConnected: u.amazonConnected ?? false,
        mercadolibreConnected: u.mercadolibreConnected ?? false,
      },
      canFinish,
    };
  }

  async setPaypal(userId: number, email: string): Promise<void> {
    const trimmed = email?.trim() || '';
    await prisma.user.update({
      where: { id: userId },
      data: {
        paypalPayoutEmail: trimmed || null,
        onboardingStep: Math.max(1, 2),
      } as any,
    });
    logger.info('[ONBOARDING] PayPal email set', { userId });
  }

  async connectMarketplace(
    userId: number,
    marketplace: MarketplaceType,
    credentialsId?: number
  ): Promise<void> {
    const field =
      marketplace === 'ebay'
        ? 'ebayConnected'
        : marketplace === 'amazon'
          ? 'amazonConnected'
          : 'mercadolibreConnected';
    await prisma.user.update({
      where: { id: userId },
      data: {
        [field]: true,
        onboardingStep: 3,
      },
    });
    logger.info('[ONBOARDING] Marketplace connected', { userId, marketplace, credentialsId });
  }

  async completeStep(userId: number, step: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingStep: Math.max(step, 0) } as any,
    });
  }

  async finishOnboarding(userId: number): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        paypalPayoutEmail: true,
        ebayConnected: true,
        amazonConnected: true,
        mercadolibreConnected: true,
      },
    });
    if (!user) return;
    const atLeastOne =
      user.ebayConnected || user.amazonConnected || user.mercadolibreConnected;
    if (!user.paypalPayoutEmail?.trim() || !atLeastOne) {
      logger.warn('[ONBOARDING] Cannot finish: missing PayPal or marketplace', { userId });
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true, onboardingStep: 4 } as any,
    });
    logger.info('[ONBOARDING] Finished', { userId });
  }
}

export const onboardingService = new OnboardingService();
