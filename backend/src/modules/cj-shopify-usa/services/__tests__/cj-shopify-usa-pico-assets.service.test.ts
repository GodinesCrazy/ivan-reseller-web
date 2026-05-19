import { cjShopifyUsaPicoAssetsService } from '../cj-shopify-usa-pico-assets.service';

describe('cjShopifyUsaPicoAssetsService', () => {
  it('collects up to 5 unique https image urls from draft and product', () => {
    const urls = cjShopifyUsaPicoAssetsService.collectProductImageUrls({
      draftPayload: {
        images: [
          { url: 'https://cdn.example.com/a.jpg' },
          { src: 'https://cdn.example.com/b.jpg' },
        ],
      },
      productImages: ['https://cdn.example.com/c.jpg', 'https://cdn.example.com/a.jpg'],
    });
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe('https://cdn.example.com/a.jpg');
  });

  it('requires minimum 3 images for video pipeline', () => {
    expect(cjShopifyUsaPicoAssetsService.hasMinimumAssets(['https://a.com/1.jpg', 'https://a.com/2.jpg'])).toBe(false);
    expect(
      cjShopifyUsaPicoAssetsService.hasMinimumAssets([
        'https://a.com/1.jpg',
        'https://a.com/2.jpg',
        'https://a.com/3.jpg',
      ]),
    ).toBe(true);
  });
});
