import type {
  AliExpressAppFamily,
  AliExpressCapabilityKey,
  AliExpressSessionFamily,
} from './aliexpress-capability-model';

export interface AliExpressCapabilityRouteInput {
  affiliateAppPresent: boolean;
  affiliateHasSession: boolean;
  dropshippingAppPresent: boolean;
  dropshippingHasSession: boolean;
}

export interface AliExpressCapabilityRoute {
  capability: AliExpressCapabilityKey;
  appFamily: AliExpressAppFamily;
  sessionFamily: AliExpressSessionFamily;
  valid: boolean;
  reason: string | null;
}

export function resolveAliExpressCapabilityRoute(
  capability: AliExpressCapabilityKey,
  input: AliExpressCapabilityRouteInput,
): AliExpressCapabilityRoute {
  if (capability === 'affiliateDiscoveryCapability') {
    return {
      capability,
      appFamily: 'affiliate',
      sessionFamily: 'none',
      valid: input.affiliateAppPresent,
      reason: input.affiliateAppPresent ? null : 'affiliate_app_missing',
    };
  }

  if (capability === 'dropshippingProductCapability' || capability === 'dropshippingOrderCapability') {
    return {
      capability,
      appFamily: 'dropshipping',
      sessionFamily: 'dropshipping_session',
      valid: input.dropshippingAppPresent && input.dropshippingHasSession,
      reason:
        input.dropshippingAppPresent && input.dropshippingHasSession
          ? null
          : 'dropshipping_session_missing',
    };
  }

  return {
    capability,
    appFamily: 'dropshipping',
    sessionFamily: 'dropshipping_session',
    valid: input.dropshippingAppPresent && input.dropshippingHasSession,
    reason:
      input.dropshippingAppPresent && input.dropshippingHasSession
        ? null
        : 'freight_requires_dropshipping_session',
  };
}
