import { prisma } from '../../../config/database';
import { AppError } from '../../../middleware/error.middleware';
import { CJ_EBAY_LISTING_STATUS } from '../cj-ebay.constants';

export interface CjEbayMonthlySellingLimitsSnapshot {
  periodStart: string;
  periodEnd: string;
  listingLimit: number | null;
  amountLimitUsd: number | null;
  usedListings: number;
  usedAmountUsd: number;
  remainingListings: number | null;
  remainingAmountUsd: number | null;
  configured: boolean;
}

function optionalPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function currentUtcMonthWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

function configuredListingLimit(): number | null {
  return optionalPositiveNumber(process.env.CJ_EBAY_MONTHLY_LISTING_LIMIT);
}

function configuredAmountLimitUsd(): number | null {
  return optionalPositiveNumber(process.env.CJ_EBAY_MONTHLY_AMOUNT_LIMIT_USD);
}

export const cjEbaySellingLimitsService = {
  async getMonthlySnapshot(userId: number, now = new Date()): Promise<CjEbayMonthlySellingLimitsSnapshot> {
    const { start, end } = currentUtcMonthWindow(now);
    const listingLimit = configuredListingLimit();
    const amountLimitUsd = configuredAmountLimitUsd();

    const rows = await prisma.cjEbayListing.findMany({
      where: {
        userId,
        status: CJ_EBAY_LISTING_STATUS.ACTIVE,
        publishedAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        listedPriceUsd: true,
        quantity: true,
      },
    });

    const usedListings = rows.length;
    const usedAmountUsd = roundMoney(rows.reduce((sum, row) => {
      const price = Number(row.listedPriceUsd ?? 0);
      const quantity = Math.max(1, Math.floor(Number(row.quantity ?? 1)));
      return sum + (Number.isFinite(price) ? price * quantity : 0);
    }, 0));

    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      listingLimit,
      amountLimitUsd,
      usedListings,
      usedAmountUsd,
      remainingListings: listingLimit == null ? null : Math.max(0, listingLimit - usedListings),
      remainingAmountUsd: amountLimitUsd == null ? null : roundMoney(Math.max(0, amountLimitUsd - usedAmountUsd)),
      configured: listingLimit != null || amountLimitUsd != null,
    };
  },

  async assertCanPublish(input: {
    userId: number;
    projectedPriceUsd: number;
    projectedQuantity: number;
  }): Promise<CjEbayMonthlySellingLimitsSnapshot> {
    const snapshot = await this.getMonthlySnapshot(input.userId);
    const projectedQuantity = Math.max(1, Math.floor(input.projectedQuantity || 1));
    const projectedAmountUsd = roundMoney(input.projectedPriceUsd * projectedQuantity);

    if (snapshot.listingLimit != null && snapshot.usedListings + 1 > snapshot.listingLimit) {
      throw new AppError(
        `CJ-eBay monthly listing limit reached: ${snapshot.usedListings}/${snapshot.listingLimit} listings already published in this period.`,
        423,
      );
    }

    if (snapshot.amountLimitUsd != null && roundMoney(snapshot.usedAmountUsd + projectedAmountUsd) > snapshot.amountLimitUsd) {
      throw new AppError(
        `CJ-eBay monthly amount limit would be exceeded: current $${snapshot.usedAmountUsd.toFixed(2)} + projected $${projectedAmountUsd.toFixed(2)} > limit $${snapshot.amountLimitUsd.toFixed(2)}.`,
        423,
      );
    }

    return snapshot;
  },
};
