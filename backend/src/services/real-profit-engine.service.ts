/**
 * Phase 27 — Real Profit Engine
 * Tracks ONLY real data: money_in (real orders from marketplaces), money_out (supplier, shipping, fees).
 * Calculates real profit per order, per product, and ROI.
 * Excludes test/mock/demo order IDs in production.
 */

import { prisma } from '../config/database';
import { toNumber } from '../utils/decimal.utils';
import logger from '../config/logger';

const COMPLETED_SALE_STATUSES = ['DELIVERED', 'COMPLETED'];

/** Same as sale.service realSalesFilter: production = real data only */
function realSalesFilter(environment: string): Record<string, unknown> {
  if (environment !== 'production') return {};
  return {
    AND: [
      { orderId: { not: { startsWith: 'test' } } },
      { orderId: { not: { startsWith: 'TEST' } } },
      { orderId: { not: { startsWith: 'mock' } } },
      { orderId: { not: { startsWith: 'demo' } } },
      { orderId: { not: { startsWith: 'DEMO' } } },
    ],
  };
}

export interface MoneyOutBreakdown {
  supplierCost: number;
  shipping: number;
  marketplaceFees: number;
  paymentFees: number;
  total: number;
}

export interface RealProfitSummary {
  moneyIn: number;
  moneyOut: MoneyOutBreakdown;
  totalProfit: number;
  orderCount: number;
  profitPerOrder: number;
  roiPercent: number;
  currency: string;
  periodDays: number;
  environment: 'production' | 'sandbox' | 'all';
  profitClassification: 'finalized' | 'estimated';
  feeCompleteness: {
    completeOrders: number;
    incompleteOrders: number;
    missingShipping: number;
    missingMarketplaceFees: number;
    missingSupplierCost: number;
  };
  currencySafety: {
    safeOrders: number;
    unresolvedOrders: number;
    state: 'safe' | 'unsafe';
  };
}

export interface ProfitPerOrderRow {
  orderId: string;
  productId: number;
  productTitle: string;
  marketplace: string;
  salePrice: number;
  supplierCost: number;
  shipping: number;
  marketplaceFee: number;
  paymentFee: number;
  totalCost: number;
  netProfit: number;
  roiPercent: number;
  profitClassification: 'finalized' | 'estimated';
  feeComplete: boolean;
}

export interface ProfitPerProductRow {
  productId: number;
  productTitle: string;
  orderCount: number;
  moneyIn: number;
  moneyOut: number;
  totalProfit: number;
  roiPercent: number;
}

/** Default payment fee % when not stored (e.g. PayPal ~2.9% + fixed) */
const DEFAULT_PAYMENT_FEE_PCT = 0.029;

/**
 * Get real profit summary for a user (or all users when userId omitted) and period.
 * Uses only real sales in production (excludes test/mock/demo).
 */
export async function getRealProfitSummary(
  options: {
    userId?: number;
    days?: number;
    environment?: 'production' | 'sandbox' | 'all';
  } = {}
): Promise<RealProfitSummary> {
  const { userId, days = 30, environment = 'production' } = options;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const envWhere = environment !== 'all' ? { environment } : {};
  const userWhere = userId ? { userId } : {};
  const realFilter = realSalesFilter(environment);

  const sales = await prisma.sale.findMany({
    where: {
      ...userWhere,
      ...envWhere,
      ...realFilter,
      status: { in: COMPLETED_SALE_STATUSES },
      createdAt: { gte: startDate },
    },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
  });

  let moneyIn = 0;
  const moneyOut = {
    supplierCost: 0,
    shipping: 0,
    marketplaceFees: 0,
    paymentFees: 0,
    total: 0,
  };
  const feeCompleteness = {
    completeOrders: 0,
    incompleteOrders: 0,
    missingShipping: 0,
    missingMarketplaceFees: 0,
    missingSupplierCost: 0,
  };
  const currencySafety = {
    safeOrders: 0,
    unresolvedOrders: 0,
    state: 'safe' as 'safe' | 'unsafe',
  };

  for (const s of sales) {
    const salePrice = toNumber(s.salePrice);
    const supplierCost = toNumber(s.aliexpressCost);
    const marketplaceFee = toNumber(s.marketplaceFee);
    const rawShipping = (s.product as { shippingCost?: unknown } | null)?.shippingCost;
    const shipping = rawShipping != null ? toNumber(rawShipping as Parameters<typeof toNumber>[0]) : 0;
    const hasShipping = rawShipping != null;
    const hasMarketplaceFee = s.marketplaceFee != null;
    const hasSupplierCost = s.aliexpressCost != null;
    const productTargetCountry = String((s.product as { targetCountry?: string | null } | null)?.targetCountry || '').trim().toUpperCase();
    const productCurrency = String((s.product as { currency?: string | null } | null)?.currency || '').trim().toUpperCase();
    const hasCurrencyContext = Boolean(productTargetCountry && productCurrency);
    const feeComplete = hasShipping && hasMarketplaceFee && hasSupplierCost;
    const paymentFee = salePrice * DEFAULT_PAYMENT_FEE_PCT;
    const totalCost = supplierCost + shipping + marketplaceFee + paymentFee;
    moneyIn += salePrice;
    moneyOut.supplierCost += supplierCost;
    moneyOut.shipping += shipping;
    moneyOut.marketplaceFees += marketplaceFee;
    moneyOut.paymentFees += paymentFee;
    moneyOut.total += totalCost;
    if (feeComplete) {
      feeCompleteness.completeOrders += 1;
    } else {
      feeCompleteness.incompleteOrders += 1;
      if (!hasShipping) feeCompleteness.missingShipping += 1;
      if (!hasMarketplaceFee) feeCompleteness.missingMarketplaceFees += 1;
      if (!hasSupplierCost) feeCompleteness.missingSupplierCost += 1;
    }
    if (hasCurrencyContext) {
      currencySafety.safeOrders += 1;
    } else {
      currencySafety.unresolvedOrders += 1;
    }
  }

  const totalProfit = moneyIn - moneyOut.total;
  const orderCount = sales.length;
  const profitPerOrder = orderCount > 0 ? totalProfit / orderCount : 0;
  const costBase = moneyOut.supplierCost + moneyOut.shipping;
  const roiPercent = costBase > 0 ? (totalProfit / costBase) * 100 : 0;

  logger.debug('[REAL-PROFIT-ENGINE] Summary', {
    userId,
    days,
    environment,
    orderCount,
    moneyIn,
    moneyOut: moneyOut.total,
    totalProfit,
  });

  return {
    moneyIn,
    moneyOut,
    totalProfit,
    orderCount,
    profitPerOrder,
    roiPercent,
    currency: 'USD',
    periodDays: days,
    environment,
    profitClassification: feeCompleteness.incompleteOrders === 0 ? 'finalized' : 'estimated',
    feeCompleteness,
    currencySafety: {
      ...currencySafety,
      state: currencySafety.unresolvedOrders === 0 ? 'safe' : 'unsafe',
    },
  };
}

