import { isCjShopifyUsaPetProduct } from '../cj-shopify-usa-policy.service';

describe('CJ Shopify USA pet policy', () => {
  it('rejects adult or human-use terms even when dog/collar appears', () => {
    expect(
      isCjShopifyUsaPetProduct({
        title: 'Collar Dog Slave Training Bundled Sheath',
        description: 'Adjustable black sheath shown on a mannequin',
      }),
    ).toBe(false);
  });

  it('rejects ambiguous accessory-only titles without a strong pet signal', () => {
    expect(isCjShopifyUsaPetProduct({ title: 'Adjustable Collar' })).toBe(false);
  });

  it('accepts real pet accessories with clear pet signals', () => {
    expect(isCjShopifyUsaPetProduct({ title: 'Adjustable Dog Collar for Daily Walks' })).toBe(true);
    expect(isCjShopifyUsaPetProduct({ title: 'Cat Grooming Brush for Shedding' })).toBe(true);
  });
});
