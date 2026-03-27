import {
  classifyListingTruth,
  reconcileProductTruth,
} from '../../services/operational-truth.service';

describe('operational-truth.service', () => {
  it('moves unsafe approved products to LEGACY_UNVERIFIED', () => {
    const result = reconcileProductTruth({
      status: 'APPROVED',
      isPublished: false,
      targetCountry: null,
      aliexpressSku: null,
      shippingCost: null,
      totalCost: null,
      marketplaceListings: [],
    });

    expect(result.nextStatus).toBe('LEGACY_UNVERIFIED');
    expect(result.nextIsPublished).toBe(false);
  });

  it('keeps safe unpublished products as VALIDATED_READY', () => {
    const result = reconcileProductTruth({
      status: 'APPROVED',
      isPublished: false,
      targetCountry: 'CL',
      aliexpressSku: 'sku-1',
      shippingCost: 4.5,
      totalCost: 12.5,
      marketplaceListings: [],
    });

    expect(result.nextStatus).toBe('VALIDATED_READY');
    expect(result.nextIsPublished).toBe(false);
  });

  it('keeps safe active products as PUBLISHED', () => {
    const result = reconcileProductTruth({
      status: 'PUBLISHED',
      isPublished: true,
      targetCountry: 'US',
      aliexpressSku: 'sku-1',
      shippingCost: 5,
      totalCost: 14,
      marketplaceListings: [{ status: 'active', listingId: 'abc' }],
    });

    expect(result.nextStatus).toBe('PUBLISHED');
    expect(result.nextIsPublished).toBe(true);
  });

  it('classifies legacy-linked listings as legacy artifacts', () => {
    expect(
      classifyListingTruth({
        listingStatus: 'failed_publish',
        productStatus: 'LEGACY_UNVERIFIED',
      })
    ).toBe('LEGACY_ARTIFACT');
  });
});
