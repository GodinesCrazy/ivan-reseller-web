#!/usr/bin/env tsx
/**
 * P106 — Real supplement hero for product 32714 only (no detail clone, no supplier fallback when configured).
 *
 * Requires exactly one hero input (fail-fast before DB if missing):
 *   --url <https://...>              Persist mlImagePipeline.portadaSupplementHeroUrl; probes fetch before persist.
 *   --workspace-path <path>         Absolute or cwd-relative file (.png/.jpg/.jpeg/.webp); persists
 *                                    mlImagePipeline.portadaSupplementHeroWorkspaceRelativePath (repo-relative, or copy into pack).
 *
 * Optional:
 *   --dry-run                       Skip prisma.update productData.
 *   --try-replace-ml <ITEM_ID>      After successful rebuild, replace listing pictures [cover, detail].
 *
 * Forbidden for P106: --seed-from-pack-detail (detail clone); use P105 script only if you intentionally need that path.
 *
 * From backend/:
 *   npx tsx scripts/p106-real-supplement-hero-live-32714.ts --url https://cdn.example.com/hero.jpg --try-replace-ml MLC3805190796
 *   npx tsx scripts/p106-real-supplement-hero-live-32714.ts --workspace-path C:\\Photos\\clean-hero.png --try-replace-ml MLC3805190796
 */
import 'dotenv/config';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { getCanonicalMercadoLibreAssetPackDir } from '../src/services/mercadolibre-image-remediation.service';
import { processFromUrlSafe } from '../src/services/image-pipeline.service';
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
const OUTPUT = path.join(process.cwd(), '..', 'p106-live-result.json');

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function workspaceRootFromPackDir(packDir: string): string {
  return path.resolve(packDir, '..', '..', '..');
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

function getArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]).trim() : null;
}

