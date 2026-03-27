import { evaluateMlChileSkuAdmission } from './ml-chile-cl-sku-admission';
import { normalizeAliExpressRawSkus } from './aliexpress-raw-sku-normalizer';

describe('P16 CL SKU stock forensics', () => {
  it('preserves raw AliExpress stock and price so the CL-SKU gate can admit the candidate', () => {
    const normalizedSkus = normalizeAliExpressRawSkus({
      ae_item_sku_info_dtos: {
        ae_item_sku_info_d_t_o: [
          {
            sku_id: '12000052855206453',
            sku_available_stock: 36,
            offer_sale_price: '1.18',
            currency_code: 'USD',
          },
        ],
      },
    });

    expect(normalizedSkus).toHaveLength(1);
    expect(normalizedSkus[0]).toMatchObject({
      skuId: '12000052855206453',
      stock: 36,
      salePrice: 1.18,
    });

    const admission = evaluateMlChileSkuAdmission({
      productId: 'p16-test',
      productTitle: '',
      productImages: [],
      salePrice: 0,
      originalPrice: 0,
      currency: 'USD',
      stock: 0,
      logisticsInfoDto: {
        ship_to_country: 'CL',
        delivery_time: 7,
      },
      skus: normalizedSkus.map((sku) => ({
        skuId: sku.skuId,
        stock: sku.stock,
        salePrice: sku.salePrice,
        attributes: sku.attributes,
      })),
    });

    expect(admission).toMatchObject({
      code: 'admitted',
      admitted: true,
      skuId: '12000052855206453',
      stock: 36,
    });
  });
});
