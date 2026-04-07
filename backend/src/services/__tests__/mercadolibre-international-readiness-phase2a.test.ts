import { evaluateMercadoLibreInternationalReadiness } from '../mercadolibre-publish-preflight.service';

function baseInput(
  overrides: Partial<Parameters<typeof evaluateMercadoLibreInternationalReadiness>[0]> = {}
): Parameters<typeof evaluateMercadoLibreInternationalReadiness>[0] {
  return {
    requestedMode: 'international',
    configuredChannelMode: 'foreign_seller_enabled',
    foreignSellerEnabled: true,
    internationalPublishingEnabled: true,
    returnAddressConfigured: true,
    returnPolicyConfigured: true,
    postSaleContactConfigured: true,
    responseSlaEnabled: true,
    alertsConfigured: true,
    shippingOriginCountry: 'CN',
    sellerOriginCountry: 'CN',
    publishQueueRequired: true,
    publishQueueReady: true,
    webhookQueueRequired: true,
    webhookQueueReady: true,
    redisAvailable: true,
    eventFlowReady: true,
    operationMode: 'automation_ready',
    siteId: 'MLC',
    unsafePollingForced: false,
    categoryFingerprint: 'accessories',
    productData: {
      compliance: {
        certificate: 'ce',
        manufacturer: 'demo-manufacturer',
      },
    },
    ...overrides,
  };
}

describe('MercadoLibre international readiness (Phase 2B)', () => {
  it('blocks international mode for local_only capability', () => {
    const result = evaluateMercadoLibreInternationalReadiness(
      baseInput({
        configuredChannelMode: 'local_only',
        foreignSellerEnabled: false,
        internationalPublishingEnabled: false,
      })
    );

    expect(result.modeResolved).toBe('international');
    expect(result.channelCapability).toBe('local_only');
    expect(result.readiness.allowed).toBe(false);
    expect(result.readiness.blockers).toContain('international_capability:local_only_account');
  });

  it('allows international when capability + compliance + returns + communication are ready', () => {
    const result = evaluateMercadoLibreInternationalReadiness(baseInput());

    expect(result.channelCapability).toBe('foreign_seller_enabled');
    expect(result.readiness.allowed).toBe(true);
    expect(result.readiness.blockers).toHaveLength(0);
    expect(result.readiness.complianceReadiness.status).toBe('pass');
    expect(result.readiness.returnsReadiness.status).toBe('ready');
    expect(result.readiness.communicationReadiness.communicationReady).toBe(true);
  });

  it('adds explicit blocker when return readiness is missing', () => {
    const result = evaluateMercadoLibreInternationalReadiness(
      baseInput({
        returnPolicyConfigured: false,
      })
    );

    expect(result.readiness.allowed).toBe(false);
    expect(result.readiness.blockers).toContain(
      'international_returns:missing_return_policy_config'
    );
    expect(result.readiness.returnsReadiness.status).toBe('missing_return_policy_config');
  });

  it('blocks international when communication readiness is missing', () => {
    const result = evaluateMercadoLibreInternationalReadiness(
      baseInput({
        postSaleContactConfigured: false,
      })
    );

    expect(result.readiness.allowed).toBe(false);
    expect(result.readiness.blockers).toContain(
      'international_communication:missing_post_sale_contact'
    );
    expect(result.readiness.communicationReadiness.communicationReady).toBe(false);
  });

  it('blocks international for restricted category compliance', () => {
    const result = evaluateMercadoLibreInternationalReadiness(
      baseInput({
        categoryFingerprint: 'weapon tactical accessory',
      })
    );

    expect(result.readiness.allowed).toBe(false);
    expect(result.readiness.complianceReadiness.status).toBe('blocked');
    expect(result.readiness.blockers).toContain('international_compliance:restricted_category');
  });

  it('marks review_required for homologation risk when regulatory data exists', () => {
    const result = evaluateMercadoLibreInternationalReadiness(
      baseInput({
        categoryFingerprint: 'wireless battery charger',
        productData: {
          compliance: {
            certificate: 'homologado',
            regulator: 'sec',
          },
        },
      })
    );

    expect(result.readiness.allowed).toBe(false);
    expect(result.readiness.complianceReadiness.status).toBe('review_required');
    expect(result.readiness.blockers).toContain('international_compliance:review_required');
    expect(result.readiness.blockers).toContain('international_compliance:homologation_required');
  });

  it('keeps local mode isolated from international-only readiness blockers', () => {
    const result = evaluateMercadoLibreInternationalReadiness(
      baseInput({
        requestedMode: 'local',
        returnPolicyConfigured: false,
        postSaleContactConfigured: false,
        responseSlaEnabled: false,
        alertsConfigured: false,
      })
    );

    expect(result.modeResolved).toBe('local');
    expect(result.readiness.allowed).toBe(true);
    expect(result.readiness.returnsReadiness.status).toBe('not_required_for_local');
    expect(result.readiness.communicationReadiness.communicationReady).toBe(true);
  });
});
