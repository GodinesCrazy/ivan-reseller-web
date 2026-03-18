/**
 * GET /api/orders — real-orders-only filter (Phase 44).
 * Only ebay:, mercadolibre:, amazon:; exclude test/demo/mock and checkout.
 */

import { isRealMarketplaceOrderPaypalId } from '../../../utils/orders-real-filter';

describe('orders real-orders-only filter (isRealMarketplaceOrderPaypalId)', () => {
  it('includes ebay orders', () => {
    expect(isRealMarketplaceOrderPaypalId('ebay:17-14370-63716')).toBe(true);
    expect(isRealMarketplaceOrderPaypalId('ebay:12-11320-43716')).toBe(true);
  });

  it('includes mercadolibre orders', () => {
    expect(isRealMarketplaceOrderPaypalId('mercadolibre:12345')).toBe(true);
  });

  it('includes amazon orders', () => {
    expect(isRealMarketplaceOrderPaypalId('amazon:AMZ-789')).toBe(true);
  });

  it('excludes checkout / non-marketplace', () => {
    expect(isRealMarketplaceOrderPaypalId('checkout:abc-123')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('other:xyz')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('')).toBe(false);
  });

  it('excludes null and empty', () => {
    expect(isRealMarketplaceOrderPaypalId(null)).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('   ')).toBe(false);
  });

  it('excludes test/demo/mock prefixes', () => {
    expect(isRealMarketplaceOrderPaypalId('TEST-123')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('DEMO-456')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('MOCK-789')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('SIM_xxx')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('ORD-TEST-1')).toBe(false);
    expect(isRealMarketplaceOrderPaypalId('test:something')).toBe(false);
  });
});
