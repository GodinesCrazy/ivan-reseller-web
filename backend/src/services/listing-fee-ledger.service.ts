import type { MarketplaceName } from './marketplace.service';

export type FeeEstimateState = 'exact' | 'estimated' | 'missing';

export interface FeeLedgerLine {
  amount: number;
  currency: string;
  state: FeeEstimateState;
  source: string;
  reason?: string;
}

export interface ListingFeeLedger {
  supplierCost: FeeLedgerLine;
  shippingCost: FeeLedgerLine;
  marketplaceFeeEstimate: FeeLedgerLine;
  paymentFeeEstimate: FeeLedgerLine;
  fxFeeEstimate: FeeLedgerLine;
  listingFeeEstimate: FeeLedgerLine;
  revenueEstimate: FeeLedgerLine;
  marketplaceFeeModel: string;
  marketplaceFeeInputs: Record<string, string | number | boolean | null>;
  fxModel: string;
  fxInputs: Record<string, string | number | boolean | null>;
  currencySafety: {
    sourceCurrency: string;
    listingCurrency: string;
    fxRequired: boolean;
    state: 'safe' | 'buffered';
    bufferPct: number;
  };
  totalKnownCost: number;
  projectedProfit: number;
  projectedMargin: number;
  feeCompleteness: number;
  completenessState: 'complete' | 'partial' | 'incomplete';
  missingFeeClasses: string[];
  estimatedFeeClasses: string[];
  blockedByFinancialIncompleteness: boolean;
  blockingReasons: string[];
}

function hasExplicitEnv(name: string): boolean {
  return String(process.env[name] || '').trim().length > 0;
}

function getNumberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function buildLine(params: {
  amount: number;
  currency: string;
  state: FeeEstimateState;
  source: string;
  reason?: string;
}): FeeLedgerLine {
  return {
    amount: Number.isFinite(params.amount) ? params.amount : 0,
    currency: params.currency,
    state: params.state,
    source: params.source,
    ...(params.reason ? { reason: params.reason } : {}),
  };
}

function completenessFromLines(lines: Array<[string, FeeLedgerLine]>): {
  feeCompleteness: number;
  completenessState: 'complete' | 'partial' | 'incomplete';
  missingFeeClasses: string[];
  estimatedFeeClasses: string[];
} {
  const missingFeeClasses = lines.filter(([, line]) => line.state === 'missing').map(([name]) => name);
  const estimatedFeeClasses = lines.filter(([, line]) => line.state === 'estimated').map(([name]) => name);
  const presentCount = lines.length - missingFeeClasses.length;
  const feeCompleteness = lines.length > 0 ? presentCount / lines.length : 0;

  return {
    feeCompleteness,
    completenessState:
      missingFeeClasses.length === 0 ? 'complete' : presentCount > 0 ? 'partial' : 'incomplete',
    missingFeeClasses,
    estimatedFeeClasses,
  };
}

