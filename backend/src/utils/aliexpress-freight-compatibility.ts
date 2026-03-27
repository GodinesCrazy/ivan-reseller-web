export type AliExpressFreightAppFamily = 'affiliate' | 'dropshipping' | 'unknown';
export type AliExpressFreightTokenFamily = 'dropshipping_session' | 'none' | 'unknown';
export type AliExpressFreightCompatibility =
  | 'freight_endpoint_compatible'
  | 'freight_endpoint_incompatible'
  | 'freight_app_session_mismatch'
  | 'freight_method_present_signature_blocked'
  | 'freight_secret_mismatch_suspected'
  | 'freight_binding_mismatch_suspected'
  | 'freight_quote_missing_for_cl'
  | 'freight_quote_found_for_cl';

export interface AliExpressFreightCredentialShape {
  appFamily: AliExpressFreightAppFamily;
  tokenFamily: AliExpressFreightTokenFamily;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  accountInfoUsable?: boolean;
  freightOptionsCount?: number;
  lastFailureReason?: string | null;
  aliCode?: string | number | null;
  aliSubCode?: string | null;
  secretConsistency?: 'secret_consistent' | 'secret_suspect' | 'unknown';
  sessionBindingConsistency?: 'session_binding_consistent' | 'session_binding_suspect' | 'unknown';
}

export interface AliExpressFreightCompatibilityResult {
  freightAppFamily: AliExpressFreightAppFamily;
  freightTokenFamily: AliExpressFreightTokenFamily;
  freightCredentialCompatibility: AliExpressFreightCompatibility;
  freightLastFailureReason: string | null;
}

export function classifyAliExpressFreightCompatibility(
  shape: AliExpressFreightCredentialShape,
): AliExpressFreightCompatibilityResult {
  const aliSubCode = String(shape.aliSubCode || '').trim().toLowerCase();
  const lastFailureReason = String(shape.lastFailureReason || '').trim() || null;

  if ((shape.freightOptionsCount || 0) > 0) {
    return {
      freightAppFamily: shape.appFamily,
      freightTokenFamily: shape.tokenFamily,
      freightCredentialCompatibility: 'freight_quote_found_for_cl',
      freightLastFailureReason: null,
    };
  }

  if (!shape.hasAccessToken || shape.tokenFamily === 'none') {
    return {
      freightAppFamily: shape.appFamily,
      freightTokenFamily: shape.tokenFamily,
      freightCredentialCompatibility: 'freight_endpoint_incompatible',
      freightLastFailureReason: lastFailureReason || 'missing_session_for_freight_call',
    };
  }

  if (
    aliSubCode === 'isv.appkey-not-exists' ||
    /invalid app key/i.test(lastFailureReason || '')
  ) {
    return {
      freightAppFamily: shape.appFamily,
      freightTokenFamily: shape.tokenFamily,
      freightCredentialCompatibility:
        shape.appFamily === 'affiliate'
          ? 'freight_app_session_mismatch'
          : 'freight_endpoint_incompatible',
      freightLastFailureReason: lastFailureReason || 'invalid_app_key',
    };
  }

  if (
    /invalid session|session expired|access token expired|oauth/i.test(lastFailureReason || '')
  ) {
    return {
      freightAppFamily: shape.appFamily,
      freightTokenFamily: shape.tokenFamily,
      freightCredentialCompatibility: 'freight_binding_mismatch_suspected',
      freightLastFailureReason: lastFailureReason || 'session_invalid_for_freight',
    };
  }

  if (shape.accountInfoUsable === false) {
    return {
      freightAppFamily: shape.appFamily,
      freightTokenFamily: shape.tokenFamily,
      freightCredentialCompatibility: 'freight_binding_mismatch_suspected',
      freightLastFailureReason: lastFailureReason || 'account_session_unusable',
    };
  }

  if (/incompletesignature|signature/i.test(lastFailureReason || '')) {
    const freightCredentialCompatibility =
      shape.secretConsistency === 'secret_suspect'
        ? 'freight_secret_mismatch_suspected'
        : shape.sessionBindingConsistency === 'session_binding_suspect'
          ? 'freight_binding_mismatch_suspected'
          : 'freight_method_present_signature_blocked';
    return {
      freightAppFamily: shape.appFamily,
      freightTokenFamily: shape.tokenFamily,
      freightCredentialCompatibility,
      freightLastFailureReason: lastFailureReason || 'incomplete_signature',
    };
  }

  return {
    freightAppFamily: shape.appFamily,
    freightTokenFamily: shape.tokenFamily,
    freightCredentialCompatibility: 'freight_quote_missing_for_cl',
    freightLastFailureReason: lastFailureReason,
  };
}
