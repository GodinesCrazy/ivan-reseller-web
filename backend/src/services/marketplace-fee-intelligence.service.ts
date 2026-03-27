/**
 * Phase 13: Marketplace Fee Intelligence Engine
 * Calculates real marketplace costs before publishing or scaling.
 * MercadoLibre Chile: commission %, MercadoPago (included), shipping subsidy.
 * eBay US: insertion fee, final value fee, payment processing.
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';

export type MarketplaceFeeMarketplace = 'mercadolibre' | 'ebay';

export interface FeeIntelligenceInput {
  marketplace: MarketplaceFeeMarketplace;
  listingPrice: number; // sale price in marketplace currency or USD
  supplierCost: number; // product + shipping from supplier (USD)
  shippingCostToCustomer?: number; // if seller pays shipping (USD)
  currency?: string; // CLP, USD
  category?: string; // for eBay category-based FVF
}

export interface FeeIntelligenceResult {
  totalMarketplaceCost: number;
  totalOperationalCost: number;
  expectedProfit: number;
  expectedMarginPercent: number;
  breakdown: {
    listingFee: number;
    finalValueFee: number;
    paymentProcessingFee: number;
    shippingSubsidyOrCost: number;
    supplierCost: number;
    taxesOrOther: number;
  };
}

// 8% default for early-stage; override with MIN_ALLOWED_MARGIN in production (e.g. 5 when scaling)
const MIN_ALLOWED_MARGIN = Number(process.env.MIN_ALLOWED_MARGIN) || 8;

/**
 * MercadoLibre Chile: commission 8–17% by category (default 12%), fixed cost by price tier (CLP).
 * MercadoPago: no extra when selling on ML. Shipping subsidy if applicable.
 */
function calculateMercadoLibreChile(input: FeeIntelligenceInput): FeeIntelligenceResult {
  const listingPrice = input.listingPrice;
  const supplierCost = input.supplierCost;
  const shippingCostToCustomer = input.shippingCostToCustomer ?? 0;

  const commissionPct = Number(process.env.ML_COMMISSION_PCT) || 12;
  const listingFee = 0; // ML no cobra fee por listar
  const finalValueFee = (listingPrice * commissionPct) / 100;
  const paymentProcessingFee = 0; // MercadoPago incluido en la comisión ML
  let fixedCostMarketplaceCurrency = 0;
  if (String(input.currency || '').toUpperCase() === 'CLP' && listingPrice > 0) {
    const lowTierMax = Number(process.env.ML_CL_FIXED_FEE_LOW_TIER_MAX_CLP) || 9990;
    const midTierMax = Number(process.env.ML_CL_FIXED_FEE_MID_TIER_MAX_CLP) || 19990;
    const lowTierFixed = Number(process.env.ML_CL_FIXED_FEE_LOW_TIER_CLP) || 700;
    const midTierFixed = Number(process.env.ML_CL_FIXED_FEE_MID_TIER_CLP) || 1000;
    fixedCostMarketplaceCurrency =
      listingPrice <= lowTierMax ? lowTierFixed : listingPrice <= midTierMax ? midTierFixed : 0;
  }
  const shippingSubsidyOrCost = shippingCostToCustomer;

  const totalMarketplaceCost =
    finalValueFee + paymentProcessingFee + fixedCostMarketplaceCurrency;
  const totalOperationalCost = supplierCost + shippingSubsidyOrCost + totalMarketplaceCost;
  const expectedProfit = listingPrice - totalOperationalCost;
  const expectedMarginPercent = listingPrice > 0 ? (expectedProfit / listingPrice) * 100 : 0;

  return {
    totalMarketplaceCost,
    totalOperationalCost,
    expectedProfit,
    expectedMarginPercent,
    breakdown: {
      listingFee,
      finalValueFee,
      paymentProcessingFee,
      shippingSubsidyOrCost,
      supplierCost,
      taxesOrOther: fixedCostMarketplaceCurrency,
    },
  };
}

