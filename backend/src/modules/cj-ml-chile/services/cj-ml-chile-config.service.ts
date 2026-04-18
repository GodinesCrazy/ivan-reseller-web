import { prisma } from '../../../config/database';
import { Prisma } from '@prisma/client';

export const cjMlChileConfigService = {
  async getOrCreate(userId: number) {
    await prisma.cjMlChileAccountSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return prisma.cjMlChileAccountSettings.findUniqueOrThrow({ where: { userId } });
  },

  async update(userId: number, data: {
    minMarginPct?: number | null;
    minProfitUsd?: number | null;
    minStock?: number;
    maxShippingUsd?: number | null;
    mlcFeePct?: number;
    mpPaymentFeePct?: number;
    incidentBufferPct?: number;
    requireChileWarehouse?: boolean;
    rejectOnUnknownShipping?: boolean;
  }) {
    await prisma.cjMlChileAccountSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const updateData: Prisma.CjMlChileAccountSettingsUpdateInput = {};

    if (data.minMarginPct !== undefined) {
      updateData.minMarginPct = data.minMarginPct != null ? new Prisma.Decimal(data.minMarginPct) : null;
    }
    if (data.minProfitUsd !== undefined) {
      updateData.minProfitUsd = data.minProfitUsd != null ? new Prisma.Decimal(data.minProfitUsd) : null;
    }
    if (data.minStock !== undefined) updateData.minStock = data.minStock;
    if (data.maxShippingUsd !== undefined) {
      updateData.maxShippingUsd = data.maxShippingUsd != null ? new Prisma.Decimal(data.maxShippingUsd) : null;
    }
    if (data.mlcFeePct !== undefined) updateData.mlcFeePct = new Prisma.Decimal(data.mlcFeePct);
    if (data.mpPaymentFeePct !== undefined) updateData.mpPaymentFeePct = new Prisma.Decimal(data.mpPaymentFeePct);
    if (data.incidentBufferPct !== undefined) updateData.incidentBufferPct = new Prisma.Decimal(data.incidentBufferPct);
    if (data.requireChileWarehouse !== undefined) updateData.requireChileWarehouse = data.requireChileWarehouse;
    if (data.rejectOnUnknownShipping !== undefined) updateData.rejectOnUnknownShipping = data.rejectOnUnknownShipping;

    return prisma.cjMlChileAccountSettings.update({
      where: { userId },
      data: updateData,
    });
  },

  toApiShape(row: Awaited<ReturnType<typeof cjMlChileConfigService.getOrCreate>>) {
    return {
      minMarginPct: row.minMarginPct != null ? Number(row.minMarginPct) : null,
      minProfitUsd: row.minProfitUsd != null ? Number(row.minProfitUsd) : null,
      minStock: row.minStock,
      maxShippingUsd: row.maxShippingUsd != null ? Number(row.maxShippingUsd) : null,
      mlcFeePct: Number(row.mlcFeePct),
      mpPaymentFeePct: Number(row.mpPaymentFeePct),
      incidentBufferPct: Number(row.incidentBufferPct),
      requireChileWarehouse: row.requireChileWarehouse,
      rejectOnUnknownShipping: row.rejectOnUnknownShipping,
    };
  },

  async getPostCreateCheckoutMode(_userId: number) {
    // For now, default to MANUAL for ML Chile until we confirm balance usage auto-flow
    return 'MANUAL';
  },
};
