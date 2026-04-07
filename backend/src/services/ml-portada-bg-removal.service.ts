/**
 * ml-portada-bg-removal.service.ts
 *
 * AI-powered background removal for ML cover images.
 * Uses @imgly/background-removal-node (ONNX local model, no API key, no cost).
 *
 * Pipeline:
 *   1. Fetch image buffer from URL or local path
 *   2. removeBackground() → PNG with transparent background (RGBA)
 *   3. Crop to tight bounding box of the product (trim alpha)
 *   4. Composite centered on 1200×1200 pure white canvas (80% fill ratio)
 *   5. Output JPEG 92 quality
 *
 * Result: clean, professional white-background portada guaranteed 1200×1200.
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import axios from 'axios';
import logger from '../config/logger';

/** Output canvas size required by ML */
const CANVAS_PX = 1200;
/** Product fills at most this fraction of the canvas side (leaves 10% margin each side) */
const FILL_RATIO = 0.80;

/**
 * Fetch image buffer from a URL or local filesystem path.
 */
async function fetchImageBuffer(src: string): Promise<Buffer> {
  if (src.startsWith('http://') || src.startsWith('https://')) {
    const resp = await axios.get(src, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxContentLength: 20 * 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
    });
    return Buffer.from(resp.data);
  }
  return fsp.readFile(src);
}

/**
 * Remove background from an image buffer using @imgly/background-removal-node.
 * Returns a PNG Buffer with transparent background (RGBA), or null on failure.
 */
async function removeBackground(inputBuffer: Buffer): Promise<Buffer | null> {
  try {
    // Dynamic import to keep startup fast
    const { removeBackground: bgRemove } = await import('@imgly/background-removal-node');
    // Pre-convert to PNG so the library always receives a well-formed PNG Blob with
    // explicit MIME type — avoids "Unsupported format: " when the library can't detect MIME
    const pngBuf = await sharp(inputBuffer).png().toBuffer();
    // Use Uint8Array to avoid TS Buffer<ArrayBufferLike> → BlobPart incompatibility
    const blob = new Blob([new Uint8Array(pngBuf)], { type: 'image/png' });
    const resultBlob = await bgRemove(blob, {
      // Use the smallest model for speed while keeping quality acceptable
      model: 'small',
      output: { format: 'image/png', quality: 1 },
    });
    const arrBuf = await resultBlob.arrayBuffer();
    return Buffer.from(arrBuf);
  } catch (err: any) {
    logger.warn('[BG-REMOVAL] removeBackground failed', { error: err?.message });
    return null;
  }
}

/**
 * Trim transparent border from a PNG RGBA buffer (tight crop to product bounds).
 * Returns the cropped PNG buffer, or the original if trim fails.
 */
async function trimTransparentBorder(pngBuffer: Buffer): Promise<Buffer> {
  try {
    // sharp's trim() removes edges matching a color; for alpha we use a threshold approach
    const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const ch = info.channels as number; // should be 4 (RGBA)

    if (ch < 4) return pngBuffer; // no alpha channel

    let minX = w, minY = h, maxX = 0, maxY = 0;
    const ALPHA_THRESHOLD = 10; // pixels with alpha < 10 are considered transparent

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

    if (minX >= maxX || minY >= maxY) return pngBuffer; // fully transparent

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    return sharp(pngBuffer)
      .extract({ left: minX, top: minY, width: cropW, height: cropH })
      .png()
      .toBuffer();
  } catch {
    return pngBuffer;
  }
}

/**
 * Compose a cropped RGBA PNG onto a 1200×1200 pure white canvas, centered with FILL_RATIO.
 * Returns a JPEG buffer.
 */
