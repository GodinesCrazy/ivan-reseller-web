import { buildMlChileSellerLogisticsPattern } from './ml-chile-seller-logistics-pattern';

describe('ML Chile seller/logistics pattern', () => {
  it('classifies a candidate as shipping-rich when normalized shipping methods exist', () => {
    const pattern = buildMlChileSellerLogisticsPattern({
      rawProduct: {
        ae_store_info: {
          store_id: '123',
          store_name: 'Demo Store',
        },
        logistics_info_dto: {
          ship_to_country: 'CL',
          delivery_time: 7,
        },
      },
      rawLogisticsInfoDto: {
        ship_to_country: 'CL',
        delivery_time: 7,
      },
      shippingMethods: [{ serviceName: 'AliExpress Standard Shipping', shippingCost: 4.2 }],
    });

    expect(pattern).toMatchObject({
      classification: 'Chile-shipping-rich',
      normalizedShippingMethodCount: 1,
    });
  });

  it('classifies destination acknowledgement without shipping methods as shipping-poor', () => {
    const pattern = buildMlChileSellerLogisticsPattern({
      rawProduct: {
        ae_store_info: {
          store_id: '123',
          store_name: 'Demo Store',
        },
        logistics_info_dto: {
          ship_to_country: 'CL',
          delivery_time: 7,
        },
      },
      rawLogisticsInfoDto: {
        ship_to_country: 'CL',
        delivery_time: 7,
      },
      shippingMethods: [],
    });

    expect(pattern).toMatchObject({
      classification: 'Chile-shipping-poor',
      normalizedShippingMethodCount: 0,
    });
  });
});
