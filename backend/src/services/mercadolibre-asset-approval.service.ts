import fs from 'fs/promises';
import path from 'path';
import { getCanonicalMercadoLibreAssetPackDir, inspectMercadoLibreAssetPack, type MlAssetKey } from './mercadolibre-image-remediation.service';

export type MlVisualApprovalMethod = 'hybrid_structural_plus_review_confirmation';
export type MlAssetReviewOutcome = 'approved' | 'rejected_needs_regeneration' | 'still_manual_review_required';

export interface MlAssetChecklistResult {
  criterion:
    | 'product_complete'
    | 'centered_or_compositionally_clear'
    | 'product_protagonist'
    | 'no_text'
    | 'no_watermark_logo'
    | 'no_hand'
    | 'no_collage_split'
    | 'minimum_1200x1200'
    | 'visually_cleaner_than_supplier';
  status: 'pass' | 'fail';
  source: 'automated' | 'review_confirmation';
  reason: string;
}

export interface MlAssetVisualReviewReport {
  assetKey: 'cover_main' | 'detail_mount_interface';
  localPath: string | null;
  outcome: MlAssetReviewOutcome;
  overallPass: boolean;
  checklist: MlAssetChecklistResult[];
  failureReasons: string[];
}

export interface MlAssetApprovalRunResult {
  method: MlVisualApprovalMethod;
  productId: number;
  packDir: string;
  reviewFilePath: string;
  reviewFilePresent: boolean;
  requiredAssets: MlAssetVisualReviewReport[];
  packApproved: boolean;
  reviewedProofState: 'pending_real_files' | 'files_ready_pending_manual_upload';
  goNoGo: 'GO_FOR_ML_IMAGE_REPLACEMENT' | 'NOT_READY_REGENERATION_REQUIRED' | 'NOT_READY_MANUAL_REVIEW_REQUIRED';
}

interface ReviewConfirmationAsset {
  assetKey: string;
  reviewedBy?: string;
  reviewedAt?: string;
  checklist?: Record<string, boolean>;
}

interface ReviewConfirmationFile {
  schemaVersion?: number;
  productId?: number;
  assets?: ReviewConfirmationAsset[];
}

interface ManifestAssetRecord {
  assetKey: MlAssetKey;
  required: boolean;
  filename?: string | null;
  promptFilename?: string | null;
  approvalState?: string | null;
  assetSource?: string | null;
  notes?: string | null;
  generatedAt?: string | null;
  generatedByAgent?: string | null;
  reviewedAt?: string | null;
  reviewedByAgent?: string | null;
  reviewSummary?: string | null;
}

interface ManifestRecord {
  reviewedProofState?: string;
  assets?: ManifestAssetRecord[];
}

const REQUIRED_ASSETS: Array<'cover_main' | 'detail_mount_interface'> = ['cover_main', 'detail_mount_interface'];

function reviewFilePathFor(packDir: string): string {
  return path.join(packDir, 'ml-asset-visual-review.json');
}

