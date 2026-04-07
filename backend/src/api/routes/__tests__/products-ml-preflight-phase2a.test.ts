import express from 'express';
import request from 'supertest';

const mockBuildMlPreflight = jest.fn();

jest.mock('../../../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 321, role: 'ADMIN', username: 'phase2a-tester' };
    next();
  },
  authorize:
    () =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

jest.mock('../../../services/mercadolibre-publish-preflight.service', () => ({
  buildMercadoLibrePublishPreflight: (...args: any[]) => mockBuildMlPreflight(...args),
}));

jest.mock('../../../services/product.service', () => ({
  productService: {
    getProducts: jest.fn(async () => ({ products: [], pagination: {}, aggregations: {} })),
    getProductById: jest.fn(),
    createProduct: jest.fn(),
    updateProduct: jest.fn(),
    updateProductStatus: jest.fn(),
    updateProductStatusSafely: jest.fn(),
    deleteProduct: jest.fn(),
    getProductStats: jest.fn(async () => ({})),
    detectInconsistencies: jest.fn(async () => []),
    getCleanupCandidates: jest.fn(async () => []),
    cleanupUnpublishedProducts: jest.fn(async () => ({ deleted: 0, dryRun: true })),
    fixInconsistencies: jest.fn(async () => ({ fixed: 0, errors: 0 })),
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/marketplace.service', () => ({
  MarketplaceService: jest.fn().mockImplementation(() => ({
    generateListingPreview: jest.fn(async () => ({ success: true, preview: {} })),
    syncProductPrice: jest.fn(async () => ({ success: true, updated: 0, errors: [] })),
    publishToMultipleMarketplaces: jest.fn(async () => []),
    getCredentials: jest.fn(async () => null),
    publishProduct: jest.fn(async () => ({ success: false })),
  })),
}));

jest.mock('../../../services/product-workflow-status.service', () => ({
  productWorkflowStatusService: {
    getProductWorkflowStatus: jest.fn(async () => null),
  },
}));

jest.mock('../../../config/database', () => ({
  prisma: {
    product: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    marketplaceListing: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    order: {
      findMany: jest.fn(async () => []),
    },
    activity: {
      create: jest.fn(async () => ({})),
    },
  },
}));

jest.mock('../../../utils/queryWithTimeout', () => ({
  queryWithTimeout: jest.fn(async (p: Promise<any>) => p),
}));

jest.mock('../../../utils/setup-check', () => ({
  handleSetupCheck: jest.fn(async () => false),
}));

jest.mock('../../../services/catalog-validation-state.service', () => ({
  getProductValidationSnapshot: jest.fn(() => ({
    validationState: 'VALIDATED_READY',
    blockedReasons: [],
    resolvedCountry: 'CL',
    resolvedLanguage: 'es',
    resolvedCurrency: 'CLP',
    feeCompleteness: 'complete',
    projectedMargin: 0.2,
    marketplaceContextSafety: 'safe',
  })),
}));

import productsRouter from '../products.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/products', productsRouter);
  return app;
}

