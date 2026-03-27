/**
 * AliExpress product data can include video URLs (e.g. under *.aliexpress-media.com).
 * Publication and image pipelines must use static images only — never treat videos as gallery images.
 */
export function isAliExpressVideoOrNonStillImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return true;
  if (u.includes('video.aliexpress') || u.includes('video.aliexpress-media')) return true;
  if (u.includes('aliexpress-media.com') && u.includes('/play/')) return true;
  if (/\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(url)) return true;
  return false;
}
