/**
 * CJ → eBay USA — Servicio de alertas del módulo (FASE 3F).
 *
 * Crea, resuelve y lista alertas operativas del módulo CJ → eBay USA.
 * La tabla `cj_ebay_alerts` existía desde FASE 3A; este servicio la activa.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError } from '../../../middleware/error.middleware';
import { CJ_EBAY_ALERT_TYPE } from '../cj-ebay.constants';

export type AlertSeverity = 'info' | 'warning' | 'error';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export type AlertRecord = {
  id: number;
  userId: number;
  type: string;
  severity: string;
  status: string;
  payload: unknown;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Metadatos de presentación por tipo de alerta
export const ALERT_META: Record<string, { label: string; description: string }> = {
  [CJ_EBAY_ALERT_TYPE.REFUND_PENDING]:         { label: 'Reembolso pendiente',         description: 'Una orden tiene un reembolso pendiente de emisión.' },
  [CJ_EBAY_ALERT_TYPE.RETURN_IN_PROGRESS]:     { label: 'Devolución en curso',          description: 'Hay una devolución activa en seguimiento.' },
  [CJ_EBAY_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED]:{ label: 'Pago a proveedor bloqueado', description: 'Balance CJ insuficiente. Recarga y reintenta el pago.' },
  [CJ_EBAY_ALERT_TYPE.ORDER_FAILED]:           { label: 'Orden fallida',               description: 'Una orden entró en estado FAILED. Revisar lastError.' },
  [CJ_EBAY_ALERT_TYPE.ORDER_NEEDS_MANUAL]:     { label: 'Intervención manual requerida', description: 'Una orden requiere acción manual del operador.' },
  [CJ_EBAY_ALERT_TYPE.TRACKING_MISSING]:       { label: 'Tracking ausente',            description: 'Orden enviada por CJ sin número de tracking disponible.' },
  [CJ_EBAY_ALERT_TYPE.REFUND_COMPLETED]:       { label: 'Reembolso completado',        description: 'Un reembolso fue procesado exitosamente.' },
  [CJ_EBAY_ALERT_TYPE.REFUND_FAILED]:          { label: 'Reembolso fallido',           description: 'Un intento de reembolso no pudo completarse.' },
  [CJ_EBAY_ALERT_TYPE.ORDER_LOSS]:             { label: 'Orden con pérdida',           description: 'El margen estimado es negativo en esta orden.' },
};

function toRecord(row: {
  id: number;
  userId: number;
  type: string;
  severity: string;
  status: string;
  payload: Prisma.JsonValue;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AlertRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    severity: row.severity,
    status: row.status,
    payload: row.payload,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const cjEbayAlertsService = {
  /**
   * Crear una alerta. Si ya existe una OPEN del mismo tipo+orderId, no duplica.
   */
  async create(input: {
    userId: number;
    type: string;
    severity?: AlertSeverity;
    payload?: Record<string, unknown>;
  }): Promise<AlertRecord> {
    const orderId = input.payload?.['orderId'] as string | undefined;
    if (orderId) {
      const existing = await prisma.cjEbayAlert.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          status: 'OPEN',
          payload: { path: ['orderId'], equals: orderId },
        },
      });
      if (existing) return toRecord(existing);
    }
    const row = await prisma.cjEbayAlert.create({
      data: {
        userId: input.userId,
        type: input.type,
        severity: input.severity ?? 'warning',
        status: 'OPEN',
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    return toRecord(row);
  },

  /** Listar alertas del usuario (con filtros opcionales). */
  async list(userId: number, opts?: { status?: AlertStatus; severity?: AlertSeverity }): Promise<AlertRecord[]> {
    const rows = await prisma.cjEbayAlert.findMany({
      where: {
        userId,
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.severity ? { severity: opts.severity } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toRecord);
  },

  /** Contar alertas abiertas (para KPI en overview). */
  async countOpen(userId: number): Promise<number> {
    return prisma.cjEbayAlert.count({ where: { userId, status: 'OPEN' } });
  },

  /** Marcar como reconocida (acknowledged). */
  async acknowledge(userId: number, alertId: number): Promise<AlertRecord> {
    const row = await prisma.cjEbayAlert.findFirst({ where: { id: alertId, userId } });
    if (!row) throw new AppError('Alert not found', 404);
    if (row.status === 'RESOLVED') throw new AppError('Alert already resolved', 400);
    const updated = await prisma.cjEbayAlert.update({
      where: { id: alertId },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    return toRecord(updated);
  },

  /** Resolver (cerrar) una alerta. */
  async resolve(userId: number, alertId: number): Promise<AlertRecord> {
    const row = await prisma.cjEbayAlert.findFirst({ where: { id: alertId, userId } });
    if (!row) throw new AppError('Alert not found', 404);
    const updated = await prisma.cjEbayAlert.update({
      where: { id: alertId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    return toRecord(updated);
  },

  /**
   * Crear alerta SUPPLIER_PAYMENT_BLOCKED para una orden bloqueada.
   * Llamado desde checkout.service cuando se detecta saldo insuficiente.
   */
  async createPaymentBlockedAlert(userId: number, orderId: string, ebayOrderId: string): Promise<void> {
    await cjEbayAlertsService.create({
      userId,
      type: CJ_EBAY_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED,
      severity: 'error',
      payload: { orderId, ebayOrderId, message: 'Balance CJ insuficiente. Recarga y reintenta el pago.' },
    });
  },

  /** Resolver alertas SUPPLIER_PAYMENT_BLOCKED de una orden (tras pago exitoso). */
  async resolvePaymentBlockedAlerts(userId: number, orderId: string): Promise<void> {
    const open = await prisma.cjEbayAlert.findMany({
      where: {
        userId,
        type: CJ_EBAY_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED,
        status: 'OPEN',
        payload: { path: ['orderId'], equals: orderId },
      },
    });
    for (const a of open) {
      await prisma.cjEbayAlert.update({
        where: { id: a.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    }
  },

  /** Metadatos de presentación para un tipo de alerta. */
  getMeta(type: string): { label: string; description: string } {
    return ALERT_META[type] ?? { label: type, description: '' };
  },
};
