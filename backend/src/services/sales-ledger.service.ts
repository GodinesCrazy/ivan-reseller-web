/**
 * Sales Ledger Service - Forensic Complete Ledger
 * Phase 1: Full breakdown per sale with data integrity tracking.
 * If any financial data is missing ? dataIntegrityIssue, NO silent 0.
 */

import { prisma } from '../config/database';
import { toNumber } from '../utils/decimal.utils';
import logger from '../config/logger';

export interface SalesLedgerEntry {
  orderId: string;
  productId: number;
  productTitle: string;
  marketplace: string;
  salePrice: number;
  supplierCost: number;
  supplierShipping: number;
  marketplaceFee: number;
  paymentFee: number;
  tax: number;
  platformCommission: number;
  totalCost: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  roiPercent: number;
  payoutExecuted: boolean;
  payoutDate: string | null;
  marketplaceUrl: string | null;
  supplierUrl: string | null;
  dataIntegrityIssue: string[];
}

/**
 * Build marketplace URL from marketplace name and listing if available
 */
function buildMarketplaceUrl(marketplace: string, listingUrl: string | null): string | null {
  if (listingUrl && listingUrl.trim()) return listingUrl;
  const base: Record<string, string> = {
    ebay: 'https://www.ebay.com',
    amazon: 'https://www.amazon.com',
    mercadolibre: 'https://www.mercadolibre.com',
    paypal: 'https://www.paypal.com',
  };
  return base[marketplace?.toLowerCase()] ?? null;
}

/**
 * Compute sales ledger with mandatory formulas and data integrity checks.
 * totalCost = supplierCost + supplierShipping + marketplaceFee + paymentFee + tax + platformCommission
 * grossProfit = salePrice - totalCost
 * marginPercent = grossProfit / salePrice
 * roiPercent = grossProfit / supplierCost (avoid div by 0)
 */
export async function getSalesLedger(userId: number, range?: 'week' | 'month' | 'quarter' | 'year'): Promise<SalesLedgerEntry[]> {
  const now = new Date();
  let startDate = new Date();

  switch (range || 'month') {
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'quarter':
      startDate.setMonth(now.getMonth() - 3);
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setMonth(now.getMonth() - 1);
  }

  const sales = await prisma.sale.findMany({
    where: { userId, createdAt: { gte: startDate } },
    include: {
      product: true,
      commission: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Batch fetch marketplace listing URLs for marketplaceUrl
  const productIds = [...new Set(sales.map((s) => s.productId))];
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      productId: { in: productIds },
      userId,
    },
    select: { productId: true, marketplace: true, listingUrl: true },
  });
  const listingMap = new Map<string, string | null>();
  for (const l of listings) {
    listingMap.set(`${l.productId}:${l.marketplace}`, l.listingUrl ?? null);
  }

  const entries: SalesLedgerEntry[] = [];

  for (const sale of sales) {
    const dataIntegrityIssue: string[] = [];

    const supplierCost = toNumber(sale.aliexpressCost);
    const salePrice = toNumber(sale.salePrice);
    const marketplaceFee = toNumber(sale.marketplaceFee);
    const platformCommission = toNumber(sale.commissionAmount);
    const netProfit = toNumber(sale.netProfit);

    // PaymentFee: not stored separately; treat marketplaceFee as combined or 0
    let paymentFee = 0;
    const product = sale.product as { shippingCost?: any; importTax?: any; aliexpressUrl?: string };
    const supplierShipping = product?.shippingCost != null ? toNumber(product.shippingCost) : NaN;
    const tax = product?.importTax != null ? toNumber(product.importTax) : NaN;

    if (supplierShipping !== supplierShipping) {
      dataIntegrityIssue.push('supplierShipping not available');
    }
    if (tax !== tax) {
      dataIntegrityIssue.push('tax not available');
    }
    // paymentFee not stored in schema - mark when used as 0
    dataIntegrityIssue.push('paymentFee not stored (used 0)');

    const ship = Number.isFinite(supplierShipping) ? supplierShipping : 0;
    const taxVal = Number.isFinite(tax) ? tax : 0;

    const totalCost =
      supplierCost + ship + marketplaceFee + paymentFee + taxVal + platformCommission;
    const grossProfit = salePrice - totalCost;
    const marginPercent = salePrice > 0 ? (grossProfit / salePrice) * 100 : 0;
    const roiPercent = supplierCost > 0 ? (grossProfit / supplierCost) * 100 : 0;

    const listingUrl = listingMap.get(`${sale.productId}:${sale.marketplace}`) ?? null;
    const marketplaceUrl = buildMarketplaceUrl(sale.marketplace, listingUrl);
    const supplierUrl = product?.aliexpressUrl ?? null;

    let payoutDate: string | null = null;
    if (sale.payoutExecuted && sale.commission?.paidAt) {
      payoutDate = sale.commission.paidAt.toISOString();
    } else if (sale.payoutExecuted) {
      dataIntegrityIssue.push('payoutDate approximated from sale.updatedAt');
      payoutDate = sale.updatedAt.toISOString();
    }

    entries.push({
      orderId: sale.orderId,
      productId: sale.productId,
      productTitle: sale.product?.title ?? '',
      marketplace: sale.marketplace,
      salePrice,
      supplierCost,
      supplierShipping: ship,
      marketplaceFee,
      paymentFee,
      tax: taxVal,
      platformCommission,
      totalCost,
      grossProfit,
      netProfit,
      marginPercent,
      roiPercent,
      payoutExecuted: !!sale.payoutExecuted,
      payoutDate,
      marketplaceUrl,
      supplierUrl,
      dataIntegrityIssue,
    });
  }

  logger.debug('[SALES-LEDGER] Computed entries', { userId, count: entries.length });
  return entries;
}
