/**
 * ebay-image-processing.service.ts
 *
 * Image processing pipeline for eBay listings.
 * Applies the same AI background-removal + white-canvas treatment used for ML.
 *
 * Pipeline per image:
 *  Hero (first image):
 *    1. Fetch → AI background removal (@imgly/background-removal-node)
 *    2. Remove detached components (promo stickers, logos)
 *    3. Tight-crop to product bounding box
 *    4. Compose centered on 1600×1600 white canvas (80 % fill ratio)
 *    5. Output JPEG quality 92
 *
 *  Secondary images (2–24):
 *    1. Fetch → flatten to white → square-fit to 1600×1600
 *    2. Output JPEG quality 92
 *
 * The 1600 px canvas satisfies eBay's recommendation for zoom capability while the
 * minimum 500 px hard requirement is exceeded by a wide margin.
 */

import sharp from 'sharp';
import axios from 'axios';
import logger from '../config/logger';

// ── Constants ─────────────────────────────────────────────────────────────────
/** eBay recommended longest side for zoom (hard min is 500). */
const EBAY_CANVAS_PX = 1600;
/** Product fills at most this fraction of the canvas side. */
const FILL_RATIO = 0.80;
/** Max images eBay accepts per listing. */
const EBAY_MAX_IMAGES = 24;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface EbayProcessedImage {
  /** Original source URL */
  sourceUrl: string;
  /** Processed JPEG buffer (null if processing failed) */
  jpegBuffer: Buffer | null;
  /** Whether this is the hero (first) image */
  isHero: boolean;
  /** Processing method used */
  method: 'ai_bg_removal' | 'square_fit_white' | 'failed';
  /** Optional error message */
  error?: string;
}

export interface EbayImageProcessingResult {
  processedImages: EbayProcessedImage[];
  heroProcessed: boolean;
  totalProcessed: number;
  totalFailed: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchImageBuffer(src: string): Promise<Buffer> {
  if (!src || !/^https?:\/\//i.test(src)) {
    throw new Error(`Invalid image URL: ${src}`);
  }
  const resp = await axios.get(src, {
    responseType: 'arraybuffer',
    timeout: 20_000,
    maxContentLength: 20 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-EbayImg/1.0)',
      Accept: 'image/*',
      Referer: 'https://www.aliexpress.com/',
    },
  });
  return Buffer.from(resp.data);
}

/**
 * Upgrade AliExpress CDN URLs to full-resolution versions.
 */
