import {
  evaluateMercadoLibreImagePolicyContract,
  type MlImageInspection,
} from '../mercadolibre-image-policy.service';

function inspection(overrides: Partial<MlImageInspection> = {}): MlImageInspection {
  return {
    url: 'https://example.com/clean-cover.jpg',
    sourceFamily: 'unknown',
    suspiciousTerms: [],
    width: 1200,
    height: 1200,
    metadataAvailable: true,
    squareLike: true,
    ...overrides,
  };
}

describe('mercadolibre-image-policy.service', () => {
  it('rejects primary images with text, logo, or watermark signals', () => {
    const result = evaluateMercadoLibreImagePolicyContract({
      imageUrls: ['https://example.com/cover-with-watermark.jpg'],
      inspectedImages: [
        inspection({
          url: 'https://example.com/cover-with-watermark.jpg',
          suspiciousTerms: ['watermark', 'text'],
        }),
      ],
    });

    expect(result.status).toBe('ml_image_policy_fail');
    expect(result.hardBlockers).toContain(
      'primary_image_url_contains_suspect_terms:watermark,text'
    );
  });

  it('rejects incomplete or uncentered product signals', () => {
    const result = evaluateMercadoLibreImagePolicyContract({
      imageUrls: ['https://example.com/cover.jpg'],
      inspectedImages: [inspection()],
      detectedVisualSignals: ['product_incomplete_or_uncentered'],
    });

    expect(result.status).toBe('ml_image_policy_fail');
    expect(result.hardBlockers).toContain('product_incomplete_or_uncentered');
  });

  it('rejects primary images below the minimum square size contract', () => {
    const result = evaluateMercadoLibreImagePolicyContract({
      imageUrls: ['https://example.com/cover-small.jpg'],
      inspectedImages: [
        inspection({
          url: 'https://example.com/cover-small.jpg',
          width: 900,
          height: 900,
        }),
      ],
    });

    expect(result.status).toBe('ml_image_policy_fail');
    expect(result.hardBlockers).toContain('primary_image_below_1200x1200');
  });

  it('requires manual review for single supplier-raw covers without reviewed proof', () => {
    const result = evaluateMercadoLibreImagePolicyContract({
      imageUrls: ['https://ae-pic-a1.aliexpress-media.com/kf/unsafe-cover.jpg'],
      inspectedImages: [
        inspection({
          url: 'https://ae-pic-a1.aliexpress-media.com/kf/unsafe-cover.jpg',
          sourceFamily: 'aliexpress_supplier',
        }),
      ],
    });

    expect(result.status).toBe('ml_image_manual_review_required');
    expect(result.manualReviewReasons).toContain('supplier_raw_images_require_reviewed_ml_cover');
    expect(result.manualReviewReasons).toContain('single_cover_image_requires_manual_review');
  });
});
