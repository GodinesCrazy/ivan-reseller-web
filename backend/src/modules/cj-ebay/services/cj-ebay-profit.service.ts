/**
 * CJ → eBay USA — Servicio de finanzas / profit (FASE 3F).
 *
 * Calcula KPIs financieros reales del módulo a partir de los datos persistidos en:
 * - `cj_ebay_orders` (totalUsd = ingreso eBay, cjPaidAt, status)
 * - `cj_ebay_listings` (listedPriceUsd)
 * - `cj_ebay_product_evaluations` (estimatedMarginPct)
 * - `cj_ebay_product_variants` (unitCostUsd)
 * - `cj_ebay_order_refunds` (devoluciones)
 * - `cj_ebay_profit_snapshots` (snapshots históricos guardados)
 *
 * HONESTIDAD DE DATOS:
 * - `utilidadEstimada` = totalUsd * estimatedMarginPct (de la evaluación en el momento del listing).
 * - `costoProveedorEstimado` = totalUsd - utilidadEstimada.
 * - `utilidadRealizada` no está disponible hasta que se integre el costo real de factura CJ.
 * - Los campos marcados `estimated` deben mostrarse con esa etiqueta en la UI.
 * - Si `estimatedMarginPct` es null para una orden, se omite de los cálculos de margen.
 */

import { prisma } from '../../../config/database';
import { CJ_EBAY_ORDER_STATUS, CJ_EBAY_REFUND_STATUS } from '../cj-ebay.constants';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type ProfitKpis = {
  /** Ingresos brutos eBay (sum totalUsd de órdenes COMPLETED + TRACKING_ON_EBAY + CJ_FULFILLING). */
  grossRevenueUsd: number;
  /** Costo proveedor CJ estimado (totalUsd - margenEstimado). */
  estimatedCjCostUsd: number;
  /** Utilidad bruta estimada. */
  estimatedGrossProfitUsd: number;
  /** Margen promedio estimado (%). */
  estimatedAvgMarginPct: number | null;
  /** Total órdenes en el período. */
  totalOrders: number;
  /** Órdenes completadas (COMPLETED). */
  completedOrders: number;
  /** Órdenes activas (en proceso, no completadas, no fallidas). */
  activeOrders: number;
  /** Órdenes que requieren atención (FAILED + NEEDS_MANUAL + SUPPLIER_PAYMENT_BLOCKED). */
  attentionOrders: number;
  /** Órdenes bloqueadas por saldo CJ. */
  paymentBlockedOrders: number;
  /** Total de refunds registrados. */
  totalRefunds: number;
  /** Refunds activos (no completados ni rechazados). */
  activeRefunds: number;
  /** Monto total de refunds completados (USD). */
  refundedAmountUsd: number;
  /** Nota de honestidad sobre los datos. */
  dataNote: string;
};

export type OrderFinancialRow = {
  orderId: string;
  ebayOrderId: string;
  status: string;
  totalUsd: number | null;
  estimatedMarginPct: number | null;
  estimatedProfitUsd: number | null;
  estimatedCjCostUsd: number | null;
  hasRefund: boolean;
  refundStatus: string | null;
  refundAmountUsd: number | null;
  updatedAt: string;
};

export type ProfitSnapshot = {
  id: number;
  snapshotDate: string;
  estimatedRevenueUsd: number;
  estimatedFeesUsd: number;
  estimatedCjCostUsd: number;
  estimatedProfitUsd: number;
  metadata: unknown;
  createdAt: string;
};

export type ProfitData = {
  kpis: ProfitKpis;
  orders: OrderFinancialRow[];
  snapshots: ProfitSnapshot[];
  period: { from: string | null; to: string | null };
};

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

