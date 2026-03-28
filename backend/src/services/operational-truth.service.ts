import { toNumber } from '../utils/decimal.utils';

export type ListingTruthClass = 'ACTIVE' | 'FAILED_PUBLISH' | 'LEGACY_ARTIFACT' | 'ARCHIVED';

export interface ProductTruthSnapshot {
  status?: string | null;
  isPublished?: boolean | null;
  targetCountry?: string | null;
  aliexpressSku?: string | null;
  shippingCost?: unknown;
  totalCost?: unknown;
  marketplaceListings?: Array<{
    status?: string | null;
    listingId?: string | null;
    publishedAt?: Date | null;
  }> | null;
}

export interface ReconciledProductTruth {
  nextStatus: 'LEGACY_UNVERIFIED' | 'VALIDATED_READY' | 'PUBLISHED';
  nextIsPublished: boolean;
  truthReason: string;
  activeVerifiedListingCount: number;
  hasMachineVerifiableContext: boolean;
}

function shippingCostIsResolved(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = toNumber(value as Parameters<typeof toNumber>[0]);
  return Number.isFinite(n) && n >= 0;
}

function totalCostIsResolved(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = toNumber(value as Parameters<typeof toNumber>[0]);
  return Number.isFinite(n) && n > 0;
}

export function hasMachineVerifiablePublishContext(product: ProductTruthSnapshot): boolean {
  const targetCountry = String(product.targetCountry || '').trim().toUpperCase();
  const aliexpressSku = String(product.aliexpressSku || '').trim();

  return Boolean(
    targetCountry &&
    aliexpressSku &&
    shippingCostIsResolved(product.shippingCost) &&
    totalCostIsResolved(product.totalCost)
  );
}

export function countActiveVerifiedListings(
  listings?: ProductTruthSnapshot['marketplaceListings']
): number {
  if (!Array.isArray(listings)) return 0;
  return listings.filter((listing) => {
    const status = String(listing?.status || '').trim().toLowerCase();
    const listingId = String(listing?.listingId || '').trim();
    return status === 'active' && listingId.length > 0;
  }).length;
}

export function reconcileProductTruth(product: ProductTruthSnapshot): ReconciledProductTruth {
  const activeVerifiedListingCount = countActiveVerifiedListings(product.marketplaceListings);
  const hasContext = hasMachineVerifiablePublishContext(product);

  if (activeVerifiedListingCount > 0 && hasContext) {
    return {
      nextStatus: 'PUBLISHED',
      nextIsPublished: true,
      truthReason: 'verified_active_listing_and_machine_context_present',
      activeVerifiedListingCount,
      hasMachineVerifiableContext: hasContext,
    };
  }

  if (hasContext) {
    return {
      nextStatus: 'VALIDATED_READY',
      nextIsPublished: false,
      truthReason: 'machine_context_present_but_no_verified_active_listing',
      activeVerifiedListingCount,
      hasMachineVerifiableContext: hasContext,
    };
  }

  return {
    nextStatus: 'LEGACY_UNVERIFIED',
    nextIsPublished: false,
    truthReason: 'missing_machine_verifiable_publish_context',
    activeVerifiedListingCount,
    hasMachineVerifiableContext: hasContext,
  };
}

export function classifyListingTruth(params: {
  listingStatus?: string | null;
  productStatus?: string | null;
}): ListingTruthClass {
  const listingStatus = String(params.listingStatus || '').trim().toLowerCase();
  const productStatus = String(params.productStatus || '').trim().toUpperCase();

  if (productStatus === 'LEGACY_UNVERIFIED' || listingStatus === 'archived_legacy_artifact') {
    return 'LEGACY_ARTIFACT';
  }

  if (listingStatus === 'failed_publish') {
    return 'FAILED_PUBLISH';
  }

  if (listingStatus === 'active' && productStatus === 'PUBLISHED') {
    return 'ACTIVE';
  }

  return 'ARCHIVED';
}

export function getListingTruthBreakdown(records: Array<{ status?: string | null; productStatus?: string | null }>): {
  active: number;
  failedPublish: number;
  legacyArtifacts: number;
  archived: number;
} {
  return records.reduce(
    (acc, record) => {
      const truthClass = classifyListingTruth(record);
      if (truthClass === 'ACTIVE') acc.active += 1;
      if (truthClass === 'FAILED_PUBLISH') acc.failedPublish += 1;
      if (truthClass === 'LEGACY_ARTIFACT') acc.legacyArtifacts += 1;
      if (truthClass === 'ARCHIVED') acc.archived += 1;
      return acc;
    },
    { active: 0, failedPublish: 0, legacyArtifacts: 0, archived: 0 }
  );
}
