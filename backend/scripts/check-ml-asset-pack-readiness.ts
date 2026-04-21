#!/usr/bin/env tsx
import { inspectMercadoLibreAssetPack } from '../src/services/mercadolibre-image-remediation.service';

async function main(): Promise<void> {
  const productId = Number(process.argv[2] || 32690);
  const pack = await inspectMercadoLibreAssetPack({ productId });
  const summary = {
    productId,
    packDir: pack.rootDir,
    manifestPath: pack.manifestPath,
    manifestPresent: pack.manifestPresent,
    ready: pack.readyForUpload,
    packApproved: pack.packApproved,
    missingRequired: pack.missingRequired,
    invalidRequired: pack.invalidRequired,
    unapprovedRequired: pack.unapprovedRequired,
    results: pack.assets.map((asset) => ({
      assetKey: asset.assetKey,
      required: asset.required,
      exists: asset.exists,
      path: asset.localPath,
      width: asset.width,
      height: asset.height,
      squareLike: asset.squareLike,
      min1200: asset.min1200,
      approvalState: asset.approvalState,
      assetSource: asset.assetSource,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ready ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
