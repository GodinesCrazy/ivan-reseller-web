/**
 * Product Performance Engine - Phase 4
 * Computes per-product performance metrics and WinningScore.
 *
 * WinningScore = (avgROI * 0.4) + (salesVelocity * 0.3) + (marginPercent * 0.2) - (returnRate * 0.1)
 * Normalized 0-100.
 *
 * Repetition rule: If WinningScore > 75 AND capital-allocation allows AND no market saturation
 *   ? increment units, duplicate listing, prioritize in autopilot
 */

import { prisma } from '../config/database';
import { toNumber } from '../utils/decimal.utils';
import logger from '../config/logger';

export interface ProductPerformanceEntry {
  productId: number;
  productTitle: string;
  totalSales: number;
  avgMargin: number;
  avgROI: number;
  salesVelocity: number; // sales per day (or per period)
  returnRate: number; // returns / total sales (0-1)
  capitalEfficiency: number; // revenue / supplierCost
  winningScore: number; // 0-100
}

/**
 * Calculate product performance metrics
 */
export async function getProductPerformance(
  userId: number,
  daysBack: number = 90
): Promise<ProductPerformanceEntry[]> {
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  const sales = await prisma.sale.findMany({
    where: {
      userId,
      createdAt: { gte: start },
      status: { not: 'CANCELLED' },
    },
    include: { product: true },
  });

  const byProduct = new Map<
    number,
    {
      productId: number;
      productTitle: string;
      sales: number[];
      costs: number[];
      grossProfits: number[];
      rois: number[];
      margins: number[];
    }
  >();

  for (const sale of sales) {
    const productId = sale.productId;
    const salePrice = toNumber(sale.salePrice);
    const supplierCost = toNumber(sale.aliexpressCost);
    const grossProfit = toNumber(sale.grossProfit);

    if (!byProduct.has(productId)) {
      byProduct.set(productId, {
        productId,
        productTitle: sale.product?.title ?? '',
        sales: [],
        costs: [],
        grossProfits: [],
        rois: [],
        margins: [],
      });
    }

    const p = byProduct.get(productId)!;
    p.sales.push(salePrice);
    p.costs.push(supplierCost);
    p.grossProfits.push(grossProfit);
    p.rois.push(supplierCost > 0 ? (grossProfit / supplierCost) * 100 : 0);
    p.margins.push(salePrice > 0 ? (grossProfit / salePrice) * 100 : 0);
  }

  const entries: ProductPerformanceEntry[] = [];

  for (const [, data] of byProduct) {
    const n = data.sales.length;
    const totalSales = n;
    const totalRevenue = data.sales.reduce((a, b) => a + b, 0);
    const totalCost = data.costs.reduce((a, b) => a + b, 0);
    const avgROI = n > 0 ? data.rois.reduce((a, b) => a + b, 0) / n : 0;
    const avgMargin = n > 0 ? data.margins.reduce((a, b) => a + b, 0) / n : 0;
    const salesVelocity = daysBack > 0 ? n / daysBack : n;
    const returnRate = 0; // TODO: if we have returns data, use returns / n
    const capitalEfficiency = totalCost > 0 ? totalRevenue / totalCost : 0;

    // WinningScore: (avgROI*0.4) + (salesVelocity*0.3) + (marginPercent*0.2) - (returnRate*0.1)
    // Scale salesVelocity to 0-100 range (assume 1 sale/day = 100)
    const velNorm = Math.min(100, salesVelocity * 100);
    const roiNorm = Math.min(100, Math.max(0, avgROI));
    const marginNorm = Math.min(100, Math.max(0, avgMargin));
    const retNorm = returnRate * 100;

    let winningScore =
      roiNorm * 0.4 + velNorm * 0.3 + marginNorm * 0.2 - retNorm * 0.1;
    winningScore = Math.max(0, Math.min(100, winningScore));

    entries.push({
      productId: data.productId,
      productTitle: data.productTitle,
      totalSales,
      avgMargin,
      avgROI,
      salesVelocity,
      returnRate,
      capitalEfficiency,
      winningScore,
    });
  }

  entries.sort((a, b) => b.winningScore - a.winningScore);
  logger.debug('[PRODUCT-PERFORMANCE] Computed entries', { userId, count: entries.length });
  return entries;
}

/**
 * Should repeat winner: WinningScore > 75 AND capital-allocation allows AND no saturation
 */
export function shouldRepeatWinner(
  winningScore: number,
  capitalAllocationAllows: boolean,
  marketSaturated: boolean
): boolean {
  return winningScore > 75 && capitalAllocationAllows && !marketSaturated;
}
