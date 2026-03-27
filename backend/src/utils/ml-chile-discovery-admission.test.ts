import { evaluateMlChileDiscoveryAdmission } from './ml-chile-discovery-admission';

describe('ML Chile discovery admission gate', () => {
  it('admits a candidate when shipping methods exist', () => {
    expect(
      evaluateMlChileDiscoveryAdmission({
        shipping_info: {
          methods: {
            method: [{ method_id: 'm1', method_name: 'AliExpress Standard', cost: '4', estimated_days: '10' }],
          },
        },
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [{ sku_id: 'sku-1', offer_sale_price: { value: 10 }, sku_available_stock: 3 }],
        },
      } as any),
    ).toMatchObject({
      code: 'admitted',
      admitted: true,
      supportSignal: 'confirmed_with_shipping_methods',
    });
  });

  it('admits a candidate when CL is acknowledged in logistics_info_dto even without shipping methods', () => {
    expect(
      evaluateMlChileDiscoveryAdmission({
        logistics_info_dto: {
          ship_to_country: 'CL',
          delivery_time: 7,
        },
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [{ sku_id: 'sku-1', offer_sale_price: { value: 10 }, sku_available_stock: 3 }],
        },
      } as any),
    ).toMatchObject({
      code: 'admitted',
      admitted: true,
      supportSignal: 'acknowledged_without_shipping_methods',
    });
  });

  it('rejects when no Chile support signal exists', () => {
    expect(
      evaluateMlChileDiscoveryAdmission({
        logistics_info_dto: {},
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [{ sku_id: 'sku-1', offer_sale_price: { value: 10 }, sku_available_stock: 3 }],
        },
      } as any),
    ).toMatchObject({
      code: 'no_destination_support_cl',
      admitted: false,
    });
  });
});