/**
 * Get profit per order (real sales only) for ledger-style detail.
 */
export async function getRealProfitPerOrder(
  options: {
    userId?: number;
    days?: number;
    environment?: 'production' | 'sandbox' | 'all';
    limit?: number;
  } = {}
): Promise<ProfitPerOrderRow[]> {
  const { userId, days = 30, environment = 'production', limit = 500 } = options;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const envWhere = environment !== 'all' ? { environment } : {};
  const userWhere = userId ? { userId } : {};
  const realFilter = realSalesFilter(environment);

  const sales = await prisma.sale.findMany({
    where: {
      ...userWhere,
      ...envWhere,
      ...realFilter,
      status: { in: COMPLETED_SALE_STATUSES },
      createdAt: { gte: startDate },
    },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const rows: ProfitPerOrderRow[] = sales.map((s) => {
    const salePrice = toNumber(s.salePrice);
    const supplierCost = toNumber(s.aliexpressCost);
    const marketplaceFee = toNumber(s.marketplaceFee);
    const rawShippingRow = (s.product as { shippingCost?: unknown } | null)?.shippingCost;
    const shipping = rawShippingRow != null ? toNumber(rawShippingRow as Parameters<typeof toNumber>[0]) : 0;
    const feeComplete = rawShippingRow != null && s.marketplaceFee != null && s.aliexpressCost != null;
    const paymentFee = salePrice * DEFAULT_PAYMENT_FEE_PCT;
    const totalCost = supplierCost + shipping + marketplaceFee + paymentFee;
    const netProfit = salePrice - totalCost;
    const costBase = supplierCost + shipping;
    const roiPercent = costBase > 0 ? (netProfit / costBase) * 100 : 0;
    return {
      orderId: s.orderId,
      productId: s.productId,
      productTitle: (s.product?.title as string) ?? '',
      marketplace: s.marketplace,
      salePrice,
      supplierCost,
      shipping,
      marketplaceFee,
      paymentFee,
      totalCost,
      netProfit,
      roiPercent,
      profitClassification: feeComplete ? 'finalized' : 'estimated',
      feeComplete,
    };
  });

  return rows;
}

/**
 * Get profit aggregated by product (real sales only).
 */
export async function getRealProfitPerProduct(
  options: {
    userId?: number;
    days?: number;
    environment?: 'production' | 'sandbox' | 'all';
    limit?: number;
  } = {}
): Promise<ProfitPerProductRow[]> {
  const rows = await getRealProfitPerOrder({ ...options, limit: options.limit ?? 2000 });
  const byProduct = new Map<
    number,
    { productTitle: string; orderCount: number; moneyIn: number; moneyOut: number }
  >();

  for (const r of rows) {
    const existing = byProduct.get(r.productId);
    const moneyOut = r.totalCost;
    if (existing) {
      existing.orderCount += 1;
      existing.moneyIn += r.salePrice;
      existing.moneyOut += moneyOut;
    } else {
      byProduct.set(r.productId, {
        productTitle: r.productTitle,
        orderCount: 1,
        moneyIn: r.salePrice,
        moneyOut,
      });
    }
  }

  const result: ProfitPerProductRow[] = [];
  for (const [productId, agg] of byProduct) {
    const totalProfit = agg.moneyIn - agg.moneyOut;
    const roiPercent = agg.moneyOut > 0 ? (totalProfit / agg.moneyOut) * 100 : 0;
    result.push({
      productId,
      productTitle: agg.productTitle,
      orderCount: agg.orderCount,
      moneyIn: agg.moneyIn,
      moneyOut: agg.moneyOut,
      totalProfit,
      roiPercent,
    });
  }
  result.sort((a, b) => b.totalProfit - a.totalProfit);
  return result.slice(0, options.limit ?? 200);
}

export const RealProfitEngine = {
  getRealProfitSummary,
  getRealProfitPerOrder,
  getRealProfitPerProduct,
  realSalesFilter,
};