/**
 * eBay US: insertion $0.35 (after free tier), FVF ~13.25% + $0.40 per order. Payment processing (managed payments) included in FVF.
 */
function calculateEbayUS(input: FeeIntelligenceInput): FeeIntelligenceResult {
  const listingPrice = input.listingPrice;
  const supplierCost = input.supplierCost;
  const shippingCostToCustomer = input.shippingCostToCustomer ?? 0;

  const insertionFee = Number(process.env.EBAY_INSERTION_FEE_USD) || 0.35;
  const fvfPct = Number(process.env.EBAY_FVF_PCT) || 13.25;
  const fvfPerOrder = Number(process.env.EBAY_FVF_PER_ORDER_USD) || 0.4;
  const finalValueFee = (listingPrice * fvfPct) / 100 + fvfPerOrder;
  const paymentProcessingFee = 0; // managed payments included in FVF

  const totalMarketplaceCost = insertionFee + finalValueFee + paymentProcessingFee;
  const totalOperationalCost = supplierCost + shippingCostToCustomer + totalMarketplaceCost;
  const expectedProfit = listingPrice - totalOperationalCost;
  const expectedMarginPercent = listingPrice > 0 ? (expectedProfit / listingPrice) * 100 : 0;

  return {
    totalMarketplaceCost,
    totalOperationalCost,
    expectedProfit,
    expectedMarginPercent,
    breakdown: {
      listingFee: insertionFee,
      finalValueFee,
      paymentProcessingFee,
      shippingSubsidyOrCost: shippingCostToCustomer,
      supplierCost,
      taxesOrOther: 0,
    },
  };
}

/**
 * Run fee intelligence for a single listing/product.
 */
export function calculateFeeIntelligence(input: FeeIntelligenceInput): FeeIntelligenceResult {
  if (input.marketplace === 'mercadolibre') return calculateMercadoLibreChile(input);
  if (input.marketplace === 'ebay') return calculateEbayUS(input);
  return calculateEbayUS({ ...input, marketplace: 'ebay' });
}

/**
 * Check if margin is above MIN_ALLOWED_MARGIN. If not, should not publish/scale.
 */
export function isProfitabilityAllowed(result: FeeIntelligenceResult): boolean {
  return result.expectedMarginPercent >= MIN_ALLOWED_MARGIN;
}

export function getMinAllowedMargin(): number {
  return MIN_ALLOWED_MARGIN;
}

/**
 * Run fee intelligence for a product and optionally flag if unprofitable.
 */
export async function runFeeIntelligenceAndFlag(
  productId: number,
  marketplace: MarketplaceFeeMarketplace,
  listingPrice: number,
  supplierCost: number,
  shippingCostToCustomer?: number
): Promise<{ result: FeeIntelligenceResult; allowed: boolean; flagged: boolean }> {
  const result = calculateFeeIntelligence({
    marketplace,
    listingPrice,
    supplierCost,
    shippingCostToCustomer,
    currency: marketplace === 'mercadolibre' ? 'CLP' : 'USD',
  });
  const allowed = isProfitabilityAllowed(result);
  let flagged = false;
  if (!allowed) {
    try {
      await prisma.unprofitableListingFlag.create({
        data: {
          productId,
          marketplace,
          expectedMargin: result.expectedMarginPercent,
          reason: `expectedMarginPercent ${result.expectedMarginPercent.toFixed(2)}% < MIN_ALLOWED_MARGIN ${getMinAllowedMargin()}%`,
        },
      });
      flagged = true;
      logger.warn('[FEE-INTELLIGENCE] Unprofitable listing flagged', {
        productId,
        marketplace,
        expectedMarginPercent: result.expectedMarginPercent,
      });
    } catch (e: any) {
      logger.warn('[FEE-INTELLIGENCE] Failed to create unprofitable flag', { error: e?.message });
    }
  }
  return { result, allowed, flagged };
}
