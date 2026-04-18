/**
 * CJ → ML Chile — Servicio de finanzas / profit (PARITY with CJ → eBay USA).
 *
 * KPIs financieros con desglose por orden, filtros de fecha, dual currency CLP/USD,
 * tracking de claims/refunds, datos estimados honestos.
 *
 * Adaptado de cj-ebay-profit.service.ts para moneda CLP y fees ML/MP.
 */

import { prisma } from '../../../config/database';
import fxService from '../../../services/fx.service';
import { CJ_ML_CHILE_ORDER_STATUS, CJ_ML_CHILE_CLAIM_STATUS } from '../cj-ml-chile.constants';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type ProfitKpis = {
  grossRevenueCLP: number;
  grossRevenueUsd: number;
  estimatedCjCostUsd: number;
  estimatedGrossProfitUsd: number;
  estimatedGrossProfitCLP: number;
  estimatedAvgMarginPct: number | null;
  fxRateCLPperUSD: number | null;
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  attentionOrders: number;
  paymentBlockedOrders: number;
  totalClaims: number;
  activeClaims: number;
  refundedAmountCLP: number;
  listingsActive: number;
  dataNote: string;
};

export type OrderFinancialRow = {
  orderId: string;
  mlOrderId: string;
  status: string;
  totalCLP: number | null;
  totalUsd: number | null;
  estimatedMarginPct: number | null;
  estimatedProfitUsd: number | null;
  estimatedProfitCLP: number | null;
  estimatedCjCostUsd: number | null;
  hasClaim: boolean;
  claimStatus: string | null;
  refundAmountCLP: number | null;
  updatedAt: string;
};

export type ProfitData = {
  kpis: ProfitKpis;
  orders: OrderFinancialRow[];
  period: { from: string | null; to: string | null };
};

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

