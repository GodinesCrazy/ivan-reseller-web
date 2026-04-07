import express from 'express';
import request from 'supertest';

const mockGetProductById = jest.fn();
const mockUpdateProductStatus = jest.fn();
const mockGetCredentials = jest.fn();
const mockBuildMlPreflight = jest.fn();
const mockGetUserEnvironment = jest.fn();
const mockAddPublishingJob = jest.fn();

jest.mock('../../../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 123, role: 'ADMIN', username: 'phase1-tester' };
    next();
  },
  authorize:
    () =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

jest.mock('../../../services/product.service', () => ({
  productService: {
    getProductById: (...args: any[]) => mockGetProductById(...args),
    updateProductStatus: (...args: any[]) => mockUpdateProductStatus(...args),
    updateProductStatusSafely: jest.fn(async () => undefined),
  },
}));

jest.mock('../../../services/marketplace.service', () => ({
  MarketplaceService: jest.fn().mockImplementation(() => ({
    getCredentials: (...args: any[]) => mockGetCredentials(...args),
    publishProduct: jest.fn(async () => ({ success: true, marketplace: 'mercadolibre' })),
    getEffectiveListingPrice: jest.fn(() => 0),
  })),
}));

jest.mock('../../../services/mercadolibre-publish-preflight.service', () => ({
  buildMercadoLibrePublishPreflight: (...args: any[]) => mockBuildMlPreflight(...args),
}));

jest.mock('../../../services/workflow-config.service', () => ({
  workflowConfigService: {
    getUserEnvironment: (...args: any[]) => mockGetUserEnvironment(...args),
  },
}));

jest.mock('../../../services/job.service', () => ({
  jobService: {
    addPublishingJob: (...args: any[]) => mockAddPublishingJob(...args),
  },
  publishingQueue: { name: 'publishing' },
}));

jest.mock('../../../services/aliexpress-acquisition.service', () => ({
  getAliExpressProductCascaded: jest.fn(async () => ({})),
}));

jest.mock('../../../config/database', () => ({
  prisma: {
    product: {
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
    },
  },
}));

jest.mock('../../../config/redis', () => ({
  isRedisAvailable: true,
}));

jest.mock('../../../utils/ml-operational-guards', () => ({
  mercadoLibrePublishRequiresRedisQueue: jest.fn(() => true),
}));

import publisherRouter from '../publisher.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/publisher', publisherRouter);
  return app;
}

describe('publisher.routes approve MercadoLibre preflight gate (Phase 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserEnvironment.mockResolvedValue('production');
    mockGetProductById.mockResolvedValue({
      id: 100,
      userId: 123,
      status: 'PENDING',
      productData: null,
      isPublished: false,
    });
    mockGetCredentials.mockResolvedValue({
      isActive: true,
      environment: 'production',
      credentials: { accessToken: 'token' },
      issues: [],
    });
    mockBuildMlPreflight.mockResolvedValue({
      publishAllowed: false,
      nextAction: 'Set package fields',
      overallState: 'blocked_physical_package',
      requestedMode: 'international',
      modeResolved: 'international',
      channelCapability: 'local_only',
      blockers: ['physical_package:packageWeightGrams must be a positive integer (grams)'],
    });
    mockUpdateProductStatus.mockResolvedValue(undefined);
    mockAddPublishingJob.mockResolvedValue({ id: 'job-approve-1' });
  });

  it('blocks approve/publication when canonical ML preflight returns publishAllowed=false', async () => {
    const res = await request(buildApp()).post('/publisher/approve/100').send({
      marketplaces: ['mercadolibre'],
      publishMode: 'international',
      customData: {},
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('mercadolibre_preflight_blocked');
    expect(res.body.overallState).toBe('blocked_physical_package');
    expect(res.body.requestedMode).toBe('international');
    expect(mockBuildMlPreflight).toHaveBeenCalledTimes(1);
    expect(mockBuildMlPreflight.mock.calls[0]?.[0]).toMatchObject({
      productId: 100,
      requestedMode: 'international',
    });
    expect(mockUpdateProductStatus).not.toHaveBeenCalled();
    expect(mockAddPublishingJob).not.toHaveBeenCalled();
  });

  it('keeps local publication flow working when preflight allows publish', async () => {
    mockBuildMlPreflight.mockResolvedValueOnce({
      publishAllowed: true,
      nextAction: '',
      overallState: 'ready_to_publish',
      blockers: [],
    });

    const res = await request(buildApp()).post('/publisher/approve/100').send({
      marketplaces: ['mercadolibre'],
      customData: {},
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockBuildMlPreflight).toHaveBeenCalledTimes(1);
    expect(mockBuildMlPreflight.mock.calls[0]?.[0]).toMatchObject({
      requestedMode: 'local',
    });
    expect(mockUpdateProductStatus).toHaveBeenCalledWith(100, 'APPROVED', 123);
    expect(mockAddPublishingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 100,
        customData: expect.objectContaining({ publishMode: 'local' }),
      })
    );
  });

  it('blocks approve/publication when international readiness lacks returns or communication config', async () => {
    mockBuildMlPreflight.mockResolvedValueOnce({
      publishAllowed: false,
      nextAction: 'Configure return policy readiness before international publication.',
      overallState: 'blocked_international_capability',
      requestedMode: 'international',
      modeResolved: 'international',
      channelCapability: 'foreign_seller_enabled',
      blockers: [
        'international_returns:missing_return_policy_config',
        'international_communication:response_sla_not_enabled',
      ],
    });

    const res = await request(buildApp()).post('/publisher/approve/100').send({
      marketplaces: ['mercadolibre'],
      publishMode: 'international',
      customData: {},
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('mercadolibre_preflight_blocked');
    expect(res.body.overallState).toBe('blocked_international_capability');
    expect(res.body.blockers).toContain('international_returns:missing_return_policy_config');
    expect(res.body.blockers).toContain('international_communication:response_sla_not_enabled');
    expect(mockUpdateProductStatus).not.toHaveBeenCalled();
    expect(mockAddPublishingJob).not.toHaveBeenCalled();
  });

  it('dry_run never enqueues or publishes and returns assessment only', async () => {
    mockBuildMlPreflight.mockResolvedValueOnce({
      publishIntent: 'dry_run',
      publishAllowed: false,
      nextAction: 'Dry run completed. No publication was executed.',
      overallState: 'ready_to_publish',
      requestedMode: 'international',
      modeResolved: 'international',
      channelCapability: 'foreign_seller_enabled',
      blockers: [],
      warnings: [],
      programVerification: { programResolved: 'international_candidate' },
      pilotReadiness: { pilotAllowed: false },
    });

    const res = await request(buildApp()).post('/publisher/approve/100').send({
      marketplaces: ['mercadolibre'],
      publishMode: 'international',
      publishIntent: 'dry_run',
      customData: {},
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.preflight.publishIntent).toBe('dry_run');
    expect(mockUpdateProductStatus).not.toHaveBeenCalled();
    expect(mockAddPublishingJob).not.toHaveBeenCalled();
    expect(mockBuildMlPreflight.mock.calls[0]?.[0]).toMatchObject({
      requestedMode: 'international',
      publishIntent: 'dry_run',
    });
  });
});
