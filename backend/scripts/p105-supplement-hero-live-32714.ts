#!/usr/bin/env tsx
/**
 * P105 — Supplement hero for product 32714: persist metadata, rebuild portada (P103 stack), optional ML picture replace.
 *
 * Metadata (product.productData JSON):
 * - mlImagePipeline.portadaSupplementHeroUrl — https preferred (fail-closed if unfetchable)
 * - mlImagePipeline.portadaSupplementHeroWorkspaceRelativePath — path under repo root (fail-closed if missing)
 * If both set, URL wins (see buildPortadaRebuildCandidateList).
 *
 * Flags:
 *   --url <https://...>              Merge portadaSupplementHeroUrl and save product row
 *   --workspace-relative <path>      Merge portadaSupplementHeroWorkspaceRelativePath (e.g. artifacts/ml-image-packs/product-32714/hero.png)
 *   --seed-from-pack-detail          Copy pack detail_mount_interface.png → portada_supplement_hero.png and set workspace relative path
 *   --dry-run                        Do not prisma.update productData
 *   --try-replace-ml <ITEM_ID>       After successful rebuild, replace listing pictures
 *
 * From backend/:
 *   npx tsx scripts/p105-supplement-hero-live-32714.ts --seed-from-pack-detail
 *   npx tsx scripts/p105-supplement-hero-live-32714.ts --url https://example.com/hero.jpg --try-replace-ml MLC3805190796
 */
import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { getCanonicalMercadoLibreAssetPackDir } from '../src/services/mercadolibre-image-remediation.service';
import { attemptMercadoLibreP103HeroPortadaFromUrls } from '../src/services/ml-portada-hero-reconstruction.service';
import {
  evaluateMlPortadaStrictAndNaturalGateFromBuffer,
} from '../src/services/ml-portada-visual-compliance.service';
import {
  isPortadaSupplementHeroConfigured,
  parseProductImageUrls,
} from '../src/services/marketplace-image-pipeline/candidate-scoring.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import { MarketplaceService } from '../src/services/marketplace.service';

