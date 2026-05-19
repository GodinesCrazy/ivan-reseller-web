/**
 * PICO 3.1 — Collects 3–5 high-res product image URLs from listing draft / CJ product payload.
 * No local downloads: URLs are passed directly to Creatomate cloud render.
 */

const MIN_IMAGES = 3;
const MAX_IMAGES = 5;

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function extractFromPayload(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => {
      if (typeof image === 'string') return image;
      if (image && typeof image === 'object') {
        const record = image as Record<string, unknown>;
        return String(record.src ?? record.url ?? record.image ?? '');
      }
      return '';
    })
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url));
}

export const cjShopifyUsaPicoAssetsService = {
  MIN_IMAGES,
  MAX_IMAGES,

  collectProductImageUrls(input: {
    draftPayload: unknown;
    productImages: unknown;
    shopifyFallbackUrls?: string[];
  }): string[] {
    const draft = input.draftPayload && typeof input.draftPayload === 'object'
      ? (input.draftPayload as Record<string, unknown>)
      : {};
    const draftImages = extractFromPayload(draft.images);
    const productImages = extractFromPayload(input.productImages);
    const fallback = (input.shopifyFallbackUrls ?? []).filter((url) => /^https?:\/\//i.test(url));

    const merged = uniqueUrls([...draftImages, ...productImages, ...fallback]);
    return merged.slice(0, MAX_IMAGES);
  },

  hasMinimumAssets(urls: string[]): boolean {
    return urls.length >= MIN_IMAGES;
  },
};
