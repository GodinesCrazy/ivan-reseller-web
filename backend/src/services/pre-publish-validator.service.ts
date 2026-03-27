/**
 * Phase 53 / Phase 7 — mandatory pre-publish validator and preventive publish preparation.
 * Publishing is only allowed when a real AliExpress supplier, real destination shipping,
 * and real profitability are all verified.
 */

import logger from '../config/logger';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import type { Destination } from './destination.service';
import { aliExpressSupplierAdapter } from './adapters/aliexpress-supplier.adapter';
import { CredentialsManager } from './credentials-manager.service';
import type { AliExpressDropshippingCredentials } from '../types/api-credentials.types';
import {
  aliexpressDropshippingAPIService,
  type DropshippingProductInfo,
} from './aliexpress-dropshipping-api.service';
import costCalculator, { type CostBreakdown } from './cost-calculator.service';
import { calculateFeeIntelligence } from './marketplace-fee-intelligence.service';
import taxCalculatorService from './tax-calculator.service';
import { toNumber } from '../utils/decimal.utils';
import { getEffectiveShippingCost } from '../utils/shipping.utils';
import fx from './fx.service';
import { normalizeAliExpressRawSkus } from '../utils/aliexpress-raw-sku-normalizer';
import { selectMlChileFreightOption } from '../utils/ml-chile-freight-selector';
import { calculateMlChileLandedCost } from '../utils/ml-chile-landed-cost';
import type {
  PreventiveSupplierAuditResult,
  PreventiveValidatedSupplier,
} from './preventive-supplier-validation.service';
import { getMarketplaceContext } from './marketplace-context.service';
import { buildListingFeeLedger, type ListingFeeLedger } from './listing-fee-ledger.service';
import {
  type MlImagePolicyAudit,
} from './mercadolibre-image-policy.service';
import {
  runMercadoLibreImageRemediationPipeline,
  type MlImageRemediationResult,
} from './mercadolibre-image-remediation.service';
import { analyzeMarketplaceOptimizationCandidate } from './marketplace-optimization-agent.service';

export type PrePublishMarketplace = 'ebay' | 'mercadolibre' | 'amazon';

export interface PrePublishProductShape {
  id: number;
  title?: string | null;
  category?: string | null;
  images?: unknown;
  productData?: unknown;
  aliexpressUrl: string;
  aliexpressSku?: string | null;
  aliexpressPrice?: unknown;
  importTax?: unknown;
  currency?: string | null;
  targetCountry?: string | null;
  originCountry?: string | null;
  shippingCost?: unknown;
}

export interface AssertProductValidForPublishingParams {
  userId: number;
  product: PrePublishProductShape;
  marketplace: PrePublishMarketplace;
  /** Raw credentials object from MarketplaceCredentials (eBay marketplace_id, ML siteId, etc.). */
  credentials: Record<string, unknown> | undefined;
  /** Same listing price used by MarketplaceService.getEffectiveListingPrice. */
  listingSalePrice: number;
}

export interface PreventiveProfitSummary {
  listingCurrency: string;
  listingSalePriceUsd: number;
  listingSalePriceMarketplaceCurrency: number;
  supplierUnitUsd: number;
  shippingUsd: number;
  importTaxUsd: number;
  supplierUnitMarketplaceCurrency: number;
  shippingMarketplaceCurrency: number;
  importTaxMarketplaceCurrency: number;
  listingFeeMarketplaceCurrency: number;
  finalValueFeeMarketplaceCurrency: number;
  marketplaceFeeMarketplaceCurrency: number;
  paymentFeeMarketplaceCurrency: number;
  taxesMarketplaceCurrency: number;
  otherCostsMarketplaceCurrency: number;
  totalCostUsd: number;
  totalCostMarketplaceCurrency: number;
  netProfitUsd: number;
  netProfitMarketplaceCurrency: number;
  marginRatio: number;
}

export interface CanonicalMlChileFreightTruth {
  targetCountry: 'CL';
  freightSummaryCode: 'freight_quote_found_for_cl';
  selectedServiceName: string;
  selectedFreightAmount: number;
  selectedFreightCurrency: string;
  shippingUsd: number;
  checkedAt: string;
  ageHours: number;
}

export type CanonicalMlChileFreightTruthStatus =
  | 'freight_truth_ready_for_publish'
  | 'freight_truth_stale'
  | 'freight_truth_inconsistent'
  | 'freight_truth_not_applicable';

export interface CanonicalMlChileFreightTruthResult {
  status: CanonicalMlChileFreightTruthStatus;
  ok: boolean;
  reason?: string;
  truth?: CanonicalMlChileFreightTruth;
}

export interface PreventivePublishPreparationResult extends PrePublishEvaluationResult {
  classification: 'SAFE';
  passesValidation: true;
  selectedSupplier: PreventiveValidatedSupplier;
  fallbackSuppliers: PreventiveValidatedSupplier[];
  supplierAudit: PreventiveSupplierAuditResult;
  profitability: PreventiveProfitSummary;
  feeLedger: ListingFeeLedger;
  metadataPatch: Record<string, unknown>;
}

/** P89: reusable economics gate (supplier + freight + fee ledger + profit floors) before ML image work. */
export type PreventiveEconomicsCoreFailure = { ok: false; message: string };
export type PreventiveEconomicsCoreSuccess = {
  ok: true;
  aeProductId: string;
  shipCountry: string;
  dest: Destination;
  selectedSupplier: PreventiveValidatedSupplier;
  supplierAudit: PreventiveSupplierAuditResult;
  profitability: PreventiveProfitSummary;
  feeLedger: ListingFeeLedger;
};

const ML_CHILE_PERSISTED_FREIGHT_MAX_AGE_HOURS = 72;
const ML_CHILE_PERSISTED_FREIGHT_TOLERANCE_USD = 0.01;

function fail(detail: string): never {
  throw new AppError(`Product not valid for publishing: ${detail}`, 400);
}

/** Convert supplier-side amount to USD for fee math when listing is USD-based. */
export function toUsd(amount: number, currency: string): number {
  const c = (currency || 'USD').toUpperCase();
  if (!Number.isFinite(amount)) return 0;
  if (c === 'USD' || c === 'US') return amount;
  try {
    return fx.convert(amount, c, 'USD');
  } catch (e: any) {
    logger.warn('[PRE-PUBLISH] FX convert failed; using raw amount as USD', {
      currency: c,
      amount,
      error: e?.message,
    });
    return amount;
  }
}

function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  if (!Number.isFinite(amount)) return 0;
  const from = (fromCurrency || 'USD').toUpperCase();
  const to = (toCurrency || 'USD').toUpperCase();
  if (from === to) return amount;
  try {
    return fx.convert(amount, from, to);
  } catch (e: any) {
    logger.warn('[PRE-PUBLISH] FX convert failed; using raw amount', {
      amount,
      from,
      to,
      error: e?.message,
    });
    return amount;
  }
}

