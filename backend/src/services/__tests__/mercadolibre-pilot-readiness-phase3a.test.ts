import {
  evaluateMercadoLibreInternationalReadiness,
  evaluateMercadoLibreProgramVerification,
  evaluateMercadoLibrePilotReadiness,
} from '../mercadolibre-publish-preflight.service';

function baseInternationalInput(
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
        certificate: 'ok',
        manufacturer: 'demo',
      },
    },
    ...overrides,
  };
}

function baseProgramVerification(
  overrides: Partial<Parameters<typeof evaluateMercadoLibreProgramVerification>[0]> = {}
): ReturnType<typeof evaluateMercadoLibreProgramVerification> {
  return evaluateMercadoLibreProgramVerification({
    requestedMode: 'international',
    configuredChannelMode: 'foreign_seller_enabled',
    foreignSellerEnabled: true,
    internationalPublishingEnabled: true,
    manualProgramVerificationOverride: null,
    credentialsPresent: true,
    credentialsActive: true,
    credentialsScope: 'user',
    credentialsSiteId: 'MLC',
    environmentResolved: 'production',
    externalVerificationOk: true,
    externalVerificationError: null,
    profile: {
      id: 10,
      nickname: 'pilot-seller',
      site_id: 'MLC',
      seller_experience: 'professional',
      tags: ['cross_border_seller'],
      status: { buy: 'allowed', sell: 'allowed' },
    },
    ...overrides,
  });
}