export function buildListingFeeLedger(params: {
  marketplace: MarketplaceName;
  country: string;
  listingCurrency: string;
  revenueEstimate: number;
  supplierCost: number;
  shippingCost: number;
  marketplaceFeeEstimate: number;
  paymentFeeEstimate: number;
  listingFeeEstimate: number;
  supplierCurrency?: string | null;
}): ListingFeeLedger {
  const marketplace = params.marketplace;
  const country = String(params.country || '').trim().toUpperCase();
  const listingCurrency = String(params.listingCurrency || 'USD').trim().toUpperCase();
  const supplierCurrency = String(params.supplierCurrency || 'USD').trim().toUpperCase();

  const supplierCost = buildLine({
    amount: params.supplierCost,
    currency: listingCurrency,
    state: params.supplierCost > 0 ? 'exact' : 'missing',
    source: 'preventive_supplier_validation',
    reason: params.supplierCost > 0 ? undefined : 'supplier_cost_missing',
  });

  const shippingCost = buildLine({
    amount: params.shippingCost,
    currency: listingCurrency,
    state: params.shippingCost > 0 ? 'exact' : 'missing',
    source: 'aliexpress_dropshipping_api',
    reason: params.shippingCost > 0 ? undefined : 'shipping_cost_missing',
  });

  let marketplaceFeeModel = 'unmodeled';
  let marketplaceFeeInputs: Record<string, string | number | boolean | null> = {
    marketplace,
    country,
    listingCurrency,
    revenueEstimate: params.revenueEstimate,
  };

  let marketplaceFeeState: FeeEstimateState = 'missing';
  let marketplaceFeeSource = 'unmodeled';
  let marketplaceFeeReason = `marketplace_fee_unmodeled:${marketplace}:${country}`;
  let marketplaceFeeAmount = params.marketplaceFeeEstimate;

  if (marketplace === 'ebay' && country === 'US') {
    const fvfPct = hasExplicitEnv('EBAY_FVF_PCT')
      ? getNumberFromEnv('EBAY_FVF_PCT', 13.5)
      : 13.5;
    marketplaceFeeModel = hasExplicitEnv('EBAY_FVF_PCT')
      ? 'configured_ebay_us_fee_schedule'
      : 'default_ebay_us_fee_schedule';
    marketplaceFeeInputs = {
      marketplace,
      country,
      listingCurrency,
      revenueEstimate: params.revenueEstimate,
      fvfPct,
      usedConfiguredFvfPct: hasExplicitEnv('EBAY_FVF_PCT'),
    };
    if (!(marketplaceFeeAmount > 0) && params.revenueEstimate > 0) {
      marketplaceFeeAmount = (params.revenueEstimate * fvfPct) / 100;
    }
    marketplaceFeeState = marketplaceFeeAmount > 0 ? 'estimated' : 'missing';
    marketplaceFeeSource = hasExplicitEnv('EBAY_FVF_PCT')
      ? 'configured_ebay_us_fee_schedule'
      : 'default_ebay_us_fee_schedule';
    marketplaceFeeReason = marketplaceFeeAmount > 0 ? '' : 'ebay_us_fee_estimate_unavailable';
  } else if (marketplace === 'mercadolibre' && country === 'CL') {
    const commissionPct = getNumberFromEnv('ML_COMMISSION_PCT', 12);
    const lowTierMax = getNumberFromEnv('ML_CL_FIXED_FEE_LOW_TIER_MAX_CLP', 9990);
    const midTierMax = getNumberFromEnv('ML_CL_FIXED_FEE_MID_TIER_MAX_CLP', 19990);
    const lowTierFixed = getNumberFromEnv('ML_CL_FIXED_FEE_LOW_TIER_CLP', 700);
    const midTierFixed = getNumberFromEnv('ML_CL_FIXED_FEE_MID_TIER_CLP', 1000);
    const fixedFeeApplied =
      listingCurrency === 'CLP' && params.revenueEstimate > 0
        ? params.revenueEstimate <= lowTierMax
          ? lowTierFixed
          : params.revenueEstimate <= midTierMax
            ? midTierFixed
            : 0
        : 0;

    marketplaceFeeModel = hasExplicitEnv('ML_COMMISSION_PCT')
      ? 'configured_mercadolibre_cl_commission_with_fixed_tiers'
      : 'default_mercadolibre_cl_commission_with_fixed_tiers';
    marketplaceFeeInputs = {
      marketplace,
      country,
      listingCurrency,
      revenueEstimate: params.revenueEstimate,
      commissionPct,
      fixedFeeApplied,
      lowTierMax,
      midTierMax,
      lowTierFixed,
      midTierFixed,
      usedConfiguredCommissionPct: hasExplicitEnv('ML_COMMISSION_PCT'),
    };

    if (params.marketplaceFeeEstimate > 0 || fixedFeeApplied === 0) {
      marketplaceFeeState = 'estimated';
      marketplaceFeeSource = hasExplicitEnv('ML_COMMISSION_PCT')
        ? 'configured_mercadolibre_cl_fee_schedule'
        : 'default_mercadolibre_cl_fee_schedule';
      marketplaceFeeReason = '';
    } else {
      marketplaceFeeReason = 'mercadolibre_cl_fee_estimate_missing';
    }
  }

  const marketplaceFeeEstimate = buildLine({
    amount: marketplaceFeeAmount,
    currency: listingCurrency,
    state: marketplaceFeeState,
    source: marketplaceFeeSource,
    ...(marketplaceFeeState === 'missing' ? { reason: marketplaceFeeReason } : {}),
  });

  let paymentFeeState: FeeEstimateState = 'missing';
  let paymentFeeSource = 'unmodeled';
  let paymentFeeReason = `payment_fee_unmodeled:${marketplace}:${country}`;

  if (marketplace === 'ebay' && country === 'US') {
    paymentFeeState = 'exact';
    paymentFeeSource = 'ebay_managed_payments_included_in_fvf';
    paymentFeeReason = '';
  } else if (marketplace === 'mercadolibre' && country === 'CL') {
    paymentFeeState = 'exact';
    paymentFeeSource = 'mercadopago_included_in_commission';
    paymentFeeReason = '';
  }

  const paymentFeeEstimate = buildLine({
    amount: params.paymentFeeEstimate,
    currency: listingCurrency,
    state: paymentFeeState,
    source: paymentFeeSource,
    ...(paymentFeeState === 'missing' ? { reason: paymentFeeReason } : {}),
  });

  let listingFeeState: FeeEstimateState = 'missing';
  let listingFeeSource = 'unmodeled';
  let listingFeeReason = `listing_fee_unmodeled:${marketplace}:${country}`;
  let listingFeeAmount = params.listingFeeEstimate;

  if (marketplace === 'ebay' && country === 'US') {
    const insertionFee = hasExplicitEnv('EBAY_INSERTION_FEE_USD')
      ? getNumberFromEnv('EBAY_INSERTION_FEE_USD', 0.4)
      : 0.4;
    if (!(listingFeeAmount > 0) && insertionFee > 0) {
      listingFeeAmount = insertionFee;
    }
    listingFeeState = listingFeeAmount >= 0 ? 'estimated' : 'missing';
    listingFeeSource = hasExplicitEnv('EBAY_INSERTION_FEE_USD')
      ? 'configured_ebay_us_insertion_fee'
      : 'default_ebay_us_insertion_fee';
    listingFeeReason = listingFeeAmount >= 0 ? '' : 'ebay_us_insertion_fee_unavailable';
  } else if (marketplace === 'mercadolibre' && country === 'CL') {
    listingFeeState = 'exact';
    listingFeeSource = 'mercadolibre_no_listing_fee';
    listingFeeReason = '';
  }

  const listingFeeEstimate = buildLine({
    amount: listingFeeAmount,
    currency: listingCurrency,
    state: listingFeeState,
    source: listingFeeSource,
    ...(listingFeeState === 'missing' ? { reason: listingFeeReason } : {}),
  });

  const fxRequired = supplierCurrency && listingCurrency && supplierCurrency !== listingCurrency;
  const fxBufferPct = fxRequired ? getNumberFromEnv('FX_FEE_BUFFER_PCT', 3) : 0;
  const fxFeeBaseAmount = Math.max(0, params.supplierCost) + Math.max(0, params.shippingCost);
  const fxFeeAmount = fxRequired ? (fxFeeBaseAmount * fxBufferPct) / 100 : 0;
  const fxModel = fxRequired
    ? hasExplicitEnv('FX_FEE_BUFFER_PCT')
      ? 'configured_cross_currency_buffer_pct'
      : 'default_cross_currency_buffer_pct'
    : 'same_currency_no_fx_fee';
  const fxInputs: Record<string, string | number | boolean | null> = {
    supplierCurrency,
    listingCurrency,
    fxRequired,
    bufferPct: fxBufferPct,
    feeBaseAmount: fxFeeBaseAmount,
    usedConfiguredBufferPct: fxRequired ? hasExplicitEnv('FX_FEE_BUFFER_PCT') : false,
  };
  const currencySafety = {
    sourceCurrency: supplierCurrency,
    listingCurrency,
    fxRequired: Boolean(fxRequired),
    state: fxRequired ? ('buffered' as const) : ('safe' as const),
    bufferPct: fxBufferPct,
  };
  const fxFeeEstimate = buildLine({
    amount: fxFeeAmount,
    currency: listingCurrency,
    state: fxRequired ? 'estimated' : 'exact',
    source: fxRequired
      ? hasExplicitEnv('FX_FEE_BUFFER_PCT')
        ? 'configured_cross_currency_buffer_pct'
        : 'default_cross_currency_buffer_pct'
      : 'not_applicable_same_currency',
  });

  const revenueEstimate = buildLine({
    amount: params.revenueEstimate,
    currency: listingCurrency,
    state: params.revenueEstimate > 0 ? 'exact' : 'missing',
    source: 'listing_sale_price',
    reason: params.revenueEstimate > 0 ? undefined : 'revenue_estimate_missing',
  });

  const trackedLines: Array<[string, FeeLedgerLine]> = [
    ['supplierCost', supplierCost],
    ['shippingCost', shippingCost],
    ['marketplaceFeeEstimate', marketplaceFeeEstimate],
    ['paymentFeeEstimate', paymentFeeEstimate],
    ['fxFeeEstimate', fxFeeEstimate],
    ['listingFeeEstimate', listingFeeEstimate],
    ['revenueEstimate', revenueEstimate],
  ];

  const completeness = completenessFromLines(trackedLines);
  const totalKnownCost =
    supplierCost.amount +
    shippingCost.amount +
    marketplaceFeeEstimate.amount +
    paymentFeeEstimate.amount +
    fxFeeEstimate.amount +
    listingFeeEstimate.amount;
  const projectedProfit = revenueEstimate.amount - totalKnownCost;
  const projectedMargin = revenueEstimate.amount > 0 ? projectedProfit / revenueEstimate.amount : 0;
  const blockingReasons = [...completeness.missingFeeClasses.map((item) => `missing_${item}`)];

  return {
    supplierCost,
    shippingCost,
    marketplaceFeeEstimate,
    paymentFeeEstimate,
    fxFeeEstimate,
    listingFeeEstimate,
    revenueEstimate,
    marketplaceFeeModel,
    marketplaceFeeInputs,
    fxModel,
    fxInputs,
    currencySafety,
    totalKnownCost,
    projectedProfit,
    projectedMargin,
    feeCompleteness: completeness.feeCompleteness,
    completenessState: completeness.completenessState,
    missingFeeClasses: completeness.missingFeeClasses,
    estimatedFeeClasses: completeness.estimatedFeeClasses,
    blockedByFinancialIncompleteness: completeness.missingFeeClasses.length > 0,
    blockingReasons,
  };
}
