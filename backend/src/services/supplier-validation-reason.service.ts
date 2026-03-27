export type SupplierValidationReasonCode =
  | 'no_stock_for_destination'
  | 'no_shipping_for_destination'
  | 'no_supplier_sku'
  | 'supplier_data_incomplete'
  | 'fee_incomplete'
  | 'margin_invalid'
  | 'unsupported_policy_context'
  | 'unsupported_language'
  | 'invalid_currency_context'
  | 'marketplace_context_invalid'
  | 'supplier_unavailable'
  | 'connector_not_ready'
  | 'webhook_proof_insufficient'
  | 'unknown';

export function classifySupplierValidationReason(reason: string | null | undefined): SupplierValidationReasonCode {
  const normalized = String(reason || '')
    .trim()
    .toLowerCase();

  if (!normalized) return 'unknown';

  if (
    normalized.includes('no aliexpress sku with stock > 0') ||
    normalized.includes('has no stock')
  ) {
    return 'no_stock_for_destination';
  }

  if (
    normalized.includes('sku "') && normalized.includes('not found') ||
    normalized.includes('could not parse original aliexpress product id') ||
    normalized.includes('sku_not_exist')
  ) {
    return 'no_supplier_sku';
  }

  if (
    normalized.includes('shipping cost') ||
    normalized.includes('could not determine shipping') ||
    normalized.includes('no shipping')
  ) {
    return 'no_shipping_for_destination';
  }

  if (
    normalized.includes('financial completeness') ||
    normalized.includes('fee completeness') ||
    normalized.includes('incomplete fee') ||
    normalized.includes('blockingreasons')
  ) {
    return 'fee_incomplete';
  }

  if (
    normalized.includes('margin') ||
    normalized.includes('profit') ||
    normalized.includes('below minimum')
  ) {
    return 'margin_invalid';
  }

  if (normalized.includes('language')) {
    return 'unsupported_language';
  }

  if (normalized.includes('currency')) {
    return 'invalid_currency_context';
  }

  if (normalized.includes('policy')) {
    return 'unsupported_policy_context';
  }

  if (
    normalized.includes('marketplace context') ||
    normalized.includes('marketplace destination') ||
    normalized.includes('target country') ||
    normalized.includes('destination country/currency')
  ) {
    return 'marketplace_context_invalid';
  }

  if (
    normalized.includes('oauth') ||
    normalized.includes('credentials not ready') ||
    normalized.includes('credentials not found') ||
    normalized.includes('token')
  ) {
    return 'connector_not_ready';
  }

  if (normalized.includes('webhook')) {
    return 'webhook_proof_insufficient';
  }

  if (
    normalized.includes('invalid supplier price') ||
    normalized.includes('supplier validation failed') ||
    normalized.includes('alternative supplier search failed') ||
    normalized.includes('api error') ||
    normalized.includes('not configured') ||
    normalized.includes('missing app credentials')
  ) {
    return 'supplier_data_incomplete';
  }

  if (
    normalized.includes('supplier unavailable') ||
    normalized.includes('no candidate found')
  ) {
    return 'supplier_unavailable';
  }

  return 'unknown';
}

export function summarizeSupplierValidationReasons(
  reasons: Array<string | null | undefined>
): Record<SupplierValidationReasonCode, number> {
  const summary = {} as Record<SupplierValidationReasonCode, number>;
  const knownCodes = new Set<SupplierValidationReasonCode>([
    'no_stock_for_destination',
    'no_shipping_for_destination',
    'no_supplier_sku',
    'supplier_data_incomplete',
    'fee_incomplete',
    'margin_invalid',
    'unsupported_policy_context',
    'unsupported_language',
    'invalid_currency_context',
    'marketplace_context_invalid',
    'supplier_unavailable',
    'connector_not_ready',
    'webhook_proof_insufficient',
    'unknown',
  ]);
  for (const reason of reasons) {
    const raw = String(reason || '').trim() as SupplierValidationReasonCode;
    const code = knownCodes.has(raw) ? raw : classifySupplierValidationReason(reason);
    summary[code] = (summary[code] || 0) + 1;
  }
  return summary;
}
