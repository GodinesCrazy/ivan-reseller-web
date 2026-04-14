/**
 * FASE 3E.4 — Snapshot solo-lectura para validación manual del flujo CJ→eBay.
 * Sin llamadas a CJ/eBay; no workers; no tablas legacy.
 */

import { prisma } from '../../../config/database';
import { CJ_EBAY_ORDER_STATUS } from '../cj-ebay.constants';

const CONFIRM_STATUSES = new Set<string>([
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED,
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMING,
]);

const PAY_STATUSES = new Set<string>([
  CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED,
  CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING,
  CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PROCESSING,
]);

function shipToFromBuyerPayload(buyerPayload: unknown): Record<string, string> {
  const p = buyerPayload as Record<string, unknown> | null | undefined;
  const addr = p?.shippingAddress as Record<string, unknown> | undefined;
  if (!addr) return {};
  const out: Record<string, string> = {};
  for (const k of [
    'fullName',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'zipCode',
    'country',
    'phoneNumber',
  ]) {
    const v = addr[k];
    if (v != null) out[k] = String(v).slice(0, 500);
  }
  return out;
}

export type FlowGate = { ok: boolean; reason?: string };

export const cjEbayOperationalValidationService = {
  /**
   * Resumen para protocolo 3E.4: qué pasos HTTP tiene sentido llamar y por qué no.
   */
  async getFlowSnapshot(userId: number, orderId: string): Promise<{
    orderId: string;
    ebayOrderId: string;
    localStatus: string;
    cjOrderId: string | null;
    cjConfirmedAt: string | null;
    cjPaidAt: string | null;
    lastError: string | null;
    legacyIsolation: { module: string; usesLegacyOrderTable: boolean };
    gates: {
      placeCjOrder: FlowGate;
      confirmCjOrder: FlowGate;
      payCjOrder: FlowGate;
      getCjOrderStatus: FlowGate;
      syncTracking: FlowGate;
    };
    suggestedSequence: string[];
    recentTraces: Array<{
      step: string;
      message: string;
      route: string | null;
      correlationId: string | null;
      createdAt: string;
    }>;
  }> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: orderId, userId },
      include: {
        variant: true,
        listing: { include: { shippingQuote: true } },
        tracking: true,
      },
    });
    if (!order) {
      throw new Error('Order not found');
    }

    const shipTo = shipToFromBuyerPayload(order.buyerPayload);
    const bp = order.buyerPayload as Record<string, unknown> | undefined;
    if (!shipTo.fullName?.trim() && typeof bp?.buyerName === 'string' && bp.buyerName.trim()) {
      shipTo.fullName = bp.buyerName.trim().slice(0, 500);
    }

    const hasMapping =
      order.listingId != null && order.variantId != null && order.listing != null;
    const variant = order.variant;
    const quote = order.listing?.shippingQuote;
    const logisticName = String(quote?.serviceName || quote?.carrier || '').trim();
    const cjVid = String(variant?.cjVid || '').trim();
    const cjSku = variant?.cjSku ? String(variant.cjSku).trim() : '';

    const retryAfterFailure =
      !order.cjOrderId &&
      hasMapping &&
      (order.status === CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL ||
        order.status === CJ_EBAY_ORDER_STATUS.FAILED);
    const canPlaceStatus =
      order.status === CJ_EBAY_ORDER_STATUS.VALIDATED || retryAfterFailure;

    let placeReason: string | undefined;
    if (order.cjOrderId) {
      placeReason = 'cjOrderId already set (idempotent no-repeat place).';
    } else if (!canPlaceStatus) {
      placeReason = `Status must be VALIDATED or NEEDS_MANUAL/FAILED (mapped, no cjOrderId); current: ${order.status}.`;
    } else if (!hasMapping) {
      placeReason = 'Order not mapped to CJ listing/variant (import must match ebaySku to listing).';
    } else if (!cjSku) {
      placeReason = 'Variant missing cjSku.';
    } else if (!cjVid) {
      placeReason = 'Variant missing cjVid.';
    } else if (!logisticName) {
      placeReason = 'Listing has no shipping quote (logisticName).';
    } else if (!shipTo.addressLine1 || !shipTo.city || !shipTo.country) {
      placeReason = 'Incomplete ship-to (addressLine1, city, country).';
    } else if (!shipTo.fullName?.trim()) {
      placeReason = 'Missing recipient fullName.';
    } else {
      const cc = String(shipTo.country || '').trim().toUpperCase();
      if (cc === 'US' && !String(shipTo.state || '').trim()) {
        placeReason = 'US orders require state/province on shipping address.';
      }
    }

    const placeCjOrder: FlowGate = {
      ok: !placeReason,
      reason: placeReason,
    };

    let confirmReason: string | undefined;
    if (!order.cjOrderId) confirmReason = 'No cjOrderId — run POST .../place first.';
    else if (order.cjConfirmedAt) confirmReason = 'Already confirmed (cjConfirmedAt set).';
    else if (!CONFIRM_STATUSES.has(order.status)) {
      confirmReason = `Status must be CJ_ORDER_CREATED or CJ_ORDER_CONFIRMING; current: ${order.status}.`;
    }

    let payReason: string | undefined;
    if (!order.cjOrderId) payReason = 'No cjOrderId.';
    else if (!order.cjConfirmedAt) payReason = 'Run confirm first (cjConfirmedAt missing).';
    else if (order.cjPaidAt) payReason = 'Already paid (cjPaidAt set).';
    else if (!PAY_STATUSES.has(order.status)) {
      payReason = `Status not eligible for pay (expect CJ_PAYMENT_PENDING / CONFIRMED / PROCESSING); current: ${order.status}.`;
    }

    let statusReason: string | undefined;
    if (!order.cjOrderId) statusReason = 'No cjOrderId — place first.';

    let syncReason: string | undefined;
    if (!order.cjOrderId) syncReason = 'No cjOrderId — place first.';
    else if (order.status === CJ_EBAY_ORDER_STATUS.COMPLETED) {
      syncReason = 'Order COMPLETED — nothing to sync.';
    }

    const suggestedSequence: string[] = [];
    if (placeCjOrder.ok) suggestedSequence.push('POST /api/cj-ebay/orders/:orderId/place');
    if (!confirmReason) suggestedSequence.push('POST /api/cj-ebay/orders/:orderId/confirm');
    if (!payReason) suggestedSequence.push('POST /api/cj-ebay/orders/:orderId/pay');
    if (!statusReason) suggestedSequence.push('GET /api/cj-ebay/orders/:orderId/status');
    if (!syncReason) suggestedSequence.push('POST /api/cj-ebay/orders/:orderId/sync-tracking');

    const traces = await prisma.cjEbayExecutionTrace.findMany({
      where: {
        userId,
        meta: { path: ['orderId'], equals: orderId },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        step: true,
        message: true,
        route: true,
        correlationId: true,
        createdAt: true,
      },
    });

    return {
      orderId: order.id,
      ebayOrderId: order.ebayOrderId,
      localStatus: order.status,
      cjOrderId: order.cjOrderId,
      cjConfirmedAt: order.cjConfirmedAt?.toISOString() ?? null,
      cjPaidAt: order.cjPaidAt?.toISOString() ?? null,
      lastError: order.lastError,
      legacyIsolation: {
        module: 'cj-ebay',
        usesLegacyOrderTable: false,
      },
      gates: {
        placeCjOrder,
        confirmCjOrder: { ok: !confirmReason, reason: confirmReason },
        payCjOrder: { ok: !payReason, reason: payReason },
        getCjOrderStatus: { ok: !statusReason, reason: statusReason },
        syncTracking: { ok: !syncReason, reason: syncReason },
      },
      suggestedSequence,
      recentTraces: traces.map((t) => ({
        step: t.step,
        message: t.message,
        route: t.route,
        correlationId: t.correlationId,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  },
};
