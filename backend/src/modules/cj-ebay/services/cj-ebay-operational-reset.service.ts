import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  CJ_EBAY_DEFAULT_MONTHLY_AMOUNT_LIMIT_USD,
  CJ_EBAY_DEFAULT_MONTHLY_LISTING_LIMIT,
} from './cj-ebay-config.service';

export const cjEbayOperationalResetService = {
  async resetUserData(userId: number, options?: { keepSettings?: boolean }) {
    const keepSettings = options?.keepSettings ?? true;
    const counts = {
      automationRuns: await prisma.cjEbayAutomationRun.count({ where: { userId } }),
      opportunityCandidates: await prisma.cjEbayOpportunityCandidate.count({ where: { userId } }),
      opportunityRuns: await prisma.cjEbayOpportunityRun.count({ where: { userId } }),
      orders: await prisma.cjEbayOrder.count({ where: { userId } }),
      listings: await prisma.cjEbayListing.count({ where: { userId } }),
      evaluations: await prisma.cjEbayProductEvaluation.count({ where: { userId } }),
      shippingQuotes: await prisma.cjEbayShippingQuote.count({ where: { userId } }),
      products: await prisma.cjEbayProduct.count({ where: { userId } }),
      alerts: await prisma.cjEbayAlert.count({ where: { userId } }),
      profitSnapshots: await prisma.cjEbayProfitSnapshot.count({ where: { userId } }),
      traces: await prisma.cjEbayExecutionTrace.count({ where: { userId } }),
    };

    await prisma.$transaction(async (tx) => {
      await tx.cjEbayAutomationRun.deleteMany({ where: { userId } });
      await tx.cjEbayOpportunityCandidate.deleteMany({ where: { userId } });
      await tx.cjEbayOpportunityRun.deleteMany({ where: { userId } });
      await tx.cjEbayOrderRefund.deleteMany({ where: { userId } });
      await tx.cjEbayTracking.deleteMany({ where: { order: { userId } } });
      await tx.cjEbayOrderEvent.deleteMany({ where: { order: { userId } } });
      await tx.cjEbayOrder.deleteMany({ where: { userId } });
      await tx.cjEbayListing.deleteMany({ where: { userId } });
      await tx.cjEbayProductEvaluation.deleteMany({ where: { userId } });
      await tx.cjEbayShippingQuote.deleteMany({ where: { userId } });
      await tx.cjEbayProductVariant.deleteMany({ where: { product: { userId } } });
      await tx.cjEbayProduct.deleteMany({ where: { userId } });
      await tx.cjEbayAlert.deleteMany({ where: { userId } });
      await tx.cjEbayProfitSnapshot.deleteMany({ where: { userId } });
      await tx.cjEbayExecutionTrace.deleteMany({ where: { userId } });

      if (keepSettings) {
        await tx.cjEbayAccountSettings.upsert({
          where: { userId },
          create: {
            userId,
            marketNiche: 'PET_SUPPLIES',
            requirePetCategory: true,
            requireUsWarehouseOnly: true,
            autopilotEnabled: false,
            autopilotState: 'PAUSED',
            autoPayCjOrders: false,
            maxPublishesPerRun: 1,
            monthlyListingLimit: CJ_EBAY_DEFAULT_MONTHLY_LISTING_LIMIT,
            monthlyAmountLimitUsd: new Prisma.Decimal(CJ_EBAY_DEFAULT_MONTHLY_AMOUNT_LIMIT_USD),
          },
          update: {
            marketNiche: 'PET_SUPPLIES',
            requirePetCategory: true,
            requireUsWarehouseOnly: true,
            autopilotEnabled: false,
            autopilotState: 'PAUSED',
            autoPayCjOrders: false,
            autopilotLastRunAt: null,
            autopilotNextRunAt: null,
            monthlyListingLimit: CJ_EBAY_DEFAULT_MONTHLY_LISTING_LIMIT,
            monthlyAmountLimitUsd: new Prisma.Decimal(CJ_EBAY_DEFAULT_MONTHLY_AMOUNT_LIMIT_USD),
          },
        });
      } else {
        await tx.cjEbayAccountSettings.deleteMany({ where: { userId } });
        await tx.cjEbayAccountSettings.create({
          data: {
            userId,
            marketNiche: 'PET_SUPPLIES',
            requirePetCategory: true,
            requireUsWarehouseOnly: true,
            monthlyListingLimit: CJ_EBAY_DEFAULT_MONTHLY_LISTING_LIMIT,
            monthlyAmountLimitUsd: new Prisma.Decimal(CJ_EBAY_DEFAULT_MONTHLY_AMOUNT_LIMIT_USD),
          },
        });
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 20_000,
      timeout: 60_000,
    });

    return {
      ok: true,
      resetAt: new Date().toISOString(),
      marketNiche: 'PET_SUPPLIES',
      autopilotState: 'PAUSED',
      deleted: counts,
      note: 'CJ-eBay operational truth was reset for this user. Credentials and non-CJ-eBay modules were not touched.',
    };
  },
};
