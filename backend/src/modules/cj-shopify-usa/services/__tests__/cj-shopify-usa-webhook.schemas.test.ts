import {
  normalizeShopifyWebhookOrderIdFromParsed,
  normalizeShopifyOrderGidFromRefundPayload,
  safeParseShopifyOrderWebhookBody,
  safeParseShopifyRefundCreateWebhookBody,
} from '../../schemas/cj-shopify-usa-webhook.schemas';

describe('cj-shopify-usa-webhook.schemas', () => {
  it('parses order webhook with numeric id', () => {
    const r = safeParseShopifyOrderWebhookBody({ id: 12345, foo: 'bar' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(normalizeShopifyWebhookOrderIdFromParsed(r.data)).toBe('gid://shopify/Order/12345');
  });

  it('prefers admin_graphql_api_id for order webhook', () => {
    const r = safeParseShopifyOrderWebhookBody({
      id: 1,
      admin_graphql_api_id: 'gid://shopify/Order/99',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(normalizeShopifyWebhookOrderIdFromParsed(r.data)).toBe('gid://shopify/Order/99');
  });

  it('rejects empty order webhook body for id resolution', () => {
    const r = safeParseShopifyOrderWebhookBody({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(normalizeShopifyWebhookOrderIdFromParsed(r.data)).toBeNull();
  });

  it('parses refund webhook with order_id', () => {
    const r = safeParseShopifyRefundCreateWebhookBody({ id: 777, order_id: 555 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(normalizeShopifyOrderGidFromRefundPayload(r.data)).toBe('gid://shopify/Order/555');
  });

  it('fails refund parse on completely empty object', () => {
    const r = safeParseShopifyRefundCreateWebhookBody({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(normalizeShopifyOrderGidFromRefundPayload(r.data)).toBeNull();
  });
});
