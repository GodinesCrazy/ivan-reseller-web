import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import {
  evaluateMercadoLibreImageRemediationDecision,
  getCanonicalMercadoLibreAssetPackDir,
  inspectMercadoLibreAssetPack,
  runMercadoLibreImageRemediationPipeline,
} from '../mercadolibre-image-remediation.service';
import type { MlImagePolicyAudit } from '../mercadolibre-image-policy.service';
import { runMlChileCanonicalPipeline } from '../marketplace-image-pipeline/ml-chile-canonical-pipeline.service';
import type { CanonicalPipelineTrace } from '../marketplace-image-pipeline/types';
import * as mlPortadaVisualCompliance from '../ml-portada-visual-compliance.service';

jest.mock('../marketplace-image-pipeline/ml-chile-canonical-pipeline.service');

const mockedRunCanonical = jest.mocked(runMlChileCanonicalPipeline);

function emptyCanonicalTrace(): CanonicalPipelineTrace {
  return {
    version: 1,
    profileId: 'mercadolibre_mlc_v1',
    steps: ['test'],
    rankedCandidates: [],
    rankedCandidateDetails: [],
    candidateInventory: [],
    directPathGateEvaluations: [],
    chosenDirectUrl: null,
    remediationAttempts: [],
    finalOutcome: 'human_review_required',
    winningRecipeId: null,
    winningRemediationCandidateUrl: null,
    remediationSimulation: [],
    remediationSimulationWinner: null,
    remediationSimulationAllWeak: false,
    remediationSimulationHiFiInvoked: false,
    remediationSimulationHiFiRowCount: 0,
    finalCoverPreferenceEnabled: false,
    finalCoverPreferenceMaxFinalists: 0,
    finalCoverPreferencePlanSlots: 0,
    finalCoverPreferenceFinalists: [],
    finalCoverPreferenceWinner: null,
    finalCoverPreferenceBeatReasons: [],
    finalCoverProvisionalWinner: null,
    commercialFinalistFloorEnabled: false,
    commercialFinalistFloorPass: null,
    commercialFinalistFloorFailureReasons: [],
  };
}

function makeRawAudit(overrides: Partial<MlImagePolicyAudit> = {}): MlImagePolicyAudit {
  return {
    status: 'ml_image_manual_review_required',
    checkedAt: new Date().toISOString(),
    primaryImageUrl: 'https://ae-pic-a1.aliexpress-media.com/kf/example.jpg',
    allSupplierRawImages: true,
    imageCount: 1,
    hardBlockers: [],
    manualReviewReasons: ['supplier_raw_images_require_reviewed_ml_cover'],
    qualityRequirements: ['single_image_gallery'],
    detectedVisualSignals: [],
    inspectedImages: [
      {
        url: 'https://ae-pic-a1.aliexpress-media.com/kf/example.jpg',
        sourceFamily: 'aliexpress_supplier',
        suspiciousTerms: [],
        width: 1200,
        height: 1200,
        metadataAvailable: true,
        squareLike: true,
      },
    ],
    storedProof: null,
    ...overrides,
  };
}

async function createApprovedPack(productId: number): Promise<string> {
  const dir = getCanonicalMercadoLibreAssetPackDir(productId);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const coverPath = path.join(dir, 'cover_main.png');
  const detailPath = path.join(dir, 'detail_mount_interface.png');

  await sharp({
    create: {
      width: 1200,
      height: 1200,
      channels: 3,
      background: '#ffffff',
    },
  })
    .png()
    .toFile(coverPath);

  await sharp({
    create: {
      width: 1400,
      height: 1400,
      channels: 3,
      background: '#f5f5f5',
    },
  })
    .png()
    .toFile(detailPath);

  await fs.writeFile(
    path.join(dir, 'ml-asset-pack.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        productId,
        generatedAt: new Date().toISOString(),
        reviewedProofState: 'files_ready_pending_manual_upload',
        remediationPathSelected: 'internal_generated_asset_pack',
        assets: [
          {
            assetKey: 'cover_main',
            required: true,
            filename: 'cover_main.png',
            promptFilename: 'cover_main.prompt.txt',
            approvalState: 'approved',
            assetSource: 'internal_generated',
            notes: 'test asset',
          },
          {
            assetKey: 'detail_mount_interface',
            required: true,
            filename: 'detail_mount_interface.png',
            promptFilename: 'detail_mount_interface.prompt.txt',
            approvalState: 'approved',
            assetSource: 'internal_generated',
            notes: 'test asset',
          },
          {
            assetKey: 'usage_context_clean',
            required: false,
            filename: null,
            promptFilename: 'usage_context_clean.prompt.txt',
            approvalState: 'missing',
            assetSource: null,
            notes: 'optional asset missing',
          },
        ],
      },
      null,
      2
    ),
    'utf8'
  );

  return dir;
}