async function readJsonFile<T>(target: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(target, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(target: string, payload: unknown): Promise<void> {
  await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizeChecklistValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function buildManualRequiredChecklist(assetKey: 'cover_main' | 'detail_mount_interface', automatedMinimum1200: boolean): MlAssetChecklistResult[] {
  const compositionCriterion =
    assetKey === 'detail_mount_interface'
      ? 'centered_or_compositionally_clear'
      : 'centered_or_compositionally_clear';
  return [
    {
      criterion: 'product_complete',
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_product_complete',
    },
    {
      criterion: compositionCriterion,
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_composition',
    },
    {
      criterion: 'product_protagonist',
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_protagonist',
    },
    {
      criterion: 'no_text',
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_no_text',
    },
    {
      criterion: 'no_watermark_logo',
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_no_watermark_logo',
    },
    {
      criterion: 'no_hand',
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_no_hand',
    },
    {
      criterion: 'no_collage_split',
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_no_collage_split',
    },
    {
      criterion: 'minimum_1200x1200',
      status: automatedMinimum1200 ? 'pass' : 'fail',
      source: 'automated',
      reason: automatedMinimum1200 ? 'dimensions_validated_automatically' : 'asset_below_1200x1200',
    },
    {
      criterion: 'visually_cleaner_than_supplier',
      status: 'fail',
      source: 'review_confirmation',
      reason: 'review_confirmation_missing_for_visual_cleanliness',
    },
  ];
}

function buildChecklistFromConfirmation(params: {
  assetKey: 'cover_main' | 'detail_mount_interface';
  automatedMinimum1200: boolean;
  confirmation: ReviewConfirmationAsset;
}): MlAssetChecklistResult[] {
  const c = params.confirmation.checklist || {};
  const get = (key: string): boolean | null => normalizeChecklistValue(c[key]);
  return [
    {
      criterion: 'product_complete',
      status: get('product_complete') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('product_complete') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
    {
      criterion: 'centered_or_compositionally_clear',
      status: get('centered_or_compositionally_clear') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('centered_or_compositionally_clear') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
    {
      criterion: 'product_protagonist',
      status: get('product_protagonist') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('product_protagonist') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
    {
      criterion: 'no_text',
      status: get('no_text') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('no_text') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
    {
      criterion: 'no_watermark_logo',
      status: get('no_watermark_logo') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('no_watermark_logo') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
    {
      criterion: 'no_hand',
      status: get('no_hand') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('no_hand') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
    {
      criterion: 'no_collage_split',
      status: get('no_collage_split') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('no_collage_split') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
    {
      criterion: 'minimum_1200x1200',
      status: params.automatedMinimum1200 ? 'pass' : 'fail',
      source: 'automated',
      reason: params.automatedMinimum1200 ? 'dimensions_validated_automatically' : 'asset_below_1200x1200',
    },
    {
      criterion: 'visually_cleaner_than_supplier',
      status: get('visually_cleaner_than_supplier') === true ? 'pass' : 'fail',
      source: 'review_confirmation',
      reason: get('visually_cleaner_than_supplier') === true ? 'review_confirmation_pass' : 'review_confirmation_fail_or_missing',
    },
  ];
}

function deriveReviewOutcome(checklist: MlAssetChecklistResult[], reviewFilePresent: boolean): MlAssetReviewOutcome {
  if (!reviewFilePresent) {
    return 'still_manual_review_required';
  }
  return checklist.every((item) => item.status === 'pass') ? 'approved' : 'rejected_needs_regeneration';
}

async function updateManifestStates(params: {
  packDir: string;
  reports: MlAssetVisualReviewReport[];
}): Promise<{ packApproved: boolean; reviewedProofState: 'pending_real_files' | 'files_ready_pending_manual_upload' }> {
  const manifestPath = path.join(params.packDir, 'ml-asset-pack.json');
  const manifest = (await readJsonFile<ManifestRecord>(manifestPath)) || {};
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const approvedRequired = params.reports.every((report) => report.outcome === 'approved');

  for (const asset of assets) {
    const report = params.reports.find((item) => item.assetKey === asset.assetKey);
    if (!report) continue;
    if (report.outcome === 'approved') {
      asset.approvalState = 'approved';
      asset.reviewedAt = new Date().toISOString();
      asset.reviewedByAgent = 'ml_visual_approval_stage';
      asset.reviewSummary = 'approved_by_hybrid_visual_approval_stage';
      asset.notes = 'approved_by_hybrid_visual_approval_stage';
    } else if (report.outcome === 'rejected_needs_regeneration') {
      asset.approvalState = 'present_unapproved';
      asset.reviewedAt = null;
      asset.reviewedByAgent = null;
      asset.reviewSummary = report.failureReasons.join('; ');
      asset.notes = report.failureReasons.join('; ');
    } else {
      asset.approvalState = 'present_unapproved';
      asset.reviewedAt = null;
      asset.reviewedByAgent = null;
      asset.reviewSummary = report.failureReasons.join('; ');
      asset.notes = report.failureReasons.join('; ');
    }
  }

  manifest.reviewedProofState = approvedRequired ? 'files_ready_pending_manual_upload' : 'pending_real_files';
  await writeJsonFile(manifestPath, manifest);

  return {
    packApproved: approvedRequired,
    reviewedProofState: manifest.reviewedProofState as 'pending_real_files' | 'files_ready_pending_manual_upload',
  };
}

export async function runMercadoLibreAssetVisualApproval(params: {
  productId: number;
  applyTransition?: boolean;
}): Promise<MlAssetApprovalRunResult> {
  const packDir = getCanonicalMercadoLibreAssetPackDir(params.productId);
  const reviewFilePath = reviewFilePathFor(packDir);
  const pack = await inspectMercadoLibreAssetPack({ productId: params.productId });
  const reviewFile = await readJsonFile<ReviewConfirmationFile>(reviewFilePath);
  const reviewAssets = Array.isArray(reviewFile?.assets) ? reviewFile!.assets! : [];
  const reviewFilePresent = !!reviewFile;

  const reports: MlAssetVisualReviewReport[] = REQUIRED_ASSETS.map((assetKey) => {
    const asset = pack.assets.find((item) => item.assetKey === assetKey);
    const automatedMinimum1200 = asset?.min1200 === true;
    const confirmation = reviewAssets.find((item) => item.assetKey === assetKey);
    const checklist =
      confirmation
        ? buildChecklistFromConfirmation({ assetKey, automatedMinimum1200, confirmation })
        : buildManualRequiredChecklist(assetKey, automatedMinimum1200);
    const outcome = deriveReviewOutcome(checklist, !!confirmation && reviewFilePresent);
    const failureReasons = checklist.filter((item) => item.status === 'fail').map((item) => `${item.criterion}:${item.reason}`);

    return {
      assetKey,
      localPath: asset?.localPath ?? null,
      outcome,
      overallPass: outcome === 'approved',
      checklist,
      failureReasons,
    };
  });

  let packApproved = false;
  let reviewedProofState: 'pending_real_files' | 'files_ready_pending_manual_upload' = 'pending_real_files';

  if (params.applyTransition) {
    const transition = await updateManifestStates({
      packDir,
      reports,
    });
    packApproved = transition.packApproved;
    reviewedProofState = transition.reviewedProofState;
  } else {
    packApproved = reports.every((report) => report.outcome === 'approved');
    reviewedProofState = packApproved ? 'files_ready_pending_manual_upload' : 'pending_real_files';
  }

  const hasRejected = reports.some((report) => report.outcome === 'rejected_needs_regeneration');
  const goNoGo =
    packApproved
      ? 'GO_FOR_ML_IMAGE_REPLACEMENT'
      : hasRejected
        ? 'NOT_READY_REGENERATION_REQUIRED'
        : 'NOT_READY_MANUAL_REVIEW_REQUIRED';

  return {
    method: 'hybrid_structural_plus_review_confirmation',
    productId: params.productId,
    packDir,
    reviewFilePath,
    reviewFilePresent,
    requiredAssets: reports,
    packApproved,
    reviewedProofState,
    goNoGo,
  };
}
