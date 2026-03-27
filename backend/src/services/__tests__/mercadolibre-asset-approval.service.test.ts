import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { runMercadoLibreAssetVisualApproval } from '../mercadolibre-asset-approval.service';

async function createPack(productId: number): Promise<string> {
  const dir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const png = await sharp({
    create: {
      width: 1536,
      height: 1536,
      channels: 3,
      background: '#ffffff',
    },
  }).png().toBuffer();

  await fs.writeFile(path.join(dir, 'cover_main.png'), png);
  await fs.writeFile(path.join(dir, 'detail_mount_interface.png'), png);
  await fs.writeFile(path.join(dir, 'usage_context_clean.png'), png);
  await fs.writeFile(
    path.join(dir, 'ml-asset-pack.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        productId,
        reviewedProofState: 'pending_real_files',
        remediationPathSelected: 'internal_generated_asset_pack',
        assets: [
          {
            assetKey: 'cover_main',
            required: true,
            filename: 'cover_main.png',
            promptFilename: 'cover_main.prompt.txt',
            approvalState: 'present_unapproved',
            assetSource: 'internal_generated',
            notes: null,
          },
          {
            assetKey: 'detail_mount_interface',
            required: true,
            filename: 'detail_mount_interface.png',
            promptFilename: 'detail_mount_interface.prompt.txt',
            approvalState: 'present_unapproved',
            assetSource: 'internal_generated',
            notes: null,
          },
          {
            assetKey: 'usage_context_clean',
            required: false,
            filename: 'usage_context_clean.png',
            promptFilename: 'usage_context_clean.prompt.txt',
            approvalState: 'present_unapproved',
            assetSource: 'internal_generated',
            notes: null,
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

describe('mercadolibre-asset-approval.service', () => {
  afterEach(async () => {
    await fs.rm(path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-991101'), { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-991102'), { recursive: true, force: true });
  });

  it('keeps assets fail-closed when review confirmation is missing', async () => {
    await createPack(991101);

    const result = await runMercadoLibreAssetVisualApproval({
      productId: 991101,
      applyTransition: true,
    });

    expect(result.packApproved).toBe(false);
    expect(result.goNoGo).toBe('NOT_READY_MANUAL_REVIEW_REQUIRED');
    expect(result.requiredAssets.every((asset) => asset.outcome === 'still_manual_review_required')).toBe(true);
  });

  it('approves required assets when full review confirmation is present', async () => {
    const dir = await createPack(991102);
    await fs.writeFile(
      path.join(dir, 'ml-asset-visual-review.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          productId: 991102,
          assets: [
            {
              assetKey: 'cover_main',
              reviewedBy: 'operator',
              reviewedAt: '2026-03-23T23:59:00.000Z',
              checklist: {
                product_complete: true,
                centered_or_compositionally_clear: true,
                product_protagonist: true,
                no_text: true,
                no_watermark_logo: true,
                no_hand: true,
                no_collage_split: true,
                visually_cleaner_than_supplier: true,
              },
            },
            {
              assetKey: 'detail_mount_interface',
              reviewedBy: 'operator',
              reviewedAt: '2026-03-23T23:59:00.000Z',
              checklist: {
                product_complete: true,
                centered_or_compositionally_clear: true,
                product_protagonist: true,
                no_text: true,
                no_watermark_logo: true,
                no_hand: true,
                no_collage_split: true,
                visually_cleaner_than_supplier: true,
              },
            },
          ],
        },
        null,
        2
      ),
      'utf8'
    );

    const result = await runMercadoLibreAssetVisualApproval({
      productId: 991102,
      applyTransition: true,
    });

    expect(result.packApproved).toBe(true);
    expect(result.goNoGo).toBe('GO_FOR_ML_IMAGE_REPLACEMENT');
    expect(result.requiredAssets.every((asset) => asset.outcome === 'approved')).toBe(true);
  });
});
