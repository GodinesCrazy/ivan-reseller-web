/**
 * Working Capital Detail Service - Phase 2
 * Aggregates cash positions, exposure, ICLR, OLR, and risk level.
 */

import { getPayPalBalance, getPayoneerBalance } from './balance-verification.service';
import { prisma } from '../config/database';
import { toNumber } from '../utils/decimal.utils';
import { getSupplierExposure, getHistoricalMetrics } from './capital-allocation.engine';
import { computeLeverage, getRiskLevel } from './finance-leverage.model';

export interface WorkingCapitalDetail {
  totalCapital: number;
  availableCash: number;
  retainedByMarketplace: number;
  inPayoneer: number;
  inPayPal: number;
  inTransit: number;
  committedToOrders: number;
  exposureFromActiveListings: number;
  inventoryCapitalLeverageRatio: number;
  optimalLeverageRatio: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Get committed capital for a specific user (orders with userId)
 */
async function getCommittedCapitalByUser(userId: number): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { userId, status: { in: ['CREATED', 'PAID', 'PURCHASING'] } },
    select: { price: true },
  });
  return orders.reduce((s, o) => s + toNumber(o.price), 0);
}

/**
 * Get working capital detail for Phase 2 endpoint
 */
export async function getWorkingCapitalDetail(userId: number): Promise<WorkingCapitalDetail> {
  const [paypalBalance, payoneerBalance, committedCapital, supplierExposure, historical] =
    await Promise.all([
      getPayPalBalance(),
      getPayoneerBalance(),
      getCommittedCapitalByUser(userId),
      getSupplierExposure(userId),
      getHistoricalMetrics(userId),
    ]);

  const inPayPal = paypalBalance?.available ?? 0;
  const inPayoneer = payoneerBalance?.available ?? 0;
  const availableCash = inPayPal + inPayoneer;

  // Retained by marketplace: estimated as pending payout (simplified - sum of pending sales value)
  const pendingSales = await prisma.sale.aggregate({
    where: {
      userId,
      status: { in: ['PENDING', 'PROCESSING', 'SHIPPED'] },
      payoutExecuted: false,
    },
    _sum: { salePrice: true },
  });
  const retainedByMarketplace = toNumber(pendingSales._sum.salePrice ?? 0);

  // In transit: orders PURCHASING (money out but product not yet delivered)
  const inTransitOrders = await prisma.order.findMany({
    where: { userId, status: 'PURCHASING' },
    select: { price: true },
  });
  const inTransit = inTransitOrders.reduce((s, o) => s + toNumber(o.price), 0);

  const exposureFromActiveListings = supplierExposure;
  const totalCapital = Math.max(availableCash + retainedByMarketplace + inTransit, availableCash);
  const totalCapitalForOLR = Math.max(totalCapital, 1);

  const { iclr, olr } = computeLeverage({
    supplierExposure,
    totalCapital: totalCapitalForOLR,
    historicalSales: historical.historicalSales,
    historicalActiveListings: historical.historicalActiveListings,
    avgActiveListings: Math.max(1, await prisma.marketplaceListing.count({ where: { userId } })),
    avgDays: historical.avgDays,
  });

  const riskLevel = getRiskLevel(iclr, olr);

  return {
    totalCapital,
    availableCash,
    retainedByMarketplace,
    inPayoneer,
    inPayPal,
    inTransit,
    committedToOrders: committedCapital,
    exposureFromActiveListings,
    inventoryCapitalLeverageRatio: iclr,
    optimalLeverageRatio: olr,
    riskLevel,
  };
}