async function composeOnWhiteCanvas(croppedPng: Buffer): Promise<Buffer> {
  const maxSide = Math.floor(CANVAS_PX * FILL_RATIO);

  const resized = await sharp(croppedPng)
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  const canvas = sharp({
    create: {
      width: CANVAS_PX,
      height: CANVAS_PX,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  });

  return canvas
    .composite([{ input: resized, gravity: 'centre' }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

/**
 * Check that the composed image actually contains a real product.
 *
 * Two gates:
 *  - Upper bound: >95% white → product invisible (already caught before)
 *  - Lower bound: <15% product coverage (>85% white) → not a product photo.
 *    This discards promotional banners, "HOT SALE" fire graphics, size charts,
 *    color swatches, and any image where ONNX found almost nothing to isolate.
 *    Real products fill 20–70% of the 1200×1200 canvas after isolation.
 */
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
  // Product must cover at least 15% of the canvas (whitePct < 0.85).
  // Anything above 85% white signals a promo overlay or empty image, not a product.
  const ok = whitePct < 0.85;
  return { ok, whitePct };
}

export interface BgRemovalResult {
  success: boolean;
  jpegBuffer?: Buffer;
  whitePct?: number;
  error?: string;
  source: string; // which image URL/path was used
}

/**
 * Try AI background removal on a list of image sources (URLs or local paths).
 * Returns the first successful result, or failure if all fail.
 */
export async function generateWhiteBgPortada(
  imageSources: string[],
  options: { productId?: number; logLabel?: string } = {}
): Promise<BgRemovalResult> {
  const label = options.logLabel ?? `product-${options.productId ?? 'unknown'}`;

  for (let i = 0; i < imageSources.length; i++) {
    const src = imageSources[i]!;
    logger.info(`[BG-REMOVAL] Attempting source ${i + 1}/${imageSources.length}`, { label, src: src.substring(0, 80) });

    try {
      // 1. Fetch
      const raw = await fetchImageBuffer(src);
      logger.info(`[BG-REMOVAL] Fetched ${raw.length} bytes`, { label, srcIdx: i });

      // 2. AI background removal
      const pngWithAlpha = await removeBackground(raw);
      if (!pngWithAlpha) {
        logger.warn(`[BG-REMOVAL] removeBackground returned null for srcIdx=${i}`, { label });
        continue;
      }
      logger.info(`[BG-REMOVAL] Background removed (${pngWithAlpha.length} bytes PNG)`, { label, srcIdx: i });

      // 3. Tight crop
      const cropped = await trimTransparentBorder(pngWithAlpha);
      logger.info(`[BG-REMOVAL] Trimmed to product bounds`, { label, srcIdx: i });

      // 4. Compose on white 1200×1200
      const jpeg = await composeOnWhiteCanvas(cropped);

      // 5. Quality gate
      const { ok, whitePct } = await checkVisibility(jpeg);
      logger.info(`[BG-REMOVAL] Visibility check`, { label, srcIdx: i, whitePct: (whitePct * 100).toFixed(1), ok });

      if (!ok) {
        logger.warn(`[BG-REMOVAL] Image discarded — not a product photo (whitePct=${(whitePct*100).toFixed(1)}% ≥85%): likely promo banner, size chart, or overlay — trying next`, { label, srcIdx: i, whitePct });
        continue;
      }

      logger.info(`[BG-REMOVAL] ✅ Success — clean white-bg portada generated`, { label, srcIdx: i, bytes: jpeg.length });
      return { success: true, jpegBuffer: jpeg, whitePct, source: src };
    } catch (err: any) {
      logger.warn(`[BG-REMOVAL] Source ${i} failed`, { label, error: err?.message });
    }
  }

  return { success: false, error: 'All sources failed background removal', source: '' };
}

/**
 * Generate and save a white-background portada to the asset pack directory.
 * Returns local file path on success, null on failure.
 */
export async function generateAndSavePortada(params: {
  productId: number;
  imageUrls: string[];
  outputDir: string;
  filename?: string;
}): Promise<{ path: string; whitePct: number } | null> {
  const filename = params.filename ?? 'cover_main.jpg';
  const result = await generateWhiteBgPortada(params.imageUrls, {
    productId: params.productId,
    logLabel: `product-${params.productId}`,
  });

  if (!result.success || !result.jpegBuffer) {
    logger.warn('[BG-REMOVAL] generateAndSavePortada: all sources failed', { productId: params.productId });
    return null;
  }

  await fsp.mkdir(params.outputDir, { recursive: true });
  const outPath = path.join(params.outputDir, filename);
  await fsp.writeFile(outPath, result.jpegBuffer);
  logger.info('[BG-REMOVAL] Portada saved', { productId: params.productId, path: outPath, bytes: result.jpegBuffer.length });
  return { path: outPath, whitePct: result.whitePct! };
}
