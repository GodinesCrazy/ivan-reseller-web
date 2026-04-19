import { prisma } from '../../../config/database';
import { Prisma } from '@prisma/client';
import { CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE } from '../cj-ebay-uk.constants';
import type { CjEbayUkConfigResponse } from '../cj-ebay-uk.types';

type SettingsRow = {
  minMarginPct: Prisma.Decimal | null;
  minProfitGbp: Prisma.Decimal | null;
  maxShippingUsd: Prisma.Decimal | null;
  handlingBufferDays: number;
  minStock: number;
  rejectOnUnknownShipping: boolean;
  maxRiskScore: number | null;
  priceChangePctReevaluate: Prisma.Decimal | null;
  incidentBufferPct: Prisma.Decimal | null;
  defaultEbayFeePct: Prisma.Decimal | null;
  defaultPaymentFeePct: Prisma.Decimal | null;
  defaultPaymentFixedFeeGbp: Prisma.Decimal | null;
  ukVatPct: Prisma.Decimal;
  vatMarketplaceFacilitated: boolean;
  fxRateUsdToGbp: Prisma.Decimal;
  cjPostCreateCheckoutMode: string;
};

function toDto(row: SettingsRow): CjEbayUkConfigResponse['settings'] {
  const mode = row.cjPostCreateCheckoutMode === CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
    ? CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
    : CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE.MANUAL;
  return {
    minMarginPct: row.minMarginPct != null ? Number(row.minMarginPct) : null,
    minProfitGbp: row.minProfitGbp != null ? Number(row.minProfitGbp) : null,
    maxShippingUsd: row.maxShippingUsd != null ? Number(row.maxShippingUsd) : null,
    handlingBufferDays: row.handlingBufferDays,
    minStock: row.minStock,
    rejectOnUnknownShipping: row.rejectOnUnknownShipping,
    maxRiskScore: row.maxRiskScore ?? null,
    priceChangePctReevaluate: row.priceChangePctReevaluate != null ? Number(row.priceChangePctReevaluate) : null,
    incidentBufferPct: row.incidentBufferPct != null ? Number(row.incidentBufferPct) : null,
    defaultEbayFeePct: row.defaultEbayFeePct != null ? Number(row.defaultEbayFeePct) : null,
    defaultPaymentFeePct: row.defaultPaymentFeePct != null ? Number(row.defaultPaymentFeePct) : null,
    defaultPaymentFixedFeeGbp: row.defaultPaymentFixedFeeGbp != null ? Number(row.defaultPaymentFixedFeeGbp) : null,
    ukVatPct: Number(row.ukVatPct),
    vatMarketplaceFacilitated: row.vatMarketplaceFacilitated,
    fxRateUsdToGbp: Number(row.fxRateUsdToGbp),
    cjPostCreateCheckoutMode: mode,
  };
}

export const cjEbayUkConfigService = {
  async getOrCreateSettings(userId: number): Promise<CjEbayUkConfigResponse['settings']> {
    let row = await prisma.cjEbayUkAccountSettings.findUnique({ where: { userId } });
    if (!row) {
      row = await prisma.cjEbayUkAccountSettings.create({ data: { userId } });
    }
    return toDto(row);
  },

  async updateSettings(userId: number, body: Record<string, unknown>): Promise<CjEbayUkConfigResponse['settings']> {
    await this.getOrCreateSettings(userId);
    const data: Prisma.CjEbayUkAccountSettingsUpdateInput = {};

    if (body.minMarginPct !== undefined) {
      data.minMarginPct = body.minMarginPct === null ? null : new Prisma.Decimal(String(body.minMarginPct));
    }
    if (body.minProfitGbp !== undefined) {
      data.minProfitGbp = body.minProfitGbp === null ? null : new Prisma.Decimal(String(body.minProfitGbp));
    }
    if (body.maxShippingUsd !== undefined) {
      data.maxShippingUsd = body.maxShippingUsd === null ? null : new Prisma.Decimal(String(body.maxShippingUsd));
    }
    if (typeof body.handlingBufferDays === 'number') data.handlingBufferDays = body.handlingBufferDays;
    if (typeof body.minStock === 'number') data.minStock = body.minStock;
    if (typeof body.rejectOnUnknownShipping === 'boolean') data.rejectOnUnknownShipping = body.rejectOnUnknownShipping;
    if (body.maxRiskScore !== undefined) data.maxRiskScore = body.maxRiskScore === null ? null : Number(body.maxRiskScore);
    if (body.incidentBufferPct !== undefined) {
      data.incidentBufferPct = body.incidentBufferPct === null ? null : new Prisma.Decimal(String(body.incidentBufferPct));
    }
    if (body.defaultEbayFeePct !== undefined) {
      data.defaultEbayFeePct = body.defaultEbayFeePct === null ? null : new Prisma.Decimal(String(body.defaultEbayFeePct));
    }
    if (body.defaultPaymentFeePct !== undefined) {
      data.defaultPaymentFeePct = body.defaultPaymentFeePct === null ? null : new Prisma.Decimal(String(body.defaultPaymentFeePct));
    }
    if (body.defaultPaymentFixedFeeGbp !== undefined) {
      data.defaultPaymentFixedFeeGbp = body.defaultPaymentFixedFeeGbp === null ? null : new Prisma.Decimal(String(body.defaultPaymentFixedFeeGbp));
    }
    if (body.ukVatPct !== undefined) {
      data.ukVatPct = new Prisma.Decimal(String(body.ukVatPct));
    }
    if (typeof body.vatMarketplaceFacilitated === 'boolean') data.vatMarketplaceFacilitated = body.vatMarketplaceFacilitated;
    if (body.fxRateUsdToGbp !== undefined) {
      data.fxRateUsdToGbp = new Prisma.Decimal(String(body.fxRateUsdToGbp));
    }
    if (body.cjPostCreateCheckoutMode !== undefined) {
      data.cjPostCreateCheckoutMode =
        body.cjPostCreateCheckoutMode === CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
          ? CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
          : CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE.MANUAL;
    }

    const row = await prisma.cjEbayUkAccountSettings.update({ where: { userId }, data });
    return toDto(row);
  },
};