export const cjMlChileProfitService = {
  async getFinancials(userId: number, from?: string, to?: string): Promise<ProfitData> {
    const dateFilter = buildDateFilter(from, to);

    // FX rate
    let fxRate: number | null = null;
    try { fxRate = fxService.convert(1, 'USD', 'CLP'); } catch { /* ignore */ }

    // Orders with listing and evaluation
    const orders = await prisma.cjMlChileOrder.findMany({
      where: { userId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: {
            evaluation: { select: { estimatedMarginPct: true } },
          },
        },
      },
    });

    // Active listings count
    const listingsActive = await prisma.cjMlChileListing.count({
      where: { userId, status: 'ACTIVE' },
    });

    // Status sets
    const REVENUE_STATUSES = new Set([
      CJ_ML_CHILE_ORDER_STATUS.COMPLETED,
      CJ_ML_CHILE_ORDER_STATUS.TRACKING_ON_ML,
      CJ_ML_CHILE_ORDER_STATUS.CJ_FULFILLING,
      CJ_ML_CHILE_ORDER_STATUS.CJ_SHIPPED,
      CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_COMPLETED,
    ]);
    const ATTENTION_STATUSES = new Set([
      CJ_ML_CHILE_ORDER_STATUS.FAILED,
      CJ_ML_CHILE_ORDER_STATUS.NEEDS_MANUAL,
      CJ_ML_CHILE_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED,
    ]);
    const ACTIVE_STATUSES = new Set([
      CJ_ML_CHILE_ORDER_STATUS.DETECTED,
      CJ_ML_CHILE_ORDER_STATUS.VALIDATED,
      CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_PLACING,
      CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_PLACED,
      CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CREATED,
      CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CONFIRMING,
      CJ_ML_CHILE_ORDER_STATUS.CJ_ORDER_CONFIRMED,
      CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_PENDING,
      CJ_ML_CHILE_ORDER_STATUS.CJ_PAYMENT_PROCESSING,
    ]);

    let grossRevenueCLP = 0;
    let grossRevenueUsd = 0;
    let estimatedProfitSum = 0;
    let estimatedCjCostSum = 0;
    let marginPctSum = 0;
    let marginPctCount = 0;

    const orderRows: OrderFinancialRow[] = orders.map((o) => {
      const totalCLP = o.totalCLP != null ? Number(o.totalCLP) : null;
      const totalUsd = o.totalUsd != null ? Number(o.totalUsd) : (totalCLP && fxRate ? totalCLP / fxRate : null);
      const marginPct =
        o.listing?.evaluation?.estimatedMarginPct != null
          ? Number(o.listing.evaluation.estimatedMarginPct)
          : null;

      let estimatedProfit: number | null = null;
      let estimatedCjCost: number | null = null;
      let estimatedProfitCLP: number | null = null;

      if (totalUsd != null && marginPct != null) {
        estimatedProfit = parseFloat((totalUsd * marginPct).toFixed(2));
        estimatedCjCost = parseFloat((totalUsd - estimatedProfit).toFixed(2));
        estimatedProfitCLP = fxRate ? parseFloat((estimatedProfit * fxRate).toFixed(0)) : null;
      }

      if (totalCLP != null && totalUsd != null && REVENUE_STATUSES.has(o.status as any)) {
        grossRevenueCLP += totalCLP;
        grossRevenueUsd += totalUsd;
        if (estimatedProfit != null) {
          estimatedProfitSum += estimatedProfit;
          estimatedCjCostSum += estimatedCjCost!;
          marginPctSum += marginPct!;
          marginPctCount++;
        }
      }

      return {
        orderId: o.id,
        mlOrderId: o.mlOrderId ?? '',
        status: o.status,
        totalCLP,
        totalUsd,
        estimatedMarginPct: marginPct,
        estimatedProfitUsd: estimatedProfit,
        estimatedProfitCLP,
        estimatedCjCostUsd: estimatedCjCost,
        hasClaim: false, // TODO: integrate ML claims when table exists
        claimStatus: null,
        refundAmountCLP: null,
        updatedAt: o.updatedAt.toISOString(),
      };
    });

    // Status counts
    const completedOrders = orders.filter((o) => o.status === CJ_ML_CHILE_ORDER_STATUS.COMPLETED).length;
    const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status as any)).length;
    const attentionOrders = orders.filter((o) => ATTENTION_STATUSES.has(o.status as any)).length;
    const paymentBlockedOrders = orders.filter(
      (o) => o.status === CJ_ML_CHILE_ORDER_STATUS.SUPPLIER_PAYMENT_BLOCKED
    ).length;

    const estimatedGrossProfitCLP = fxRate ? parseFloat((estimatedProfitSum * fxRate).toFixed(0)) : 0;

    const kpis: ProfitKpis = {
      grossRevenueCLP: parseFloat(grossRevenueCLP.toFixed(0)),
      grossRevenueUsd: parseFloat(grossRevenueUsd.toFixed(2)),
      estimatedCjCostUsd: parseFloat(estimatedCjCostSum.toFixed(2)),
      estimatedGrossProfitUsd: parseFloat(estimatedProfitSum.toFixed(2)),
      estimatedGrossProfitCLP,
      estimatedAvgMarginPct:
        marginPctCount > 0 ? parseFloat(((marginPctSum / marginPctCount) * 100).toFixed(1)) : null,
      fxRateCLPperUSD: fxRate,
      totalOrders: orders.length,
      completedOrders,
      activeOrders,
      attentionOrders,
      paymentBlockedOrders,
      totalClaims: 0,
      activeClaims: 0,
      refundedAmountCLP: 0,
      listingsActive,
      dataNote:
        'Utilidad y costo CJ son ESTIMADOS a partir del margen de la evaluación original. ' +
        'Montos CLP calculados con tasa FX al momento de la consulta. ' +
        'Fees ML (12%) y MP (5.18%) incluidos en la evaluación.',
    };

    const dates = orders.map((o) => o.createdAt.getTime());
    const period = {
      from: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
      to: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    };

    return { kpis, orders: orderRows, period };
  },

  /** Simple summary for overview page (backwards compat). */
  async getSummary(userId: number) {
    const data = await cjMlChileProfitService.getFinancials(userId);
    let fxRate: number | null = null;
    try { fxRate = fxService.convert(1, 'USD', 'CLP'); } catch { /* ignore */ }
    return {
      totalRevenueCLP: data.kpis.grossRevenueCLP,
      totalRevenueUsd: data.kpis.grossRevenueUsd,
      totalProfitUsd: data.kpis.estimatedGrossProfitUsd,
      listingsActive: data.kpis.listingsActive,
      fxRateCLPperUSD: fxRate,
      snapshots: [],
    };
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
