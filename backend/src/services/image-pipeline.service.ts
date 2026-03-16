/**
 * Phase 2: Image processing pipeline before listing publication.
 * Download supplier images, resize (min 1200x1200), normalize format.
 * Watermark removal is not implemented (would require ML/heavy processing).
 */

import axios from 'axios';
import sharp from 'sharp';
import logger from '../config/logger';

const MIN_SIDE = 1200;
const MAX_SIDE = 4096;
const JPEG_QUALITY = 90;
const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
}

/**
 * Process a buffer: resize so both sides are at least MIN_SIDE (if smaller), cap at MAX_SIDE, normalize to JPEG.
 * Preserves aspect ratio. Does not upscale small images beyond MIN_SIDE.
 */
export async function processBuffer(
  inputBuffer: Buffer,
  contentType?: string
): Promise<ProcessedImage> {
  const image = sharp(inputBuffer, { failOnError: false });
  const meta = await image.metadata();
  let width = meta.width ?? 0;
  let height = meta.height ?? 0;

  let pipeline = image;

  // Resize so both sides are at least MIN_SIDE (upscale if needed); cap at MAX_SIDE
  if (width > 0 && height > 0 && (width < MIN_SIDE || height < MIN_SIDE)) {
    const scale = Math.max(MIN_SIDE / width, MIN_SIDE / height);
    const newW = Math.min(MAX_SIDE, Math.round(width * scale));
    const newH = Math.min(MAX_SIDE, Math.round(height * scale));
    pipeline = pipeline.resize(newW, newH);
    width = newW;
    height = newH;
  } else if (width > MAX_SIDE || height > MAX_SIDE) {
    pipeline = pipeline.resize(MAX_SIDE, MAX_SIDE, { fit: 'inside' });
    const m = await pipeline.metadata();
    width = m.width ?? width;
    height = m.height ?? height;
  }

  const buffer = await pipeline
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    contentType: 'image/jpeg',
    width: (await sharp(buffer).metadata()).width ?? width,
    height: (await sharp(buffer).metadata()).height ?? height,
  };
}

/**
 * Download image from URL and process: resize (min 1200x1200), normalize to JPEG.
 * Returns processed buffer and metadata. Throws on download failure or invalid image.
 */
export async function processFromUrl(url: string): Promise<ProcessedImage> {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: MAX_FILE_BYTES,
    maxBodyLength: MAX_FILE_BYTES,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller/1.0)', Accept: 'image/*' },
    validateStatus: (s) => s === 200,
  });

  const buffer = Buffer.from(resp.data);
  const contentType = (resp.headers['content-type'] as string) || 'image/jpeg';

  if (buffer.length < 1024) {
    throw new Error('Image too small');
  }

  return processBuffer(buffer, contentType);
}

/**
 * Run pipeline on a URL; on failure returns null and logs (caller can fall back to original URL/buffer).
 */
export async function processFromUrlSafe(url: string): Promise<ProcessedImage | null> {
  try {
    return await processFromUrl(url);
  } catch (e: any) {
    logger.warn('[IMAGE-PIPELINE] processFromUrl failed', {
      url: url?.slice(0, 100),
      error: e?.message,
    });
    return null;
  }
}