function upgradeAliUrl(url: string): string {
  return url
    .replace(/_\d+x\d+\w*\.(jpg|jpeg|png|webp)/gi, '.$1')
    .replace(/\.(jpg|jpeg|png)_\d+x\d+\w*\.(jpg|jpeg|png)/gi, '.$1')
    .replace(/\.webp(?=($|[?#]))/gi, '.jpg')
    .replace(/[?&](bw|bh)=\d+/gi, '')
    .replace(/^http:\/\//, 'https://');
}

// ── Hero processing (AI background removal) ──────────────────────────────────

async function processHeroImage(raw: Buffer, label: string): Promise<Buffer | null> {
  try {
    // Dynamic import to keep startup fast
    const { generateWhiteBgPortada } = await import('./ml-portada-bg-removal.service');

    // generateWhiteBgPortada expects URLs, but we already have a buffer.
    // We'll use the lower-level pipeline directly for the buffer we already have.
    const bgRemovalResult = await processBufferWithBgRemoval(raw, label);
    if (bgRemovalResult) return bgRemovalResult;

    // Fallback: use generateWhiteBgPortada-style flow but adapted for eBay canvas
    logger.warn('[EBAY-IMG-PROC] Hero AI bg removal failed, falling back to square-fit', { label });
    return null;
  } catch (err: any) {
    logger.warn('[EBAY-IMG-PROC] Hero processing threw', { label, error: err?.message });
    return null;
  }
}

/**
 * Direct buffer processing with AI background removal for eBay canvas size.
 */
async function processBufferWithBgRemoval(inputBuffer: Buffer, label: string): Promise<Buffer | null> {
  try {
    const { removeBackground: bgRemove } = await import('@imgly/background-removal-node');

    // Pre-convert to PNG for the library
    const pngBuf = await sharp(inputBuffer).png().toBuffer();
    const blob = new Blob([new Uint8Array(pngBuf)], { type: 'image/png' });

    const resultBlob = await bgRemove(blob, {
      model: 'small',
      output: { format: 'image/png', quality: 1 },
    });
    const arrBuf = await resultBlob.arrayBuffer();
    const pngWithAlpha = Buffer.from(arrBuf);

    if (!pngWithAlpha || pngWithAlpha.length < 100) {
      logger.warn('[EBAY-IMG-PROC] bg removal returned empty/tiny result', { label });
      return null;
    }

    // Remove detached components (promo stickers/logos)
    const filtered = await keepMainSubjectComponents(pngWithAlpha);

    // Tight-crop to product bounds
    const cropped = await trimTransparentBorder(filtered);

    // Compose on eBay-sized white canvas
    const jpeg = await composeOnWhiteCanvas(cropped, EBAY_CANVAS_PX);

    // Quality gate: product must be visible
    const { ok, whitePct } = await checkVisibility(jpeg);
    if (!ok) {
      logger.warn('[EBAY-IMG-PROC] Hero bg-removal result failed visibility gate', {
        label,
        whitePct: (whitePct * 100).toFixed(1),
      });
      return null;
    }

    logger.info('[EBAY-IMG-PROC] Hero AI bg removal succeeded', {
      label,
      whitePct: (whitePct * 100).toFixed(1),
      bytes: jpeg.length,
    });
    return jpeg;
  } catch (err: any) {
    logger.warn('[EBAY-IMG-PROC] processBufferWithBgRemoval failed', { label, error: err?.message });
    return null;
  }
}

// ── Component filtering (reused from ML pipeline logic) ──────────────────────

async function keepMainSubjectComponents(pngBuffer: Buffer): Promise<Buffer> {
  try {
    const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const ch = info.channels as number;
    if (ch < 4) return pngBuffer;

    const ALPHA_THRESHOLD = 10;
    const visited = new Uint8Array(w * h);
    const labels = new Int32Array(w * h);
    labels.fill(-1);

    type Component = {
      id: number;
      area: number;
      minX: number; minY: number; maxX: number; maxY: number;
      sumX: number; sumY: number;
    };
    const components: Component[] = [];

    let compId = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (visited[idx]) continue;
        visited[idx] = 1;
        const alpha = data[idx * ch + 3]!;
        if (alpha <= ALPHA_THRESHOLD) continue;

        const qx: number[] = [x];
        const qy: number[] = [y];
        let qi = 0;
        const comp: Component = { id: compId, area: 0, minX: x, minY: y, maxX: x, maxY: y, sumX: 0, sumY: 0 };

        while (qi < qx.length) {
          const cx = qx[qi]!;
          const cy = qy[qi]!;
          qi += 1;
          const cidx = cy * w + cx;
          labels[cidx] = compId;
          comp.area += 1;
          comp.sumX += cx;
          comp.sumY += cy;
          if (cx < comp.minX) comp.minX = cx;
          if (cy < comp.minY) comp.minY = cy;
          if (cx > comp.maxX) comp.maxX = cx;
          if (cy > comp.maxY) comp.maxY = cy;

          const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
          for (const [nx, ny] of neighbors) {
            if (nx! < 0 || ny! < 0 || nx! >= w || ny! >= h) continue;
            const nidx = ny! * w + nx!;
            if (visited[nidx]) continue;
            visited[nidx] = 1;
            const na = data[nidx * ch + 3]!;
            if (na > ALPHA_THRESHOLD) {
              qx.push(nx!);
              qy.push(ny!);
            }
          }
        }

        components.push(comp);
        compId += 1;
      }
    }

    if (components.length <= 1) return pngBuffer;
    const largest = components.reduce((best, c) => (c.area > best.area ? c : best));
    const largestCx = largest.sumX / largest.area;
    const largestCy = largest.sumY / largest.area;
    const distLimit = Math.max(w, h) * 0.35;

    const keepIds = new Set<number>([largest.id]);
    for (const c of components) {
      if (c.id === largest.id) continue;
      const cx = c.sumX / c.area;
      const cy = c.sumY / c.area;
      const d = Math.hypot(cx - largestCx, cy - largestCy);
      if (c.area >= largest.area * 0.12 && d <= distLimit) {
        keepIds.add(c.id);
      }
    }

    const out = Buffer.from(data);
    for (let i = 0; i < w * h; i++) {
      const lid = labels[i]!;
      if (lid < 0 || !keepIds.has(lid)) {
        out[i * ch + 3] = 0;
      }
    }

    return await sharp(out, { raw: { width: w, height: h, channels: ch as 1 | 2 | 3 | 4 } })
      .png()
      .toBuffer();
  } catch {
    return pngBuffer;
  }
}

async function trimTransparentBorder(pngBuffer: Buffer): Promise<Buffer> {
  try {
    const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const ch = info.channels as number;
    if (ch < 4) return pngBuffer;

    let minX = w, minY = h, maxX = 0, maxY = 0;
    const ALPHA_THRESHOLD = 10;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * ch + 3]!;
        if (alpha > ALPHA_THRESHOLD) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX >= maxX || minY >= maxY) return pngBuffer;

    return sharp(pngBuffer)
      .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
      .png()
      .toBuffer();
  } catch {
    return pngBuffer;
  }
}

// ── Canvas composition ───────────────────────────────────────────────────────

async function composeOnWhiteCanvas(croppedPng: Buffer, canvasPx: number): Promise<Buffer> {
  const maxSide = Math.floor(canvasPx * FILL_RATIO);

  const resized = await sharp(croppedPng)
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  const canvas = sharp({
    create: {
      width: canvasPx,
      height: canvasPx,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  });

  return canvas
    .composite([{ input: resized, gravity: 'centre' }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function checkVisibility(jpegBuf: Buffer): Promise<{ ok: boolean; whitePct: number }> {
  const { data, info } = await sharp(jpegBuf)
    .resize(200, 200, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let white = 0;
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += (info.channels as number)) {
    if (data[i]! > 240 && data[i + 1]! > 240 && data[i + 2]! > 240) white++;
  }
  const whitePct = white / total;
  return { ok: whitePct < 0.85, whitePct };
}

// ── Secondary image processing (square fit with white bg) ────────────────────

async function processSecondaryImage(raw: Buffer): Promise<Buffer> {
  const maxSide = EBAY_CANVAS_PX;
  return sharp(raw)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(maxSide, maxSide, { fit: 'contain', background: '#ffffff' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Process a list of image URLs for eBay listing compliance.
 * Hero image gets AI background removal + white canvas.
 * Secondary images get square-fit with white background.
 *
 * @param imageUrls  Raw image URLs (typically from AliExpress)
 * @param options    Processing options
 * @returns          Processed image buffers and metadata
 */
export async function processEbayImages(
  imageUrls: string[],
  options?: {
    maxImages?: number;
    productId?: number;
    concurrency?: number;
  }
): Promise<EbayImageProcessingResult> {
  const maxImages = Math.max(1, Math.min(EBAY_MAX_IMAGES, Number(options?.maxImages) || EBAY_MAX_IMAGES));
  const concurrency = Math.max(1, Math.min(4, Number(options?.concurrency) || 3));
  const label = `product-${options?.productId ?? 'unknown'}`;

  // Dedupe and normalize URLs
  const urls = Array.from(
    new Set(
      (Array.isArray(imageUrls) ? imageUrls : [])
        .map((u) => upgradeAliUrl(String(u || '').trim()))
        .filter((u) => /^https?:\/\//i.test(u))
    )
  ).slice(0, maxImages);

  if (urls.length === 0) {
    return { processedImages: [], heroProcessed: false, totalProcessed: 0, totalFailed: 0 };
  }

  logger.info('[EBAY-IMG-PROC] Starting image processing', {
    label,
    totalImages: urls.length,
    maxImages,
  });

  const results: EbayProcessedImage[] = [];

  // Process hero image first (index 0)
  const heroUrl = urls[0]!;
  const heroResult = await processOneImage(heroUrl, true, label);
  results.push(heroResult);

  // Process secondary images with limited concurrency
  const secondaryUrls = urls.slice(1);
  if (secondaryUrls.length > 0) {
    const secondaryResults = await mapWithConcurrency(
      secondaryUrls,
      concurrency,
      async (url) => processOneImage(url, false, label)
    );
    results.push(...secondaryResults);
  }

  const totalProcessed = results.filter((r) => r.jpegBuffer !== null).length;
  const totalFailed = results.filter((r) => r.jpegBuffer === null).length;
  const heroProcessed = results[0]?.jpegBuffer !== null;

  logger.info('[EBAY-IMG-PROC] Processing complete', {
    label,
    totalProcessed,
    totalFailed,
    heroProcessed,
  });

  return { processedImages: results, heroProcessed, totalProcessed, totalFailed };
}

async function processOneImage(
  url: string,
  isHero: boolean,
  label: string
): Promise<EbayProcessedImage> {
  try {
    const raw = await fetchImageBuffer(url);
    logger.info('[EBAY-IMG-PROC] Fetched image', {
      label,
      url: url.substring(0, 80),
      bytes: raw.length,
      isHero,
    });

    if (isHero) {
      const heroJpeg = await processHeroImage(raw, label);
      if (heroJpeg) {
        return { sourceUrl: url, jpegBuffer: heroJpeg, isHero: true, method: 'ai_bg_removal' };
      }
      // Fallback: square-fit for hero too
      const fallbackJpeg = await processSecondaryImage(raw);
      return { sourceUrl: url, jpegBuffer: fallbackJpeg, isHero: true, method: 'square_fit_white' };
    }

    const jpeg = await processSecondaryImage(raw);
    return { sourceUrl: url, jpegBuffer: jpeg, isHero: false, method: 'square_fit_white' };
  } catch (err: any) {
    logger.warn('[EBAY-IMG-PROC] Failed to process image', {
      label,
      url: url.substring(0, 80),
      isHero,
      error: err?.message,
    });
    return { sourceUrl: url, jpegBuffer: null, isHero, method: 'failed', error: err?.message };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
