import { getStrictPublishReadinessBlockers, type StrictPublishCandidate } from './strict-publish-readiness';

export type MlChileBlockerCode =
  | 'missing_target_country'
  | 'target_country_not_cl'
  | 'missing_shipping_cost'
  | 'missing_import_tax'
  | 'missing_total_cost'
  | 'missing_aliexpress_sku'
  | 'status_not_validated_ready'
  | 'margin_invalid'
  | 'auth_blocked'
  | 'marketplace_context_invalid';

export interface MlChileCandidateIssueShape extends StrictPublishCandidate {
  id: number;
  productData?: string | null;
}

export interface MlChileIssueQueues {
  authBlocked: number[];
  oauthReauthRequired: number[];
  freightEndpointCompatible: number[];
  freightEndpointIncompatible: number[];
  freightAppSessionMismatch: number[];
  freightMethodPresentSignatureBlocked: number[];
  freightSecretMismatchSuspected: number[];
  freightBindingMismatchSuspected: number[];
  freightPlatformEntitlementRequired: number[];
  freightCodeSideRecoveryExhausted: number[];
  freightFallbackPathUnavailable: number[];
  freightQuoteFoundForCl: number[];
  freightQuoteMissingForCl: number[];
  selectedShippingServicePersisted: number[];
  missingTargetCountryCl: number[];
  missingShippingCost: number[];
  missingShippingCostTrueSupplierSide: number[];
  missingImportTax: number[];
  missingImportTaxAfterFreight: number[];
  missingTotalCost: number[];
  missingTotalCostAfterFreight: number[];
  missingAliExpressSku: number[];
  likelyRutRequiredForSupplierCheckout: number[];
  nearValid: number[];
  nearValidWaitingOnExternalPlatformFix: number[];
}

function parseProductData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getMlChilePreSaleBlockers(
  candidate: StrictPublishCandidate,
  extra: {
    authBlocked?: boolean;
    marketplaceContextInvalid?: boolean;
    marginInvalid?: boolean;
  } = {},
): MlChileBlockerCode[] {
  const blockers = new Set<MlChileBlockerCode>();
  const strictBlockers = getStrictPublishReadinessBlockers(candidate);
  const targetCountry = String(candidate.targetCountry || '').trim().toUpperCase();

  for (const blocker of strictBlockers) {
    if (blocker === 'missing_target_country') blockers.add('missing_target_country');
    if (blocker === 'missing_shipping_cost') blockers.add('missing_shipping_cost');
    if (blocker === 'missing_import_tax') blockers.add('missing_import_tax');
    if (blocker === 'missing_total_cost') blockers.add('missing_total_cost');
    if (blocker === 'missing_aliexpress_sku') blockers.add('missing_aliexpress_sku');
    if (blocker === 'status_not_validated_ready') blockers.add('status_not_validated_ready');
  }

  if (targetCountry && targetCountry !== 'CL') blockers.add('target_country_not_cl');
  if (!targetCountry) blockers.add('missing_target_country');
  if (extra.marginInvalid) blockers.add('margin_invalid');
  if (extra.authBlocked) blockers.add('auth_blocked');
  if (extra.marketplaceContextInvalid) blockers.add('marketplace_context_invalid');

  return Array.from(blockers);
}

