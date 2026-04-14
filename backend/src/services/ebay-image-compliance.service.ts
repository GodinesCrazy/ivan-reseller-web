import axios from 'axios';
import sharp from 'sharp';
import logger from '../config/logger';
import { evaluateMlPortadaStrictGateFromBuffer } from './ml-portada-visual-compliance.service';
import { evaluatePortadaComplianceV2 } from './ml-portada-compliance-v2.service';
import { processEbayImages } from './ebay-image-processing.service';
import { uploadImagesToEbayEps } from './ebay-image-upload.service';

const EBAY_MAX_IMAGES = 24;
const EBAY_MIN_LONGEST_SIDE = 500;
const EBAY_RECOMMENDED_LONGEST_SIDE = 1600;
const EBAY_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'gif']);
const ALI_CDN_PATTERN = /aliexpress-media\.com|alicdn\.com|ae0[0-9]\.alicdn\.com/i;

function extractUrlExtension(url: string): string | null {
  try {
    const parsed = new URL(String(url || '').trim());
    const path = String(parsed.pathname || '').toLowerCase();
    const match = path.match(/\.([a-z0-9]{2,5})$/i);
    if (!match) return null;
    const ext = String(match[1] || '').toLowerCase();
    if (!ext) return null;
    if (ext === 'tif') return 'tiff';
    if (ext === 'jpg') return 'jpeg';
    return ext;
  } catch {
    return null;
  }
}

function normalizeDecodedFormat(format: string): string {
  const f = String(format || '').toLowerCase();
  if (f === 'tif') return 'tiff';
  if (f === 'jpg') return 'jpeg';
  return f;
}

export interface EbayImageComplianceAudit {
  sourceUrl: string;
  resolvedUrl: string | null;
  accepted: boolean;
  reasons: string[];
  warnings: string[];
  format?: string;
  width?: number;
  height?: number;
  longestSide?: number;
  complianceScore?: number;
}

export interface EbayImageComplianceResult {
  acceptedUrls: string[];
  audits: EbayImageComplianceAudit[];
  rejectedCount: number;
  warnings: string[];
}

function normalizeUrl(raw: string): string {
  return String(raw || '').trim();
}

function upgradeAliExpressImageUrl(url: string): string {
  let upgraded = url;
  upgraded = upgraded
    .replace(/_\d+x\d+\w*\.(jpg|jpeg|png|webp)/gi, '.$1')
    .replace(/\.(jpg|jpeg|png)_\d+x\d+\w*\.(jpg|jpeg|png)/gi, '.$1')
    .replace(/\.webp(?=($|[?#]))/gi, '.jpg')
    .replace(/[?&](bw|bh)=\d+/gi, '');
  if (upgraded.startsWith('http://')) {
    upgraded = upgraded.replace('http://', 'https://');
  }
  return upgraded;
}

function buildUrlCandidates(url: string): string[] {
  const out: string[] = [];
  const push = (candidate: string) => {
    const clean = normalizeUrl(candidate);
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) return;
    if (!out.includes(clean)) out.push(clean);
  };

  const cleanUrl = normalizeUrl(url);
  if (!cleanUrl) return out;

  if (ALI_CDN_PATTERN.test(cleanUrl)) {
    push(upgradeAliExpressImageUrl(cleanUrl));
  }
  push(cleanUrl);
  return out;
}

async function downloadImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxContentLength: EBAY_MAX_IMAGE_BYTES,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-eBayImageCompliance/1.0)',
      Accept: 'image/*,*/*;q=0.8',
      Referer: 'https://www.aliexpress.com/',
    },
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  const buffer = Buffer.isBuffer(response.data)
    ? response.data
    : Buffer.from(response.data);
  return { buffer, contentType };
}

