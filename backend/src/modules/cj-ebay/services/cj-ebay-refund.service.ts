/**
 * CJ → eBay USA — Servicio de devoluciones y reembolsos (FASE 3F).
 *
 * CJ Dropshipping no expone una API formal de returns/refunds en el flujo actual
 * (payType=3 / payBalance). El modelo es semi-manual con trazabilidad completa:
 *
 * - El operador crea el registro de devolución cuando el comprador abre un caso en eBay.
 * - Los estados se avanzan manualmente (o mediante webhooks eBay si se implementan).
 * - La coordinación con CJ es manual (contacto directo con soporte CJ o portal).
 * - El reembolso final en eBay lo ejecuta el operador desde el portal eBay Seller Hub.
 * - Esta capa registra el estado local, trazas y evidencia para auditoría.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError } from '../../../middleware/error.middleware';
import { CJ_EBAY_REFUND_STATUS, CJ_EBAY_ALERT_TYPE, CJ_EBAY_TRACE_STEP } from '../cj-ebay.constants';
import { cjEbayTraceService } from './cj-ebay-trace.service';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type RefundStatus = keyof typeof CJ_EBAY_REFUND_STATUS;

export type RefundRecord = {
  id: string;
  orderId: string;
  userId: number;
  status: string;
  refundType: string;
  amountUsd: number | null;
  reason: string | null;
  ebayReturnId: string | null;
  cjRefundRef: string | null;
  notes: string | null;
  events: RefundEvent[];
  resolvedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type RefundEvent = {
  at: string;
  status: string;
  note: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// Transitions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Transiciones válidas del ciclo de devolución.
 * El modelo es lineal con salidas alternativas.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  RETURN_REQUESTED: ['RETURN_APPROVED', 'RETURN_REJECTED', 'NEEDS_MANUAL_REFUND'],
  RETURN_APPROVED: ['RETURN_IN_TRANSIT', 'REFUND_PENDING', 'NEEDS_MANUAL_REFUND'],
  RETURN_REJECTED: ['NEEDS_MANUAL_REFUND', 'RETURN_REQUESTED'], // re-abribles por escalada
  RETURN_IN_TRANSIT: ['RETURN_RECEIVED', 'NEEDS_MANUAL_REFUND'],
  RETURN_RECEIVED: ['REFUND_PENDING', 'NEEDS_MANUAL_REFUND'],
  REFUND_PENDING: ['REFUND_PARTIAL', 'REFUND_COMPLETED', 'REFUND_FAILED', 'NEEDS_MANUAL_REFUND'],
  REFUND_PARTIAL: ['REFUND_COMPLETED', 'REFUND_FAILED', 'NEEDS_MANUAL_REFUND'],
  REFUND_COMPLETED: [], // terminal
  REFUND_FAILED: ['REFUND_PENDING', 'NEEDS_MANUAL_REFUND'],
  NEEDS_MANUAL_REFUND: ['RETURN_REQUESTED', 'REFUND_PENDING', 'REFUND_COMPLETED'],
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function toRecord(row: {
  id: string;
  orderId: string;
  userId: number;
  status: string;
  refundType: string;
  amountUsd: Prisma.Decimal | null;
  reason: string | null;
  ebayReturnId: string | null;
  cjRefundRef: string | null;
  notes: string | null;
  events: Prisma.JsonValue;
  resolvedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RefundRecord {
  let events: RefundEvent[] = [];
  if (Array.isArray(row.events)) {
    events = row.events as RefundEvent[];
  }
  return {
    id: row.id,
    orderId: row.orderId,
    userId: row.userId,
    status: row.status,
    refundType: row.refundType,
    amountUsd: row.amountUsd != null ? Number(row.amountUsd) : null,
    reason: row.reason,
    ebayReturnId: row.ebayReturnId,
    cjRefundRef: row.cjRefundRef,
    notes: row.notes,
    events,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function appendEvent(existing: RefundEvent[], status: string, note: string): RefundEvent[] {
  return [
    ...existing,
    { at: new Date().toISOString(), status, note },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

export const cjEbayRefundService = {
  /**
   * Crear un nuevo registro de devolución/reembolso para una orden.
   * Verifica que la orden exista y pertenezca al usuario.
   */
  async createRefund(input: {
    userId: number;
    orderId: string;
    reason?: string;
    amountUsd?: number;
    refundType?: 'FULL' | 'PARTIAL';
    ebayReturnId?: string;
    notes?: string;
  }): Promise<RefundRecord> {
    const order = await prisma.cjEbayOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
    });
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const initialEvents = appendEvent([], CJ_EBAY_REFUND_STATUS.RETURN_REQUESTED, 'Devolución abierta por el operador');

    const row = await prisma.cjEbayOrderRefund.create({
      data: {
        orderId: input.orderId,
        userId: input.userId,
        status: CJ_EBAY_REFUND_STATUS.RETURN_REQUESTED,
        refundType: input.refundType ?? 'FULL',
        amountUsd: input.amountUsd != null ? new Prisma.Decimal(input.amountUsd) : undefined,
        reason: input.reason?.trim() || null,
        ebayReturnId: input.ebayReturnId?.trim() || null,
        notes: input.notes?.trim() || null,
        events: initialEvents as unknown as Prisma.InputJsonValue,
      },
    });

    await cjEbayTraceService.record({
      userId: input.userId,
      step: CJ_EBAY_TRACE_STEP.REFUND_CREATED,
      message: `Refund ${row.id} abierto para orden ${input.orderId}`,
      meta: { refundId: row.id, orderId: input.orderId, reason: input.reason },
    });

    // Crear alerta REFUND_PENDING para visibilidad en el módulo
    await _createAlertIfNotExists(input.userId, CJ_EBAY_ALERT_TYPE.REFUND_PENDING, 'warning', {
      orderId: input.orderId,
      refundId: row.id,
      ebayOrderId: order.ebayOrderId,
    });

    return toRecord(row);
  },

  /**
   * Avanzar el estado de un refund (semi-manual).
   * Valida la transición; aplica; registra evento en el timeline.
   */
  async updateStatus(input: {
    userId: number;
    refundId: string;
    newStatus: string;
    note?: string;
    amountUsd?: number;
    cjRefundRef?: string;
    ebayReturnId?: string;
  }): Promise<RefundRecord> {
    const row = await prisma.cjEbayOrderRefund.findFirst({
      where: { id: input.refundId, userId: input.userId },
    });
    if (!row) {
      throw new AppError('Refund not found', 404);
    }

    const allowed = VALID_TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(input.newStatus)) {
      throw new AppError(
        `Transición inválida: ${row.status} → ${input.newStatus}. Permitidas: ${allowed.join(', ') || 'ninguna (estado terminal)'}`,
        400
      );
    }

    let currentEvents: RefundEvent[] = Array.isArray(row.events) ? (row.events as RefundEvent[]) : [];
    const note = input.note?.trim() || `Estado actualizado a ${input.newStatus}`;
    currentEvents = appendEvent(currentEvents, input.newStatus, note);

    const isTerminal =
      input.newStatus === CJ_EBAY_REFUND_STATUS.REFUND_COMPLETED ||
      input.newStatus === CJ_EBAY_REFUND_STATUS.RETURN_REJECTED;

    const updated = await prisma.cjEbayOrderRefund.update({
      where: { id: row.id },
      data: {
        status: input.newStatus,
        events: currentEvents as unknown as Prisma.InputJsonValue,
        resolvedAt: isTerminal ? new Date() : row.resolvedAt,
        amountUsd:
          input.amountUsd != null
            ? new Prisma.Decimal(input.amountUsd)
            : row.amountUsd,
        cjRefundRef: input.cjRefundRef?.trim() || row.cjRefundRef,
        ebayReturnId: input.ebayReturnId?.trim() || row.ebayReturnId,
        lastError: null,
      },
    });

    await cjEbayTraceService.record({
      userId: input.userId,
      step: CJ_EBAY_TRACE_STEP.REFUND_STATUS_UPDATED,
      message: `Refund ${row.id}: ${row.status} → ${input.newStatus}`,
      meta: { refundId: row.id, orderId: row.orderId, from: row.status, to: input.newStatus, note },
    });

    // Si el refund se completó, crear alerta informativa
    if (input.newStatus === CJ_EBAY_REFUND_STATUS.REFUND_COMPLETED) {
      await _createAlertIfNotExists(input.userId, CJ_EBAY_ALERT_TYPE.REFUND_COMPLETED, 'info', {
        orderId: row.orderId,
        refundId: row.id,
      });
    }
    if (input.newStatus === CJ_EBAY_REFUND_STATUS.REFUND_FAILED) {
      await _createAlertIfNotExists(input.userId, CJ_EBAY_ALERT_TYPE.REFUND_FAILED, 'error', {
        orderId: row.orderId,
        refundId: row.id,
      });
    }

    return toRecord(updated);
  },

  /** Obtener todos los refunds de una orden. */
  async getRefundsForOrder(userId: number, orderId: string): Promise<RefundRecord[]> {
    const rows = await prisma.cjEbayOrderRefund.findMany({
      where: { orderId, userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  },

  /** Listar todos los refunds del usuario (para consola financiera). */
  async listRefunds(userId: number): Promise<RefundRecord[]> {
    const rows = await prisma.cjEbayOrderRefund.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  },

  /** Obtener un refund por id. */
  async getRefundById(userId: number, refundId: string): Promise<RefundRecord | null> {
    const row = await prisma.cjEbayOrderRefund.findFirst({
      where: { id: refundId, userId },
    });
    return row ? toRecord(row) : null;
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Internal alert helper (evita importar circular con alert service)
// ──────────────────────────────────────────────────────────────────────────────

async function _createAlertIfNotExists(
  userId: number,
  type: string,
  severity: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // No duplicar alertas del mismo tipo para la misma orden si ya está OPEN
    const orderId = payload['orderId'] as string | undefined;
    if (orderId) {
      const existing = await prisma.cjEbayAlert.findFirst({
        where: {
          userId,
          type,
          status: 'OPEN',
          payload: { path: ['orderId'], equals: orderId },
        },
      });
      if (existing) return;
    }
    await prisma.cjEbayAlert.create({
      data: { userId, type, severity, status: 'OPEN', payload: payload as Prisma.InputJsonValue },
    });
  } catch {
    // Non-critical — no propagar errores de alerta
  }
}
