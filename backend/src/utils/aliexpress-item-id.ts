/**
 * Resolve AliExpress catalog item id from URLs (item pages, short links with id, /i/ paths).
 * Broader than adapter-only /item/... for production promotion URLs.
 */
export function extractAliExpressItemIdFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;

  const m1 = u.match(/(?:\/item\/|\/i\/)(\d{6,})(?:\.[a-z]+)?(?:\?|#|$|\/)/i);
  if (m1?.[1]) return m1[1]!;

  const m2 = u.match(/[?&]item_id=(\d{6,})/i);
  if (m2?.[1]) return m2[1]!;

  const m3 = u.match(/(\d{10,})/);
  if (m3?.[1] && u.toLowerCase().includes('aliexpress')) return m3[1]!;

  return null;
}