/** Minimum shipping cost from DS shipping methods (>= 0). */
export function minShippingCostFromApi(info: DropshippingProductInfo): number | null {
  const methods = info.shippingInfo?.availableShippingMethods ?? [];
  const costs = methods
    .map((m) => m.cost)
    .filter((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0);
  if (costs.length === 0) return null;
  return Math.min(...costs);
}

/**
 * Pick a purchasable SKU (non-throwing). Used by Phase 54 risk scan + assert wrapper.
 */
export function selectPurchasableSkuSoft(
  info: DropshippingProductInfo,
  preferredSkuId?: string | null
):
  | { ok: true; skuId: string; unitPrice: number }
  | { ok: false; reason: string } {
  const skus =
    info.skus && info.skus.length > 0
      ? info.skus
      : normalizeAliExpressRawSkus(info as unknown as Record<string, unknown>);
  if (skus && skus.length > 0) {
    const pref = (preferredSkuId || '').trim();
    if (pref) {
      const s = skus.find((x) => String(x.skuId).trim() === pref);
      if (!s) {
        return { ok: false, reason: `AliExpress SKU "${pref}" not found on listing` };
      }
      if ((s.stock ?? 0) <= 0) {
        return { ok: false, reason: `AliExpress SKU "${pref}" has no stock` };
      }
      return { ok: true, skuId: String(s.skuId), unitPrice: s.salePrice };
    }
    const inStock = skus.filter((x) => (x.stock ?? 0) > 0);
    if (inStock.length === 0) {
      return { ok: false, reason: 'no AliExpress SKU with stock > 0 for this destination' };
    }
    inStock.sort((a, b) => a.salePrice - b.salePrice);
    const best = inStock[0]!;
    return { ok: true, skuId: String(best.skuId), unitPrice: best.salePrice };
  }
  if ((info.stock ?? 0) > 0 && Number.isFinite(info.salePrice) && info.salePrice > 0) {
    return { ok: true, skuId: '', unitPrice: info.salePrice };
  }
  return { ok: false, reason: 'no AliExpress SKU with stock > 0 for this destination' };
}

/**
 * @deprecated Prefer selectPurchasableSkuSoft for precise reasons; this returns null on any failure.
 */
export function selectPurchasableSku(
  info: DropshippingProductInfo,
  preferredSkuId?: string | null
): { skuId: string; unitPrice: number } | null {
  const r = selectPurchasableSkuSoft(info, preferredSkuId);
  return r.ok ? { skuId: r.skuId, unitPrice: r.unitPrice } : null;
}

export function computeProfitAfterFees(
  marketplace: PrePublishMarketplace,
  salePrice: number,
  supplierCostUsd: number,
  shippingUsd: number,
  importTax: number
): { netProfit: number; totalCost: number; breakdown: CostBreakdown } {
  const { breakdown, netProfit } = costCalculator.calculate(marketplace, salePrice, supplierCostUsd, {
    shippingCost: shippingUsd,
    importTax,
  });
  const totalCost = breakdown.totalCost;
  return { netProfit, totalCost, breakdown };
}

/** Phase 54 — risk bucket for active listing scan */
export type ListingRiskClass = 'SAFE' | 'RISKY' | 'UNPROFITABLE' | 'UNSHIPPABLE' | 'CONFIG';

export interface PrePublishEvaluationResult {
  classification: ListingRiskClass;
  /** SAFE or RISKY — would allow publish under Phase 53 rules */
  passesValidation: boolean;
  message: string;
  usedShippingFallback: boolean;
  listingSalePrice: number;
  marketplace: PrePublishMarketplace;
  netProfit?: number;
  totalCost?: number;
  /** Supplier unit price in USD (after FX) — QA / constrained cycles */
  supplierUnitUsd?: number;
  /** Min API shipping to destination, USD — QA / constrained cycles */
  shippingUsd?: number;
  /** Selected purchasable SKU id from getProductInfo */
  aliexpressSkuId?: string;
  shipCountry?: string;
  aeProductId?: string;
  productId: number;
  listingDbId?: number;
}

export interface EvaluatePrePublishParams extends AssertProductValidForPublishingParams {
  /** When true (Phase 54 scan), run checks even if PRE_PUBLISH_VALIDATION_DISABLED */
  ignoreValidationDisabled?: boolean;
}

function parseProductMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

export function resolveCanonicalMlChileFreightTruth(
  product: PrePublishProductShape,
  shipCountry: string,
  now: Date = new Date()
): CanonicalMlChileFreightTruthResult {
  const requestedCountry = String(shipCountry || '').trim().toUpperCase();
  if (requestedCountry !== 'CL') {
    return {
      status: 'freight_truth_not_applicable',
      ok: false,
      reason: `canonical persisted ML Chile freight truth is only applicable for CL, got ${requestedCountry || 'unknown'}`,
    };
  }

  const productTargetCountry = String(product.targetCountry || '').trim().toUpperCase();
  if (productTargetCountry !== 'CL') {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: `product targetCountry ${productTargetCountry || 'missing'} does not match CL`,
    };
  }

  const metadata = parseProductMetadata(product.productData);
  const freightMeta =
    metadata.mlChileFreight && typeof metadata.mlChileFreight === 'object'
      ? (metadata.mlChileFreight as Record<string, unknown>)
      : null;

  if (!freightMeta) {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: 'persisted mlChileFreight metadata is missing',
    };
  }

  const freightSummaryCode = String(freightMeta.freightSummaryCode || '').trim();
  if (freightSummaryCode !== 'freight_quote_found_for_cl') {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: `persisted freightSummaryCode is ${freightSummaryCode || 'missing'}, expected freight_quote_found_for_cl`,
    };
  }

  const freightTargetCountry = String(freightMeta.targetCountry || '').trim().toUpperCase();
  if (freightTargetCountry !== 'CL') {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: `persisted freight targetCountry ${freightTargetCountry || 'missing'} does not match CL`,
    };
  }

  const selectedServiceName = String(freightMeta.selectedServiceName || '').trim();
  if (!selectedServiceName) {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: 'persisted selectedServiceName is missing',
    };
  }

  const selectedFreightCurrency = String(freightMeta.selectedFreightCurrency || '').trim().toUpperCase();
  if (!selectedFreightCurrency) {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: 'persisted selectedFreightCurrency is missing',
    };
  }

  const selectedFreightAmount = Number(freightMeta.selectedFreightAmount);
  if (!Number.isFinite(selectedFreightAmount) || selectedFreightAmount < 0) {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: 'persisted selectedFreightAmount is missing or invalid',
    };
  }

  const checkedAtRaw = String(
    freightMeta.checkedAt || freightMeta.observedAt || freightMeta.auditedAt || ''
  ).trim();
  if (!checkedAtRaw) {
    return {
      status: 'freight_truth_stale',
      ok: false,
      reason: 'persisted freight truth timestamp is missing',
    };
  }

  const checkedAt = new Date(checkedAtRaw);
  if (Number.isNaN(checkedAt.getTime())) {
    return {
      status: 'freight_truth_stale',
      ok: false,
      reason: `persisted freight truth timestamp is invalid: ${checkedAtRaw}`,
    };
  }

  const ageHours = (now.getTime() - checkedAt.getTime()) / (60 * 60 * 1000);
  if (!Number.isFinite(ageHours) || ageHours < 0) {
    return {
      status: 'freight_truth_stale',
      ok: false,
      reason: `persisted freight truth timestamp is not coherent: ${checkedAtRaw}`,
    };
  }
  if (ageHours > ML_CHILE_PERSISTED_FREIGHT_MAX_AGE_HOURS) {
    return {
      status: 'freight_truth_stale',
      ok: false,
      reason: `persisted freight truth is stale at ${ageHours.toFixed(2)}h old`,
    };
  }

  const shippingUsd = toUsd(selectedFreightAmount, selectedFreightCurrency);
  if (!Number.isFinite(shippingUsd) || shippingUsd < 0) {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: 'persisted freight amount could not be normalized to USD',
    };
  }

  const persistedShippingCostUsd = Math.max(
    0,
    toNumber((product.shippingCost ?? 0) as Parameters<typeof toNumber>[0])
  );
  if (
    !Number.isFinite(persistedShippingCostUsd) ||
    Math.abs(persistedShippingCostUsd - shippingUsd) > ML_CHILE_PERSISTED_FREIGHT_TOLERANCE_USD
  ) {
    return {
      status: 'freight_truth_inconsistent',
      ok: false,
      reason: `persisted shippingCost ${persistedShippingCostUsd.toFixed(2)} does not match freight truth ${shippingUsd.toFixed(2)} USD`,
    };
  }

  return {
    status: 'freight_truth_ready_for_publish',
    ok: true,
    truth: {
      targetCountry: 'CL',
      freightSummaryCode: 'freight_quote_found_for_cl',
      selectedServiceName,
      selectedFreightAmount,
      selectedFreightCurrency,
      shippingUsd,
      checkedAt: checkedAt.toISOString(),
      ageHours,
    },
  };
}

