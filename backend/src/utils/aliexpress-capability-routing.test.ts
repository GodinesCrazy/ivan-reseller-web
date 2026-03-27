import { resolveAliExpressCapabilityRoute } from './aliexpress-capability-routing';

describe('resolveAliExpressCapabilityRoute', () => {
  it('routes affiliate discovery only to the affiliate app family', () => {
    const route = resolveAliExpressCapabilityRoute('affiliateDiscoveryCapability', {
      affiliateAppPresent: true,
      affiliateHasSession: false,
      dropshippingAppPresent: true,
      dropshippingHasSession: true,
    });

    expect(route.appFamily).toBe('affiliate');
    expect(route.sessionFamily).toBe('none');
    expect(route.valid).toBe(true);
  });

  it('routes freight only to the dropshipping session family', () => {
    const route = resolveAliExpressCapabilityRoute('freightQuoteCapability', {
      affiliateAppPresent: true,
      affiliateHasSession: false,
      dropshippingAppPresent: true,
      dropshippingHasSession: true,
    });

    expect(route.appFamily).toBe('dropshipping');
    expect(route.sessionFamily).toBe('dropshipping_session');
    expect(route.valid).toBe(true);
  });

  it('blocks freight when dropshipping session is missing', () => {
    const route = resolveAliExpressCapabilityRoute('freightQuoteCapability', {
      affiliateAppPresent: true,
      affiliateHasSession: false,
      dropshippingAppPresent: true,
      dropshippingHasSession: false,
    });

    expect(route.valid).toBe(false);
    expect(route.reason).toBe('freight_requires_dropshipping_session');
  });
});
