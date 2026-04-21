#!/usr/bin/env tsx
/**
 * P103 — Rebuild Mercado Libre portada for product 32714 from best-ranked raw supplier image:
 * border-color isolation → 1200×1200 white hero → strict + natural + hero + integrity gates.
 *
 * Writes cover_main.png + updates ml-asset-pack.json when a candidate passes all gates.
 * Optional: --try-replace-ml <ITEM_ID> to call MercadoLibreService.replaceListingPictures (requires active token).
 *
 * From backend/:
 *   npx tsx scripts/p103-hero-rebuild-32714.ts
 *   npx tsx scripts/p103-hero-rebuild-32714.ts --try-replace-ml MLC3805190796
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
import { parseProductImageUrls } from '../src/services/marketplace-image-pipeline/candidate-scoring.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import { MarketplaceService } from '../src/services/marketplace.service';

const PRODUCT_ID = 32714;
const OUTPUT = path.join(process.cwd(), '..', 'p103-rebuild-result.json');

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const tryReplaceIdx = process.argv.indexOf('--try-replace-ml');
  const replaceItemId =
    tryReplaceIdx >= 0 && process.argv[tryReplaceIdx + 1] ? String(process.argv[tryReplaceIdx + 1]).trim() : null;

  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    pipeline: 'P103 rank → isolate → hero 1200 → strict+natural+hero+integrity',
    pictureOrderIntent: 'portada_first: [cover_main.png, existing detail_mount_interface unchanged]',
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

  const urls = parseProductImageUrls(row.images);

  out.supplierImageUrlCount = urls.length;
  out.supplierImageUrlsSample = urls.slice(0, 6);

  if (urls.length === 0) {
    out.fatalError = 'no_http_supplier_urls_on_product_row';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    await prisma.$disconnect();
    process.exit(3);
    return;
  }

  const attempt = await attemptMercadoLibreP103HeroPortadaFromUrls(urls, {
    maxTrials: 8,
    productData: row.productData,
  });
  out.p103AttemptOk = attempt.ok;
  out.p103Trace = attempt.trace;
  out.winningUrl = attempt.winningUrl ?? null;
  out.winningObjectKey = attempt.winningObjectKey ?? null;
  out.winningSourceKind = attempt.winningSourceKind ?? null;

  if (!attempt.ok || !attempt.pngBuffer) {
    out.fatalError = 'p103_all_ranked_candidates_failed_gates_or_isolation';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    await prisma.$disconnect();
    process.exit(4);
    return;
  }

  const gate = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(attempt.pngBuffer);
  out.postBuildStrictNaturalGate = gate;

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
          assetSource: 'p103_hero_reconstruction_v1',
          notes: null,
        };
  const merged = {
    ...(coverRec as Record<string, unknown>),
    filename: 'cover_main.png',
    approvalState: 'approved',
    assetSource: 'p103_hero_reconstruction_v1',
    notes: `P103 ranked-source isolation rebuild; winner_url=${attempt.winningUrl ?? 'unknown'}`,
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
