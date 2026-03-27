import { prisma } from '../config/database';

export interface OrderTruthFlags {
  manuallyCancelledMarketplaceSide: boolean;
  excludedFromCommercialProof: boolean;
  commercialProofEligible: boolean;
  truthNeedsOperatorConfirmation: boolean;
  operatorTruthReason: string | null;
  marketplaceObservedStatus: string | null;
  markedAt: string | null;
  cancelledByUserId: number | null;
}

interface OrderTruthEnvelope {
  legacyText?: string | null;
  truthFlags?: Partial<OrderTruthFlags>;
}

const DEFAULT_TRUTH_FLAGS: OrderTruthFlags = {
  manuallyCancelledMarketplaceSide: false,
  excludedFromCommercialProof: false,
  commercialProofEligible: true,
  truthNeedsOperatorConfirmation: false,
  operatorTruthReason: null,
  marketplaceObservedStatus: null,
  markedAt: null,
  cancelledByUserId: null,
};

function parseEnvelope(raw: string | null | undefined): OrderTruthEnvelope {
  const value = String(raw || '').trim();
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as OrderTruthEnvelope;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return { legacyText: value };
  }

  return {};
}

function toNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function getOrderTruthFlags(order: {
  fulfillmentNotes?: string | null;
  failureReason?: string | null;
  errorMessage?: string | null;
}): OrderTruthFlags {
  const envelope = parseEnvelope(order.fulfillmentNotes);
  const rawFlags = envelope.truthFlags || {};
  const failureReason = String(order.failureReason || '').trim().toUpperCase();
  const explicitManualCancel =
    rawFlags.manuallyCancelledMarketplaceSide === true ||
    failureReason === 'MANUALLY_CANCELLED_MARKETPLACE_SIDE';
  const excluded =
    rawFlags.excludedFromCommercialProof === true ||
    explicitManualCancel;
  const commercialProofEligible =
    rawFlags.commercialProofEligible === false
      ? false
      : !excluded;

  return {
    manuallyCancelledMarketplaceSide: explicitManualCancel,
    excludedFromCommercialProof: excluded,
    commercialProofEligible,
    truthNeedsOperatorConfirmation: rawFlags.truthNeedsOperatorConfirmation === true,
    operatorTruthReason:
      toNullableString(rawFlags.operatorTruthReason) ||
      (explicitManualCancel ? toNullableString(order.errorMessage) : null),
    marketplaceObservedStatus: toNullableString(rawFlags.marketplaceObservedStatus),
    markedAt: toNullableString(rawFlags.markedAt),
    cancelledByUserId:
      typeof rawFlags.cancelledByUserId === 'number' && Number.isFinite(rawFlags.cancelledByUserId)
        ? rawFlags.cancelledByUserId
        : null,
  };
}

export function mergeOrderTruthFlags(params: {
  fulfillmentNotes?: string | null;
  patch: Partial<OrderTruthFlags>;
}): string {
  const envelope = parseEnvelope(params.fulfillmentNotes);
  const current = getOrderTruthFlags({
    fulfillmentNotes: params.fulfillmentNotes,
  });
  const next: OrderTruthFlags = {
    ...DEFAULT_TRUTH_FLAGS,
    ...current,
    ...params.patch,
  };

  return JSON.stringify({
    ...(envelope.legacyText ? { legacyText: envelope.legacyText } : {}),
    truthFlags: next,
  });
}

export async function markOrderCancelledOnMarketplace(params: {
  orderId: string;
  actorUserId?: number | null;
  marketplaceObservedStatus?: string | null;
  reason: string;
}): Promise<{ orderId: string; saleId: number | null }> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      status: true,
      fulfillmentNotes: true,
    },
  });

  if (!order) {
    throw new Error(`Order ${params.orderId} not found`);
  }

  const mergedNotes = mergeOrderTruthFlags({
    fulfillmentNotes: order.fulfillmentNotes,
    patch: {
      manuallyCancelledMarketplaceSide: true,
      excludedFromCommercialProof: true,
      commercialProofEligible: false,
      truthNeedsOperatorConfirmation: false,
      operatorTruthReason: params.reason,
      marketplaceObservedStatus: params.marketplaceObservedStatus || order.status || null,
      markedAt: new Date().toISOString(),
      cancelledByUserId:
        typeof params.actorUserId === 'number' && Number.isFinite(params.actorUserId)
          ? params.actorUserId
          : null,
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { orderId: params.orderId },
      select: { id: true, status: true },
    });

    await tx.order.update({
      where: { id: params.orderId },
      data: {
        status: 'FAILED',
        manualFulfillmentRequired: false,
        failureReason: 'MANUALLY_CANCELLED_MARKETPLACE_SIDE',
        errorMessage: params.reason,
        fulfillmentNotes: mergedNotes,
      },
    });

    if (sale && sale.status !== 'CANCELLED') {
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'CANCELLED' },
      });
    }

    return { orderId: params.orderId, saleId: sale?.id ?? null };
  });

  return result;
}