export const cjEbayProfitService = {
  /**
   * Obtener datos financieros completos para la consola de profit.
   * @param userId   Usuario operador.
   * @param from     Fecha inicio del período (ISO string, opcional).
   * @param to       Fecha fin del período (ISO string, opcional).
   */
  async getFinancials(userId: number, from?: string, to?: string): Promise<ProfitData> {
    const dateFilter = buildDateFilter(from, to);

    // ── Órdenes con listing y evaluación ───────────────────────────────────────
    const orders = await prisma.cjEbayOrder.findMany({
      where: { userId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: {
            evaluation: { select: { estimatedMarginPct: true } },
          },
        },
        refunds: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // ── Snapshots históricos ────────────────────────────────────────────────────
    const snapshots = await prisma.cjEbayProfitSnapshot.findMany({
      where: { userId, ...(dateFilter ? { snapshotDate: dateFilter } : {}) },
      orderBy: { snapshotDate: 'desc' },
    });

    // ── Cómputo de KPIs ────────────────────────────────────────────────────────
    const REVENUE_STATUSES = new Set([
      CJ_EBAY_ORDER_STATUS.COMPLETED,
      CJ_EBAY_ORDER_STATUS.TRACKING_ON_EBAY,
      CJ_EBAY_ORDER_STATUS.CJ_FULFILLING,
      CJ_EBAY_ORDER_STATUS.CJ_SHIPPED,
      CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
    ]);
    const ATTENTION_STATUSES = new Set([
      CJ_EBAY_ORDER_STATUS.FAILED,
      CJ_EBAY_ORDER_STATUS.NEEDS_MANUAL,
      CJ_EBAY_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
    ]);
    const ACTIVE_STATUSES = new Set([
      CJ_EBAY_ORDER_STATUS.DETECTED,
      CJ_EBAY_ORDER_STATUS.VALIDATED,
      CJ_EBAY_ORDER_STATUS.CJ_ORDER_PLACING,
      CJ_EBAY_ORDER_STATUS.CJ_ORDER_PLACED,
      CJ_EBAY_ORDER_STATUS.CJ_ORDER_CREATED,
      CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMING,
      CJ_EBAY_ORDER_STATUS.CJ_ORDER_CONFIRMED,
      CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PENDING,
      CJ_EBAY_ORDER_STATUS.CJ_PAYMENT_PROCESSING,
    ]);

    let grossRevenueUsd = 0;
    let estimatedProfitSum = 0;
    let marginPctSum = 0;
    let marginPctCount = 0;
    let estimatedCjCostSum = 0;

    const orderRows: OrderFinancialRow[] = orders.map((o) => {
      const total = o.totalUsd != null ? Number(o.totalUsd) : null;
      const marginPct =
        o.listing?.evaluation?.estimatedMarginPct != null
          ? Number(o.listing.evaluation.estimatedMarginPct)
          : null;

      let estimatedProfit: number | null = null;
      let estimatedCjCost: number | null = null;

      if (total != null && marginPct != null) {
        estimatedProfit = parseFloat((total * marginPct).toFixed(2));
        estimatedCjCost = parseFloat((total - estimatedProfit).toFixed(2));
      }

      // Acumular para KPIs (solo órdenes con ingresos)
      if (total != null && REVENUE_STATUSES.has(o.status as Parameters<typeof REVENUE_STATUSES.has>[0])) {
        grossRevenueUsd += total;
        if (estimatedProfit != null) {
          estimatedProfitSum += estimatedProfit;
          estimatedCjCostSum += estimatedCjCost!;
          marginPctSum += marginPct!;
          marginPctCount++;
        }
      }

      const lastRefund = o.refunds[0] ?? null;

      return {
        orderId: o.id,
        ebayOrderId: o.ebayOrderId,
        status: o.status,
        totalUsd: total,
        estimatedMarginPct: marginPct,
        estimatedProfitUsd: estimatedProfit,
        estimatedCjCostUsd: estimatedCjCost,
        hasRefund: o.refunds.length > 0,
        refundStatus: lastRefund?.status ?? null,
        refundAmountUsd: lastRefund?.amountUsd != null ? Number(lastRefund.amountUsd) : null,
        updatedAt: o.updatedAt.toISOString(),
      };
    });

    // ── Refunds ────────────────────────────────────────────────────────────────
    const allRefunds = await prisma.cjEbayOrderRefund.findMany({
      where: { userId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    });
    const activeRefunds = allRefunds.filter(
      (r) =>
        r.status !== CJ_EBAY_REFUND_STATUS.REFUND_COMPLETED &&
        r.status !== CJ_EBAY_REFUND_STATUS.RETURN_REJECTED
    );
    const completedRefunds = allRefunds.filter(
      (r) => r.status === CJ_EBAY_REFUND_STATUS.REFUND_COMPLETED || r.status === CJ_EBAY_REFUND_STATUS.REFUND_PARTIAL
    );
    const refundedAmountUsd = completedRefunds.reduce(
      (sum, r) => sum + (r.amountUsd != null ? Number(r.amountUsd) : 0),
      0
    );

    // ── Conteos de estado ──────────────────────────────────────────────────────
    const completedOrders = orders.filter((o) => o.status === CJ_EBAY_ORDER_STATUS.COMPLETED).length;
    const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status as Parameters<typeof ACTIVE_STATUSES.has>[0])).length;
    const attentionOrders = orders.filter((o) => ATTENTION_STATUSES.has(o.status as Parameters<typeof ATTENTION_STATUSES.has>[0])).length;
    const paymentBlockedOrders = orders.filter(
      (o) => o.status === CJ_EBAY_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED
    ).length;

    const kpis: ProfitKpis = {
      grossRevenueUsd: parseFloat(grossRevenueUsd.toFixed(2)),
      estimatedCjCostUsd: parseFloat(estimatedCjCostSum.toFixed(2)),
      estimatedGrossProfitUsd: parseFloat(estimatedProfitSum.toFixed(2)),
      estimatedAvgMarginPct:
        marginPctCount > 0 ? parseFloat(((marginPctSum / marginPctCount) * 100).toFixed(1)) : null,
      totalOrders: orders.length,
      completedOrders,
      activeOrders,
      attentionOrders,
      paymentBlockedOrders,
      totalRefunds: allRefunds.length,
      activeRefunds: activeRefunds.length,
      refundedAmountUsd: parseFloat(refundedAmountUsd.toFixed(2)),
      dataNote:
        'Utilidad y costo CJ son ESTIMADOS a partir del margen de la evaluación original. ' +
        'La utilidad realizada requiere la factura real de CJ (no disponible en este flujo).',
    };

    const snapshotRows: ProfitSnapshot[] = snapshots.map((s) => ({
      id: s.id,
      snapshotDate: s.snapshotDate.toISOString().split('T')[0],
      estimatedRevenueUsd: Number(s.estimatedRevenueUsd),
      estimatedFeesUsd: Number(s.estimatedFeesUsd),
      estimatedCjCostUsd: Number(s.estimatedCjCostUsd),
      estimatedProfitUsd: Number(s.estimatedProfitUsd),
      metadata: s.metadata,
      createdAt: s.createdAt.toISOString(),
    }));

    // Período cubierto
    const dates = orders.map((o) => o.createdAt.getTime());
    const period = {
      from: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
      to: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    };

    return { kpis, orders: orderRows, snapshots: snapshotRows, period };
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildDateFilter(
  from?: string,
  to?: string
): { gte?: Date; lte?: Date } | null {
  if (!from && !to) return null;
  const filter: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) filter.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) filter.lte = d;
  }
  return Object.keys(filter).length ? filter : null;
}