export function buildMlChileIssueQueues(
  candidates: MlChileCandidateIssueShape[],
  extras: Record<
    number,
    {
      authBlocked?: boolean;
      oauthReauthRequired?: boolean;
      marketplaceContextInvalid?: boolean;
      marginInvalid?: boolean;
    }
  > = {},
): MlChileIssueQueues {
  const queues: MlChileIssueQueues = {
    authBlocked: [],
    oauthReauthRequired: [],
    freightEndpointCompatible: [],
    freightEndpointIncompatible: [],
    freightAppSessionMismatch: [],
    freightMethodPresentSignatureBlocked: [],
    freightSecretMismatchSuspected: [],
    freightBindingMismatchSuspected: [],
    freightPlatformEntitlementRequired: [],
    freightCodeSideRecoveryExhausted: [],
    freightFallbackPathUnavailable: [],
    freightQuoteFoundForCl: [],
    freightQuoteMissingForCl: [],
    selectedShippingServicePersisted: [],
    missingTargetCountryCl: [],
    missingShippingCost: [],
    missingShippingCostTrueSupplierSide: [],
    missingImportTax: [],
    missingImportTaxAfterFreight: [],
    missingTotalCost: [],
    missingTotalCostAfterFreight: [],
    missingAliExpressSku: [],
    likelyRutRequiredForSupplierCheckout: [],
    nearValid: [],
    nearValidWaitingOnExternalPlatformFix: [],
  };

  for (const candidate of candidates) {
    const blockers = getMlChilePreSaleBlockers(candidate, extras[candidate.id]);
    const productData = parseProductData(candidate.productData);
    const freightMeta =
      productData.mlChileFreight && typeof productData.mlChileFreight === 'object'
        ? (productData.mlChileFreight as Record<string, unknown>)
        : {};
    const freightCompatibilityMeta =
      productData.mlChileFreightCompatibility && typeof productData.mlChileFreightCompatibility === 'object'
        ? (productData.mlChileFreightCompatibility as Record<string, unknown>)
        : {};
    const landedCostMeta =
      productData.mlChileLandedCost && typeof productData.mlChileLandedCost === 'object'
        ? (productData.mlChileLandedCost as Record<string, unknown>)
        : {};
    const rutMeta =
      productData.mlChileRutReadiness && typeof productData.mlChileRutReadiness === 'object'
        ? (productData.mlChileRutReadiness as Record<string, unknown>)
        : {};
    const strategicPauseMeta =
      productData.mlChileStrategicPause && typeof productData.mlChileStrategicPause === 'object'
        ? (productData.mlChileStrategicPause as Record<string, unknown>)
        : {};

    if (blockers.includes('auth_blocked')) queues.authBlocked.push(candidate.id);
    if (extras[candidate.id]?.oauthReauthRequired) queues.oauthReauthRequired.push(candidate.id);
    if (String(freightCompatibilityMeta.freightCredentialCompatibility || '').trim() === 'freight_endpoint_compatible') {
      queues.freightEndpointCompatible.push(candidate.id);
    }
    if (String(freightCompatibilityMeta.freightCredentialCompatibility || '').trim() === 'freight_endpoint_incompatible') {
      queues.freightEndpointIncompatible.push(candidate.id);
    }
    if (String(freightCompatibilityMeta.freightCredentialCompatibility || '').trim() === 'freight_app_session_mismatch') {
      queues.freightAppSessionMismatch.push(candidate.id);
    }
    if (
      String(freightCompatibilityMeta.freightCredentialCompatibility || '').trim() ===
      'freight_method_present_signature_blocked'
    ) {
      queues.freightMethodPresentSignatureBlocked.push(candidate.id);
    }
    if (
      String(freightCompatibilityMeta.freightCredentialCompatibility || '').trim() ===
      'freight_secret_mismatch_suspected'
    ) {
      queues.freightSecretMismatchSuspected.push(candidate.id);
    }
    if (
      String(freightCompatibilityMeta.freightCredentialCompatibility || '').trim() ===
      'freight_binding_mismatch_suspected'
    ) {
      queues.freightBindingMismatchSuspected.push(candidate.id);
    }
    if (
      String(freightCompatibilityMeta.freightCredentialCompatibility || '').trim() ===
      'freight_endpoint_incompatible'
    ) {
      queues.freightPlatformEntitlementRequired.push(candidate.id);
      queues.freightCodeSideRecoveryExhausted.push(candidate.id);
      queues.freightFallbackPathUnavailable.push(candidate.id);
    }
    if (String(freightMeta.freightSummaryCode || '').trim() === 'freight_quote_found_for_cl') {
      queues.freightQuoteFoundForCl.push(candidate.id);
    }
    if (String(freightMeta.freightSummaryCode || '').trim() === 'freight_quote_missing_for_cl') {
      queues.freightQuoteMissingForCl.push(candidate.id);
    }
    if (String(freightMeta.selectedServiceName || '').trim()) {
      queues.selectedShippingServicePersisted.push(candidate.id);
    }
    if (blockers.includes('missing_target_country') || blockers.includes('target_country_not_cl')) {
      queues.missingTargetCountryCl.push(candidate.id);
    }
    if (blockers.includes('missing_shipping_cost')) queues.missingShippingCost.push(candidate.id);
    if (
      blockers.includes('missing_shipping_cost') &&
      String(freightMeta.freightSummaryCode || '').trim() === 'freight_quote_missing_for_cl'
    ) {
      queues.missingShippingCostTrueSupplierSide.push(candidate.id);
    }
    if (blockers.includes('missing_import_tax')) queues.missingImportTax.push(candidate.id);
    if (
      blockers.includes('missing_import_tax') &&
      String(landedCostMeta.landedCostCompleteness || '').trim() === 'complete'
    ) {
      queues.missingImportTaxAfterFreight.push(candidate.id);
    }
    if (blockers.includes('missing_total_cost')) queues.missingTotalCost.push(candidate.id);
    if (
      blockers.includes('missing_total_cost') &&
      String(landedCostMeta.landedCostCompleteness || '').trim() === 'complete'
    ) {
      queues.missingTotalCostAfterFreight.push(candidate.id);
    }
    if (blockers.includes('missing_aliexpress_sku')) queues.missingAliExpressSku.push(candidate.id);
    if (String(rutMeta.classification || '').trim() === 'absent_but_likely_required') {
      queues.likelyRutRequiredForSupplierCheckout.push(candidate.id);
    }
    if (blockers.length === 1) queues.nearValid.push(candidate.id);
    if (
      String(strategicPauseMeta.state || '').trim() === 'paused_on_external_freight_dependency' &&
      blockers.includes('missing_shipping_cost')
    ) {
      queues.nearValidWaitingOnExternalPlatformFix.push(candidate.id);
    }
  }

  return queues;
}
