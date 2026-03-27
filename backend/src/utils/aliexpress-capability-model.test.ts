import {
  buildAliExpressCapabilitySnapshot,
  classifyMlChileStrategicPause,
} from './aliexpress-capability-model';

describe('buildAliExpressCapabilitySnapshot', () => {
  it('marks affiliate and dropshipping capabilities separately', () => {
    const snapshot = buildAliExpressCapabilitySnapshot({
      affiliateAppPresent: true,
      affiliateHasSession: false,
      dropshippingAppPresent: true,
      dropshippingHasSession: true,
    });

    expect(snapshot.affiliateDiscoveryCapability.status).toBe('affiliate_only_capable');
    expect(snapshot.dropshippingProductCapability.status).toBe('dropshipping_capable');
    expect(snapshot.freightQuoteCapability.status).toBe('freight_capable');
  });

  it('marks freight entitlement as externally blocked on invalid app key', () => {
    const snapshot = buildAliExpressCapabilitySnapshot({
      affiliateAppPresent: true,
      affiliateHasSession: false,
      dropshippingAppPresent: true,
      dropshippingHasSession: true,
      freightCompatibility: 'freight_endpoint_incompatible',
      freightLastFailureReason: 'Invalid app Key',
    });

    expect(snapshot.freightQuoteCapability.status).toBe('freight_entitlement_missing');
    expect(snapshot.freightQuoteCapability.readiness).toBe('externally_blocked');
  });

  it('marks ML Chile strategic pause on external freight blocker', () => {
    const snapshot = buildAliExpressCapabilitySnapshot({
      affiliateAppPresent: true,
      affiliateHasSession: false,
      dropshippingAppPresent: true,
      dropshippingHasSession: true,
      freightCompatibility: 'freight_endpoint_incompatible',
      freightLastFailureReason: 'Invalid app Key',
    });

    const pause = classifyMlChileStrategicPause({
      freightCapability: snapshot.freightQuoteCapability,
    });

    expect(pause.state).toBe('paused_on_external_freight_dependency');
  });
});
