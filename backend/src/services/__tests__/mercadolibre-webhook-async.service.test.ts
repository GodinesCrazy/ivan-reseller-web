import { computeMercadoLibreWebhookIdempotencyKey } from '../mercadolibre-webhook-async.service';

describe('computeMercadoLibreWebhookIdempotencyKey', () => {
  it('uses stable id when _id is present', () => {
    const k1 = computeMercadoLibreWebhookIdempotencyKey({ _id: 'abc123', topic: 'orders_v2' });
    const k2 = computeMercadoLibreWebhookIdempotencyKey({ _id: 'abc123', extra: 1 });
    expect(k1).toBe('ml_wh:id:abc123');
    expect(k2).toBe('ml_wh:id:abc123');
  });

  it('is stable for same topic/resource/user/data.id', () => {
    const body = {
      topic: 'orders_v2',
      resource: '/orders/999',
      user_id: 111,
      data: { id: '999' },
    };
    expect(computeMercadoLibreWebhookIdempotencyKey(body)).toBe(
      computeMercadoLibreWebhookIdempotencyKey({ ...body })
    );
  });

  it('falls back to body hash when no stable tuple', () => {
    const k = computeMercadoLibreWebhookIdempotencyKey({ ping: true });
    expect(k.startsWith('ml_wh:full:')).toBe(true);
  });
});