describe('products publish-preflight endpoint international readiness (Phase 2B)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildMlPreflight.mockResolvedValue({
      publishIntent: 'pilot',
      requestedMode: 'international',
      modeResolved: 'international',
      channelCapability: 'local_only',
      programVerification: {
        verified: false,
        accountVerificationStatus: 'manual_confirmation_required',
        programResolved: 'international_candidate',
        verifiedProgram: 'international_candidate',
        siteIdResolved: 'MLC',
        verifiedSiteId: 'MLC',
        environmentResolved: 'production',
        verifiedSellerType: 'unknown',
        verifiedScopes: ['user', 'oauth_token'],
        verifiedCapabilities: ['declared_international_publishing_enabled'],
        lastVerifiedAt: new Date().toISOString(),
        verificationEvidence: {},
        verificationWarnings: ['program_verification:external_international_capability_not_fully_verified'],
        verificationBlockers: [],
        blockers: [],
        warnings: ['program_verification:external_international_capability_not_fully_verified'],
        nextActions: ['Obtain external evidence for international capability'],
      },
      pilotReadiness: {
        pilotAllowed: false,
        pilotModeResolved: 'pilot',
        blockers: ['pilot_manual_ack:required_for_international_candidate'],
        warnings: [],
        requiredManualChecks: ['admin_confirmation_for_international_candidate'],
        runbookHints: ['Run preflight dry_run before pilot publication.'],
        evidence: {
          publishIntent: 'pilot',
          requestedMode: 'international',
          programResolved: 'international_candidate',
          accountVerified: false,
          internationalReadinessAllowed: false,
          complianceStatus: 'review_required',
          returnsReady: false,
          communicationReady: false,
          workersReady: true,
          redisAvailable: true,
          eventFlowReady: true,
          environmentResolved: 'production',
          verificationFreshHours: 1,
          approvalRequired: true,
          approvalId: null,
          approvalExpiresAt: null,
          categoryKeyResolved: null,
          categoryAllowlisted: false,
          categoryAllowlistNotes: null,
          abortControlState: 'ready',
          securityFlags: {
            pilotModeEnabled: true,
            pilotRequireManualAck: true,
            pilotManualAckProvided: false,
            maxActivePilotPublications: 1,
            activeMercadoLibrePublications: 0,
          },
        },
      },
      complianceReadiness: {
        status: 'review_required',
        reasons: ['unknown_category_risk'],
        blockers: ['international_compliance:review_required', 'international_compliance:unknown_category_risk'],
        warnings: ['international_compliance:manual_review_required'],
        evidence: {
          categoryFingerprint: '',
          hasRegulatoryData: false,
          matchedSignals: ['category_fingerprint_missing'],
        },
        nextActions: ['Set a valid category fingerprint before international publication.'],
      },
      returnsReadiness: {
        status: 'missing_return_policy_config',
        ready: false,
        blockers: ['international_returns:missing_return_policy_config'],
        warnings: [],
        evidence: {
          returnAddressConfigured: true,
          returnPolicyConfigured: false,
          shippingOriginCountry: 'CN',
          sellerOriginCountry: 'CN',
        },
        nextActions: ['Configure minimum return policy settings before international publication.'],
      },
      communicationReadiness: {
        communicationReady: false,
        blockers: ['international_communication:response_sla_not_enabled'],
        warnings: [],
        evidence: {
          postSaleContactConfigured: true,
          responseSlaEnabled: false,
          alertsConfigured: true,
        },
        nextActions: ['Enable and commit response SLA before international publication.'],
      },
      blockers: ['international_capability:local_only_account'],
      publishAllowed: false,
      overallState: 'blocked_international_capability',
    });
  });

  it('returns modeResolved and blockers for requestedMode=international', async () => {
    const res = await request(buildApp()).get(
      '/products/100/publish-preflight?marketplace=mercadolibre&requestedMode=international&publishIntent=pilot'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modeResolved).toBe('international');
    expect(res.body.data.blockers).toContain('international_capability:local_only_account');
    expect(res.body.data.publishIntent).toBe('pilot');
    expect(res.body.data.programVerification.programResolved).toBe('international_candidate');
    expect(res.body.data.pilotReadiness.pilotAllowed).toBe(false);
    expect(res.body.data.pilotReadiness.evidence.approvalRequired).toBe(true);
    expect(res.body.data.pilotReadiness.evidence.categoryAllowlisted).toBe(false);
    expect(res.body.data.pilotReadiness.evidence.abortControlState).toBe('ready');
    expect(res.body.data.complianceReadiness.status).toBe('review_required');
    expect(res.body.data.returnsReadiness.status).toBe('missing_return_policy_config');
    expect(res.body.data.communicationReadiness.communicationReady).toBe(false);
    expect(mockBuildMlPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 100,
        requestedMode: 'international',
        publishIntent: 'pilot',
      })
    );
  });

  it('publish-dry-run endpoint forces dry_run intent and never implies real publish', async () => {
    mockBuildMlPreflight.mockResolvedValueOnce({
      publishIntent: 'dry_run',
      requestedMode: 'international',
      modeResolved: 'international',
      channelCapability: 'international_candidate',
      blockers: ['pilot_manual_ack:required_for_international_candidate'],
      publishAllowed: false,
      overallState: 'blocked_pilot_readiness',
    });

    const res = await request(buildApp()).get(
      '/products/100/publish-dry-run?marketplace=mercadolibre&requestedMode=international'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.data.publishIntent).toBe('dry_run');
    expect(mockBuildMlPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 100,
        publishIntent: 'dry_run',
      })
    );
  });
});