const PRODUCT_ID = 32714;
const OUTPUT = path.join(process.cwd(), '..', 'p105-live-result.json');
const WORKSPACE_REL_DEFAULT = `artifacts/ml-image-packs/product-${PRODUCT_ID}/portada_supplement_hero.png`;

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function mergeProductDataMlPipeline(
  productData: unknown,
  patch: Record<string, unknown>
): { merged: Record<string, unknown>; json: string } {
  let base: Record<string, unknown> = {};
  if (typeof productData === 'string' && productData.trim()) {
    try {
      base = JSON.parse(productData) as Record<string, unknown>;
    } catch {
      base = {};
    }
  } else if (productData && typeof productData === 'object') {
    base = { ...(productData as Record<string, unknown>) };
  }
  const prev: Record<string, unknown> = { ...((base.mlImagePipeline as Record<string, unknown>) || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete prev[k];
    else prev[k] = v;
  }
  base.mlImagePipeline = prev;
  return { merged: base, json: JSON.stringify(base) };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const tryReplaceIdx = process.argv.indexOf('--try-replace-ml');
  const replaceItemId =
    tryReplaceIdx >= 0 && process.argv[tryReplaceIdx + 1] ? String(process.argv[tryReplaceIdx + 1]).trim() : null;

  const urlIdx = process.argv.indexOf('--url');
  const urlArg = urlIdx >= 0 && process.argv[urlIdx + 1] ? String(process.argv[urlIdx + 1]).trim() : null;

  const wrIdx = process.argv.indexOf('--workspace-relative');
  const wrArg = wrIdx >= 0 && process.argv[wrIdx + 1] ? String(process.argv[wrIdx + 1]).trim() : null;

  const seedFromDetail = process.argv.includes('--seed-from-pack-detail');

  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    pipeline: 'P105 supplement hero → P103 isolation + gates → cover_main.png',
    dryRun,
  };

  const row = await prisma.product.findUnique({ where: { id: PRODUCT_ID } });
  if (!row) {
    out.fatalError = 'product_not_found';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    await prisma.$disconnect();
    process.exit(2);
    return;
  }

  let productDataForRun: unknown = row.productData;
  const pipelinePatch: Record<string, unknown> = {};

  if (seedFromDetail) {
    const packDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
    const detail = path.join(packDir, 'detail_mount_interface.png');
    const target = path.join(packDir, 'portada_supplement_hero.png');
    if (!fs.existsSync(detail)) {
      out.fatalError = 'pack_detail_mount_interface_png_missing_for_seed';
      out.expectedPath = detail;
      fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
      console.log(JSON.stringify(out, null, 2));
      await prisma.$disconnect();
      process.exit(3);
      return;
    }
    await fs.promises.copyFile(detail, target);
    out.seededSupplementFile = path.resolve(target);
    pipelinePatch.portadaSupplementHeroWorkspaceRelativePath = WORKSPACE_REL_DEFAULT;
    pipelinePatch.portadaSupplementHeroUrl = null;
  }

  if (urlArg) {
    pipelinePatch.portadaSupplementHeroUrl = urlArg;
    pipelinePatch.portadaSupplementHeroWorkspaceRelativePath = null;
  }

  if (wrArg) {
    pipelinePatch.portadaSupplementHeroWorkspaceRelativePath = wrArg;
    if (!urlArg) {
      pipelinePatch.portadaSupplementHeroUrl = null;
    }
  }

  if (Object.keys(pipelinePatch).length > 0) {
    const { json } = mergeProductDataMlPipeline(row.productData, pipelinePatch);
    productDataForRun = parseJson(json);
    out.productDataPatch = pipelinePatch;
    out.supplementConfiguredAfterPatch = isPortadaSupplementHeroConfigured(productDataForRun);
    if (!dryRun) {
      await prisma.product.update({
        where: { id: PRODUCT_ID },
        data: { productData: json },
      });
      out.productRowUpdated = true;
    } else {
      out.productRowUpdated = false;
    }
  } else {
    out.supplementConfiguredAfterPatch = isPortadaSupplementHeroConfigured(row.productData);
  }

  if (!isPortadaSupplementHeroConfigured(productDataForRun)) {
    out.fatalError = 'p105_supplement_hero_not_configured';
    out.hint =
      'Pass --url, --workspace-relative, or --seed-from-pack-detail; or set mlImagePipeline.portadaSupplementHeroUrl / portadaSupplementHeroWorkspaceRelativePath on the product row.';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    await prisma.$disconnect();
    process.exit(4);
    return;
  }

  const urls = parseProductImageUrls(row.images);
  out.supplierImageUrlCount = urls.length;
  out.portadaSourcePlanNote =
    'Supplement hero is trial #1 when configured; see p103Trace.portadaSourcePlan in this file after rebuild.';

  const attempt = await attemptMercadoLibreP103HeroPortadaFromUrls(urls, {
    maxTrials: 12,
    productData: productDataForRun,
  });

  out.p103AttemptOk = attempt.ok;
  out.p103Trace = attempt.trace;
  out.winningUrl = attempt.winningUrl ?? null;
  out.winningObjectKey = attempt.winningObjectKey ?? null;
  out.winningSourceKind = attempt.winningSourceKind ?? null;

  if (!attempt.ok || !attempt.pngBuffer) {
    out.fatalError = attempt.trace.failClosedReason ?? 'p103_rebuild_failed_all_trials';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    await prisma.$disconnect();
    process.exit(5);
    return;
  }

  out.postBuildStrictNaturalGate = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(attempt.pngBuffer);

  const packDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const coverPath = path.join(packDir, 'cover_main.png');
  const manifestPath = path.join(packDir, 'ml-asset-pack.json');

  await fs.promises.mkdir(packDir, { recursive: true });
  await fs.promises.writeFile(coverPath, attempt.pngBuffer);

  let manifest: Record<string, unknown> = {};
  try {
    manifest = parseJson<Record<string, unknown>>(await fs.promises.readFile(manifestPath, 'utf8'));
  } catch {
    manifest = {
      schemaVersion: 1,
      productId: PRODUCT_ID,
      generatedAt: new Date().toISOString(),
      listingId: null,
      reviewedProofState: 'files_ready_pending_manual_upload',
      remediationPathSelected: 'canonical_pipeline_v1',
      assets: [],
    };
  }

  const assets = Array.isArray(manifest.assets) ? [...(manifest.assets as unknown[])] : [];
  const idx = assets.findIndex(
    (a) => typeof a === 'object' && a !== null && (a as { assetKey?: string }).assetKey === 'cover_main'
  );
  const coverRec =
    idx >= 0
      ? { ...(assets[idx] as object) }
      : {
          assetKey: 'cover_main',
          required: true,
          filename: 'cover_main.png',
          promptFilename: null,
          approvalState: 'approved',
          assetSource: 'p105_portada_supplement_hero',
          notes: null,
        };
  const merged = {
    ...(coverRec as Record<string, unknown>),
    filename: 'cover_main.png',
    approvalState: 'approved',
    assetSource: 'p105_portada_supplement_hero',
    notes: `P105 supplement hero; winner_kind=${attempt.winningSourceKind ?? 'unknown'}; winner_url=${attempt.winningUrl ?? 'n/a'}`,
  };
  if (idx >= 0) assets[idx] = merged;
  else assets.unshift(merged);

  manifest.assets = assets;
  manifest.generatedAt = new Date().toISOString();
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  out.writtenCoverPath = path.resolve(coverPath);
  out.writtenManifestPath = path.resolve(manifestPath);

  if (replaceItemId && row.userId) {
    try {
      const ms = new MarketplaceService();
      const creds = await ms.getCredentials(row.userId, 'mercadolibre', 'production');
      if (!creds?.credentials) {
        out.mlPictureReplace = { attempted: false, reason: 'no_mercadolibre_credentials_row' };
      } else {
        const mlCreds = (creds.credentials || {}) as Record<string, string | undefined>;
        const accessToken = typeof mlCreds.accessToken === 'string' ? mlCreds.accessToken : '';
        if (!accessToken) {
          out.mlPictureReplace = { attempted: false, reason: 'no_mercadolibre_access_token' };
        } else {
          const ml = new MercadoLibreService(creds.credentials as any);
          const detailPath = path.join(packDir, 'detail_mount_interface.png');
          const detailJpg = path.join(packDir, 'detail_mount_interface.jpg');
          const detail =
            fs.existsSync(detailPath) ? detailPath : fs.existsSync(detailJpg) ? detailJpg : null;
          if (!detail) {
            out.mlPictureReplace = { attempted: false, reason: 'detail_mount_interface_missing_next_to_cover' };
          } else {
            const snap = await ml.replaceListingPictures(replaceItemId, [coverPath, detail]);
            out.mlPictureReplace = { attempted: true, itemId: replaceItemId, snapshot: snap };
          }
        }
      }
    } catch (e) {
      out.mlPictureReplace = {
        attempted: true,
        itemId: replaceItemId,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    out.mlPictureReplace = {
      attempted: false,
      reason: replaceItemId ? 'missing_userId_on_product' : 'no_--try-replace-ml_flag',
    };
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  const err = e instanceof Error ? e.message : String(e);
  fs.writeFileSync(OUTPUT, JSON.stringify({ fatalError: err }, null, 2), 'utf8');
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
