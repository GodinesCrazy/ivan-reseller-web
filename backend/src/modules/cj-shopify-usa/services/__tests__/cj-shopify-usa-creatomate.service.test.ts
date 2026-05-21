import { cjShopifyUsaCreatomateService } from '../cj-shopify-usa-creatomate.service';

describe('cjShopifyUsaCreatomateService', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.CREATOMATE_API_KEY;
  const originalTemplateId = process.env.CREATOMATE_TEMPLATE_ID;
  const originalRenderMode = process.env.PICO_VIDEO_RENDER_MODE;

  beforeEach(() => {
    process.env.CREATOMATE_API_KEY = 'test-creatomate-key';
    process.env.CREATOMATE_TEMPLATE_ID = 'template-that-should-not-be-used-by-default';
    delete process.env.PICO_VIDEO_RENDER_MODE;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.CREATOMATE_API_KEY = originalApiKey;
    process.env.CREATOMATE_TEMPLATE_ID = originalTemplateId;
    process.env.PICO_VIDEO_RENDER_MODE = originalRenderMode;
    jest.restoreAllMocks();
  });

  it('uses the safe source render by default so product images are contained, not cropped', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'render-1' }),
    })) as unknown as typeof fetch;

    await cjShopifyUsaCreatomateService.createSlideshowRender({
      imageUrls: ['https://example.com/product-1.jpg', 'https://example.com/product-2.jpg'],
      productTitle: 'Very long pet travel bag title that should remain inside the video safe area',
    });

    const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(body.template_id).toBeUndefined();
    expect(body.source.width).toBe(1080);
    expect(body.source.height).toBe(1920);

    const imageElements = body.source.elements[0].elements;
    expect(imageElements.some((element: { fit?: string }) => element.fit === 'contain')).toBe(true);
    expect(imageElements.some((element: { fit?: string; opacity?: string }) => element.fit === 'cover' && element.opacity)).toBe(true);
  });

  it('refreshes a completed render url from Creatomate', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'render-1', status: 'succeeded', url: 'https://cdn.example.com/video.mp4' }),
    })) as unknown as typeof fetch;

    await expect(cjShopifyUsaCreatomateService.getRenderUrl('render-1')).resolves.toBe(
      'https://cdn.example.com/video.mp4',
    );
  });
});
