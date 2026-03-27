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
    overallState: 'ready_to_publish',
    publishAllowed: true,
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