function resolveStrictDestinationContext(
  product: PrePublishProductShape,
  marketplace: PrePublishMarketplace,
  credentials: Record<string, unknown> | undefined
): { dest: Destination; shipCountry: string } | { error: string; dest: Destination; shipCountry?: string } {
  const context = getMarketplaceContext(marketplace, credentials);
  const dest = context.destination;
  const shipCountry = context.country;
  if (!context.resolved || !shipCountry || !context.currency) {
    return {
      error: context.resolutionError || 'marketplace destination country/currency could not be resolved safely',
      dest,
    };
  }
  if (context.languageSafetyState !== 'resolved' || !context.languageSupported || !context.language) {
    return {
      error:
        context.languageBlockReason ||
        'marketplace language could not be resolved or is not supported safely',
      dest,
      shipCountry,
    };
  }
  const configuredTarget = (product.targetCountry || '').toString().trim().toUpperCase();

  if (configuredTarget && configuredTarget !== shipCountry) {
    return {
      error: `target country ${configuredTarget} does not match marketplace destination ${shipCountry}`,
      dest,
      shipCountry,
    };
  }

  return { dest, shipCountry };
}

async function loadDropshippingCredentials(userId: number): Promise<AliExpressDropshippingCredentials | null> {
  const envFallback = (() => {
    const appKey = process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '';
    const appSecret = process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '';
    const accessToken = process.env.ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN || '';
    if (!String(appKey).trim() || !String(appSecret).trim()) return null;
    return {
      appKey: String(appKey).trim(),
      appSecret: String(appSecret).trim(),
      accessToken: String(accessToken).trim() || undefined,
      sandbox: false,
      credentialSource: 'env:ALIEXPRESS_DROPSHIPPING_*',
      tokenSource: String(accessToken).trim()
        ? 'env:ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN'
        : 'none',
    } as AliExpressDropshippingCredentials;
  })();

  const dropshippingEntry = await CredentialsManager.getCredentialEntry(
    userId,
    'aliexpress-dropshipping',
    'production'
  );
  const creds = (dropshippingEntry?.credentials as AliExpressDropshippingCredentials | null) || envFallback;
  if (!creds?.appKey || !creds?.appSecret) return null;
  const credentialMetadata = creds as unknown as Record<string, unknown>;
  aliexpressDropshippingAPIService.setCredentials({
    ...creds,
    credentialSource:
      String(credentialMetadata.credentialSource || '').trim() ||
      (dropshippingEntry
        ? `credentials_manager:aliexpress-dropshipping:${dropshippingEntry.scope}${
            dropshippingEntry.id ? `#${dropshippingEntry.id}` : ''
          }`
        : 'env:ALIEXPRESS_DROPSHIPPING_*'),
    tokenSource:
      String(credentialMetadata.tokenSource || '').trim() ||
      (String(creds.accessToken || '').trim()
        ? dropshippingEntry
          ? 'credentials_manager:aliexpress-dropshipping:accessToken'
          : 'env:ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN'
        : 'none'),
  } as AliExpressDropshippingCredentials);
  return creds;
}

function buildRejectedSupplierSummary(audit: PreventiveSupplierAuditResult): string {
  const rejected = audit.rejectedSuppliers.slice(0, 3).map((item) => item.reason).filter(Boolean);
  if (rejected.length === 0) return 'no preventive supplier passed validation';
  return rejected.join('; ');
}

function calculateImportTaxUsd(product: PrePublishProductShape, supplierUnitUsd: number, shippingUsd: number, shipCountry: string): number {
  const configured = Math.max(0, toNumber((product.importTax ?? 0) as Parameters<typeof toNumber>[0]));
  if (String(shipCountry || '').trim().toUpperCase() === 'CL') {
    const landedCost = calculateMlChileLandedCost({
      productCost: supplierUnitUsd,
      shippingCost: shippingUsd,
      currency: 'USD',
    });
    return Math.max(configured, landedCost.importTaxAmount);
  }
  const fromTaxTable = taxCalculatorService.calculateTaxDetailed(supplierUnitUsd, shippingUsd, shipCountry).totalTax;
  return Math.max(configured, fromTaxTable);
}

function calculatePreventiveProfit(params: {
  product: PrePublishProductShape;
  marketplace: PrePublishMarketplace;
  listingSalePriceUsd: number;
  shipCountry: string;
  destination: Destination;
  supplier: PreventiveValidatedSupplier;
}): PreventiveProfitSummary {
  const listingCurrency = (params.destination.currency || 'USD').toUpperCase();
  const listingSalePriceMarketplaceCurrency = convertCurrency(params.listingSalePriceUsd, 'USD', listingCurrency);
  const supplierUnitMarketplaceCurrency = convertCurrency(params.supplier.salePriceUsd, 'USD', listingCurrency);
  const shippingMarketplaceCurrency = convertCurrency(params.supplier.shippingUsd, 'USD', listingCurrency);
  const importTaxUsd = calculateImportTaxUsd(
    params.product,
    params.supplier.salePriceUsd,
    params.supplier.shippingUsd,
    params.shipCountry
  );
  const importTaxMarketplaceCurrency = convertCurrency(importTaxUsd, 'USD', listingCurrency);

  let totalCostMarketplaceCurrency = 0;
  let netProfitMarketplaceCurrency = 0;
  let marketplaceFeeMarketplaceCurrency = 0;
  let listingFeeMarketplaceCurrency = 0;
  let finalValueFeeMarketplaceCurrency = 0;
  let paymentFeeMarketplaceCurrency = 0;
  let taxesMarketplaceCurrency = 0;
  let otherCostsMarketplaceCurrency = 0;

  if (params.marketplace === 'mercadolibre' || params.marketplace === 'ebay') {
    const intelligence = calculateFeeIntelligence({
      marketplace: params.marketplace,
      listingPrice: listingSalePriceMarketplaceCurrency,
      supplierCost: supplierUnitMarketplaceCurrency + shippingMarketplaceCurrency,
      shippingCostToCustomer: 0,
      currency: listingCurrency,
      category: params.product.category || undefined,
    });
    totalCostMarketplaceCurrency =
      intelligence.totalOperationalCost + importTaxMarketplaceCurrency;
    netProfitMarketplaceCurrency =
      listingSalePriceMarketplaceCurrency - totalCostMarketplaceCurrency;
    listingFeeMarketplaceCurrency = intelligence.breakdown.listingFee;
    finalValueFeeMarketplaceCurrency = intelligence.breakdown.finalValueFee;
    marketplaceFeeMarketplaceCurrency = listingFeeMarketplaceCurrency + finalValueFeeMarketplaceCurrency;
    paymentFeeMarketplaceCurrency = intelligence.breakdown.paymentProcessingFee;
    taxesMarketplaceCurrency = intelligence.breakdown.taxesOrOther;
  } else {
    const advanced = costCalculator.calculateAdvanced(
      params.marketplace,
      params.shipCountry.toLowerCase(),
      listingSalePriceMarketplaceCurrency,
      params.supplier.salePriceUsd,
      listingCurrency,
      'USD',
      {
        shippingCost: shippingMarketplaceCurrency,
        importTax: importTaxMarketplaceCurrency,
      }
    );
    totalCostMarketplaceCurrency = advanced.breakdown.totalCost;
    netProfitMarketplaceCurrency = advanced.netProfit;
    marketplaceFeeMarketplaceCurrency = advanced.breakdown.marketplaceFee;
    paymentFeeMarketplaceCurrency = advanced.breakdown.paymentFee;
    taxesMarketplaceCurrency = advanced.breakdown.taxes + advanced.breakdown.importTax;
    otherCostsMarketplaceCurrency = advanced.breakdown.otherCosts;
  }

  const totalCostUsd = convertCurrency(totalCostMarketplaceCurrency, listingCurrency, 'USD');
  const netProfitUsd = params.listingSalePriceUsd - totalCostUsd;
  const marginRatio =
    listingSalePriceMarketplaceCurrency > 0
      ? netProfitMarketplaceCurrency / listingSalePriceMarketplaceCurrency
      : 0;

  return {
    listingCurrency,
    listingSalePriceUsd: params.listingSalePriceUsd,
    listingSalePriceMarketplaceCurrency,
    supplierUnitUsd: params.supplier.salePriceUsd,
    shippingUsd: params.supplier.shippingUsd,
    importTaxUsd,
    supplierUnitMarketplaceCurrency,
    shippingMarketplaceCurrency,
    importTaxMarketplaceCurrency,
    listingFeeMarketplaceCurrency,
    finalValueFeeMarketplaceCurrency,
    marketplaceFeeMarketplaceCurrency,
    paymentFeeMarketplaceCurrency,
    taxesMarketplaceCurrency,
    otherCostsMarketplaceCurrency,
    totalCostUsd,
    totalCostMarketplaceCurrency,
    netProfitUsd,
    netProfitMarketplaceCurrency,
    marginRatio,
  };
}

function summarizeSupplier(supplier: PreventiveValidatedSupplier) {
  return {
    source: supplier.source,
    productId: supplier.productId,
    productUrl: supplier.productUrl,
    productTitle: supplier.productTitle,
    affiliateUrl: supplier.affiliateUrl,
    salePriceUsd: supplier.salePriceUsd,
    shippingUsd: supplier.shippingUsd,
    totalSupplierCostUsd: supplier.totalSupplierCostUsd,
    rating: supplier.rating,
    orderCount: supplier.orderCount,
    shippingSummary: supplier.shippingSummary,
    skuId: supplier.skuId,
    stock: supplier.stock,
    shippingMethodsCount: supplier.shippingMethodsCount,
    validatedAt: supplier.validatedAt,
  };
}

/**
 * Non-throwing evaluation for Phase 54 and tooling. Maps outcomes to SAFE / RISKY / UNPROFITABLE / UNSHIPPABLE / CONFIG.
 */
export async function evaluatePrePublishValidation(
  params: EvaluatePrePublishParams
): Promise<PrePublishEvaluationResult> {
  const base = {
    marketplace: params.marketplace,
    listingSalePrice: params.listingSalePrice,
    usedShippingFallback: false,
    productId: params.product.id,
  };

  const skip = !params.ignoreValidationDisabled && env.PRE_PUBLISH_VALIDATION_DISABLED;
  if (skip) {
    return {
      ...base,
      classification: 'SAFE',
      passesValidation: true,
      message: 'Pre-publish validation disabled by env (skipped)',
      usedShippingFallback: false,
    };
  }

  const { userId, product, marketplace, credentials, listingSalePrice } = params;

  if (!listingSalePrice || listingSalePrice <= 0) {
    return {
      ...base,
      classification: 'CONFIG',
      passesValidation: false,
      message: 'listing sale price is missing or invalid',
    };
  }

  const aeProductId = aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl || '');
  if (!aeProductId) {
    return {
      ...base,
      classification: 'UNSHIPPABLE',
      passesValidation: false,
      message: 'could not parse AliExpress product id from URL',
      aeProductId: undefined,
    };
  }

  const destination = resolveStrictDestinationContext(product, marketplace, credentials);
  if ('error' in destination) {
    return {
      ...base,
      classification: 'CONFIG',
      passesValidation: false,
      message: destination.error,
      shipCountry: destination.shipCountry,
      aeProductId,
    };
  }
  const { dest, shipCountry } = destination;

  const creds = await loadDropshippingCredentials(userId);
  if (!creds?.accessToken) {
    return {
      ...base,
      classification: 'CONFIG',
      passesValidation: false,
      message: 'AliExpress Dropshipping API is not connected; cannot validate supplier',
      shipCountry,
      aeProductId,
    };
  }

  let info: DropshippingProductInfo;
  try {
    info = await aliexpressDropshippingAPIService.getProductInfo(aeProductId, {
      localCountry: shipCountry,
      localLanguage: dest.language || 'en',
    });
  } catch (e: any) {
    logger.warn('[PRE-PUBLISH] getProductInfo failed', {
      productId: product.id,
      aeProductId,
      shipCountry,
      error: e?.message,
    });
    return {
      ...base,
      classification: 'UNSHIPPABLE',
      passesValidation: false,
      message: `supplier API error: ${e?.message || 'getProductInfo failed'}`,
      shipCountry,
      aeProductId,
    };
  }

  const skuPick = selectPurchasableSkuSoft(info, product.aliexpressSku);
  if (skuPick.ok === false) {
    return {
      ...base,
      classification: 'UNSHIPPABLE',
      passesValidation: false,
      message: skuPick.reason,
      shipCountry,
      aeProductId,
    };
  }
  const selected = skuPick;

  const supplierCurrency = (info.currency || product.currency || 'USD').toString();
  const supplierUnitUsd = toUsd(selected.unitPrice, supplierCurrency);

  let shippingUsd = minShippingCostFromApi(info);
  let usedShippingFallback = false;
  if (marketplace === 'mercadolibre' && shipCountry === 'CL') {
    const freightQuotes = await aliexpressDropshippingAPIService.calculateBuyerFreight({
      countryCode: shipCountry,
      productId: aeProductId,
      productNum: 1,
      sendGoodsCountryCode: String(product.originCountry || 'CN').trim().toUpperCase() || 'CN',
      skuId: selected.skuId || undefined,
    });
    const selection = selectMlChileFreightOption(freightQuotes.options);
    if (!selection.selected) {
      return {
        ...base,
        classification: 'UNSHIPPABLE',
        passesValidation: false,
        message: `could not determine shipping cost from AliExpress freight API for ${shipCountry}: ${selection.reason}`,
        usedShippingFallback: false,
        shipCountry,
        aeProductId,
      };
    }
    shippingUsd = toUsd(selection.selected.freightAmount, selection.selected.freightCurrency || 'USD');
  }
  if (shippingUsd == null) {
    if (env.PRE_PUBLISH_SHIPPING_FALLBACK) {
      shippingUsd = getEffectiveShippingCost(product as import('../utils/shipping.utils').ProductWithShippingCost);
      usedShippingFallback = true;
      logger.info('[PRE-PUBLISH] Using fallback shipping (API returned no method costs)', {
        productId: product.id,
        shippingUsd,
      });
    } else {
      return {
        ...base,
        classification: 'UNSHIPPABLE',
        passesValidation: false,
        message: 'could not determine shipping cost from AliExpress API for this destination',
        usedShippingFallback: false,
        shipCountry,
        aeProductId,
      };
    }
  }

  const importTax = calculateImportTaxUsd(product, supplierUnitUsd, shippingUsd, shipCountry);
  const { netProfit, totalCost, breakdown } = computeProfitAfterFees(
    marketplace,
    listingSalePrice,
    supplierUnitUsd,
    shippingUsd,
    importTax
  );

  const minProfit = env.PRE_PUBLISH_MIN_NET_PROFIT;
  if (netProfit < minProfit) {
    return {
      ...base,
      classification: 'UNPROFITABLE',
      passesValidation: false,
      message: `net profit ${netProfit.toFixed(2)} below minimum ${minProfit} (totalCost ${totalCost.toFixed(2)} vs sale ${listingSalePrice.toFixed(2)})`,
      usedShippingFallback,
      netProfit,
      totalCost,
      supplierUnitUsd,
      shippingUsd,
      aliexpressSkuId: selected.skuId || undefined,
      shipCountry,
      aeProductId,
    };
  }

  const minRatio = env.PRE_PUBLISH_MIN_MARGIN_RATIO;
  if (minRatio > 0 && listingSalePrice > 0 && netProfit / listingSalePrice < minRatio) {
    return {
      ...base,
      classification: 'UNPROFITABLE',
      passesValidation: false,
      message: `margin ratio ${(netProfit / listingSalePrice).toFixed(4)} below minimum ${minRatio}`,
      usedShippingFallback,
      netProfit,
      totalCost,
      supplierUnitUsd,
      shippingUsd,
      aliexpressSkuId: selected.skuId || undefined,
      shipCountry,
      aeProductId,
    };
  }

  const classification: ListingRiskClass = usedShippingFallback ? 'RISKY' : 'SAFE';

  logger.info('[PRE-PUBLISH] evaluated', {
    productId: product.id,
    marketplace,
    aeProductId,
    shipCountry,
    classification,
    netProfit,
    totalCost,
    marketplaceFee: breakdown.marketplaceFee,
    paymentFee: breakdown.paymentFee,
  });

  return {
    classification,
    passesValidation: true,
    message:
      classification === 'RISKY'
        ? 'Valid but shipping cost used DB/env fallback (not from AliExpress API methods)'
        : 'OK',
    usedShippingFallback,
    listingSalePrice,
    marketplace,
    netProfit,
    totalCost,
    supplierUnitUsd,
    shippingUsd,
    aliexpressSkuId: selected.skuId || undefined,
    shipCountry,
    aeProductId,
    productId: product.id,
  };
}

export type RunPreventiveEconomicsCoreParams = AssertProductValidForPublishingParams & {
  /**
   * When true, runs supplier + ledger checks and returns profitability even if listing price fails
   * profit/margin floors (used to compute canonical uplift before re-validation).
   */
  allowUnprofitableListing?: boolean;
};

function preventiveListingMeetsProfitFloors(profitability: PreventiveProfitSummary): boolean {
  if (profitability.netProfitUsd <= 0) return false;
  const minProfit = Math.max(0.01, env.PRE_PUBLISH_MIN_NET_PROFIT);
  if (profitability.netProfitUsd < minProfit) return false;
  const minMarginRatio = Math.max(0, env.PRE_PUBLISH_MIN_MARGIN_RATIO);
  if (minMarginRatio > 0 && profitability.marginRatio < minMarginRatio) return false;
  return true;
}

/**
 * Minimum USD listing price that satisfies the same floors as `runPreventiveEconomicsCore`,
 * using `calculatePreventiveProfit` (fee intelligence + CL import tax path).
 */
function findMinimumProfitableListingSalePriceUsd(params: {
  product: PrePublishProductShape;
  marketplace: PrePublishMarketplace;
  shipCountry: string;
  destination: Destination;
  supplier: PreventiveValidatedSupplier;
}): number {
  const minProfit = Math.max(0.01, env.PRE_PUBLISH_MIN_NET_PROFIT);
  const minMarginRatio = Math.max(0, env.PRE_PUBLISH_MIN_MARGIN_RATIO);

  const importTaxUsd = calculateImportTaxUsd(
    params.product,
    params.supplier.salePriceUsd,
    params.supplier.shippingUsd,
    params.shipCountry
  );
  let priceUsd = Math.max(
    params.supplier.salePriceUsd + params.supplier.shippingUsd + importTaxUsd,
    10
  );

  for (let i = 0; i < 50; i++) {
    const profitability = calculatePreventiveProfit({
      product: params.product,
      marketplace: params.marketplace,
      listingSalePriceUsd: priceUsd,
      shipCountry: params.shipCountry,
      destination: params.destination,
      supplier: params.supplier,
    });
    if (
      profitability.netProfitUsd >= minProfit &&
      (minMarginRatio <= 0 || profitability.marginRatio >= minMarginRatio)
    ) {
      return Math.round(priceUsd * 100) / 100;
    }
    priceUsd = Math.round((priceUsd * 1.1 + 1) * 100) / 100;
  }
  throw new Error('Could not find a listing price that meets preventive profit floors');
}

/**
 * P89 / Phase 53: supplier + landed cost + fee intelligence + ledger completeness + profit floors.
 * Used by prepareProductForSafePublishing and web preflight (canonical MLC pricing truth).
 */
export async function runPreventiveEconomicsCore(
  params: RunPreventiveEconomicsCoreParams
): Promise<PreventiveEconomicsCoreSuccess | PreventiveEconomicsCoreFailure> {
  const { userId, product, marketplace, credentials, listingSalePrice } = params;

  if (!listingSalePrice || listingSalePrice <= 0) {
    return { ok: false, message: 'listing sale price is missing or invalid' };
  }

  const aeProductId = aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl || '');
  if (!aeProductId) {
    return { ok: false, message: 'could not parse AliExpress product id from URL' };
  }

  const destination = resolveStrictDestinationContext(product, marketplace, credentials);
  if ('error' in destination) {
    return { ok: false, message: destination.error };
  }
  const { dest, shipCountry } = destination;

  const creds = await loadDropshippingCredentials(userId);
  if (!creds?.accessToken) {
    return { ok: false, message: 'AliExpress Dropshipping API is not connected; cannot validate supplier' };
  }

  const persistedMlChileFreightTruth =
    marketplace === 'mercadolibre' && shipCountry === 'CL'
      ? resolveCanonicalMlChileFreightTruth(product, shipCountry)
      : null;

  if (marketplace === 'mercadolibre' && shipCountry === 'CL' && !persistedMlChileFreightTruth?.ok) {
    return {
      ok: false,
      message: `persisted ML Chile freight truth is not ready for publish: ${persistedMlChileFreightTruth?.reason || 'unknown reason'}`,
    };
  }

  const { runPreventiveSupplierAudit } = await import('./preventive-supplier-validation.service');
  const supplierAudit = await runPreventiveSupplierAudit({
    userId,
    orderTitle: product.title || `Product ${product.id}`,
    originalProductUrl: product.aliexpressUrl || '',
    originalSupplierPriceUsd: Math.max(
      0.01,
      toNumber((product.aliexpressPrice ?? 0) as Parameters<typeof toNumber>[0])
    ),
    shipToCountry: shipCountry,
    preferredSkuId: product.aliexpressSku,
    persistedMlChileFreightTruth: persistedMlChileFreightTruth?.truth,
    skipAlternativeSearch:
      marketplace === 'mercadolibre' &&
      shipCountry === 'CL' &&
      persistedMlChileFreightTruth?.ok === true,
  });

  if (!supplierAudit.bestSupplier) {
    return { ok: false, message: buildRejectedSupplierSummary(supplierAudit) };
  }

  const selectedSupplier = supplierAudit.bestSupplier;
  const profitability = calculatePreventiveProfit({
    product,
    marketplace,
    listingSalePriceUsd: listingSalePrice,
    shipCountry,
    destination: dest,
    supplier: selectedSupplier,
  });
  const feeLedger = buildListingFeeLedger({
    marketplace,
    country: shipCountry,
    listingCurrency: profitability.listingCurrency,
    revenueEstimate: profitability.listingSalePriceMarketplaceCurrency,
    supplierCost: profitability.supplierUnitMarketplaceCurrency,
    shippingCost: profitability.shippingMarketplaceCurrency,
    marketplaceFeeEstimate: profitability.finalValueFeeMarketplaceCurrency,
    paymentFeeEstimate: profitability.paymentFeeMarketplaceCurrency,
    listingFeeEstimate: profitability.listingFeeMarketplaceCurrency,
    supplierCurrency: 'USD',
  });

  if (profitability.shippingUsd <= 0) {
    return { ok: false, message: 'shipping cost from AliExpress API is missing or invalid' };
  }
  if (feeLedger.blockedByFinancialIncompleteness) {
    return {
      ok: false,
      message: `financial completeness is insufficient: ${feeLedger.blockingReasons.join(', ')}`,
    };
  }

  if (!params.allowUnprofitableListing) {
    if (profitability.netProfitUsd <= 0) {
      return {
        ok: false,
        message: `real profit ${profitability.netProfitUsd.toFixed(2)} must be > 0 (sale ${listingSalePrice.toFixed(2)} vs total cost ${profitability.totalCostUsd.toFixed(2)})`,
      };
    }

    const minProfit = Math.max(0.01, env.PRE_PUBLISH_MIN_NET_PROFIT);
    if (profitability.netProfitUsd < minProfit) {
      return {
        ok: false,
        message: `real profit ${profitability.netProfitUsd.toFixed(2)} below minimum ${minProfit.toFixed(2)}`,
      };
    }

    const minMarginRatio = Math.max(0, env.PRE_PUBLISH_MIN_MARGIN_RATIO);
    if (minMarginRatio > 0 && profitability.marginRatio < minMarginRatio) {
      return {
        ok: false,
        message: `real margin ${(profitability.marginRatio * 100).toFixed(2)}% below minimum ${(minMarginRatio * 100).toFixed(2)}%`,
      };
    }
  }

  return {
    ok: true,
    aeProductId,
    shipCountry,
    dest,
    selectedSupplier,
    supplierAudit,
    profitability,
    feeLedger,
  };
}

/**
 * Strict preventive preparation used by the real publish path.
 * This ignores PRE_PUBLISH_VALIDATION_DISABLED and never allows shipping fallback.
 */
export interface CanonicalProfitablePriceResult {
  profitablePriceUsd: number;
  requiredMarginUsd: number;
  totalCostUsd: number;
  mlFeeUsd: number;
  marginRatio: number;
  iterations: number;
}

/**
 * Compute canonical minimum profitable listing price (USD) using `computeProfitAfterFees` / cost calculator.
 * The publish path uses `findMinimumProfitableListingSalePriceUsd` internally so uplift matches
 * `calculatePreventiveProfit` + fee intelligence; keep this for diagnostics or non-MLC estimates.
 */
export function computeCanonicalProfitablePrice(
  supplierUnitUsd: number,
  shippingUsd: number,
  importTaxUsd: number,
  targetMarginRatio = 0.20, // 20% minimum margin
  maxIterations = 20
): CanonicalProfitablePriceResult {
  let priceUsd = Math.max(supplierUnitUsd + shippingUsd + importTaxUsd, 10); // Minimum $10
  let iteration = 0;

  while (iteration < maxIterations) {
    const { netProfit, totalCost, breakdown } = computeProfitAfterFees(
      'mercadolibre',
      priceUsd,
      supplierUnitUsd,
      shippingUsd,
      importTaxUsd
    );

    const marginRatio = priceUsd > 0 ? netProfit / priceUsd : 0;
    
    if (netProfit > 0 && marginRatio >= targetMarginRatio) {
      return {
        profitablePriceUsd: Math.round(priceUsd * 100) / 100,
        requiredMarginUsd: netProfit,
        totalCostUsd: totalCost,
        mlFeeUsd: breakdown.marketplaceFee,
        marginRatio,
        iterations: iteration,
      };
    }

    // Increase price by 10% + $1 buffer
    priceUsd = Math.round((priceUsd * 1.1 + 1) * 100) / 100;
    iteration++;
  }

  throw new Error(`Could not find profitable price after ${maxIterations} iterations`);
}

export async function prepareProductForSafePublishing(
  params: AssertProductValidForPublishingParams
): Promise<PreventivePublishPreparationResult> {
  const draft = await runPreventiveEconomicsCore({
    ...params,
    allowUnprofitableListing: true,
  });
  if (draft.ok === false) {
    fail(draft.message);
  }

  const requestedPrice = params.listingSalePrice;
  let listingSalePrice = requestedPrice;
  let canonicalPriceUplift:
    | {
        applied: boolean;
        requestedListingSalePriceUsd: number;
        upliftedListingSalePriceUsd: number;
        minNetProfitFloorUsd: number;
        minMarginRatioFloor: number;
      }
    | undefined;

  if (!preventiveListingMeetsProfitFloors(draft.profitability)) {
    listingSalePrice = findMinimumProfitableListingSalePriceUsd({
      product: params.product,
      marketplace: params.marketplace,
      shipCountry: draft.shipCountry,
      destination: draft.dest,
      supplier: draft.selectedSupplier,
    });
    canonicalPriceUplift = {
      applied: true,
      requestedListingSalePriceUsd: requestedPrice,
      upliftedListingSalePriceUsd: listingSalePrice,
      minNetProfitFloorUsd: Math.max(0.01, env.PRE_PUBLISH_MIN_NET_PROFIT),
      minMarginRatioFloor: Math.max(0, env.PRE_PUBLISH_MIN_MARGIN_RATIO),
    };
    logger.info('[PRE-PUBLISH] canonical listing price uplift applied', {
      productId: params.product.id,
      marketplace: params.marketplace,
      ...canonicalPriceUplift,
    });
  }

  const econ =
    listingSalePrice === requestedPrice && preventiveListingMeetsProfitFloors(draft.profitability)
      ? draft
      : await runPreventiveEconomicsCore({
          ...params,
          listingSalePrice,
          allowUnprofitableListing: false,
        });

  if (econ.ok === false) {
    fail(
      `after canonical price uplift, economics still blocked: ${econ.message}. requested=${requestedPrice.toFixed(2)} upliftCandidate=${listingSalePrice.toFixed(2)}`
    );
  }

  const { userId, product, marketplace, credentials } = params;
  const { selectedSupplier, supplierAudit, profitability, feeLedger, shipCountry, aeProductId } = econ;

  if (Number.isFinite(listingSalePrice) && listingSalePrice > 0) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        finalPrice: listingSalePrice,
        suggestedPrice: listingSalePrice,
        totalCost: profitability.totalCostUsd,
        shippingCost: profitability.shippingUsd,
        importTax: profitability.importTaxUsd,
      },
    });
    logger.info('[PRE-PUBLISH] persisted validated listing sale price (before ML image gate)', {
      productId: product.id,
      listingSalePriceUsd: listingSalePrice,
      totalCostUsd: profitability.totalCostUsd,
      canonicalUpliftApplied: canonicalPriceUplift?.applied === true,
    });
  }

  let mlImageCompliance: MlImagePolicyAudit | null = null;
  let mlImageRemediation: MlImageRemediationResult | null = null;
  let marketplaceOptimizationAdvisory: ReturnType<typeof analyzeMarketplaceOptimizationCandidate> | null = null;
  if (marketplace === 'mercadolibre') {
    mlImageRemediation = await runMercadoLibreImageRemediationPipeline({
      userId,
      productId: product.id,
      title: product.title,
      images: product.images,
      productData: product.productData,
    });
    mlImageCompliance = mlImageRemediation.rawAudit;
    if (!mlImageRemediation.publishSafe) {
      fail(
        `MercadoLibre image remediation did not produce a compliant asset pack: ${mlImageRemediation.blockingReasons.join(', ')}`
      );
    }
    if (mlImageRemediation.complianceProof.status === 'ml_image_policy_fail') {
      fail(
        `MercadoLibre image policy failed: ${mlImageRemediation.blockingReasons.join(', ')}`
      );
    }
    if (mlImageRemediation.complianceProof.status === 'ml_image_manual_review_required') {
      fail(
        `MercadoLibre image remediation requires manual review: ${mlImageRemediation.blockingReasons.join(', ')}`
      );
    }
    marketplaceOptimizationAdvisory = analyzeMarketplaceOptimizationCandidate({
      id: product.id,
      title: product.title,
      category: product.category,
      images: product.images,
      productData: product.productData,
      finalPrice: listingSalePrice,
      shippingCost: profitability.shippingUsd,
      totalCost: profitability.totalCostUsd,
      targetCountry: shipCountry,
    });
  }

  const metadataPatch = {
    preventivePublish: {
      auditedAt: new Date().toISOString(),
      marketplace,
      shipCountry,
      destinationCurrency: profitability.listingCurrency,
      resolvedLanguage: getMarketplaceContext(marketplace, credentials).language,
      requiredLanguage: getMarketplaceContext(marketplace, credentials).requiredLanguage,
      canonicalPriceUplift:
        canonicalPriceUplift ??
        ({
          applied: false,
          requestedListingSalePriceUsd: requestedPrice,
          upliftedListingSalePriceUsd: listingSalePrice,
          minNetProfitFloorUsd: Math.max(0.01, env.PRE_PUBLISH_MIN_NET_PROFIT),
          minMarginRatioFloor: Math.max(0, env.PRE_PUBLISH_MIN_MARGIN_RATIO),
        } as const),
      listingSalePriceUsd: profitability.listingSalePriceUsd,
      listingSalePriceMarketplaceCurrency: profitability.listingSalePriceMarketplaceCurrency,
      originalAliExpressUrl: product.aliexpressUrl,
      optimizedQuery: supplierAudit.optimizedQuery,
      originalSupplierPassed: supplierAudit.originalSupplierPassed,
      searchedAlternatives: supplierAudit.searchedAlternatives,
      attemptedAlternativeValidation: supplierAudit.attemptedAlternativeValidation,
      validatedAlternativeCount: supplierAudit.validatedAlternativeCount,
      minimumAlternativeSearchTarget: supplierAudit.minimumAlternativeSearchTarget,
      supplierReliabilityScore: supplierAudit.supplierReliabilityScore,
      shippingSource:
        marketplace === 'mercadolibre' && shipCountry === 'CL'
          ? 'persisted_ml_chile_freight_truth'
          : 'aliexpress_api',
      policyComplianceReady:
        marketplace === 'mercadolibre'
          ? mlImageRemediation?.publishSafe === true
          : true,
      mlChileImageCompliance: mlImageRemediation?.complianceProof || mlImageCompliance,
      mlChileImageRemediation: mlImageRemediation,
      mlChileAssetPack: mlImageRemediation?.assetPack || null,
      marketplaceOptimizationAdvisory,
      selectedSupplier: summarizeSupplier(selectedSupplier),
      fallbackSuppliers: supplierAudit.fallbackSuppliers.slice(0, 5).map(summarizeSupplier),
      rejectedSuppliers: supplierAudit.rejectedSuppliers.slice(0, 10),
      feeLedger,
      marketplaceFeeEstimate: feeLedger.marketplaceFeeEstimate,
      marketplaceFeeModel: feeLedger.marketplaceFeeModel,
      marketplaceFeeInputs: feeLedger.marketplaceFeeInputs,
      fxFeeEstimate: feeLedger.fxFeeEstimate,
      fxModel: feeLedger.fxModel,
      fxInputs: feeLedger.fxInputs,
      currencySafety: feeLedger.currencySafety,
      profitability: {
        listingCurrency: profitability.listingCurrency,
        netProfitUsd: profitability.netProfitUsd,
        netProfitMarketplaceCurrency: profitability.netProfitMarketplaceCurrency,
        marginRatio: profitability.marginRatio,
        totalCostUsd: profitability.totalCostUsd,
        totalCostMarketplaceCurrency: profitability.totalCostMarketplaceCurrency,
        supplierUnitUsd: profitability.supplierUnitUsd,
        shippingUsd: profitability.shippingUsd,
        importTaxUsd: profitability.importTaxUsd,
        listingFeeMarketplaceCurrency: profitability.listingFeeMarketplaceCurrency,
        finalValueFeeMarketplaceCurrency: profitability.finalValueFeeMarketplaceCurrency,
        marketplaceFeeMarketplaceCurrency: profitability.marketplaceFeeMarketplaceCurrency,
        paymentFeeMarketplaceCurrency: profitability.paymentFeeMarketplaceCurrency,
        taxesMarketplaceCurrency: profitability.taxesMarketplaceCurrency,
      },
    },
  };

  logger.info('[PRE-PUBLISH] preventive preparation ready', {
    productId: product.id,
    marketplace,
    shipCountry,
    selectedSupplierId: selectedSupplier.productId,
    supplierReliabilityScore: supplierAudit.supplierReliabilityScore,
    fallbackSuppliers: supplierAudit.fallbackSuppliers.length,
    netProfitUsd: profitability.netProfitUsd,
    marginRatio: profitability.marginRatio,
  });

  return {
    classification: 'SAFE',
    passesValidation: true,
    message:
      canonicalPriceUplift?.applied === true
        ? `OK (canonical listing price uplifted to ${listingSalePrice.toFixed(2)} USD)`
        : 'OK',
    usedShippingFallback: false,
    listingSalePrice,
    marketplace,
    netProfit: profitability.netProfitUsd,
    totalCost: profitability.totalCostUsd,
    supplierUnitUsd: profitability.supplierUnitUsd,
    shippingUsd: profitability.shippingUsd,
    aliexpressSkuId: selectedSupplier.skuId,
    shipCountry,
    aeProductId,
    productId: product.id,
    selectedSupplier,
    fallbackSuppliers: supplierAudit.fallbackSuppliers,
    supplierAudit,
    profitability,
    feeLedger,
    metadataPatch,
  };
}

export async function persistPreventivePublishPreparation(params: {
  productId: number;
  preparation: PreventivePublishPreparationResult;
  upliftPriceUsd?: number;
}) {
  const existing = await prisma.product.findUnique({
    where: { id: params.productId },
    select: {
      id: true,
      productData: true,
    },
  });

  if (!existing) {
    fail(`product ${params.productId} not found while persisting preventive preparation`);
  }

  const currentMeta = parseProductMetadata(existing.productData);
  const mergedMeta = {
    ...currentMeta,
    ...params.preparation.metadataPatch,
  };

  const supplier = params.preparation.selectedSupplier;
  const updateData: any = {
    aliexpressUrl: supplier.productUrl,
    aliexpressSku: supplier.skuId || null,
    aliexpressPrice: supplier.salePriceUsd,
    shippingCost: params.preparation.profitability.shippingUsd,
    importTax: params.preparation.profitability.importTaxUsd,
    totalCost: params.preparation.profitability.totalCostUsd,
    targetCountry: params.preparation.shipCountry || 'US',
    supplierStock: supplier.stock,
    supplierStockCheckedAt: new Date(supplier.validatedAt),
    productData: JSON.stringify(mergedMeta),
  };

  const effectivePrice =
    params.upliftPriceUsd !== undefined
      ? params.upliftPriceUsd
      : params.preparation.listingSalePrice;
  if (Number.isFinite(effectivePrice) && effectivePrice > 0) {
    updateData.finalPrice = effectivePrice;
    updateData.suggestedPrice = effectivePrice;
  }

  return prisma.product.update({
    where: { id: params.productId },
    data: updateData,
  });
}

/**
 * Throws AppError with message prefix "Product not valid for publishing" if any check fails.
 */
export async function assertProductValidForPublishing(
  params: AssertProductValidForPublishingParams
): Promise<void> {
  const result = await evaluatePrePublishValidation({
    ...params,
    ignoreValidationDisabled: false,
  });

  if (result.classification === 'SAFE' && result.message.includes('skipped')) {
    return;
  }

  if (!result.passesValidation) {
    fail(result.message);
  }

  if (env.PRE_PUBLISH_REJECT_RISKY && result.classification === 'RISKY') {
    fail(
      'listing classified RISKY (shipping not from AliExpress API lines); set PRE_PUBLISH_REJECT_RISKY=false or fix API shipping'
    );
  }
}
