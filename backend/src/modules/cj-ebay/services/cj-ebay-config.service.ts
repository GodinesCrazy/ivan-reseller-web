import { prisma } from '../../../config/database';
import type { CjEbayUpdateConfigBody } from '../schemas/cj-ebay.schemas';
import type { CjEbayConfigResponse } from '../cj-ebay.types';
import { Prisma } from '@prisma/client';
import { CJ_EBAY_POST_CREATE_CHECKOUT_MODE } from '../cj-ebay.constants';

function toSettingsDto(row: {
  minMarginPct: Prisma.Decimal | null;
  minProfitUsd: Prisma.Decimal | null;
  maxShippingUsd: Prisma.Decimal | null;
  handlingBufferDays: number;
  minStock: number;
  rejectOnUnknownShipping: boolean;
  maxRiskScore: number | null;
  priceChangePctReevaluate: Prisma.Decimal | null;
  incidentBufferPct: Prisma.Decimal | null;
  defaultEbayFeePct: Prisma.Decimal | null;
  defaultPaymentFeePct: Prisma.Decimal | null;
  defaultPaymentFixedFeeUsd: Prisma.Decimal | null;
  cjPostCreateCheckoutMode: string;
}): CjEbayConfigResponse['settings'] {
  return {
    minMarginPct: row.minMarginPct != null ? Number(row.minMarginPct) : null,
    minProfitUsd: row.minProfitUsd != null ? Number(row.minProfitUsd) : null,
    maxShippingUsd: row.maxShippingUsd != null ? Number(row.maxShippingUsd) : null,
    handlingBufferDays: row.handlingBufferDays,
    minStock: row.minStock,
    rejectOnUnknownShipping: row.rejectOnUnknownShipping,
    maxRiskScore: row.maxRiskScore,
    priceChangePctReevaluate:
      row.priceChangePctReevaluate != null ? Number(row.priceChangePctReevaluate) : null,
    incidentBufferPct: row.incidentBufferPct != null ? Number(row.incidentBufferPct) : null,
    defaultEbayFeePct: row.defaultEbayFeePct != null ? Number(row.defaultEbayFeePct) : null,
    defaultPaymentFeePct:
      row.defaultPaymentFeePct != null ? Number(row.defaultPaymentFeePct) : null,
    defaultPaymentFixedFeeUsd:
      row.defaultPaymentFixedFeeUsd != null ? Number(row.defaultPaymentFixedFeeUsd) : null,
    cjPostCreateCheckoutMode:
      row.cjPostCreateCheckoutMode === CJ_EBAY_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
        ? CJ_EBAY_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
        : CJ_EBAY_POST_CREATE_CHECKOUT_MODE.MANUAL,
  };
}

export const cjEbayConfigService = {
  async getOrCreateSettings(userId: number): Promise<CjEbayConfigResponse['settings']> {
    let row = await prisma.cjEbayAccountSettings.findUnique({ where: { userId } });
    if (!row) {
      row = await prisma.cjEbayAccountSettings.create({
        data: { userId },
      });
    }
    return toSettingsDto(row);
  },

  async updateSettings(
    userId: number,
    body: CjEbayUpdateConfigBody
  ): Promise<CjEbayConfigResponse['settings']> {
    await this.getOrCreateSettings(userId);
    const data: Prisma.CjEbayAccountSettingsUpdateInput = {};
    if (body.minMarginPct !== undefined) {
      data.minMarginPct =
        body.minMarginPct === null ? null : new Prisma.Decimal(body.minMarginPct);
    }
    if (body.minProfitUsd !== undefined) {
      data.minProfitUsd =
        body.minProfitUsd === null ? null : new Prisma.Decimal(body.minProfitUsd);
    }
    if (body.maxShippingUsd !== undefined) {
      data.maxShippingUsd =
        body.maxShippingUsd === null ? null : new Prisma.Decimal(body.maxShippingUsd);
    }
    if (body.handlingBufferDays !== undefined) data.handlingBufferDays = body.handlingBufferDays;
    if (body.minStock !== undefined) data.minStock = body.minStock;
    if (body.rejectOnUnknownShipping !== undefined) {
      data.rejectOnUnknownShipping = body.rejectOnUnknownShipping;
    }
    if (body.maxRiskScore !== undefined) data.maxRiskScore = body.maxRiskScore;
    if (body.priceChangePctReevaluate !== undefined) {
      data.priceChangePctReevaluate =
        body.priceChangePctReevaluate === null
          ? null
          : new Prisma.Decimal(body.priceChangePctReevaluate);
    }
    if (body.incidentBufferPct !== undefined) {
      data.incidentBufferPct =
        body.incidentBufferPct === null ? null : new Prisma.Decimal(body.incidentBufferPct);
    }
    if (body.defaultEbayFeePct !== undefined) {
      data.defaultEbayFeePct =
        body.defaultEbayFeePct === null ? null : new Prisma.Decimal(body.defaultEbayFeePct);
    }
    if (body.defaultPaymentFeePct !== undefined) {
      data.defaultPaymentFeePct =
        body.defaultPaymentFeePct === null ? null : new Prisma.Decimal(body.defaultPaymentFeePct);
    }
    if (body.defaultPaymentFixedFeeUsd !== undefined) {
      data.defaultPaymentFixedFeeUsd =
        body.defaultPaymentFixedFeeUsd === null
          ? null
          : new Prisma.Decimal(body.defaultPaymentFixedFeeUsd);
    }
    if (body.cjPostCreateCheckoutMode !== undefined) {
      data.cjPostCreateCheckoutMode =
        body.cjPostCreateCheckoutMode === CJ_EBAY_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
          ? CJ_EBAY_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
          : CJ_EBAY_POST_CREATE_CHECKOUT_MODE.MANUAL;
    }
    const row = await prisma.cjEbayAccountSettings.update({
      where: { userId },
      data,
    });
    return toSettingsDto(row);
  },

  async getPostCreateCheckoutMode(userId: number): Promise<
    (typeof CJ_EBAY_POST_CREATE_CHECKOUT_MODE)[keyof typeof CJ_EBAY_POST_CREATE_CHECKOUT_MODE]
  > {
    const row = await prisma.cjEbayAccountSettings.findUnique({ where: { userId } });
    if (!row) {
      await this.getOrCreateSettings(userId);
    }
    const again = await prisma.cjEbayAccountSettings.findUnique({ where: { userId } });
    const m = String(again?.cjPostCreateCheckoutMode || '').trim();
    return m === CJ_EBAY_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
      ? CJ_EBAY_POST_CREATE_CHECKOUT_MODE.AUTO_CONFIRM_PAY
      : CJ_EBAY_POST_CREATE_CHECKOUT_MODE.MANUAL;
  },
};
