import type { MarketplaceName } from './marketplace.service';

export type ProductValidationState =
  | 'LEGACY_UNVERIFIED'
  | 'PENDING'
  | 'REJECTED'
  | 'BLOCKED'
  | 'VALIDATION_INCOMPLETE'
  | 'VALIDATED_READY'
  | 'PUBLISHED';

export interface ProductValidationSnapshot {
  validationState: ProductValidationState;
  blockedReasons: string[];
  resolvedCountry: string | null;
  resolvedLanguage: string | null;
  resolvedCurrency: string | null;
  feeCompleteness: number;
  projectedMargin: number | null;
  marketplaceContextSafety: 'safe' | 'unsafe';
  candidateMarketplace: MarketplaceName | null;
}

function parseMeta(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

export function getProductValidationSnapshot(product: {
  status?: string | null;
  currency?: string | null;
  targetCountry?: string | null;
  shippingCost?: unknown;
  totalCost?: unknown;
  aliexpressSku?: string | null;
  productData?: unknown;
}): ProductValidationSnapshot {
  const status = String(product.status || '').trim().toUpperCase();
  const meta = parseMeta(product.productData);
  const preventivePublish = meta.preventivePublish || {};
  const validatedCatalog = meta.validatedCatalog || {};
  const profitability = preventivePublish.profitability || {};
  const feeLedger = preventivePublish.feeLedger || {};
  const rejectedSuppliers = Array.isArray(preventivePublish.rejectedSuppliers)
    ? preventivePublish.rejectedSuppliers
    : [];
  const resolvedCountry =
    String(validatedCatalog.validatedCountry || preventivePublish.shipCountry || product.targetCountry || '')
      .trim()
      .toUpperCase() || null;
  const resolvedLanguage =
    String(preventivePublish.resolvedLanguage || preventivePublish.requiredLanguage || '').trim().toLowerCase() ||
    null;
  const resolvedCurrency =
    String(
      validatedCatalog.validatedCurrency ||
        preventivePublish.destinationCurrency ||
        product.currency ||
        ''
    )
      .trim()
      .toUpperCase() || null;
  const candidateMarketplace =
    String(
      validatedCatalog.validatedMarketplace || preventivePublish.marketplace || ''
    ).trim().toLowerCase() || null;

  const blockedReasons = new Set<string>();
  if (!product.aliexpressSku) blockedReasons.add('missingSku');
  if (product.shippingCost == null) blockedReasons.add('missingShipping');
  if (!resolvedCountry) blockedReasons.add('unsupportedCountry');
  if (!resolvedLanguage) blockedReasons.add('unsupportedLanguage');
  if (!resolvedCurrency) blockedReasons.add('unresolvedCurrency');
  if (product.totalCost == null) blockedReasons.add('incompleteFees');
  if (feeLedger?.blockedByFinancialIncompleteness === true) blockedReasons.add('incompleteFees');
  if (Array.isArray(feeLedger?.blockingReasons) && feeLedger.blockingReasons.length > 0) {
    blockedReasons.add('incompleteFees');
  }
  if (!candidateMarketplace && status !== 'LEGACY_UNVERIFIED') blockedReasons.add('invalidMarketplaceContext');
  if (!preventivePublish.selectedSupplier && status !== 'LEGACY_UNVERIFIED') {
    blockedReasons.add('supplierUnavailable');
  }
  for (const rejected of rejectedSuppliers.slice(0, 3)) {
    const reasonCode =
      typeof rejected?.reasonCode === 'string' && rejected.reasonCode.trim()
        ? rejected.reasonCode.trim()
        : null;
    if (reasonCode) blockedReasons.add(reasonCode);
  }
  if (!preventivePublish.policyComplianceReady) blockedReasons.add('policyIncomplete');

  const feeCompleteness =
    typeof feeLedger?.feeCompleteness === 'number'
      ? feeLedger.feeCompleteness
      : status === 'VALIDATED_READY' || status === 'PUBLISHED'
        ? 1
        : 0;
  const projectedMargin =
    typeof feeLedger?.projectedMargin === 'number'
      ? feeLedger.projectedMargin
      : typeof profitability?.marginRatio === 'number'
        ? profitability.marginRatio
        : null;

  let validationState: ProductValidationState;
  if (status === 'LEGACY_UNVERIFIED') validationState = 'LEGACY_UNVERIFIED';
  else if (status === 'VALIDATED_READY') validationState = 'VALIDATED_READY';
  else if (status === 'PUBLISHED') validationState = 'PUBLISHED';
  else if (status === 'REJECTED') validationState = 'REJECTED';
  else if (blockedReasons.size > 0) validationState = 'BLOCKED';
  else if (status === 'PENDING') validationState = 'PENDING';
  else validationState = 'VALIDATION_INCOMPLETE';

  return {
    validationState,
    blockedReasons: Array.from(blockedReasons),
    resolvedCountry,
    resolvedLanguage,
    resolvedCurrency,
    feeCompleteness,
    projectedMargin,
    marketplaceContextSafety: blockedReasons.size === 0 ? 'safe' : 'unsafe',
    candidateMarketplace:
      candidateMarketplace === 'ebay' ||
      candidateMarketplace === 'mercadolibre' ||
      candidateMarketplace === 'amazon'
        ? (candidateMarketplace as MarketplaceName)
        : null,
  };
}
