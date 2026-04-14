/**
 * FASE 3E.4 — Resumen para constancia de validación viva (sin secretos ni PII innecesaria).
 * Solo lectura DB; no llama CJ/eBay.
 */

import { prisma } from '../../../config/database';

const META_MAX_STRING = 800;
const EVENTS_LIMIT = 300;
const TRACES_LIMIT = 200;

/** Claves o subcadenas que no deben salir en evidencias archivadas. */
function keyLooksSensitive(k: string): boolean {
  const lower = k.toLowerCase();
  return (
    /password|secret|token|apikey|authorization|credential|refresh/i.test(lower) ||
    /email|phone|address|postal|zip|fullname|buyername|shipping/i.test(lower)
  );
}

export function sanitizeForEvidence(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const t = value.length > META_MAX_STRING ? `${value.slice(0, META_MAX_STRING)}…[truncated]` : value;
    return t;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((x) => sanitizeForEvidence(x, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keyLooksSensitive(k)) {
        out[k] = '[redacted]';
        continue;
      }
      out[k] = sanitizeForEvidence(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function slimRawEbaySummary(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lineItems = Array.isArray(r.lineItems)
    ? (r.lineItems as Record<string, unknown>[]).map((li) => ({
        lineItemId: li.lineItemId != null ? String(li.lineItemId) : null,
        sku: li.sku != null ? String(li.sku) : null,
        quantity: typeof li.quantity === 'number' ? li.quantity : null,
      }))
    : [];
  return {
    orderId: r.orderId != null ? String(r.orderId) : null,
    fulfillmentStatus: r.fulfillmentStatus != null ? String(r.fulfillmentStatus) : null,
    lineItems,
  };
}

export const cjEbayOrderEvidenceService = {
  async buildEvidenceSummary(userId: number, orderId: string): Promise<{
    generatedAt: string;
    order: {
      id: string;
      ebayOrderId: string;
      status: string;
      cjOrderId: string | null;
      cjConfirmedAt: string | null;
      cjPaidAt: string | null;
      listingId: number | null;
      variantId: number | null;
      productId: number | null;
      ebaySku: string | null;
      lineItemRef: string | null;
      lineQuantity: number;
      currency: string;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
    };
    variant: { cjVid: string | null; cjSku: string | null };
    listing: { id: number | null; ebaySku: string | null; ebayListingId: string | null; status: string | null };
    tracking: {
      carrierCode: string | null;
      trackingNumber: string | null;
      status: string | null;
      submittedToEbayAt: string | null;
    } | null;
    submitTrackingToEbayDone: boolean;
    rawEbaySummarySlim: Record<string, unknown> | null;
    buyerPayloadPresent: boolean;
    eventsTimeline: Array<{
      step: string;
      message: string | null;
      createdAt: string;
      meta: unknown;
    }>;
    tracesRelated: Array<{
      step: string;
      message: string;
      route: string | null;
      correlationId: string | null;
      createdAt: string;
      meta: unknown;
    }>;
    note: string;
  }> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: orderId, userId },
      include: {
        variant: { select: { cjVid: true, cjSku: true } },
        listing: { select: { id: true, ebaySku: true, ebayListingId: true, status: true } },
        tracking: true,
        events: { orderBy: { createdAt: 'asc' }, take: EVENTS_LIMIT },
      },
    });
    if (!order) {
      throw new Error('Order not found');
    }

    const traces = await prisma.cjEbayExecutionTrace.findMany({
      where: {
        userId,
        meta: { path: ['orderId'], equals: orderId },
      },
      orderBy: { createdAt: 'asc' },
      take: TRACES_LIMIT,
      select: {
        step: true,
        message: true,
        route: true,
        correlationId: true,
        createdAt: true,
        meta: true,
      },
    });

    const submitted = order.tracking?.submittedToEbayAt != null;

    return {
      generatedAt: new Date().toISOString(),
      order: {
        id: order.id,
        ebayOrderId: order.ebayOrderId,
        status: order.status,
        cjOrderId: order.cjOrderId,
        cjConfirmedAt: order.cjConfirmedAt?.toISOString() ?? null,
        cjPaidAt: order.cjPaidAt?.toISOString() ?? null,
        listingId: order.listingId,
        variantId: order.variantId,
        productId: order.productId,
        ebaySku: order.ebaySku,
        lineItemRef: order.lineItemRef,
        lineQuantity: order.lineQuantity,
        currency: order.currency,
        lastError: order.lastError,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
      variant: {
        cjVid: order.variant?.cjVid != null ? String(order.variant.cjVid) : null,
        cjSku: order.variant?.cjSku != null ? String(order.variant.cjSku) : null,
      },
      listing: {
        id: order.listing?.id ?? order.listingId,
        ebaySku: order.listing?.ebaySku ?? null,
        ebayListingId: order.listing?.ebayListingId != null ? String(order.listing.ebayListingId) : null,
        status: order.listing?.status ?? null,
      },
      tracking: order.tracking
        ? {
            carrierCode: order.tracking.carrierCode,
            trackingNumber: order.tracking.trackingNumber,
            status: order.tracking.status,
            submittedToEbayAt: order.tracking.submittedToEbayAt?.toISOString() ?? null,
          }
        : null,
      submitTrackingToEbayDone: submitted,
      rawEbaySummarySlim: slimRawEbaySummary(order.rawEbaySummary),
      buyerPayloadPresent: order.buyerPayload != null && typeof order.buyerPayload === 'object',
      eventsTimeline: order.events.map((ev) => ({
        step: ev.step,
        message: ev.message,
        createdAt: ev.createdAt.toISOString(),
        meta: sanitizeForEvidence(ev.meta),
      })),
      tracesRelated: traces.map((t) => ({
        step: t.step,
        message: t.message,
        route: t.route,
        correlationId: t.correlationId,
        createdAt: t.createdAt.toISOString(),
        meta: sanitizeForEvidence(t.meta),
      })),
      note:
        'Sanitized export for 3E.4 evidence: buyerPayload omitted; meta keys matching PII/secrets redacted. Not a substitute for per-step request/response logs.',
    };
  },
};
