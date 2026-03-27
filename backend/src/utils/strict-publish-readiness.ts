export interface StrictPublishCandidate {
  status?: string | null;
  isPublished?: boolean | null;
  targetCountry?: string | null;
  shippingCost?: unknown;
  importTax?: unknown;
  totalCost?: unknown;
  aliexpressSku?: string | null;
}

function hasScalarValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function getStrictPublishReadinessBlockers(product: StrictPublishCandidate): string[] {
  const blockers: string[] = [];
  const status = String(product.status || '').trim().toUpperCase();

  if (status !== 'VALIDATED_READY') {
    blockers.push('status_not_validated_ready');
  }

  if (product.isPublished === true) {
    blockers.push('already_published');
  }

  if (!hasScalarValue(product.targetCountry)) {
    blockers.push('missing_target_country');
  }

  if (!hasScalarValue(product.shippingCost)) {
    blockers.push('missing_shipping_cost');
  }

  if (!hasScalarValue(product.importTax)) {
    blockers.push('missing_import_tax');
  }

  if (!hasScalarValue(product.totalCost)) {
    blockers.push('missing_total_cost');
  }

  if (!hasScalarValue(product.aliexpressSku)) {
    blockers.push('missing_aliexpress_sku');
  }

  return blockers;
}

export function isStrictPublishReady(product: StrictPublishCandidate): boolean {
  return getStrictPublishReadinessBlockers(product).length === 0;
}