async function resolveImageFromCandidates(candidates: string[]): Promise<{
  resolvedUrl: string | null;
  buffer: Buffer | null;
  contentType: string;
  errors: string[];
}> {
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const downloaded = await downloadImageBuffer(candidate);
      return {
        resolvedUrl: candidate,
        buffer: downloaded.buffer,
        contentType: downloaded.contentType,
        errors,
      };
    } catch (error: any) {
      errors.push(`${candidate}::${error?.message || 'download_failed'}`);
    }
  }
  return {
    resolvedUrl: null,
    buffer: null,
    contentType: '',
    errors,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

function dedupeReasons(values: string[]): string[] {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

export async function enforceEbayImageCompliance(
  imageUrls: string[],
  options?: {
    maxImages?: number;
    concurrency?: number;
  }
): Promise<EbayImageComplianceResult> {
  const maxImages = Math.max(1, Math.min(EBAY_MAX_IMAGES, Number(options?.maxImages) || EBAY_MAX_IMAGES));
  const concurrency = Math.max(1, Math.min(6, Number(options?.concurrency) || 4));
  const normalized = Array.from(
    new Set(
      (Array.isArray(imageUrls) ? imageUrls : [])
        .map((url) => normalizeUrl(String(url || '')))
        .filter((url) => /^https?:\/\//i.test(url))
    )
  );

  if (normalized.length === 0) {
    return {
      acceptedUrls: [],
      audits: [],
      rejectedCount: 0,
      warnings: ['no_image_urls_provided'],
    };
  }

  const audits = await mapWithConcurrency(normalized, concurrency, async (sourceUrl) => {
    const warnings: string[] = [];
    const reasons: string[] = [];

    const candidates = buildUrlCandidates(sourceUrl);
    const resolved = await resolveImageFromCandidates(candidates);
    if (!resolved.buffer || !resolved.resolvedUrl) {
      return {
        sourceUrl,
        resolvedUrl: null,
        accepted: false,
        reasons: dedupeReasons([
          'image_download_failed_for_all_candidates',
          ...resolved.errors.slice(0, 4),
        ]),
        warnings,
      } as EbayImageComplianceAudit;
    }

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(resolved.buffer, { failOn: 'none' }).rotate().metadata();
    } catch (error: any) {
      return {
        sourceUrl,
        resolvedUrl: resolved.resolvedUrl,
        accepted: false,
        reasons: [`image_decode_failed:${error?.message || 'unknown_decode_error'}`],
        warnings,
      } as EbayImageComplianceAudit;
    }

    const format = normalizeDecodedFormat(String(metadata.format || '').toLowerCase());
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const longestSide = Math.max(width, height);
    const declaredExt = extractUrlExtension(sourceUrl) || extractUrlExtension(resolved.resolvedUrl);
    let formatAllowed = ALLOWED_FORMATS.has(format);
    if (!formatAllowed && format === 'webp' && declaredExt && ALLOWED_FORMATS.has(declaredExt)) {
      warnings.push(
        `source_declares_${declaredExt}_but_fetched_as_webp_transcode`
      );
      formatAllowed = true;
    }
    if (!formatAllowed) reasons.push(`unsupported_format:${format || 'unknown'}`);
    if (longestSide < EBAY_MIN_LONGEST_SIDE) {
      reasons.push(
        `longest_side_too_small:${longestSide}_required_${EBAY_MIN_LONGEST_SIDE}`
      );
    }
    if (longestSide < EBAY_RECOMMENDED_LONGEST_SIDE) {
      warnings.push(
        `longest_side_below_recommended:${longestSide}_recommended_${EBAY_RECOMMENDED_LONGEST_SIDE}`
      );
    }

    let complianceScore = 0;
    try {
      const [strictGate, v2] = await Promise.all([
        evaluateMlPortadaStrictGateFromBuffer(resolved.buffer),
        evaluatePortadaComplianceV2(resolved.buffer),
      ]);
      complianceScore = Number(v2.overallScore || 0);

      // Mandatory eBay rule: no promotional text / watermark / overlaid logos.
      if (!v2.checks.textLogo.pass) {
        reasons.push(
          ...v2.checks.textLogo.signals.map((signal) => `style:${signal}`)
        );
        reasons.push('style_text_logo_or_watermark_detected');
      }

      // Mandatory eBay rule: no decorative frame around product.
      const hasDecorativeFrame = strictGate.signals.some((signal) =>
        String(signal).includes('frame_edges_dominate_core_ui_or_banner_framing')
      );
      if (hasDecorativeFrame) {
        reasons.push('style_decorative_frame_detected');
      }

      // eBay recommendation: white / very light background.
      if (!v2.checks.whiteBg.pass) {
        warnings.push(
          ...v2.checks.whiteBg.signals.map((signal) => `recommended_bg:${signal}`)
        );
      }
    } catch (error: any) {
      reasons.push(`style_validation_error:${error?.message || 'unknown_style_error'}`);
    }

    return {
      sourceUrl,
      resolvedUrl: resolved.resolvedUrl,
      accepted: reasons.length === 0,
      reasons: dedupeReasons(reasons),
      warnings: dedupeReasons(warnings),
      format,
      width,
      height,
      longestSide,
      complianceScore,
    } as EbayImageComplianceAudit;
  });

  const acceptedSorted = audits
    .filter((audit) => audit.accepted && audit.resolvedUrl)
    .sort((a, b) => {
      const aRecommended = (a.longestSide || 0) >= EBAY_RECOMMENDED_LONGEST_SIDE ? 1 : 0;
      const bRecommended = (b.longestSide || 0) >= EBAY_RECOMMENDED_LONGEST_SIDE ? 1 : 0;
      if (aRecommended !== bRecommended) return bRecommended - aRecommended;
      if ((a.complianceScore || 0) !== (b.complianceScore || 0)) {
        return (b.complianceScore || 0) - (a.complianceScore || 0);
      }
      return (b.longestSide || 0) - (a.longestSide || 0);
    });

  const acceptedUrls: string[] = [];
  for (const audit of acceptedSorted) {
    const resolvedUrl = String(audit.resolvedUrl || '').trim();
    if (!resolvedUrl) continue;
    if (acceptedUrls.includes(resolvedUrl)) continue;
    acceptedUrls.push(resolvedUrl);
    if (acceptedUrls.length >= maxImages) break;
  }

  const warnings = dedupeReasons(audits.flatMap((audit) => audit.warnings));
  const rejectedCount = audits.filter((audit) => !audit.accepted).length;

  logger.info('[EBAY-IMAGE-COMPLIANCE] Audit completed', {
    requested: normalized.length,
    accepted: acceptedUrls.length,
    rejected: rejectedCount,
    maxImages,
  });

  return {
    acceptedUrls,
    audits,
    rejectedCount,
    warnings,
  };
}

// ── Full Processing + Upload Pipeline ────────────────────────────────────────

export interface EbayImagePipelineResult {
  /** Final image URLs ready for eBay Inventory API (EPS URLs or fallback originals) */
  finalImageUrls: string[];
  /** Whether AI processing was applied */
  processingApplied: boolean;
  /** Whether EPS upload was used */
  epsUploadUsed: boolean;
  /** Processing stats */
  stats: {
    totalInput: number;
    processed: number;
    uploaded: number;
    fallbackToOriginal: number;
  };
  /** Warnings */
  warnings: string[];
}

/**
 * Full eBay image pipeline: process images (AI bg-removal + white bg) → upload to EPS → return URLs.
 *
 * This applies the same visual treatment as MercadoLibre:
 * - Hero image: AI background removal, component filtering, white 1600×1600 canvas
 * - Secondary images: Square-fit with white background at 1600×1600
 *
 * Falls back gracefully:
 * 1. If processing fails for an image → use original URL (if it passes compliance)
 * 2. If EPS upload fails → use original URL (if it passes compliance)
 * 3. If all EPS uploads fail → fall back entirely to enforceEbayImageCompliance
 */
export async function processAndUploadEbayImages(
  imageUrls: string[],
  ebayCredentials: { token: string; sandbox: boolean },
  options?: {
    maxImages?: number;
    productId?: number;
  }
): Promise<EbayImagePipelineResult> {
  const maxImages = Math.max(1, Math.min(EBAY_MAX_IMAGES, Number(options?.maxImages) || EBAY_MAX_IMAGES));
  const label = `product-${options?.productId ?? 'unknown'}`;
  const warnings: string[] = [];

  logger.info('[EBAY-IMAGE-PIPELINE] Starting full image pipeline', {
    label,
    inputImages: imageUrls.length,
    maxImages,
  });

  // Step 1: Process images (AI bg-removal for hero, square-fit for others)
  let processingResult;
  try {
    processingResult = await processEbayImages(imageUrls, {
      maxImages,
      productId: options?.productId,
      concurrency: 3,
    });
  } catch (err: any) {
    logger.warn('[EBAY-IMAGE-PIPELINE] Image processing failed entirely, falling back to compliance-only', {
      label,
      error: err?.message,
    });
    warnings.push('image_processing_failed_entirely');

    // Fallback: just run compliance validation on originals
    const compliance = await enforceEbayImageCompliance(imageUrls, { maxImages });
    return {
      finalImageUrls: compliance.acceptedUrls,
      processingApplied: false,
      epsUploadUsed: false,
      stats: {
        totalInput: imageUrls.length,
        processed: 0,
        uploaded: 0,
        fallbackToOriginal: compliance.acceptedUrls.length,
      },
      warnings: [...warnings, ...compliance.warnings],
    };
  }

  // Step 2: Collect successfully processed images for upload
  const imagesToUpload = processingResult.processedImages
    .filter((img) => img.jpegBuffer !== null)
    .map((img) => ({
      jpegBuffer: img.jpegBuffer!,
      sourceUrl: img.sourceUrl,
    }));

  if (imagesToUpload.length === 0) {
    logger.warn('[EBAY-IMAGE-PIPELINE] No images processed successfully, falling back to compliance-only', { label });
    warnings.push('no_images_processed_successfully');

    const compliance = await enforceEbayImageCompliance(imageUrls, { maxImages });
    return {
      finalImageUrls: compliance.acceptedUrls,
      processingApplied: false,
      epsUploadUsed: false,
      stats: {
        totalInput: imageUrls.length,
        processed: 0,
        uploaded: 0,
        fallbackToOriginal: compliance.acceptedUrls.length,
      },
      warnings: [...warnings, ...compliance.warnings],
    };
  }

  // Step 3: Upload processed images to eBay EPS
  let uploadResult;
  try {
    uploadResult = await uploadImagesToEbayEps(imagesToUpload, ebayCredentials, {
      concurrency: 2,
      productId: options?.productId,
    });
  } catch (err: any) {
    logger.warn('[EBAY-IMAGE-PIPELINE] EPS upload failed entirely, falling back to compliance-only', {
      label,
      error: err?.message,
    });
    warnings.push('eps_upload_failed_entirely');

    const compliance = await enforceEbayImageCompliance(imageUrls, { maxImages });
    return {
      finalImageUrls: compliance.acceptedUrls,
      processingApplied: true,
      epsUploadUsed: false,
      stats: {
        totalInput: imageUrls.length,
        processed: imagesToUpload.length,
        uploaded: 0,
        fallbackToOriginal: compliance.acceptedUrls.length,
      },
      warnings: [...warnings, ...compliance.warnings],
    };
  }

  // Step 4: Build final URL list
  // Use EPS URLs for successfully uploaded images, fall back to original for the rest
  const epsUrls = uploadResult.uploadedUrls;

  if (epsUrls.length === 0) {
    logger.warn('[EBAY-IMAGE-PIPELINE] All EPS uploads failed, falling back to compliance-only', { label });
    warnings.push('all_eps_uploads_failed');

    const compliance = await enforceEbayImageCompliance(imageUrls, { maxImages });
    return {
      finalImageUrls: compliance.acceptedUrls,
      processingApplied: true,
      epsUploadUsed: false,
      stats: {
        totalInput: imageUrls.length,
        processed: imagesToUpload.length,
        uploaded: 0,
        fallbackToOriginal: compliance.acceptedUrls.length,
      },
      warnings: [...warnings, ...compliance.warnings],
    };
  }

  // Mix EPS URLs with fallback originals for images that failed processing/upload
  const finalUrls: string[] = [...epsUrls];

  // If some images failed processing, try to add their originals (validated) as fallback
  const failedSourceUrls = processingResult.processedImages
    .filter((img) => img.jpegBuffer === null)
    .map((img) => img.sourceUrl);

  if (failedSourceUrls.length > 0 && finalUrls.length < maxImages) {
    const fallbackCompliance = await enforceEbayImageCompliance(failedSourceUrls, {
      maxImages: maxImages - finalUrls.length,
    });
    for (const url of fallbackCompliance.acceptedUrls) {
      if (finalUrls.length >= maxImages) break;
      if (!finalUrls.includes(url)) finalUrls.push(url);
    }
    if (fallbackCompliance.acceptedUrls.length > 0) {
      warnings.push(`${fallbackCompliance.acceptedUrls.length}_fallback_original_urls_added`);
    }
  }

  logger.info('[EBAY-IMAGE-PIPELINE] Pipeline complete', {
    label,
    epsUrls: epsUrls.length,
    totalFinal: finalUrls.length,
    processingApplied: true,
    epsUploadUsed: true,
  });

  return {
    finalImageUrls: finalUrls,
    processingApplied: true,
    epsUploadUsed: true,
    stats: {
      totalInput: imageUrls.length,
      processed: imagesToUpload.length,
      uploaded: epsUrls.length,
      fallbackToOriginal: finalUrls.length - epsUrls.length,
    },
    warnings,
  };
}
