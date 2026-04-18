/**
 * CJ → ML Chile — Servicio de alertas (PARITY with CJ → eBay USA).
 *
 * Auto-generación con deduplicación, meta labels, filtros por estado/severidad.
 * Adaptado de cj-ebay-alerts.service.ts.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { AppError } from '../../../middleware/error.middleware';
import { CJ_ML_CHILE_ALERT_TYPE } from '../cj-ml-chile.constants';

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
  meta: { label: string; description: string };
};

// Metadatos de presentación por tipo de alerta — adaptado a ML Chile
export const ALERT_META: Record<string, { label: string; description: string }> = {
  [CJ_ML_CHILE_ALERT_TYPE.CLAIM_OPENED]:              { label: 'Reclamo abierto',              description: 'El comprador abrió un reclamo en Mercado Libre.' },
  [CJ_ML_CHILE_ALERT_TYPE.CLAIM_CLOSED_BUYER]:        { label: 'Reclamo cerrado (comprador)',   description: 'ML cerró el reclamo a favor del comprador. Se generará reembolso.' },
  [CJ_ML_CHILE_ALERT_TYPE.REFUND_PENDING]:            { label: 'Reembolso pendiente',           description: 'Un reclamo resultó en reembolso pendiente de procesamiento.' },
  [CJ_ML_CHILE_ALERT_TYPE.REFUND_COMPLETED]:          { label: 'Reembolso completado',          description: 'El reembolso fue procesado exitosamente por Mercado Pago.' },
  [CJ_ML_CHILE_ALERT_TYPE.REFUND_FAILED]:             { label: 'Reembolso fallido',             description: 'El intento de reembolso no pudo completarse.' },
  [CJ_ML_CHILE_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED]:  { label: 'Pago a proveedor bloqueado',   description: 'Balance CJ insuficiente. Recarga y reintenta el pago.' },
  [CJ_ML_CHILE_ALERT_TYPE.ORDER_FAILED]:              { label: 'Orden fallida',                 description: 'Una orden entró en estado FAILED. Revisar lastError.' },
  [CJ_ML_CHILE_ALERT_TYPE.ORDER_NEEDS_MANUAL]:        { label: 'Intervención manual requerida', description: 'Una orden requiere acción manual del operador.' },
  [CJ_ML_CHILE_ALERT_TYPE.TRACKING_MISSING]:          { label: 'Tracking ausente',              description: 'Orden enviada por CJ sin número de tracking disponible.' },
  [CJ_ML_CHILE_ALERT_TYPE.WAREHOUSE_CHILE_UNAVAILABLE]: { label: 'Warehouse Chile no disponible', description: 'El producto perdió disponibilidad en warehouse Chile.' },
  [CJ_ML_CHILE_ALERT_TYPE.FX_RATE_STALE]:             { label: 'Tasa FX obsoleta',              description: 'La tasa de cambio USD/CLP no se actualizó recientemente.' },
  [CJ_ML_CHILE_ALERT_TYPE.MARGIN_BELOW_MIN]:          { label: 'Margen bajo mínimo',            description: 'El margen estimado cayó por debajo del mínimo configurado.' },
  [CJ_ML_CHILE_ALERT_TYPE.ORDER_LOSS]:                { label: 'Orden con pérdida',             description: 'El margen estimado es negativo en esta orden.' },
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
  const meta = ALERT_META[row.type] ?? { label: row.type, description: '' };
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
    meta,
  };
}

export const cjMlChileAlertsService = {
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
      const existing = await prisma.cjMlChileAlert.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          status: 'OPEN',
          payload: { path: ['orderId'], equals: orderId },
        },
      });
      if (existing) return toRecord(existing);
    }
    const row = await prisma.cjMlChileAlert.create({
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
    const rows = await prisma.cjMlChileAlert.findMany({
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
    return prisma.cjMlChileAlert.count({ where: { userId, status: 'OPEN' } });
  },

  /** Marcar como reconocida (acknowledged). */
  async acknowledge(userId: number, alertId: number): Promise<AlertRecord> {
    const row = await prisma.cjMlChileAlert.findFirst({ where: { id: alertId, userId } });
    if (!row) throw new AppError('Alert not found', 404);
    if (row.status === 'RESOLVED') throw new AppError('Alert already resolved', 400);
    const updated = await prisma.cjMlChileAlert.update({
      where: { id: alertId },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    return toRecord(updated);
  },

  /** Resolver (cerrar) una alerta. */
  async resolve(userId: number, alertId: number): Promise<AlertRecord> {
    const row = await prisma.cjMlChileAlert.findFirst({ where: { id: alertId, userId } });
    if (!row) throw new AppError('Alert not found', 404);
    const updated = await prisma.cjMlChileAlert.update({
      where: { id: alertId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    return toRecord(updated);
  },

  /** Crear alerta SUPPLIER_PAYMENT_BLOCKED para una orden bloqueada. */
  async createPaymentBlockedAlert(userId: number, orderId: string, mlOrderId: string): Promise<void> {
    await cjMlChileAlertsService.create({
      userId,
      type: CJ_ML_CHILE_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED,
      severity: 'error',
      payload: { orderId, mlOrderId, message: 'Balance CJ insuficiente. Recarga y reintenta el pago.' },
    });
  },

  /** Resolver alertas SUPPLIER_PAYMENT_BLOCKED de una orden (tras pago exitoso). */
  async resolvePaymentBlockedAlerts(userId: number, orderId: string): Promise<void> {
    const open = await prisma.cjMlChileAlert.findMany({
      where: {
        userId,
        type: CJ_ML_CHILE_ALERT_TYPE.SUPPLIER_PAYMENT_BLOCKED,
        status: 'OPEN',
        payload: { path: ['orderId'], equals: orderId },
      },
    });
    for (const a of open) {
      await prisma.cjMlChileAlert.update({
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
