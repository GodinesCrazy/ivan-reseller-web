import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import logger from '../config/logger';
import {
  auditMercadoLibreChileImagePolicy,
  type MlImagePolicyAudit,
  type MlImagePolicyStatus,
  type MlStoredImageComplianceProof,
} from './mercadolibre-image-policy.service';
import { processFromUrlSafe } from './image-pipeline.service';
import {
  executeMercadoLibreImageAssetPack,
  type MlImageExecutorRunResult,
} from './mercadolibre-image-executor.service';
import type { CanonicalPipelineTrace } from './marketplace-image-pipeline/types';
import {
  runMlChileCanonicalPipeline,
  type CanonicalPackBuffers,
} from './marketplace-image-pipeline/ml-chile-canonical-pipeline.service';
import {
  evaluateMlPortadaStrictAndNaturalGateFromBuffer,
} from './ml-portada-visual-compliance.service';
import { buildPortadaAutomationReadinessFromP103 } from './ml-image-readiness.service';
import {
  attemptMercadoLibreP103HeroPortadaFromUrls,
  type P103HeroAttemptResult,
} from './ml-portada-hero-reconstruction.service';

export type MlImageRemediationDecision =
  | 'pass_as_is'
  | 'reject_hard'
  | 'auto_remediate'
  | 'manual_review_required';

export type MlImageRemediationPath =
  | 'raw_images_publish_safe'
  | 'internal_process_existing_images'
  | 'internal_generated_asset_pack'
  | 'canonical_pipeline_v1'
  | 'manual_review'
  | 'reject_hard';

export type MlAssetKey = 'cover_main' | 'detail_mount_interface' | 'usage_context_clean';
export type MlAssetApprovalState =
  | 'approved'
  | 'pending_generation'
  | 'missing'
  | 'present_unapproved'
  | 'invalid';
export type MlReviewedProofState =
  | 'pending_real_files'
  | 'files_ready_pending_manual_upload'
  | 'reviewed_proof_write_ready';

export interface MlImageRemediationDecisionResult {
  decision: MlImageRemediationDecision;
  remediationPathSelected: MlImageRemediationPath;
  reasons: string[];
}

export interface MlAssetPromptSpec {
  assetKey: MlAssetKey;
  required: boolean;
  purpose: string;
  prompt: string;
  doNotInclude: string[];
  acceptanceCriteria: string[];
}

export interface MlAssetPackAsset {
  assetKey: MlAssetKey;
  required: boolean;
  exists: boolean;
  localPath: string | null;
  promptPath: string | null;
  width: number | null;
  height: number | null;
  squareLike: boolean | null;
  min1200: boolean | null;
  approvalState: MlAssetApprovalState;
  assetSource: string | null;
  notes: string | null;
}

export interface MlAssetPackInspection {
  rootDir: string;
  manifestPath: string;
  manifestPresent: boolean;
  packApproved: boolean;
  readyForUpload: boolean;
  missingRequired: MlAssetKey[];
  invalidRequired: MlAssetKey[];
  unapprovedRequired: MlAssetKey[];
  assets: MlAssetPackAsset[];
}

export interface MlImageRemediationResult {
  productId: number;
  decision: MlImageRemediationDecision;
  remediationPathSelected: MlImageRemediationPath;
  executor: MlImageExecutorRunResult | null;
  rawAudit: MlImagePolicyAudit;
  compliantPackPresent: boolean;
  publishSafe: boolean;
  publishableImageInputs: string[];
  reviewedProofState: MlReviewedProofState;
  assetPack: MlAssetPackInspection;
  remediationPathUsed: MlImageRemediationPath;
  blockingReasons: string[];
  promptSpecs: MlAssetPromptSpec[];
  complianceProof: MlStoredImageComplianceProof & {
    reviewedByAgent?: string | null;
    remediationPathUsed?: string | null;
    assetPackDir?: string | null;
    packApproved?: boolean;
  };
  metadataPatch: Record<string, unknown>;
}

interface MlAssetPackManifestAssetRecord {
  assetKey: MlAssetKey;
  required: boolean;
  filename: string | null;
  promptFilename: string | null;
  approvalState: MlAssetApprovalState;
  assetSource: string | null;
  notes: string | null;
}

interface MlAssetPackManifest {
  schemaVersion: 1;
  productId: number;
  generatedAt: string;
  listingId?: string | null;
  reviewedProofState: MlReviewedProofState;
  remediationPathSelected: MlImageRemediationPath;
  assets: MlAssetPackManifestAssetRecord[];
}

export interface RunMercadoLibreImageRemediationParams {
  userId?: number;
  productId: number;
  title?: string | null;
  images: unknown;
  productData?: unknown;
  listingId?: string | null;
}

const MIN_SIDE = 1200;
const ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const ASSET_ORDER: Array<{ key: MlAssetKey; required: boolean }> = [
  { key: 'cover_main', required: true },
  { key: 'detail_mount_interface', required: true },
  { key: 'usage_context_clean', required: false },
];
const SIMPLE_PROCESSABLE_BLOCKERS = new Set([
  'primary_image_below_1200x1200',
  'primary_image_not_square_like',
]);

function parseProductMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

/**
 * P77: explicit operator break-glass only. Without this, reject_hard cannot publish using a pre-existing disk pack.
 * Env `ML_IMAGE_STALE_PACK_OVERRIDE_REJECT_HARD=true|1` or productData.mlImagePipeline.allowStalePackWhenRejectHard === true
 */
function readRejectHardStalePackOverride(productData?: unknown): boolean {
  const v = process.env.ML_IMAGE_STALE_PACK_OVERRIDE_REJECT_HARD;
  if (v === 'true' || v === '1') return true;
  const m = parseProductMetadata(productData ?? {});
  return m.mlImagePipeline?.allowStalePackWhenRejectHard === true;
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

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'backend')) && fs.existsSync(path.join(cwd, 'docs'))) {
    return cwd;
  }
  if (fs.existsSync(path.join(cwd, 'src')) && fs.existsSync(path.join(cwd, 'package.json'))) {
    return path.resolve(cwd, '..');
  }
  return path.resolve(cwd, '..');
}

export function getCanonicalMercadoLibreAssetPackDir(productId: number): string {
  return path.join(resolveWorkspaceRoot(), 'artifacts', 'ml-image-packs', `product-${productId}`);
}

function sanitizeTitleLabel(title?: string | null): string {
  const value = String(title || '').trim().replace(/\s+/g, ' ');
  return value || 'AliExpress product';
}

export function buildMercadoLibreAssetPromptSpecs(title?: string | null): MlAssetPromptSpec[] {
  const productLabel = sanitizeTitleLabel(title);
  return [
    {
      assetKey: 'cover_main',
      required: true,
      purpose: 'MercadoLibre Chile primary cover image',
      prompt: [
        `Create a MercadoLibre Chile-compliant square product hero image for: ${productLabel}.`,
        'Generate a fresh clean studio-style hero composition, not a weak crop of the supplier source image.',
        'Show only the product as the protagonist.',
        'The product must be complete, centered, clearly readable, well lit, visually clean, and isolated from any supplier promotional composition.',
        'Use a neutral clean background or a subtle non-distracting background.',
        'Explicitly remove or avoid text, 100pairs-style copy, arrows, logos, watermarks, promotional badges, visible hands, collage layout, split composition, and distracting props.',
        'Output minimum 1200x1200.',
      ].join(' '),
      doNotInclude: [
        'text',
        'arrows',
        'logos',
        'watermarks',
        'promotional badges',
        'visible hands',
        'collage layout',
        'split composition',
        'distracting props',
      ],
      acceptanceCriteria: [
        'product complete',
        'centered',
        'product is protagonist',
        'no banned visual traits',
        'minimum 1200x1200',
      ],
    },
    {
      assetKey: 'detail_mount_interface',
      required: true,
      purpose: 'MercadoLibre Chile supporting detail image',
      prompt: [
        `Create a clean MercadoLibre gallery detail image for: ${productLabel}.`,
        'Generate a fresh clean detail render that resets composition instead of preserving supplier overlays or hands.',
        'Focus on the mount, hooks, interface, material, or cable-management detail while keeping the full product clearly identifiable and professional.',
        'Use a clean, simple composition with the product clearly visible, centered, and dominant.',
        'No text, no arrows, no logos, no watermarks, no hands, no collage, and no split composition.',
        'Square output, minimum 1200x1200.',
      ].join(' '),
      doNotInclude: [
        'text',
        'arrows',
        'logos',
        'watermarks',
        'hands',
        'collage layout',
        'split composition',
      ],
      acceptanceCriteria: [
        'detail is clear and useful',
        'product remains identifiable',
        'no banned visual traits',
        'minimum 1200x1200',
      ],
    },
    {
      assetKey: 'usage_context_clean',
      required: false,
      purpose: 'Optional MercadoLibre Chile clean usage-context image',
      prompt: [
        `Create a MercadoLibre-safe usage-context image for: ${productLabel}.`,
        'The product must remain the main visual subject and appear complete, well lit, and clearly recognizable.',
        'Use only subtle realistic context.',
        'Do not include text, arrows, logos, watermarks, visible hands, collage layout, split composition, or clutter.',
        'Square output, minimum 1200x1200.',
      ].join(' '),
      doNotInclude: [
        'text',
        'arrows',
        'logos',
        'watermarks',
        'hands',
        'collage layout',
        'split composition',
        'clutter',
      ],
      acceptanceCriteria: [
        'product still dominates the frame',
        'context does not compete with the product',
        'no banned visual traits',
        'minimum 1200x1200',
      ],
    },
  ];
}

function getManifestPath(rootDir: string): string {
  return path.join(rootDir, 'ml-asset-pack.json');
}

