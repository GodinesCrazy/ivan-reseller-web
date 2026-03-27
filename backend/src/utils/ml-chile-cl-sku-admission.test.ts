import { evaluateMlChileSkuAdmission } from './ml-chile-cl-sku-admission';

describe('ML Chile CL-SKU admission gate', () => {
  it('admits a CL candidate with shipping support and in-stock sku', () => {
    expect(
      evaluateMlChileSkuAdmission({
        shippingInfo: {
          availableShippingMethods: [{ methodId: 'm1', cost: 5, estimatedDays: 10 }],
        },
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [
            {
              sku_id: 'sku-1',
              sku_available_stock: 3,
              offer_sale_price: { value: 12.2 },
            },
          ],
        },
      } as any),
    ).toMatchObject({
      code: 'admitted',
      admitted: true,
      skuId: 'sku-1',
    });
  });

  it('rejects when CL shipping is absent', () => {
    expect(
      evaluateMlChileSkuAdmission({
        shippingInfo: {
          availableShippingMethods: [],
        },
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [
            {
              sku_id: 'sku-1',
              sku_available_stock: 3,
              offer_sale_price: { value: 12.2 },
            },
          ],
        },
      } as any).code,
    ).toBe('no_destination_support_cl');
  });

  it('rejects when sku rows exist but all stock is zero', () => {
    expect(
      evaluateMlChileSkuAdmission({
        shippingInfo: {
          availableShippingMethods: [{ methodId: 'm1', cost: 5, estimatedDays: 10 }],
        },
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [
            {
              sku_id: 'sku-1',
              sku_available_stock: 0,
              offer_sale_price: { value: 12.2 },
            },
          ],
        },
      } as any).code,
    ).toBe('cl_sku_no_stock');
  });
});