describe('mercadolibre-image-remediation.service', () => {
  beforeEach(() => {
    process.env.ML_P103_HERO_REBUILD = 'false';
    process.env.ML_ENFORCE_WHITE_COVER_MAIN = 'true';
    process.env.ML_INCLUDE_RAW_GALLERY_WITH_APPROVED_PACK = 'false';
    mockedRunCanonical.mockResolvedValue(null);
    jest.spyOn(mlPortadaVisualCompliance, 'evaluateMlPortadaStrictAndNaturalGateFromBuffer').mockResolvedValue({
      pass: true,
      signals: [],
      metrics: {},
    });
  });

  afterEach(async () => {
    mockedRunCanonical.mockReset();
    jest.restoreAllMocks();
    await fs.rm(getCanonicalMercadoLibreAssetPackDir(990001), { recursive: true, force: true });
    await fs.rm(getCanonicalMercadoLibreAssetPackDir(990002), { recursive: true, force: true });
    await fs.rm(getCanonicalMercadoLibreAssetPackDir(990003), { recursive: true, force: true });
  });

  it('selects auto_remediate for risky supplier raw single-image covers', () => {
    const result = evaluateMercadoLibreImageRemediationDecision(makeRawAudit());

    expect(result.decision).toBe('auto_remediate');
    expect(result.remediationPathSelected).toBe('internal_generated_asset_pack');
    expect(result.reasons).toContain('supplier_raw_images_require_reviewed_ml_cover');
  });

  it('P77: reject_hard does not stay publish-safe from a stale disk pack without explicit override', async () => {
    await createApprovedPack(990001);

    const result = await runMercadoLibreImageRemediationPipeline({
      productId: 990001,
      title: 'Cable organizer',
      images: '[]',
      productData: {},
    });

    expect(result.publishSafe).toBe(false);
    expect(result.compliantPackPresent).toBe(true);
    expect(result.assetPack.packApproved).toBe(true);
    expect(result.publishableImageInputs).toHaveLength(0);
    expect(result.complianceProof.status).toBe('ml_image_policy_fail');
    expect(result.blockingReasons.join(' ')).toContain('reject_hard_stale_pack_not_permitted_without_override_p77');
    expect(result.metadataPatch.mlChileImageRemediation).toMatchObject({
      integrationLayerOutcome: 'reject_hard',
      rejectHardStalePackOverrideActive: false,
    });
  });

  it('P77: reject_hard may use stale disk pack only with explicit productData override', async () => {
    await createApprovedPack(990001);

    const result = await runMercadoLibreImageRemediationPipeline({
      productId: 990001,
      title: 'Cable organizer',
      images: '[]',
      productData: JSON.stringify({
        mlImagePipeline: { allowStalePackWhenRejectHard: true },
      }),
    });

    expect(result.publishSafe).toBe(true);
    expect(result.metadataPatch.mlChileImageRemediation).toMatchObject({
      integrationLayerOutcome: 'reject_hard_stale_pack_override_publish',
      rejectHardStalePackOverrideActive: true,
    });
  });

  it('blocks publish when the compliant asset pack is missing', async () => {
    const result = await runMercadoLibreImageRemediationPipeline({
      productId: 990002,
      title: 'Cable organizer',
      images: '[]',
      productData: {},
    });

    expect(result.publishSafe).toBe(false);
    expect(result.assetPack.packApproved).toBe(false);
    expect(result.blockingReasons).toContain('no source images available for MercadoLibre remediation');
  });

  it('inspects pack approval and required assets correctly', async () => {
    await createApprovedPack(990001);
    const inspection = await inspectMercadoLibreAssetPack({ productId: 990001 });

    expect(inspection.packApproved).toBe(true);
    expect(inspection.readyForUpload).toBe(true);
    expect(inspection.missingRequired).toEqual([]);
    expect(inspection.invalidRequired).toEqual([]);
    expect(inspection.unapprovedRequired).toEqual([]);
  });

  describe('P76 canonical pipeline wiring', () => {
    it('P98: human_review_required on supplier URLs still allows publish when disk pack is inspect-approved', async () => {
      await createApprovedPack(990003);
      mockedRunCanonical.mockResolvedValue({
        kind: 'human_review_required',
        reasons: ['ml_canonical_dual_gate_failed_all_candidates_and_remediations'],
        trace: emptyCanonicalTrace(),
      });

      const result = await runMercadoLibreImageRemediationPipeline({
        productId: 990003,
        title: 'Cable organizer',
        images: JSON.stringify(['https://example.com/a.jpg', 'https://example.com/b.jpg']),
        productData: {},
      });

      expect(result.assetPack.packApproved).toBe(true);
      expect(result.publishSafe).toBe(true);
      expect(result.remediationPathSelected).toBe('canonical_pipeline_v1');
      expect(result.decision).toBe('manual_review_required');
      expect(result.metadataPatch.mlChileImageRemediation).toMatchObject({
        integrationLayerOutcome: 'legacy_approved_pack',
      });
      expect(result.publishableImageInputs.length).toBeGreaterThan(0);
      expect(result.publishableImageInputs.every((input) => !input.startsWith('https://example.com'))).toBe(true);
      expect(result.metadataPatch.mlChileCanonicalPipeline).toBeDefined();
    });

    it('uses raw_ordered URLs when canonical passes both gates and white-cover enforcement is disabled', async () => {
      process.env.ML_ENFORCE_WHITE_COVER_MAIN = 'false';
      const u1 = 'https://example.com/cover.jpg';
      const u2 = 'https://example.com/detail.jpg';
      mockedRunCanonical.mockResolvedValue({
        kind: 'raw_ordered',
        orderedUrls: [u1, u2],
        trace: { ...emptyCanonicalTrace(), chosenDirectUrl: u1 },
      });

      const result = await runMercadoLibreImageRemediationPipeline({
        productId: 990002,
        title: 'Cable organizer',
        images: JSON.stringify([u1, u2]),
        productData: {},
      });

      expect(result.publishSafe).toBe(true);
      expect(result.remediationPathSelected).toBe('canonical_pipeline_v1');
      expect(result.publishableImageInputs).toEqual([u1, u2]);
      expect(result.metadataPatch.mlChileCanonicalPipeline).toMatchObject({
        handledKind: 'raw_ordered',
        appliedToPublishDecision: true,
      });
      expect((result.metadataPatch.mlChileCanonicalPipeline as { orderedUrls?: string[] }).orderedUrls).toEqual([
        u1,
        u2,
      ]);
    });
  });
});
