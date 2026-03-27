import { normalizeAliExpressFreightQuoteResult } from './aliexpress-freight-normalizer';

describe('normalizeAliExpressFreightQuoteResult', () => {
  it('normalizes freight options from nested freight payloads', () => {
    const result = normalizeAliExpressFreightQuoteResult({
      freight_calculate_result_for_buyer_dto: {
        solutions: [
          {
            service_name: 'AliExpress Standard Shipping',
            freight_amount: '2.55',
            currency: 'USD',
            delivery_time: 14,
          },
        ],
      },
    });

    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({
      serviceName: 'AliExpress Standard Shipping',
      freightAmount: 2.55,
      freightCurrency: 'USD',
      estimatedDeliveryTime: 14,
    });
  });

  it('keeps free shipping options when explicitly marked', () => {
    const result = normalizeAliExpressFreightQuoteResult({
      logistics: {
        option: {
          service_name: 'Cainiao Super Economy',
          free_shipping: true,
          currency: 'USD',
        },
      },
    });

    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.isFreeShipping).toBe(true);
    expect(result.options[0]?.freightAmount).toBe(0);
  });
});
