import { isAliExpressVideoOrNonStillImageUrl } from './aliexpress-listing-still-image-url';

describe('isAliExpressVideoOrNonStillImageUrl', () => {
  it('treats AliExpress video URLs as non-still-image', () => {
    expect(
      isAliExpressVideoOrNonStillImageUrl('https://video.aliexpress-media.com/play/4000281538369.mp4'),
    ).toBe(true);
    expect(isAliExpressVideoOrNonStillImageUrl('https://example.com/gallery/play/hero.jpg')).toBe(false);
  });

  it('allows normal AliExpress CDN still images', () => {
    expect(
      isAliExpressVideoOrNonStillImageUrl('https://ae01.alicdn.com/kf/Sfd8ecf61dd114748a07a5337170aa38dI.jpg'),
    ).toBe(false);
    expect(
      isAliExpressVideoOrNonStillImageUrl('https://ae-pic-a1.aliexpress-media.com/kf/example.jpg'),
    ).toBe(false);
  });
});
