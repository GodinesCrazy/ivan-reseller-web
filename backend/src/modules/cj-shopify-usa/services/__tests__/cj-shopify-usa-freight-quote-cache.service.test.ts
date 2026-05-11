import { redis } from '../../../../config/redis';
import {
  buildFreightQuoteCacheKey,
  quoteShippingToUsWarehouseAwareCached,
  resolveFreightQuoteCacheTtlMs,
} from '../cj-shopify-usa-freight-quote-cache.service';

jest.mock('../../../../config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

describe('cj-shopify-usa-freight-quote-cache.service', () => {
  const redisGet = redis.get as jest.MockedFunction<typeof redis.get>;
  const redisSet = redis.set as jest.MockedFunction<typeof redis.set>;

  beforeEach(() => {
    jest.clearAllMocks();
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    delete process.env.CJ_SHOPIFY_USA_FREIGHT_CACHE_TTL_MS;
  });

  it('buildFreightQuoteCacheKey includes user, product, variant, qty, dest', () => {
    const key = buildFreightQuoteCacheKey(7, {
      productId: 'P1',
      variantId: 'V1',
      quantity: 2,
      destCountryCode: 'us',
    });
    expect(key).toBe('cj:freight:USA:7:P1:V1:2:US');
  });

  it('resolveFreightQuoteCacheTtlMs clamps invalid env to default 24h', () => {
    process.env.CJ_SHOPIFY_USA_FREIGHT_CACHE_TTL_MS = '500';
    expect(resolveFreightQuoteCacheTtlMs()).toBe(86_400_000);
    process.env.CJ_SHOPIFY_USA_FREIGHT_CACHE_TTL_MS = String(3_600_000);
    expect(resolveFreightQuoteCacheTtlMs()).toBe(3_600_000);
  });

  it('quoteShippingToUsWarehouseAwareCached calls adapter once on repeat (memory hit)', async () => {
    const quote = { ok: true, mocked: true } as const;
    const adapter = { quoteShippingToUsWarehouseAware: jest.fn().mockResolvedValue(quote) };
    const input = {
      productId: 'cache-test-pid',
      variantId: 'cache-test-vid',
      quantity: 1,
      destCountryCode: 'US',
    };

    const a = await quoteShippingToUsWarehouseAwareCached(42, adapter as never, input);
    const b = await quoteShippingToUsWarehouseAwareCached(42, adapter as never, input);

    expect(a).toEqual(quote);
    expect(b).toEqual(quote);
    expect(adapter.quoteShippingToUsWarehouseAware).toHaveBeenCalledTimes(1);
    expect(redisGet).toHaveBeenCalled();
    expect(redisSet).toHaveBeenCalled();
  });
});
