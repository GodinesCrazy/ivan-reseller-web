export type AliExpressCapabilityKey =
  | 'affiliateDiscoveryCapability'
  | 'dropshippingProductCapability'
  | 'dropshippingOrderCapability'
  | 'freightQuoteCapability';

export type AliExpressAppFamily = 'affiliate' | 'dropshipping' | 'unknown';
export type AliExpressSessionFamily = 'dropshipping_session' | 'none' | 'unknown';
export type AliExpressCapabilityReadiness =
  | 'code_ready'
  | 'runtime_ready'
  | 'externally_blocked'
  | 'not_capable';

export type AliExpressCapabilityStatus =
  | 'affiliate_only_capable'
  | 'dropshipping_capable'
  | 'freight_capable'
  | 'freight_app_session_mismatch'
  | 'freight_entitlement_missing'
  | 'freight_runtime_compatible'
  | 'not_capable';

export interface AliExpressCapabilityDescriptor {
  capability: AliExpressCapabilityKey;
  requiredAppFamily: AliExpressAppFamily;
  requiredSessionFamily: AliExpressSessionFamily;
  readiness: AliExpressCapabilityReadiness;
  status: AliExpressCapabilityStatus;
  exactIncompatibilityState: string | null;
  codeReady: boolean;
  runtimeReady: boolean;
  externallyBlocked: boolean;
}

export interface AliExpressCapabilityInput {
  affiliateAppPresent: boolean;
  affiliateHasSession: boolean;
  dropshippingAppPresent: boolean;
  dropshippingHasSession: boolean;
  freightCompatibility?: string | null;
  freightLastFailureReason?: string | null;
}

function buildCapability(
  descriptor: Omit<AliExpressCapabilityDescriptor, 'runtimeReady' | 'externallyBlocked'>,
): AliExpressCapabilityDescriptor {
  return {
    ...descriptor,
    runtimeReady: descriptor.readiness === 'runtime_ready',
    externallyBlocked: descriptor.readiness === 'externally_blocked',
  };
}

export function buildAliExpressCapabilitySnapshot(
  input: AliExpressCapabilityInput,
): Record<AliExpressCapabilityKey, AliExpressCapabilityDescriptor> {
  const freightCompatibility = String(input.freightCompatibility || '').trim();
  const freightFailureReason = String(input.freightLastFailureReason || '').trim() || null;

  const affiliateDiscoveryCapability = buildCapability({
    capability: 'affiliateDiscoveryCapability',
    requiredAppFamily: 'affiliate',
    requiredSessionFamily: 'none',
    readiness: input.affiliateAppPresent ? 'runtime_ready' : 'not_capable',
    status: input.affiliateAppPresent ? 'affiliate_only_capable' : 'not_capable',
    exactIncompatibilityState: input.affiliateAppPresent ? null : 'affiliate_app_missing',
    codeReady: true,
  });

  const dropshippingProductCapability = buildCapability({
    capability: 'dropshippingProductCapability',
    requiredAppFamily: 'dropshipping',
    requiredSessionFamily: 'dropshipping_session',
    readiness:
      input.dropshippingAppPresent && input.dropshippingHasSession ? 'runtime_ready' : 'not_capable',
    status:
      input.dropshippingAppPresent && input.dropshippingHasSession
        ? 'dropshipping_capable'
        : 'not_capable',
    exactIncompatibilityState:
      input.dropshippingAppPresent && input.dropshippingHasSession
        ? null
        : 'dropshipping_session_missing',
    codeReady: true,
  });

  const dropshippingOrderCapability = buildCapability({
    capability: 'dropshippingOrderCapability',
    requiredAppFamily: 'dropshipping',
    requiredSessionFamily: 'dropshipping_session',
    readiness:
      input.dropshippingAppPresent && input.dropshippingHasSession ? 'code_ready' : 'not_capable',
    status:
      input.dropshippingAppPresent && input.dropshippingHasSession
        ? 'dropshipping_capable'
        : 'not_capable',
    exactIncompatibilityState:
      input.dropshippingAppPresent && input.dropshippingHasSession
        ? null
        : 'dropshipping_session_missing',
    codeReady: true,
  });

  let freightQuoteCapability: AliExpressCapabilityDescriptor;
  if (freightCompatibility === 'freight_quote_found_for_cl' || freightCompatibility === 'freight_endpoint_compatible') {
    freightQuoteCapability = buildCapability({
      capability: 'freightQuoteCapability',
      requiredAppFamily: 'dropshipping',
      requiredSessionFamily: 'dropshipping_session',
      readiness: 'runtime_ready',
      status: 'freight_runtime_compatible',
      exactIncompatibilityState: null,
      codeReady: true,
    });
  } else if (freightCompatibility === 'freight_app_session_mismatch') {
    freightQuoteCapability = buildCapability({
      capability: 'freightQuoteCapability',
      requiredAppFamily: 'dropshipping',
      requiredSessionFamily: 'dropshipping_session',
      readiness: 'not_capable',
      status: 'freight_app_session_mismatch',
      exactIncompatibilityState: freightFailureReason || 'freight_app_session_mismatch',
      codeReady: true,
    });
  } else if (freightCompatibility === 'freight_endpoint_incompatible') {
    freightQuoteCapability = buildCapability({
      capability: 'freightQuoteCapability',
      requiredAppFamily: 'dropshipping',
      requiredSessionFamily: 'dropshipping_session',
      readiness: 'externally_blocked',
      status: 'freight_entitlement_missing',
      exactIncompatibilityState: freightFailureReason || 'freight_endpoint_incompatible',
      codeReady: true,
    });
  } else {
    freightQuoteCapability = buildCapability({
      capability: 'freightQuoteCapability',
      requiredAppFamily: 'dropshipping',
      requiredSessionFamily: 'dropshipping_session',
      readiness:
        input.dropshippingAppPresent && input.dropshippingHasSession ? 'code_ready' : 'not_capable',
      status:
        input.dropshippingAppPresent && input.dropshippingHasSession
          ? 'freight_capable'
          : 'not_capable',
      exactIncompatibilityState:
        input.dropshippingAppPresent && input.dropshippingHasSession
          ? 'freight_runtime_not_verified'
          : 'dropshipping_session_missing',
      codeReady: true,
    });
  }

  return {
    affiliateDiscoveryCapability,
    dropshippingProductCapability,
    dropshippingOrderCapability,
    freightQuoteCapability,
  };
}

export function classifyMlChileStrategicPause(params: {
  freightCapability: AliExpressCapabilityDescriptor;
}): {
  state: 'paused_on_external_freight_dependency' | 'not_paused_on_external_freight_dependency';
  reason: string;
} {
  if (params.freightCapability.readiness === 'externally_blocked') {
    return {
      state: 'paused_on_external_freight_dependency',
      reason:
        params.freightCapability.exactIncompatibilityState ||
        'freight_entitlement_missing_or_incompatible',
    };
  }

  return {
    state: 'not_paused_on_external_freight_dependency',
    reason: 'freight_capability_not_externally_blocked',
  };
}
