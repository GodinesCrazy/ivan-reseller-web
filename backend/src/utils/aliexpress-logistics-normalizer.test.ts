import {
  evaluateAliExpressChileSupportSignal,
  normalizeAliExpressShippingMethods,
  summarizeAliExpressLogisticsForensics,
} from './aliexpress-logistics-normalizer';

describe('AliExpress logistics normalizer', () => {
  it('keeps classic shipping_info methods', () => {
    const methods = normalizeAliExpressShippingMethods({
      shipping_info: {
        methods: {
          method: [
            {
              method_id: 'AE_STD',
              method_name: 'AliExpress Standard Shipping',
              cost: '4.5',
              estimated_days: '12',
            },
          ],
        },
      },
    });

    expect(methods).toEqual([
      {
        methodId: 'AE_STD',
        methodName: 'AliExpress Standard Shipping',
        cost: 4.5,
        estimatedDays: 12,
      },
    ]);
  });

  it('extracts logistics methods from logistics_info_dto nested arrays', () => {
    const methods = normalizeAliExpressShippingMethods({
      logistics_info_dto: {
        freight_ext: {
          logistics_detail_list: [
            {
              logistics_id: 'CHILE_STD',
              logistics_service_name: 'Chile Standard',
              shipping_fee: '5.2',
              delivery_day_max: '18',
            },
          ],
        },
      },
    });

    expect(methods).toEqual([
      {
        methodId: 'CHILE_STD',
        methodName: 'Chile Standard',
        cost: 5.2,
        estimatedDays: 18,
      },
    ]);
  });

  it('summarizes logistics forensic presence', () => {
    expect(
      summarizeAliExpressLogisticsForensics({
        logistics_info_dto: {
          logistics_detail_list: [{ logistics_id: 'x', service_name: 'y', shipping_fee: '1' }],
        },
      }),
    ).toMatchObject({
      hasClassicShippingInfo: false,
      hasLogisticsInfoDto: true,
      normalizedMethodCount: 1,
    });
  });

  it('treats logistics_info_dto ship_to_country plus delivery_time as acknowledged Chile support', () => {
    expect(
      evaluateAliExpressChileSupportSignal({
        logistics_info_dto: {
          ship_to_country: 'CL',
          delivery_time: 7,
        },
      }),
    ).toMatchObject({
      signal: 'acknowledged_without_shipping_methods',
      shipToCountry: 'CL',
      deliveryTime: 7,
      normalizedMethodCount: 0,
    });
  });
});
