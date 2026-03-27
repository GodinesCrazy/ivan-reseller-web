import {
  getStrictPublishReadinessBlockers,
  isStrictPublishReady,
} from './strict-publish-readiness';

describe('strict publish readiness', () => {
  it('accepts only fully validated candidates', () => {
    expect(
      isStrictPublishReady({
        status: 'VALIDATED_READY',
        isPublished: false,
        targetCountry: 'US',
        shippingCost: 0,
        importTax: 0,
        totalCost: 12.5,
        aliexpressSku: 'sku-123',
      }),
    ).toBe(true);
  });

  it('blocks legacy or incomplete products', () => {
    expect(
      getStrictPublishReadinessBlockers({
        status: 'APPROVED',
        isPublished: false,
        targetCountry: '',
        shippingCost: null,
        importTax: undefined,
        totalCost: null,
        aliexpressSku: '',
      }),
    ).toEqual([
      'status_not_validated_ready',
      'missing_target_country',
      'missing_shipping_cost',
      'missing_import_tax',
      'missing_total_cost',
      'missing_aliexpress_sku',
    ]);
  });

  it('blocks already published products even if fields look complete', () => {
    expect(
      getStrictPublishReadinessBlockers({
        status: 'VALIDATED_READY',
        isPublished: true,
        targetCountry: 'US',
        shippingCost: 1,
        importTax: 0,
        totalCost: 2,
        aliexpressSku: 'sku-123',
      }),
    ).toContain('already_published');
  });
});
