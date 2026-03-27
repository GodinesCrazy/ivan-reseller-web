import logger from '../config/logger';
import { processFromUrlSafe } from './image-pipeline.service';

export type MlImagePolicyStatus =
  | 'ml_image_policy_pass'
  | 'ml_image_policy_fail'
  | 'ml_image_manual_review_required';

export interface MlStoredImageComplianceProof {
  status?: MlImagePolicyStatus;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewedByAgent?: string | null;
  assetSource?: string | null;
  primaryImageUrl?: string | null;
  visualSignals?: string[];
  notes?: string | null;
  remediationPathUsed?: string | null;
  assetPackDir?: string | null;
  packApproved?: boolean | null;
}

export interface MlImageInspection {
  url: string;
  sourceFamily: 'aliexpress_supplier' | 'unknown';
  suspiciousTerms: string[];
  width: number | null;
  height: number | null;
  metadataAvailable: boolean;
  squareLike: boolean | null;
}

export interface MlImagePolicyAudit {
  status: MlImagePolicyStatus;
  checkedAt: string;
  primaryImageUrl: string | null;
  allSupplierRawImages: boolean;
  imageCount: number;
  hardBlockers: string[];
  manualReviewReasons: string[];
  qualityRequirements: string[];
  detectedVisualSignals: string[];
  inspectedImages: MlImageInspection[];
  storedProof: MlStoredImageComplianceProof | null;
}

export interface EvaluateMlImagePolicyInput {
  imageUrls: string[];
  inspectedImages: MlImageInspection[];
  storedProof?: MlStoredImageComplianceProof | null;
  detectedVisualSignals?: string[];
}

const SUPPLIER_RAW_IMAGE_PATTERN = /aliexpress-media\.com|alicdn\.com|ae0\d\.alicdn\.com/i;
const SUSPICIOUS_IMAGE_TERMS = [
  'logo',
  'watermark',
  'watermarking',
  'text',
  'banner',
  'promo',
  'coupon',
  'qr',
  'qrcode',
  'original',
  'wm_',
];
const HARD_VISUAL_SIGNALS = new Set([
  'text_overlay_detected',
  'logo_or_watermark_detected',
  'product_incomplete_or_uncentered',
  'background_not_policy_safe',
  'collage_or_split_composition_detected',
  'hands_or_non_product_objects_dominate_cover',
]);
const REVIEWABLE_ASSET_SOURCES = new Set([
  'manual_replacement',
  'clean_local_asset',
  'internal_generated',
]);

function parseProductMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return {};
}

function parseImageUrls(images: unknown): string[] {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      }
    } catch {
      if (images.trim().length > 0) return [images.trim()];
    }
  }
  return [];
}

function readStoredProof(productData: unknown): MlStoredImageComplianceProof | null {
  const metadata = parseProductMetadata(productData);
  const direct = metadata.mlChileImageCompliance;
  const preventive = metadata.preventivePublish?.mlChileImageCompliance;
  const candidate = (direct && typeof direct === 'object' ? direct : preventive) as Record<string, any> | undefined;
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    status: candidate.status,
    reviewedAt: candidate.reviewedAt ?? null,
    reviewedBy: candidate.reviewedBy ?? null,
    reviewedByAgent: candidate.reviewedByAgent ?? null,
    assetSource: candidate.assetSource ?? null,
    primaryImageUrl: candidate.primaryImageUrl ?? null,
    visualSignals: Array.isArray(candidate.visualSignals)
      ? candidate.visualSignals.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    notes: candidate.notes ?? null,
    remediationPathUsed: candidate.remediationPathUsed ?? null,
    assetPackDir: candidate.assetPackDir ?? null,
    packApproved:
      typeof candidate.packApproved === 'boolean' ? candidate.packApproved : null,
  };
}

function getSuspiciousTerms(url: string): string[] {
  const lower = url.toLowerCase();
  return SUSPICIOUS_IMAGE_TERMS.filter((term) => lower.includes(term));
}

function isReviewedPassProof(
  proof: MlStoredImageComplianceProof | null | undefined,
  primaryImageUrl: string | null
): boolean {
  if (!proof || proof.status !== 'ml_image_policy_pass') return false;
  if (!proof.reviewedAt || !proof.assetSource || !REVIEWABLE_ASSET_SOURCES.has(proof.assetSource)) {
    return false;
  }
  if (proof.primaryImageUrl && primaryImageUrl && proof.primaryImageUrl !== primaryImageUrl) {
    return false;
  }
  return true;
}