describe('MercadoLibre program verification + pilot readiness (Phase 3A)', () => {
  it('resolves blocked when external/config state is inconsistent and channel is blocked', () => {
    const verification = evaluateMercadoLibreProgramVerification({
      requestedMode: 'international',
      configuredChannelMode: 'blocked',
      foreignSellerEnabled: false,
      internationalPublishingEnabled: false,
      manualProgramVerificationOverride: null,
      credentialsPresent: true,
      credentialsActive: true,
      credentialsScope: 'user',
      credentialsSiteId: 'MLC',
      environmentResolved: 'production',
      externalVerificationOk: false,
      externalVerificationError: 'unauthorized',
      profile: null,
    });

    expect(verification.programResolved).toBe('blocked');
    expect(verification.verified).toBe(false);
    expect(verification.verificationBlockers).toContain(
      'program_verification:external_account_verification_failed'
    );
  });

  it('blocks pilot international when account is verified as local_only', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(
      baseInternationalInput({
        configuredChannelMode: 'local_only',
        foreignSellerEnabled: false,
        internationalPublishingEnabled: false,
      })
    );
    const verification = baseProgramVerification({
      configuredChannelMode: 'local_only',
      foreignSellerEnabled: false,
      internationalPublishingEnabled: false,
      profile: {
        id: 11,
        nickname: 'local-seller',
        site_id: 'MLC',
        seller_experience: 'professional',
        tags: ['local'],
      },
    });

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: 'apr-local-only',
      approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      approvalValid: true,
      approvalExpired: false,
      categoryKeyResolved: 'accessories',
      categoryAllowlisted: true,
      categoryAllowlistNotes: null,
      abortControlState: 'ready',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 0,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(verification.programResolved).toBe('local');
    expect(pilot.pilotAllowed).toBe(false);
    expect(pilot.blockers).toContain('pilot_program:international_not_permitted:local');
  });

  it('allows pilot international when foreign_seller is externally verified and readiness is complete', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(baseInternationalInput());
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: 'apr-verified',
      approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      approvalValid: true,
      approvalExpired: false,
      categoryKeyResolved: 'accessories',
      categoryAllowlisted: true,
      categoryAllowlistNotes: null,
      abortControlState: 'ready',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 0,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(verification.programResolved).toBe('foreign_seller_verified');
    expect(intl.readiness.allowed).toBe(true);
    expect(pilot.pilotAllowed).toBe(true);
  });

  it('blocks pilot when blast radius limit is exceeded', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(baseInternationalInput());
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: 'apr-blast-radius',
      approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      approvalValid: true,
      approvalExpired: false,
      categoryKeyResolved: 'accessories',
      categoryAllowlisted: true,
      categoryAllowlistNotes: null,
      abortControlState: 'ready',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 1,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(pilot.pilotAllowed).toBe(false);
    expect(
      pilot.blockers.some((b) => b.startsWith('pilot_blast_radius:max_active_publications_reached'))
    ).toBe(true);
  });

  it('blocks pilot when compliance status is review_required', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(
      baseInternationalInput({
        categoryFingerprint: 'wireless battery charger',
        productData: {
          compliance: {
            certificate: 'homologado',
            regulator: 'sec',
          },
        },
      })
    );
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: 'apr-compliance',
      approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      approvalValid: true,
      approvalExpired: false,
      categoryKeyResolved: 'wireless_battery_charger',
      categoryAllowlisted: true,
      categoryAllowlistNotes: null,
      abortControlState: 'ready',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 0,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(intl.readiness.complianceReadiness.status).toBe('review_required');
    expect(pilot.pilotAllowed).toBe(false);
    expect(pilot.blockers).toContain('pilot_compliance:requires_pass_status:review_required');
  });

  it('keeps local production flow unaffected by pilot-only controls', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(
      baseInternationalInput({
        requestedMode: 'local',
        configuredChannelMode: 'local_only',
        foreignSellerEnabled: false,
        internationalPublishingEnabled: false,
      })
    );
    const verification = evaluateMercadoLibreProgramVerification({
      requestedMode: 'local',
      configuredChannelMode: 'local_only',
      foreignSellerEnabled: false,
      internationalPublishingEnabled: false,
      manualProgramVerificationOverride: null,
      credentialsPresent: true,
      credentialsActive: true,
      credentialsScope: 'user',
      credentialsSiteId: 'MLC',
      environmentResolved: 'production',
      externalVerificationOk: true,
      externalVerificationError: null,
      profile: {
        id: 12,
        nickname: 'local',
        site_id: 'MLC',
        seller_experience: 'professional',
        tags: ['local'],
      },
    });

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'production',
      requestedMode: 'local',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: false,
      approvalId: null,
      approvalExpiresAt: null,
      approvalValid: false,
      approvalExpired: false,
      categoryKeyResolved: null,
      categoryAllowlisted: false,
      categoryAllowlistNotes: null,
      abortControlState: 'ready',
      pilotModeEnabled: false,
      pilotRequireManualAck: true,
      pilotManualAckProvided: false,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 10,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(pilot.pilotAllowed).toBe(true);
    expect(verification.programResolved).toBe('local');
  });

  it('blocks pilot international when persistent approval is missing', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(baseInternationalInput());
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: null,
      approvalExpiresAt: null,
      approvalValid: false,
      approvalExpired: false,
      categoryKeyResolved: 'accessories',
      categoryAllowlisted: true,
      categoryAllowlistNotes: null,
      abortControlState: 'ready',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 0,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(pilot.pilotAllowed).toBe(false);
    expect(pilot.blockers).toContain('pilot_approval:missing_valid_approval');
  });

  it('blocks pilot international when approval is expired', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(baseInternationalInput());
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: 'apr-expired',
      approvalExpiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      approvalValid: false,
      approvalExpired: true,
      categoryKeyResolved: 'accessories',
      categoryAllowlisted: true,
      categoryAllowlistNotes: null,
      abortControlState: 'ready',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 0,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(pilot.pilotAllowed).toBe(false);
    expect(pilot.blockers).toContain('pilot_approval:approval_expired');
  });

  it('blocks pilot international when category is not in allowlist', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(baseInternationalInput());
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: 'apr-allowlist',
      approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      approvalValid: true,
      approvalExpired: false,
      categoryKeyResolved: 'restricted_demo',
      categoryAllowlisted: false,
      categoryAllowlistNotes: 'blocked category',
      abortControlState: 'ready',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 0,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(pilot.pilotAllowed).toBe(false);
    expect(pilot.blockers).toContain('pilot_allowlist:category_not_allowed:restricted_demo');
  });

  it('dry_run does not require persistent approval and never blocks publication path', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(baseInternationalInput());
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'dry_run',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: null,
      approvalExpiresAt: null,
      approvalValid: false,
      approvalExpired: false,
      categoryKeyResolved: null,
      categoryAllowlisted: false,
      categoryAllowlistNotes: null,
      abortControlState: 'aborted',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: false,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 1,
      workersReady: false,
      redisAvailable: false,
      eventFlowReady: false,
      environmentResolved: 'production',
    });

    expect(pilot.pilotModeResolved).toBe('dry_run');
    expect(pilot.pilotAllowed).toBe(true);
    expect(pilot.blockers).toHaveLength(0);
  });

  it('blocks pilot when control state is aborted or rollback requested', () => {
    const intl = evaluateMercadoLibreInternationalReadiness(baseInternationalInput());
    const verification = baseProgramVerification();

    const pilot = evaluateMercadoLibrePilotReadiness({
      publishIntent: 'pilot',
      requestedMode: 'international',
      programVerification: verification,
      internationalReadiness: intl.readiness,
      approvalRequired: true,
      approvalId: 'apr-control-state',
      approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      approvalValid: true,
      approvalExpired: false,
      categoryKeyResolved: 'accessories',
      categoryAllowlisted: true,
      categoryAllowlistNotes: null,
      abortControlState: 'rollback_requested',
      pilotModeEnabled: true,
      pilotRequireManualAck: true,
      pilotManualAckProvided: true,
      pilotMaxActivePublications: 1,
      activeMercadoLibrePublications: 0,
      workersReady: true,
      redisAvailable: true,
      eventFlowReady: true,
      environmentResolved: 'production',
    });

    expect(pilot.pilotAllowed).toBe(false);
    expect(pilot.blockers).toContain('pilot_control:blocking_state:rollback_requested');
  });
});
