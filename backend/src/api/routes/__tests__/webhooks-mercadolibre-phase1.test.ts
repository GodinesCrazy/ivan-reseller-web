import express from 'express';
import request from 'supertest';

const mockComputeIdempotency = jest.fn();
const mockPersistLedger = jest.fn();
const mockMarkQueued = jest.fn();
const mockMarkFailed = jest.fn();
const mockAddMlWebhookJob = jest.fn();
const mockRequiresBullmq = jest.fn();

jest.mock('../../../middleware/webhook-signature.middleware', () => ({
  createWebhookSignatureValidator:
    () =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

jest.mock('../../../services/webhook-readiness.service', () => ({
  getWebhookStatusWithProof: jest.fn(async () => ({ mercadolibre: { configured: true } })),
  getWebhookStatus: jest.fn(() => ({ mercadolibre: { configured: true } })),
}));

jest.mock('../../../services/webhook-event-proof.service', () => ({
  recordWebhookEventProof: jest.fn(async () => undefined),
}));

jest.mock('../../../services/ebay-webhook.service', () => ({
  buildEbayChallengeResponse: jest.fn(() => 'challenge'),
  resolveEbayWebhookEndpoint: jest.fn(() => 'https://example.com/webhooks/ebay'),
  resolveEbayWebhookVerificationToken: jest.fn(() => 'token'),
}));

jest.mock('../../../services/webhook-marketplace-order.service', () => ({
  recordSaleFromWebhook: jest.fn(async () => ({ id: 1 })),
}));

jest.mock('../../../services/mercadolibre-webhook-async.service', () => ({
  computeMercadoLibreWebhookIdempotencyKey: (...args: any[]) => mockComputeIdempotency(...args),
  persistMercadoLibreWebhookLedger: (...args: any[]) => mockPersistLedger(...args),
  markMercadoLibreWebhookQueued: (...args: any[]) => mockMarkQueued(...args),
  markMercadoLibreWebhookProcessed: jest.fn(async () => undefined),
  markMercadoLibreWebhookFailed: (...args: any[]) => mockMarkFailed(...args),
  processMercadoLibreWebhookPayload: jest.fn(async () => ({ ok: true })),
}));

jest.mock('../../../services/job.service', () => ({
  jobService: {
    addMlWebhookJob: (...args: any[]) => mockAddMlWebhookJob(...args),
  },
}));

jest.mock('../../../utils/ml-operational-guards', () => ({
  mercadoLibreWebhookRequiresBullmq: (...args: any[]) => mockRequiresBullmq(...args),
}));

import webhooksRouter from '../webhooks.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhooks', webhooksRouter);
  return app;
}

describe('webhooks.routes MercadoLibre Phase 1 safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComputeIdempotency.mockReturnValue('ml_wh:test');
    mockPersistLedger.mockResolvedValue({ eventId: 'evt-1', alreadyHandled: false });
    mockAddMlWebhookJob.mockResolvedValue({ id: 'job-1' });
    mockMarkQueued.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockRequiresBullmq.mockReturnValue(true);
  });

  it('returns duplicate ACK and does not enqueue when event is already handled', async () => {
    mockPersistLedger.mockResolvedValue({ eventId: 'evt-dup', alreadyHandled: true });

    const res = await request(buildApp()).post('/webhooks/mercadolibre').send({
      _id: 'dup-1',
      topic: 'orders_v2',
      resource: '/orders/1',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.eventId).toBe('evt-dup');
    expect(mockAddMlWebhookJob).not.toHaveBeenCalled();
    expect(mockMarkQueued).not.toHaveBeenCalled();
  });

  it('does not return false success when queue enqueue fails', async () => {
    mockAddMlWebhookJob.mockResolvedValue(null);

    const res = await request(buildApp()).post('/webhooks/mercadolibre').send({
      _id: 'evt-queue-fail',
      topic: 'orders_v2',
      resource: '/orders/2',
    });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('queue_unavailable');
    expect((res.body as any).success).not.toBe(true);
    expect(mockMarkFailed).toHaveBeenCalledWith(
      'evt-1',
      expect.stringContaining('queue unavailable')
    );
    expect(mockMarkQueued).not.toHaveBeenCalled();
  });

  it('does not return success when ledger persistence fails', async () => {
    mockPersistLedger.mockRejectedValue(new Error('db down'));

    const res = await request(buildApp()).post('/webhooks/mercadolibre').send({
      _id: 'evt-db-fail',
      topic: 'orders_v2',
      resource: '/orders/3',
    });

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('ingest_failed');
    expect(mockAddMlWebhookJob).not.toHaveBeenCalled();
  });
});

