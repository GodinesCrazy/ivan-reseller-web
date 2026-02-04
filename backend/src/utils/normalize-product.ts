/**
 * Normalization layer for product data from any source.
 * Single function: normalizeProduct(raw) -> NormalizedProduct | null
 * Invalid products return null and are discarded.
 */

export interface NormalizedProduct {
  title: string;
  price: number;
  currency: string;
  images: string[];
  supplier: 'aliexpress';
  source: 'native_scraper' | 'affiliate' | 'scraper_bridge';
  productUrl: string;
  productId?: string;
  raw?: unknown;
}

function ensureString(v: unknown): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function ensureNumber(v: unknown): number {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function ensureImages(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.startsWith('http'))
      .map((x) => (x.startsWith('//') ? `https:${x}` : x.startsWith('http') ? x : `https://${x}`));
  }
  if (typeof v === 'string' && v.startsWith('http')) return [v.startsWith('//') ? `https:${v}` : v];
  return [];
}

function ensureUrl(v: unknown): string {
  const s = ensureString(v);
  if (!s || s.length < 10) return '';
  if (s.startsWith('http')) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `https://www.aliexpress.com${s}`;
  return `https://${s}`;
}

export function normalizeProduct(
  raw: unknown,
  source: 'native_scraper' | 'affiliate' | 'scraper_bridge'
): NormalizedProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const title = ensureString(o.title ?? o.name ?? o.productTitle ?? '');
  const price = ensureNumber(o.price ?? o.sourcePrice ?? o.priceMin ?? o.priceMax ?? o.cost ?? 0);
  const currency = (ensureString(o.currency ?? o.sourceCurrency ?? o.priceCurrency ?? 'USD') || 'USD').toUpperCase();
  const productUrl = ensureUrl(o.productUrl ?? o.url ?? o.aliexpressUrl ?? o.link ?? '');
  const imageUrl = ensureString(o.imageUrl ?? o.image ?? o.mainImage ?? '');
  const imagesRaw = o.images ?? o.imageList ?? (imageUrl ? [imageUrl] : []);
  const images = ensureImages(imagesRaw);
  const productId = ensureString(o.productId ?? o.id ?? '');

  if (!title || title.length < 2) return null;
  if (price <= 0) return null;
  if (!productUrl || productUrl.length < 15) return null;

  return {
    title,
    price,
    currency,
    images: images.length > 0 ? images : (imageUrl ? [imageUrl.startsWith('http') ? imageUrl : `https://${imageUrl}`] : []),
    supplier: 'aliexpress',
    source,
    productUrl,
    productId: productId || undefined,
    raw: o,
  };
}
