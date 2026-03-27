import { normalizeAliExpressRawSkus } from './aliexpress-raw-sku-normalizer';

describe('AliExpress raw SKU normalizer', () => {
  it('extracts purchasable sku rows from raw DS payload', () => {
    expect(
      normalizeAliExpressRawSkus({
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [
            {
              sku_id: '123',
              sku_available_stock: '8',
              offer_sale_price: { value: '12.5' },
            },
          ],
        },
      }),
    ).toEqual([
      {
        skuId: '123',
        stock: 8,
        salePrice: 12.5,
        attributes: {},
      },
    ]);
  });

  it('ignores incomplete raw sku rows', () => {
    expect(
      normalizeAliExpressRawSkus({
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [
            {
              sku_id: '123',
              offer_sale_price: { value: '12.5' },
            },
          ],
        },
      }),
    ).toEqual([]);
  });

  it('extracts attributes from ae_sku_property_dtos (ds.product.get shape)', () => {
    expect(
      normalizeAliExpressRawSkus({
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [
            {
              sku_id: '12000048020865799',
              sku_available_stock: 998,
              offer_sale_price: '3.19',
              ae_sku_property_dtos: {
                ae_sku_property_d_t_o: [
                  { sku_property_name: 'Color', sku_property_value: 'black' },
                ],
              },
            },
          ],
        },
      }),
    ).toEqual([
      {
        skuId: '12000048020865799',
        stock: 998,
        salePrice: 3.19,
        attributes: { Color: 'black' },
      },
    ]);
  });

  it('extracts attributes from sku_property_list (DS shape)', () => {
    expect(
      normalizeAliExpressRawSkus({
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [
            {
              sku_id: '12000048020865799',
              sku_available_stock: '998',
              offer_sale_price: '3.19',
              sku_property_list: {
                ae_sku_property: [
                  { sku_property_name: 'Color', sku_property_value: 'Gray' },
                ],
              },
            },
          ],
        },
      }),
    ).toEqual([
      {
        skuId: '12000048020865799',
        stock: 998,
        salePrice: 3.19,
        attributes: { Color: 'Gray' },
      },
    ]);
  });
});