function resolveWorkspacePathForMetadata(
  inputPath: string,
  workspaceRoot: string,
  packDir: string
): { absoluteSource: string; persistedRelativePath: string; copiedIntoPack: boolean } | null {
  const abs = path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return null;
  }
  const ext = path.extname(abs).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return null;
  }
  const rootResolved = path.resolve(workspaceRoot);
  const rel = path.relative(rootResolved, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return {
      absoluteSource: abs,
      persistedRelativePath: rel.split(path.sep).join('/'),
      copiedIntoPack: false,
    };
  }
  fs.mkdirSync(packDir, { recursive: true });
  const dest = path.join(packDir, `p106_supplement_hero${ext}`);
  fs.copyFileSync(abs, dest);
  const relDest = path.relative(rootResolved, dest);
  return {
    absoluteSource: abs,
    persistedRelativePath: relDest.split(path.sep).join('/'),
    copiedIntoPack: true,
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const urlArg = getArg('--url');
  const wpArg = getArg('--workspace-path');
  const tryReplaceIdx = process.argv.indexOf('--try-replace-ml');
  const replaceItemId =
    tryReplaceIdx >= 0 && process.argv[tryReplaceIdx + 1] ? String(process.argv[tryReplaceIdx + 1]).trim() : null;

  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    pipeline: 'P106 real supplement hero → persist → P103 isolation + gates → cover_main.png → optional ML replace',
    dryRun,
  };

  if (!urlArg && !wpArg) {
    out.fatalError = 'p106_real_supplement_hero_missing';
    out.requiredInput =
      'Provide exactly one of: --url <https://...> (HTTPS only) or --workspace-path <absolute-or-relative-path-to-png-jpg-webp>. Do not use P105 --seed-from-pack-detail for P106 (detail clone is excluded).';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.error(out.requiredInput);
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
    return;
  }

  if (urlArg && wpArg) {
    out.fatalError = 'p106_ambiguous_multiple_hero_inputs';
    out.hint = 'Pass only one of --url or --workspace-path.';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
    return;
  }

  if (urlArg) {
    const u = urlArg.trim();
    if (!u.toLowerCase().startsWith('https://')) {
      out.fatalError = 'p106_url_must_be_https';
      out.rejectedUrlPrefix = u.slice(0, 24);
      fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
      return;
    }
  }

  const packDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const workspaceRoot = workspaceRootFromPackDir(packDir);

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

  if (urlArg) {
    out.suppliedHeroInput = { kind: 'url', value: urlArg };
    const probed = await processFromUrlSafe(urlArg);
    if (!probed?.buffer || probed.buffer.length <= 64) {
      out.fatalError = 'p106_hero_url_unfetchable_or_empty';
      out.sourceLoadOk = false;
      fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
      console.log(JSON.stringify(out, null, 2));
      await prisma.$disconnect();
      process.exit(3);
      return;
    }
    out.sourceLoadOk = true;
    out.sourceProbeBytes = probed.buffer.length;
    pipelinePatch.portadaSupplementHeroUrl = urlArg;
    pipelinePatch.portadaSupplementHeroWorkspaceRelativePath = null;
  } else if (wpArg) {
    const resolved = resolveWorkspacePathForMetadata(wpArg, workspaceRoot, packDir);
    if (!resolved) {
      out.fatalError = 'p106_workspace_path_missing_or_invalid_extension';
      out.suppliedHeroInput = { kind: 'workspace_path', value: wpArg };
      out.allowedExtensions = [...ALLOWED_EXT];
      out.workspaceRootResolved = workspaceRoot;
      fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
      console.log(JSON.stringify(out, null, 2));
      await prisma.$disconnect();
      process.exit(3);
      return;
    }
    out.suppliedHeroInput = { kind: 'workspace_path', value: wpArg };
    out.resolvedAbsolutePath = resolved.absoluteSource;
    out.copiedIntoPack = resolved.copiedIntoPack;
    const buf = await fs.promises.readFile(
      resolved.copiedIntoPack ? path.join(workspaceRoot, resolved.persistedRelativePath) : resolved.absoluteSource
    );
    if (!buf || buf.length <= 64) {
      out.fatalError = 'p106_workspace_hero_file_empty_or_unreadable';
      out.sourceLoadOk = false;
      fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
      console.log(JSON.stringify(out, null, 2));
      await prisma.$disconnect();
      process.exit(3);
      return;
    }
    out.sourceLoadOk = true;
    out.sourceProbeBytes = buf.length;
    pipelinePatch.portadaSupplementHeroWorkspaceRelativePath = resolved.persistedRelativePath;
    pipelinePatch.portadaSupplementHeroUrl = null;
  }

  out.persistedFields = {
    portadaSupplementHeroUrl: pipelinePatch.portadaSupplementHeroUrl ?? null,
    portadaSupplementHeroWorkspaceRelativePath: pipelinePatch.portadaSupplementHeroWorkspaceRelativePath ?? null,
  };

  const { json } = mergeProductDataMlPipeline(row.productData, pipelinePatch);
  productDataForRun = parseJson(json);
  out.supplementConfiguredAfterPatch = isPortadaSupplementHeroConfigured(productDataForRun, workspaceRoot);

  if (!dryRun) {
    await prisma.product.update({
      where: { id: PRODUCT_ID },
      data: { productData: json },
    });
    out.productRowUpdated = true;
  } else {
    out.productRowUpdated = false;
  }

  const urls = parseProductImageUrls(row.images);
  out.supplierImageUrlCount = urls.length;

  const attempt = await attemptMercadoLibreP103HeroPortadaFromUrls(urls, {
    maxTrials: 12,
    productData: productDataForRun,
    workspaceRoot,
  });

  out.p103AttemptOk = attempt.ok;
  out.p103Trace = attempt.trace;
  out.winningUrl = attempt.winningUrl ?? null;
  out.winningObjectKey = attempt.winningObjectKey ?? null;
  out.winningSourceKind = attempt.winningSourceKind ?? null;

  if (!attempt.ok || !attempt.pngBuffer) {
    out.fatalError = attempt.trace.failClosedReason ?? 'p103_rebuild_failed_all_trials';
    out.gateResultsSummary = attempt.trace.trials?.length
      ? attempt.trace.trials[attempt.trace.trials.length - 1]
      : null;
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    await prisma.$disconnect();
    process.exit(5);
    return;
  }

  out.postBuildStrictNaturalGate = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(attempt.pngBuffer);

  const coverPath = path.join(packDir, 'cover_main.png');
  const manifestPath = path.join(packDir, 'ml-asset-pack.json');

  await fs.promises.mkdir(packDir, { recursive: true });
  await fs.promises.writeFile(coverPath, attempt.pngBuffer);

  out.writtenCoverPath = path.resolve(coverPath);
  out.coverMainSha256 = crypto.createHash('sha256').update(attempt.pngBuffer).digest('hex');

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
          assetSource: 'p106_real_supplement_hero',
          notes: null,
        };
  const merged = {
    ...(coverRec as Record<string, unknown>),
    filename: 'cover_main.png',
    approvalState: 'approved',
    assetSource: 'p106_real_supplement_hero',
    notes: `P106 real supplement hero; winner_kind=${attempt.winningSourceKind ?? 'unknown'}; winner_url=${attempt.winningUrl ?? 'n/a'}`,
  };
  if (idx >= 0) assets[idx] = merged;
  else assets.unshift(merged);

  manifest.assets = assets;
  manifest.generatedAt = new Date().toISOString();
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  out.writtenManifestPath = path.resolve(manifestPath);
  out.mlPicturePayloadOrder = replaceItemId ? ['cover_main.png (first)', 'detail_mount_interface.png|jpg (second)'] : [];

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
