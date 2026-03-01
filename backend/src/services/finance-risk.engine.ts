/**
 * Finance Risk Engine - Phase 5
 * Calculates worst-case scenario, capital buffer, CCC, and capital turnover.
 *
 * WorstCaseScenario: all sales occur simultaneously
 * worstCaseCost = SUM(supplierCost of active listings)
 * capitalBuffer = totalCapital - worstCaseCost
 * bufferPercent = capitalBuffer / totalCapital
 *
 * Cash Conversion Cycle: CCC = DaysInventory + DaysReceivable - DaysPayable
 * Capital Turnover: totalRevenue / totalCapital
 */

import { prisma } from '../config/database';
import { toNumber } from '../utils/decimal.utils';
import { getSupplierExposure } from './capital-allocation.engine';

export interface FinanceRiskOutput {
  worstCaseCost: number;
  capitalBuffer: number;
  bufferPercent: number;
  ccc: number; // Cash Conversion Cycle (days)
  capitalTurnover: number;
  totalRevenue: number;
  totalCapital: number;
}

/**
 * Compute DaysInventory, DaysReceivable, DaysPayable from orders/sales data
 * Simplified: DaysInventory = avg time product sits; DaysReceivable = avg time to get paid; DaysPayable = 0
 */
async function getCCCComponents(userId: number, daysBack: number = 90): Promise<{
  daysInventory: number;
  daysReceivable: number;
  daysPayable: number;
}> {
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  const sales = await prisma.sale.findMany({
    where: { userId, createdAt: { gte: start } },
    select: { createdAt: true, payoutExecuted: true, updatedAt: true },
  });

  let daysInventory = 14; // Default
  let daysReceivable = 7; // Default
  const daysPayable = 0;

  if (sales.length > 0) {
    const paid = sales.filter((s) => s.payoutExecuted);
    if (paid.length > 0) {
      const diffs = paid.map((s) => {
        const created = s.createdAt.getTime();
        const updated = s.updatedAt?.getTime() ?? created;
        return (updated - created) / (1000 * 60 * 60 * 24);
      });
      daysReceivable = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
  }

  return { daysInventory, daysReceivable, daysPayable };
}

/**
 * Compute finance risk metrics
 */
export async function computeFinanceRisk(
  userId: number,
  totalCapital: number,
  daysBack: number = 90
): Promise<FinanceRiskOutput> {
  const [worstCaseCost, totalRevenueResult, cccComponents] = await Promise.all([
    getSupplierExposure(userId),
    prisma.sale.aggregate({
      where: { userId, createdAt: { gte: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) } },
      _sum: { salePrice: true },
    }),
    getCCCComponents(userId, daysBack),
  ]);

  const totalRevenue = toNumber(totalRevenueResult._sum.salePrice ?? 0);
  const capitalBuffer = Math.max(0, totalCapital - worstCaseCost);
  const bufferPercent = totalCapital > 0 ? (capitalBuffer / totalCapital) * 100 : 0;

  const ccc =
    cccComponents.daysInventory +
    cccComponents.daysReceivable -
    cccComponents.daysPayable;

  const capitalTurnover = totalCapital > 0 ? totalRevenue / totalCapital : 0;

  return {
    worstCaseCost,
    capitalBuffer,
    bufferPercent,
    ccc,
    capitalTurnover,
    totalRevenue,
    totalCapital,
  };
}