export function evaluateMercadoLibreImagePolicyContract(
  input: EvaluateMlImagePolicyInput
): MlImagePolicyAudit {
  const imageUrls = input.imageUrls;
  const inspectedImages = input.inspectedImages;
  const storedProof = input.storedProof ?? null;
  const detectedVisualSignals = [
    ...(input.detectedVisualSignals ?? []),
    ...((storedProof?.visualSignals ?? []).filter((signal) => typeof signal === 'string')),
  ];

  const checkedAt = new Date().toISOString();
  const hardBlockers: string[] = [];
  const manualReviewReasons: string[] = [];
  const qualityRequirements: string[] = [];
  const primaryImageUrl = imageUrls[0] ?? null;
  const primaryInspection = inspectedImages[0];
  const allSupplierRawImages =
    imageUrls.length > 0 &&
    inspectedImages.length > 0 &&
    inspectedImages.every((inspection) => inspection.sourceFamily === 'aliexpress_supplier');

  if (imageUrls.length === 0) {
    hardBlockers.push('ml_cover_image_missing');
  }

  if (storedProof?.status === 'ml_image_policy_fail') {
    hardBlockers.push('stored_ml_image_policy_fail');
  }

  if (primaryInspection?.suspiciousTerms?.length) {
    hardBlockers.push(
      `primary_image_url_contains_suspect_terms:${primaryInspection.suspiciousTerms.join(',')}`
    );
  }

  if (primaryInspection && primaryInspection.metadataAvailable) {
    if ((primaryInspection.width ?? 0) < 1200 || (primaryInspection.height ?? 0) < 1200) {
      hardBlockers.push('primary_image_below_1200x1200');
    }
    if (primaryInspection.squareLike === false) {
      hardBlockers.push('primary_image_not_square_like');
    }
  } else if (primaryImageUrl && !isReviewedPassProof(storedProof, primaryImageUrl)) {
    manualReviewReasons.push('primary_image_metadata_unavailable');
  }

  for (const signal of detectedVisualSignals) {
    if (HARD_VISUAL_SIGNALS.has(signal)) {
      hardBlockers.push(signal);
    }
  }

  if (imageUrls.length === 1) {
    qualityRequirements.push('single_image_gallery');
  }

  if (allSupplierRawImages && !isReviewedPassProof(storedProof, primaryImageUrl)) {
    manualReviewReasons.push('supplier_raw_images_require_reviewed_ml_cover');
  }

  if (imageUrls.length === 1 && !isReviewedPassProof(storedProof, primaryImageUrl)) {
    manualReviewReasons.push('single_cover_image_requires_manual_review');
  }

  const status: MlImagePolicyStatus =
    hardBlockers.length > 0
      ? 'ml_image_policy_fail'
      : manualReviewReasons.length > 0
        ? 'ml_image_manual_review_required'
        : 'ml_image_policy_pass';

  return {
    status,
    checkedAt,
    primaryImageUrl,
    allSupplierRawImages,
    imageCount: imageUrls.length,
    hardBlockers: [...new Set(hardBlockers)],
    manualReviewReasons: [...new Set(manualReviewReasons)],
    qualityRequirements: [...new Set(qualityRequirements)],
    detectedVisualSignals: [...new Set(detectedVisualSignals)],
    inspectedImages,
    storedProof,
  };
}

async function inspectImageUrl(url: string): Promise<MlImageInspection> {
  const processed = await processFromUrlSafe(url);
  const width = processed?.width ?? null;
  const height = processed?.height ?? null;
  const squareLike =
    width && height
      ? Math.abs(width / height - 1) <= 0.15
      : null;

  return {
    url,
    sourceFamily: SUPPLIER_RAW_IMAGE_PATTERN.test(url) ? 'aliexpress_supplier' : 'unknown',
    suspiciousTerms: getSuspiciousTerms(url),
    width,
    height,
    metadataAvailable: Boolean(processed),
    squareLike,
  };
}

export async function auditMercadoLibreChileImagePolicy(params: {
  productId?: number;
  images: unknown;
  productData?: unknown;
}): Promise<MlImagePolicyAudit> {
  const imageUrls = parseImageUrls(params.images);
  const storedProof = readStoredProof(params.productData);
  const inspectedImages = await Promise.all(imageUrls.slice(0, 3).map((url) => inspectImageUrl(url)));
  const audit = evaluateMercadoLibreImagePolicyContract({
    imageUrls,
    inspectedImages,
    storedProof,
  });

  logger.info('[ML-IMAGE-POLICY] audited', {
    productId: params.productId,
    status: audit.status,
    hardBlockers: audit.hardBlockers,
    manualReviewReasons: audit.manualReviewReasons,
    primaryImageUrl: audit.primaryImageUrl?.slice(0, 120),
    imageCount: audit.imageCount,
  });

  return audit;
}
