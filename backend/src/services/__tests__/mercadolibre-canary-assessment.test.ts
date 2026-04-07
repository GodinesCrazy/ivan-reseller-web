import {
  computeMercadoLibreCanaryAssessment,
  type MercadoLibrePublishPreflightPayload,
} from '../mercadolibre-publish-preflight.service';

function basePayload(
  overrides: Partial<Omit<MercadoLibrePublishPreflightPayload, 'canary'>>
): Omit<MercadoLibrePublishPreflightPayload, 'canary'> {
  return {
    schemaVersion: 1,
    marketplace: 'mercadolibre',
    productId: 1,
    publishIntent: 'production',
    requestedMode: 'local',
    modeResolved: 'local',
    channelCapability: 'local_only',
    overallState: 'ready_to_publish',
    publishAllowed: true,
    programVerification: {
      verified: true,
      accountVerificationStatus: 'verified',
      programResolved: 'local',
      verifiedProgram: 'local',
      siteIdResolved: 'MLC',
      verifiedSiteId: 'MLC',
      environmentResolved: 'production',
      verifiedSellerType: 'unknown',
      verifiedScopes: ['user', 'oauth_token'],
      verifiedCapabilities: ['no_external_international_signal'],
      lastVerifiedAt: new Date().toISOString(),
      verificationEvidence: {
        external: { verified: true, profileId: '1', siteId: 'MLC' },
        declarative: { configuredChannelMode: 'local_only' },
      },
      verificationWarnings: [],
      verificationBlockers: [],
      blockers: [],
      warnings: [],
      nextActions: [],
    },
    pilotReadiness: {
      pilotAllowed: true,
      pilotModeResolved: 'production',
      blockers: [],
      warnings: [],
      requiredManualChecks: [],
      runbookHints: [],
      evidence: {
        publishIntent: 'production',
        requestedMode: 'local',
        programResolved: 'local',
        accountVerified: true,
        internationalReadinessAllowed: false,
        complianceStatus: 'pass',
        returnsReady: true,
        communicationReady: true,
        workersReady: true,
        redisAvailable: true,
        eventFlowReady: true,
        environmentResolved: 'production',
        verificationFreshHours: 0,
        securityFlags: {
          pilotModeEnabled: false,
          pilotRequireManualAck: true,
          pilotManualAckProvided: false,
          maxActivePilotPublications: 1,
          activeMercadoLibrePublications: 0,
        },
      },
    },
    internationalReadiness: {
      allowed: false,
      blockers: ['international_capability:local_only_account'],
      warnings: [],
      complianceReadiness: {
        status: 'pass',
        reasons: [],
        blockers: [],
        warnings: [],
        evidence: {
          categoryFingerprint: 'general',
          hasRegulatoryData: true,
          matchedSignals: [],
        },
        nextActions: [],
      },
      returnsReadiness: {
        status: 'not_required_for_local',
        ready: true,
        blockers: [],
        warnings: [],
        evidence: {
          returnAddressConfigured: false,
          returnPolicyConfigured: false,
          shippingOriginCountry: null,
          sellerOriginCountry: null,
        },
        nextActions: [],
      },
      communicationReadiness: {
        communicationReady: true,
        blockers: [],
        warnings: [],
        evidence: {
          postSaleContactConfigured: false,
          responseSlaEnabled: false,
          alertsConfigured: false,
        },
        nextActions: [],
      },
      evidence: {
        siteId: 'MLC',
        requestedMode: 'local',
        channelCapability: 'local_only',
        channelModeConfigured: 'local_only',
        foreignSellerEnabled: false,
        internationalPublishingEnabled: false,
        returnAddressConfigured: false,
        shippingOriginCountry: null,
        sellerOriginCountry: null,
        queue: {
          publishQueueRequired: true,
          publishQueueReady: true,
          webhookQueueRequired: true,
          webhookQueueReady: true,
          redisAvailable: true,
        },
        connector: {
          eventFlowReady: true,
          operationMode: 'automation_ready',
        },
        categoryFingerprint: 'general',
        shippingModeExpected: 'me2',
      },
      nextActions: ['Configure channel capability'],
    },
    complianceReadiness: {
      status: 'pass',
      reasons: [],
      blockers: [],
      warnings: [],
      evidence: {
        categoryFingerprint: 'general',
        hasRegulatoryData: true,
        matchedSignals: [],
      },
      nextActions: [],
    },
    returnsReadiness: {
      status: 'not_required_for_local',
      ready: true,
      blockers: [],
      warnings: [],
      evidence: {
        returnAddressConfigured: false,
        returnPolicyConfigured: false,
        shippingOriginCountry: null,
        sellerOriginCountry: null,
      },
      nextActions: [],
    },
    communicationReadiness: {
      communicationReady: true,
      blockers: [],
      warnings: [],
      evidence: {
        postSaleContactConfigured: false,
        responseSlaEnabled: false,
        alertsConfigured: false,
      },
      nextActions: [],
    },
    nextAction: '',
    blockers: [],
    warnings: [],
    productStatus: 'VALIDATED_READY',
    listingSalePriceUsd: 29,
    canonicalPricing: {
      ok: true,
      source: 'preventive_economics_core',
      listingSalePriceUsd: 29,
      shipCountry: 'CL',
      listingCurrency: 'CLP',
      profitabilityUsd: {
        netProfitUsd: 5,
        marginRatio: 0.2,
        totalCostUsd: 24,
        supplierUnitUsd: 10,
        shippingUsd: 8,
        importTaxUsd: 1,
      },
      profitabilityMarketplaceCurrency: {
        listingSalePrice: 26000,
        netProfit: 4000,
        totalCost: 22000,
        marketplaceFee: 0,
        paymentFee: 0,
        listingFee: 0,
        finalValueFee: 0,
        taxes: 0,
      },
      feeLedger: {
        marketplaceFeeModel: 'mlc',
        totalKnownCost: 24,
        projectedProfit: 5,
        projectedMargin: 0.2,
        completenessState: 'complete',
        blockedByFinancialIncompleteness: false,
        blockingReasons: [],
      },
    },
    images: {
      publishSafe: true,
      blockingReason: null,
      imageCount: 5,
      packApproved: true,
      requiredAssets: [],
    },
    language: {
      supported: true,
      country: 'CL',
      resolvedLanguage: 'es',
      requiredLanguage: 'es',
    },
    credentials: { present: true, active: true, issues: [] },
    mercadoLibreApi: {
      testConnectionOk: true,
      credentialEnvironment: 'production',
    },
    postsale: {
      mercadolibreWebhookConfigured: true,
      mercadolibreEventFlowReady: true,
      mercadolibreConnectorAutomationReady: true,
      mercadolibreOperationMode: 'live',
      fulfillPrerequisiteAliExpressUrl: true,
      verificationNotes: [],
    },
    ...overrides,
  };
}

describe('computeMercadoLibreCanaryAssessment', () => {
  it('returns recommended when all gates and profit are strong', () => {
    const c = computeMercadoLibreCanaryAssessment(basePayload({}));
    expect(c.tier).toBe('recommended');
    expect(c.score).toBeGreaterThanOrEqual(88);
  });

  it('returns blocked when publish is not allowed', () => {
    const c = computeMercadoLibreCanaryAssessment(
      basePayload({
        publishAllowed: false,
        overallState: 'blocked_images',
      })
    );
    expect(c.tier).toBe('blocked');
  });

  it('downgrades when webhook is not configured', () => {
    const c = computeMercadoLibreCanaryAssessment(
      basePayload({
        postsale: {
          mercadolibreWebhookConfigured: false,
          mercadolibreEventFlowReady: false,
          mercadolibreConnectorAutomationReady: false,
          mercadolibreOperationMode: 'degraded',
          fulfillPrerequisiteAliExpressUrl: true,
          verificationNotes: [],
        },
      })
    );
    expect(c.tier).not.toBe('recommended');
    expect(c.reasons.some((r) => r.includes('webhook'))).toBe(true);
  });
});