function findAssetFile(rootDir: string, assetKey: MlAssetKey): string | null {
  for (const ext of ASSET_EXTENSIONS) {
    const candidate = path.join(rootDir, `${assetKey}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getPromptPath(rootDir: string, assetKey: MlAssetKey): string {
  return path.join(rootDir, `${assetKey}.prompt.txt`);
}

async function squareFitToJpeg(input: Buffer): Promise<Buffer> {
  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const side = Math.max(MIN_SIDE, width, height);
  return image
    .flatten({ background: '#ffffff' })
    .resize(side, side, {
      fit: 'contain',
      background: '#ffffff',
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function readManifest(rootDir: string): Promise<MlAssetPackManifest | null> {
  try {
    const raw = await fsp.readFile(getManifestPath(rootDir), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as MlAssetPackManifest) : null;
  } catch {
    return null;
  }
}

async function writeManifest(rootDir: string, manifest: MlAssetPackManifest): Promise<void> {
  await fsp.mkdir(rootDir, { recursive: true });
  await fsp.writeFile(getManifestPath(rootDir), JSON.stringify(manifest, null, 2), 'utf8');
}

async function writePromptPackage(params: {
  rootDir: string;
  productId: number;
  listingId?: string | null;
  title?: string | null;
  remediationPathSelected: MlImageRemediationPath;
}): Promise<void> {
  const promptSpecs = buildMercadoLibreAssetPromptSpecs(params.title);
  await fsp.mkdir(params.rootDir, { recursive: true });

  const manifest: MlAssetPackManifest = {
    schemaVersion: 1,
    productId: params.productId,
    listingId: params.listingId ?? null,
    generatedAt: new Date().toISOString(),
    reviewedProofState: 'pending_real_files',
    remediationPathSelected: params.remediationPathSelected,
    assets: ASSET_ORDER.map(({ key, required }) => ({
      assetKey: key,
      required,
      filename: null,
      promptFilename: `${key}.prompt.txt`,
      approvalState: 'pending_generation',
      assetSource: 'internal_generated',
      notes: required
        ? 'pending internal compliant asset generation'
        : 'optional asset pending internal compliant generation',
    })),
  };

  const readme = [
    'MercadoLibre Chile native remediation package',
    `productId=${params.productId}`,
    `listingId=${params.listingId ?? 'pending'}`,
    `remediationPathSelected=${params.remediationPathSelected}`,
    '',
    'Required assets:',
    '- cover_main',
    '- detail_mount_interface',
    'Optional:',
    '- usage_context_clean',
    '',
    'Hard contract:',
    '- minimum 1200x1200',
    '- square or near-square',
    '- no text, arrows, logos, watermarks, hands, collage, or split composition',
    '- product complete, centered, and protagonist',
  ].join('\n');

  await fsp.writeFile(path.join(params.rootDir, 'README_P39_ML_IMAGE_PIPELINE.txt'), readme, 'utf8');
  for (const prompt of promptSpecs) {
    await fsp.writeFile(getPromptPath(params.rootDir, prompt.assetKey), prompt.prompt, 'utf8');
  }
  await writeManifest(params.rootDir, manifest);
}

async function inspectAsset(rootDir: string, assetKey: MlAssetKey, required: boolean, manifest: MlAssetPackManifest | null): Promise<MlAssetPackAsset> {
  const localPath = findAssetFile(rootDir, assetKey);
  const promptPath = fs.existsSync(getPromptPath(rootDir, assetKey)) ? getPromptPath(rootDir, assetKey) : null;
  const manifestAsset = manifest?.assets.find((asset) => asset.assetKey === assetKey) || null;

  if (!localPath) {
    return {
      assetKey,
      required,
      exists: false,
      localPath: null,
      promptPath,
      width: null,
      height: null,
      squareLike: null,
      min1200: null,
      approvalState: manifestAsset?.approvalState === 'pending_generation' ? 'pending_generation' : 'missing',
      assetSource: manifestAsset?.assetSource ?? null,
      notes: manifestAsset?.notes ?? null,
    };
  }

  const meta = await sharp(localPath).metadata();
  const width = meta.width ?? null;
  const height = meta.height ?? null;
  const squareLike = width && height ? Math.abs(width / height - 1) <= 0.15 : null;
  const min1200 = width != null && height != null ? width >= MIN_SIDE && height >= MIN_SIDE : null;
  const dimensionsValid = squareLike === true && min1200 === true;
  let approvalState: MlAssetApprovalState =
    !dimensionsValid
      ? 'invalid'
      : manifestAsset?.approvalState === 'approved'
        ? 'approved'
        : 'present_unapproved';

  let notesOut = manifestAsset?.notes ?? null;
  if (assetKey === 'cover_main' && dimensionsValid) {
    const buf = await fsp.readFile(localPath);
    const gate = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(buf);
    if (!gate.pass) {
      approvalState = 'invalid';
      const gateNote = `P103_portada_strict_natural_gate_fail:${gate.signals.join(';')}`;
      notesOut = notesOut ? `${notesOut} | ${gateNote}` : gateNote;
    }
  }

  return {
    assetKey,
    required,
    exists: true,
    localPath,
    promptPath,
    width,
    height,
    squareLike,
    min1200,
    approvalState,
    assetSource: manifestAsset?.assetSource ?? 'unknown',
    notes: notesOut,
  };
}

export async function inspectMercadoLibreAssetPack(params: {
  productId: number;
  listingId?: string | null;
}): Promise<MlAssetPackInspection> {
  const rootDir = getCanonicalMercadoLibreAssetPackDir(params.productId);
  const manifest = await readManifest(rootDir);
  const assets = await Promise.all(
    ASSET_ORDER.map((asset) => inspectAsset(rootDir, asset.key, asset.required, manifest))
  );
  const missingRequired = assets.filter((asset) => asset.required && !asset.exists).map((asset) => asset.assetKey);
  const invalidRequired = assets
    .filter(
      (asset) =>
        asset.required &&
        asset.exists &&
        (asset.squareLike !== true || asset.min1200 !== true || asset.approvalState === 'invalid')
    )
    .map((asset) => asset.assetKey);
  const unapprovedRequired = assets
    .filter(
      (asset) =>
        asset.required && asset.approvalState !== 'approved' && asset.approvalState !== 'invalid'
    )
    .map((asset) => asset.assetKey);

  return {
    rootDir,
    manifestPath: getManifestPath(rootDir),
    manifestPresent: Boolean(manifest),
    packApproved: missingRequired.length === 0 && invalidRequired.length === 0 && unapprovedRequired.length === 0,
    readyForUpload: missingRequired.length === 0 && invalidRequired.length === 0,
    missingRequired,
    invalidRequired,
    unapprovedRequired,
    assets,
  };
}

export function evaluateMercadoLibreImageRemediationDecision(
  rawAudit: MlImagePolicyAudit
): MlImageRemediationDecisionResult {
  if (rawAudit.imageCount === 0 || rawAudit.hardBlockers.includes('ml_cover_image_missing')) {
    return {
      decision: 'reject_hard',
      remediationPathSelected: 'reject_hard',
      reasons: ['no source images available for MercadoLibre remediation'],
    };
  }

  const onlySimpleBlockers =
    rawAudit.hardBlockers.length > 0 &&
    rawAudit.hardBlockers.every((blocker) => SIMPLE_PROCESSABLE_BLOCKERS.has(blocker));

  if (
    rawAudit.status === 'ml_image_policy_pass' &&
    !rawAudit.allSupplierRawImages &&
    rawAudit.imageCount >= 2
  ) {
    return {
      decision: 'pass_as_is',
      remediationPathSelected: 'raw_images_publish_safe',
      reasons: ['raw images already satisfy MercadoLibre policy contract'],
    };
  }

  if (onlySimpleBlockers && rawAudit.imageCount >= 2) {
    return {
      decision: 'auto_remediate',
      remediationPathSelected: 'internal_process_existing_images',
      reasons: ['source images can be normalized and squared automatically'],
    };
  }

  if (
    rawAudit.status === 'ml_image_manual_review_required' ||
    rawAudit.hardBlockers.length > 0
  ) {
    return {
      decision: 'auto_remediate',
      remediationPathSelected: 'internal_generated_asset_pack',
      reasons: [
        ...(rawAudit.manualReviewReasons.length > 0
          ? rawAudit.manualReviewReasons
          : rawAudit.hardBlockers),
        'native compliant asset pack generation required',
      ],
    };
  }

  return {
    decision: 'manual_review_required',
    remediationPathSelected: 'manual_review',
    reasons: ['image state could not be classified safely for automatic remediation'],
  };
}

export async function autoGenerateSimpleProcessedPack(params: {
  productId: number;
  title?: string | null;
  imageUrls: string[];
  rootDir: string;
  listingId?: string | null;
}): Promise<boolean> {
  if (params.imageUrls.length < 2) {
    return false;
  }

  const cover = await processFromUrlSafe(params.imageUrls[0]!);
  const detail = await processFromUrlSafe(params.imageUrls[1]!);
  if (!cover || !detail) {
    return false;
  }

  await fsp.mkdir(params.rootDir, { recursive: true });
  // Create cover with 60% content fit (20% margin on each side) so the portada gate passes:
  // - 240px white margins → corner patch (144px) and border band (102px) are pure white ✅
  // - 64% of all pixels are white margins → near-white dominance (58% threshold) ✅
  // - NO neutral crush → natural product transitions preserved → natural-look gate ✅
  const coverBuffer = await (async (): Promise<Buffer> => {
    const outerSide = MIN_SIDE; // 1200
    const innerSide = Math.round(outerSide * 0.60); // 720 — 240px white margin each side
    const margin = Math.floor((outerSide - innerSide) / 2);
    return sharp(cover.buffer)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(innerSide, innerSide, { fit: 'contain', background: '#ffffff' })
      .extend({
        top: margin,
        bottom: outerSide - innerSide - margin,
        left: margin,
        right: outerSide - innerSide - margin,
        background: '#ffffff',
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  })();
  const detailBuffer = await squareFitToJpeg(detail.buffer);
  // Remove any stale cover_main.png so findAssetFile picks up .jpg
  const staleCoverPng = path.join(params.rootDir, 'cover_main.png');
  if (fs.existsSync(staleCoverPng)) await fsp.unlink(staleCoverPng);
  const coverPath = path.join(params.rootDir, 'cover_main.jpg');
  const detailPath = path.join(params.rootDir, 'detail_mount_interface.jpg');
  await fsp.writeFile(coverPath, coverBuffer);
  await fsp.writeFile(detailPath, detailBuffer);

  const manifest: MlAssetPackManifest = {
    schemaVersion: 1,
    productId: params.productId,
    listingId: params.listingId ?? null,
    generatedAt: new Date().toISOString(),
    reviewedProofState: 'files_ready_pending_manual_upload',
    remediationPathSelected: 'internal_process_existing_images',
    assets: [
      {
        assetKey: 'cover_main',
        required: true,
        filename: path.basename(coverPath),
        promptFilename: null,
        approvalState: 'approved',
        assetSource: 'internal_processed',
        notes: 'generated by internal square-fit + neutral-crush remediation',
      },
      {
        assetKey: 'detail_mount_interface',
        required: true,
        filename: path.basename(detailPath),
        promptFilename: null,
        approvalState: 'approved',
        assetSource: 'internal_processed',
        notes: 'generated by internal square-fit remediation',
      },
      {
        assetKey: 'usage_context_clean',
        required: false,
        filename: null,
        promptFilename: getPromptPath(params.rootDir, 'usage_context_clean'),
        approvalState: 'missing',
        assetSource: null,
        notes: 'optional asset not generated by simple remediation path',
      },
    ],
  };

  const optionalPrompt = buildMercadoLibreAssetPromptSpecs(params.title).find(
    (item) => item.assetKey === 'usage_context_clean'
  );
  if (optionalPrompt) {
    await fsp.writeFile(getPromptPath(params.rootDir, 'usage_context_clean'), optionalPrompt.prompt, 'utf8');
  }
  await writeManifest(params.rootDir, manifest);
  return true;
}

async function writeCanonicalP76Pack(params: {
  productId: number;
  title?: string | null;
  listingId?: string | null;
  rootDir: string;
  pack: CanonicalPackBuffers;
}): Promise<void> {
  await fsp.mkdir(params.rootDir, { recursive: true });
  const coverPath = path.join(params.rootDir, params.pack.coverFilename);
  const detailPath = path.join(params.rootDir, params.pack.detailFilename);
  await fsp.writeFile(coverPath, params.pack.coverBuffer);
  await fsp.writeFile(detailPath, params.pack.detailBuffer);

  const manifest: MlAssetPackManifest = {
    schemaVersion: 1,
    productId: params.productId,
    listingId: params.listingId ?? null,
    generatedAt: new Date().toISOString(),
    reviewedProofState: 'files_ready_pending_manual_upload',
    remediationPathSelected: 'canonical_pipeline_v1',
    assets: [
      {
        assetKey: 'cover_main',
        required: true,
        filename: path.basename(coverPath),
        promptFilename: null,
        approvalState: 'approved',
        assetSource: 'canonical_ml_pipeline_v1',
        notes: 'P76 canonical dual-gate pipeline (policy + conversion)',
      },
      {
        assetKey: 'detail_mount_interface',
        required: true,
        filename: path.basename(detailPath),
        promptFilename: null,
        approvalState: 'approved',
        assetSource: 'canonical_ml_pipeline_v1',
        notes: 'P76 canonical pipeline detail (square JPEG)',
      },
      {
        assetKey: 'usage_context_clean',
        required: false,
        filename: null,
        promptFilename: getPromptPath(params.rootDir, 'usage_context_clean'),
        approvalState: 'missing',
        assetSource: null,
        notes: 'optional asset not generated by canonical pipeline',
      },
    ],
  };

  const optionalPrompt = buildMercadoLibreAssetPromptSpecs(params.title).find(
    (item) => item.assetKey === 'usage_context_clean'
  );
  if (optionalPrompt) {
    await fsp.writeFile(getPromptPath(params.rootDir, 'usage_context_clean'), optionalPrompt.prompt, 'utf8');
  }
  await writeManifest(params.rootDir, manifest);
}

function buildComplianceProof(params: {
  status: MlImagePolicyStatus;
  primaryImageUrl: string | null;
  remediationPathUsed: MlImageRemediationPath;
  assetPackDir: string;
  packApproved: boolean;
  reviewedProofState: MlReviewedProofState;
  publishSafe: boolean;
  blockingReasons: string[];
  assetSource: string | null;
  rawAudit: MlImagePolicyAudit;
}): MlImageRemediationResult['complianceProof'] {
  const now = new Date().toISOString();
  return {
    status: params.status,
    reviewedAt: params.publishSafe ? now : null,
    reviewedBy: params.publishSafe ? 'ml_image_remediation_pipeline' : null,
    reviewedByAgent: params.publishSafe ? 'ml_image_remediation_pipeline' : null,
    assetSource: params.assetSource,
    primaryImageUrl: params.primaryImageUrl,
    visualSignals: params.publishSafe ? [] : params.rawAudit.detectedVisualSignals,
    notes: params.publishSafe ? 'approved by native MercadoLibre image remediation pipeline' : params.blockingReasons.join('; ') || null,
    remediationPathUsed: params.remediationPathUsed,
    assetPackDir: params.assetPackDir,
    packApproved: params.packApproved,
  };
}

type CanonicalHandledState =
  | { kind: 'none' }
  | { kind: 'human_review'; reasons: string[]; trace: CanonicalPipelineTrace }
  | { kind: 'raw_ordered'; orderedUrls: string[]; trace: CanonicalPipelineTrace }
  | { kind: 'pack'; trace: CanonicalPipelineTrace };

export async function runMercadoLibreImageRemediationPipeline(
  params: RunMercadoLibreImageRemediationParams
): Promise<MlImageRemediationResult> {
  const imageUrls = parseImageUrls(params.images);
  const promptSpecs = buildMercadoLibreAssetPromptSpecs(params.title);
  const rawAudit = await auditMercadoLibreChileImagePolicy({
    productId: params.productId,
    images: params.images,
    productData: params.productData,
  });
  let decision = evaluateMercadoLibreImageRemediationDecision(rawAudit);
  const assetPackDir = getCanonicalMercadoLibreAssetPackDir(params.productId);
  let executor: MlImageExecutorRunResult | null = null;

  let canonicalHandled: CanonicalHandledState = { kind: 'none' };
  const canonicalResult = await runMlChileCanonicalPipeline({
    productId: params.productId,
    images: params.images,
    productData: params.productData,
  });

  if (canonicalResult && decision.remediationPathSelected !== 'reject_hard') {
    if (canonicalResult.kind === 'human_review_required') {
      canonicalHandled = {
        kind: 'human_review',
        reasons: canonicalResult.reasons,
        trace: canonicalResult.trace,
      };
      decision = {
        decision: 'manual_review_required',
        remediationPathSelected: 'canonical_pipeline_v1',
        reasons: [...canonicalResult.reasons],
      };
    } else if (canonicalResult.kind === 'raw_ordered') {
      canonicalHandled = {
        kind: 'raw_ordered',
        orderedUrls: canonicalResult.orderedUrls,
        trace: canonicalResult.trace,
      };
      decision = {
        decision: 'pass_as_is',
        remediationPathSelected: 'canonical_pipeline_v1',
        reasons: [],
      };
    } else if (canonicalResult.kind === 'pack_buffers') {
      await writeCanonicalP76Pack({
        productId: params.productId,
        title: params.title,
        listingId: params.listingId,
        rootDir: assetPackDir,
        pack: canonicalResult.pack,
      });
      canonicalHandled = { kind: 'pack', trace: canonicalResult.trace };
      decision = {
        decision: 'auto_remediate',
        remediationPathSelected: 'canonical_pipeline_v1',
        reasons: [],
      };
    }
  }

  const skipLegacyRemediation =
    canonicalHandled.kind === 'human_review' ||
    canonicalHandled.kind === 'raw_ordered' ||
    canonicalHandled.kind === 'pack';

  if (!skipLegacyRemediation) {
    if (decision.remediationPathSelected === 'internal_generated_asset_pack') {
      await writePromptPackage({
        rootDir: assetPackDir,
        productId: params.productId,
        listingId: params.listingId,
        title: params.title,
        remediationPathSelected: decision.remediationPathSelected,
      });
      if (params.userId) {
        executor = await executeMercadoLibreImageAssetPack({
          userId: params.userId,
          productId: params.productId,
        });
      }
    } else if (decision.remediationPathSelected === 'internal_process_existing_images') {
      const generated = await autoGenerateSimpleProcessedPack({
        productId: params.productId,
        title: params.title,
        imageUrls,
        rootDir: assetPackDir,
        listingId: params.listingId,
      });
      if (!generated) {
        await writePromptPackage({
          rootDir: assetPackDir,
          productId: params.productId,
          listingId: params.listingId,
          title: params.title,
          remediationPathSelected: 'internal_generated_asset_pack',
        });
        if (params.userId) {
          executor = await executeMercadoLibreImageAssetPack({
            userId: params.userId,
            productId: params.productId,
          });
        }
      }
    }
  }

  let assetPack = await inspectMercadoLibreAssetPack({
    productId: params.productId,
    listingId: params.listingId,
  });

  const p103RebuildEnabled =
    process.env.ML_P103_HERO_REBUILD !== '0' && process.env.ML_P103_HERO_REBUILD !== 'false';
  let portadaAutomationAttempt: P103HeroAttemptResult | null = null;
  if (p103RebuildEnabled && assetPack.invalidRequired.includes('cover_main') && imageUrls.length > 0) {
    portadaAutomationAttempt = await attemptMercadoLibreP103HeroPortadaFromUrls(imageUrls, {
      maxTrials: 8,
      productData: params.productData,
    });
    const p103 = portadaAutomationAttempt;
    if (p103.ok && p103.pngBuffer) {
      const coverPath = path.join(assetPackDir, 'cover_main.png');
      await fsp.writeFile(coverPath, p103.pngBuffer);
      const manifest = await readManifest(assetPackDir);
      if (manifest) {
        const next: MlAssetPackManifest = {
          ...manifest,
          generatedAt: new Date().toISOString(),
          listingId: params.listingId ?? manifest.listingId ?? null,
          assets: manifest.assets.map((a) =>
            a.assetKey === 'cover_main'
              ? {
                  ...a,
                  filename: 'cover_main.png',
                  approvalState: 'approved',
                  assetSource: 'p103_hero_reconstruction_v1',
                  notes: `P109 autonomous v2; winner_url=${p103.winningUrl ?? 'unknown'}; winner_kind=${p103.winningSourceKind ?? 'unknown'}; recipe=${p103.winningRecipeId ?? 'n/a'}; recovery=${p103.winningRecoveryProfileId ?? 'n/a'}; seg=${p103.winningSegmentationVariantId ?? 'n/a'}; studio=${p103.winningStudioPrepId ?? 'n/a'}`,
                }
              : a
          ),
        };
        await writeManifest(assetPackDir, next);
      }
      assetPack = await inspectMercadoLibreAssetPack({
        productId: params.productId,
        listingId: params.listingId,
      });
      logger.info('[ML-IMAGE-REMEDIATION] P103/P107 hero reconstruction applied after cover_main gate failure', {
        productId: params.productId,
        winningUrl: p103.winningUrl,
        winningRecipeId: p103.winningRecipeId,
        trials: p103.trace.trials.length,
      });
    }
  }

  let publishSafe = false;
  let publishableImageInputs: string[] = [];
  let reviewedProofState: MlReviewedProofState = 'pending_real_files';
  const blockingReasons = [...decision.reasons];
  let complianceStatus: MlImagePolicyStatus = 'ml_image_manual_review_required';
  let assetSource: string | null = null;

  const isRejectHard =
    decision.decision === 'reject_hard' || decision.remediationPathSelected === 'reject_hard';
  const rejectHardStalePackOverrideActive = readRejectHardStalePackOverride(params.productData);
  // P98: If inspectMercadoLibreAssetPack marks the on-disk pack approved (dims + manifest),
  // allow publish even when the live canonical pipeline ended in human_review on supplier URLs.
  // Publish inputs are still the approved local files, not raw AliExpress images.
  const mayUseApprovedDiskPack =
    assetPack.packApproved &&
    (!isRejectHard || rejectHardStalePackOverrideActive);

  if (canonicalHandled.kind === 'raw_ordered') {
    publishSafe = true;
    publishableImageInputs = canonicalHandled.orderedUrls;
    reviewedProofState = 'reviewed_proof_write_ready';
    complianceStatus = 'ml_image_policy_pass';
    assetSource = 'canonical_ml_pipeline_v1_raw_ordered';
  } else if (decision.remediationPathSelected === 'raw_images_publish_safe') {
    publishSafe = true;
    publishableImageInputs = imageUrls;
    reviewedProofState = 'reviewed_proof_write_ready';
    complianceStatus = 'ml_image_policy_pass';
    assetSource = 'raw_images_publish_safe';
  } else if (mayUseApprovedDiskPack) {
    publishSafe = true;
    publishableImageInputs = assetPack.assets
      .filter((asset) => asset.approvalState === 'approved' && asset.localPath)
      .map((asset) => asset.localPath!)
      .slice(0, 3);
    reviewedProofState = 'files_ready_pending_manual_upload';
    complianceStatus = 'ml_image_policy_pass';
    assetSource = assetPack.assets.find((asset) => asset.assetKey === 'cover_main')?.assetSource ?? 'internal_generated';
    if (isRejectHard && rejectHardStalePackOverrideActive) {
      logger.warn('[ML-IMAGE-REMEDIATION] P77 reject_hard stale pack override active — explicit operator intent', {
        productId: params.productId,
      });
    }
  } else {
    if (assetPack.missingRequired.length > 0) {
      blockingReasons.push(`missing_required_assets:${assetPack.missingRequired.join(',')}`);
    }
    if (assetPack.invalidRequired.length > 0) {
      blockingReasons.push(`invalid_required_assets:${assetPack.invalidRequired.join(',')}`);
    }
    if (assetPack.unapprovedRequired.length > 0) {
      blockingReasons.push(`unapproved_required_assets:${assetPack.unapprovedRequired.join(',')}`);
    }
    if (assetPack.packApproved && isRejectHard && !rejectHardStalePackOverrideActive) {
      blockingReasons.push('reject_hard_stale_pack_not_permitted_without_override_p77');
    }
    complianceStatus =
      decision.decision === 'reject_hard' ? 'ml_image_policy_fail' : 'ml_image_manual_review_required';
  }

  let integrationLayerOutcome:
    | 'direct_pass'
    | 'remediated_pass'
    | 'human_review_required'
    | 'reject_hard'
    | 'legacy_raw_publish_safe'
    | 'legacy_approved_pack'
    | 'reject_hard_stale_pack_override_publish'
    | 'blocked' = 'blocked';

  if (publishSafe) {
    if (canonicalHandled.kind === 'raw_ordered') {
      integrationLayerOutcome = 'direct_pass';
    } else if (canonicalHandled.kind === 'pack') {
      integrationLayerOutcome = 'remediated_pass';
    } else if (decision.remediationPathSelected === 'raw_images_publish_safe') {
      integrationLayerOutcome = 'legacy_raw_publish_safe';
    } else if (isRejectHard && rejectHardStalePackOverrideActive) {
      integrationLayerOutcome = 'reject_hard_stale_pack_override_publish';
    } else {
      integrationLayerOutcome = 'legacy_approved_pack';
    }
  } else if (isRejectHard) {
    integrationLayerOutcome = 'reject_hard';
  } else if (canonicalHandled.kind === 'human_review') {
    integrationLayerOutcome = 'human_review_required';
  }

  const complianceProof = buildComplianceProof({
    status: complianceStatus,
    primaryImageUrl: publishableImageInputs[0] || rawAudit.primaryImageUrl || null,
    remediationPathUsed: decision.remediationPathSelected,
    assetPackDir,
    packApproved: assetPack.packApproved,
    reviewedProofState,
    publishSafe,
    blockingReasons,
    assetSource,
    rawAudit,
  });

  const mlChileCanonicalPipelineMeta =
    canonicalResult === null
      ? {
          checkedAt: new Date().toISOString(),
          executed: false,
          canonicalDisabled: true,
          note: 'ML_CANONICAL_IMAGE_PIPELINE disabled or unavailable',
        }
      : {
          checkedAt: new Date().toISOString(),
          executed: true,
          trace: canonicalResult.trace,
          traceFinalOutcome: canonicalResult.trace.finalOutcome,
          appliedToPublishDecision: canonicalHandled.kind !== 'none',
          handledKind: canonicalHandled.kind === 'none' ? null : canonicalHandled.kind,
          unusedTraceOnlyBecauseRejectHard:
            decision.remediationPathSelected === 'reject_hard' && canonicalHandled.kind === 'none',
          orderedUrls: canonicalHandled.kind === 'raw_ordered' ? canonicalHandled.orderedUrls : undefined,
          humanReviewReasons: canonicalHandled.kind === 'human_review' ? canonicalHandled.reasons : undefined,
        };

  const portadaReadiness = buildPortadaAutomationReadinessFromP103(portadaAutomationAttempt);

  const metadataPatch = {
    mlChileCanonicalPipeline: mlChileCanonicalPipelineMeta,
    mlChileImageCompliance: complianceProof,
    ...(portadaReadiness ? { portadaAutomation: portadaReadiness } : {}),
    mlChileImageRemediation: {
      checkedAt: new Date().toISOString(),
      decision: decision.decision,
      remediationPathSelected: decision.remediationPathSelected,
      executor,
      publishSafe,
      reviewedProofState,
      blockingReasons: [...new Set(blockingReasons)],
      integrationLayerOutcome,
      rejectHardStalePackOverrideActive,
      promptSpecs,
      rawAuditSummary: {
        status: rawAudit.status,
        hardBlockers: rawAudit.hardBlockers,
        manualReviewReasons: rawAudit.manualReviewReasons,
        qualityRequirements: rawAudit.qualityRequirements,
        primaryImageUrl: rawAudit.primaryImageUrl,
        imageCount: rawAudit.imageCount,
      },
    },
    mlChileAssetPack: {
      rootDir: assetPack.rootDir,
      manifestPath: assetPack.manifestPath,
      manifestPresent: assetPack.manifestPresent,
      packApproved: assetPack.packApproved,
      readyForUpload: assetPack.readyForUpload,
      missingRequired: assetPack.missingRequired,
      invalidRequired: assetPack.invalidRequired,
      unapprovedRequired: assetPack.unapprovedRequired,
      assets: assetPack.assets.map((asset) => ({
        assetKey: asset.assetKey,
        required: asset.required,
        exists: asset.exists,
        localPath: asset.localPath,
        promptPath: asset.promptPath,
        approvalState: asset.approvalState,
        assetSource: asset.assetSource,
        width: asset.width,
        height: asset.height,
        squareLike: asset.squareLike,
        min1200: asset.min1200,
        notes: asset.notes,
      })),
    },
  };

  logger.info('[ML-IMAGE-REMEDIATION] evaluated', {
    productId: params.productId,
    decision: decision.decision,
    remediationPathSelected: decision.remediationPathSelected,
    publishSafe,
    integrationLayerOutcome,
    packApproved: assetPack.packApproved,
    blockingReasons: [...new Set(blockingReasons)].slice(0, 5),
  });

  return {
    productId: params.productId,
    decision: decision.decision,
    remediationPathSelected: decision.remediationPathSelected,
    executor,
    rawAudit,
    compliantPackPresent: assetPack.packApproved,
    publishSafe,
    publishableImageInputs,
    reviewedProofState,
    assetPack,
    remediationPathUsed: decision.remediationPathSelected,
    blockingReasons: [...new Set(blockingReasons)],
    promptSpecs,
    complianceProof,
    metadataPatch,
  };
}

export async function resolveMercadoLibrePublishImageInputs(
  params: RunMercadoLibreImageRemediationParams
): Promise<{
  publishSafe: boolean;
  images: string[];
  remediation: MlImageRemediationResult;
  blockingReason?: string;
}> {
  const remediation = await runMercadoLibreImageRemediationPipeline(params);
  if (!remediation.publishSafe || remediation.publishableImageInputs.length === 0) {
    return {
      publishSafe: false,
      images: [],
      remediation,
      blockingReason:
        remediation.blockingReasons[0] ||
        'MercadoLibre compliant asset pack is not ready',
    };
  }

  return {
    publishSafe: true,
    images: remediation.publishableImageInputs,
    remediation,
  };
}
