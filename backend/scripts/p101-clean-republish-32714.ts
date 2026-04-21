#!/usr/bin/env tsx
/**
 * P101 — Fresh controlled Mercado Libre publish for product 32714 using hardened local pack paths
 * (cover_main first, detail second) via MarketplaceService.publishProduct.
 *
 * Fails closed unless:
 * - pack on disk matches hardened manifest (cover_main assetSource must reference p100 gate path)
 * - inspectMercadoLibreAssetPack.packApproved && portada strict gate passes on cover_main
 *
 * Default: duplicateListing=true (operator deleted old ML listing; DB may still show published).
 *
 * From backend/:
 *   npx tsx scripts/p101-clean-republish-32714.ts
 *   npx tsx scripts/p101-clean-republish-32714.ts --no-duplicate   # only if product not marked published
 */
import 'dotenv/config';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { MarketplaceService } from '../src/services/marketplace.service';
import { buildMercadoLibrePublishPreflight } from '../src/services/mercadolibre-publish-preflight.service';
import {
  getCanonicalMercadoLibreAssetPackDir,
  inspectMercadoLibreAssetPack,
} from '../src/services/mercadolibre-image-remediation.service';
import {
  evaluateMlPortadaStrictAndNaturalGateFromBuffer,
} from '../src/services/ml-portada-visual-compliance.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';

const PRODUCT_ID = 32714;
const OUTPUT = path.join(process.cwd(), '..', 'p101-republish-result.json');
const PUBLISH_TIMEOUT_MS = 180_000;

/** Required source marks for hardened local portada lineage (P100/P102/P103/P105). */
const REQUIRED_COVER_SOURCE_MARKS = ['p100', 'p102', 'p103', 'p105', 'p106'];

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

async function fetchMlItem(accessToken: string, listingId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://api.mercadolibre.com/items/${listingId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'IvanReseller-P101/1.0',
      },
    });
    const text = await response.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      return { fetchOk: false, status: response.status, body };
    }
    return body;
  } catch (e) {
    return { fetchOk: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  const noDuplicate = process.argv.includes('--no-duplicate');
  const duplicateListing = !noDuplicate;
  const gateBefore = process.env.ENABLE_ML_PUBLISH ?? null;
  process.env.ENABLE_ML_PUBLISH = 'true';

  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    publishPath: 'MarketplaceService.publishProduct → publishToMercadoLibre → MercadoLibreService.createListing',
    pictureOrderIntent: 'portada_first: [cover_main.png local path, detail_mount_interface.png local path]',
    duplicateListing,
    blockNewPublications: process.env.BLOCK_NEW_PUBLICATIONS ?? null,
  };

  const packDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const coverPath = path.resolve(path.join(packDir, 'cover_main.png'));
  const detailPath = path.resolve(path.join(packDir, 'detail_mount_interface.png'));
  const manifestPath = path.join(packDir, 'ml-asset-pack.json');

  const identity: Record<string, unknown> = {
    packDir: path.resolve(packDir),
    coverPath,
    detailPath,
    coverExists: fs.existsSync(coverPath),
    detailExists: fs.existsSync(detailPath),
  };
  if (fs.existsSync(coverPath)) {
    (identity as any).coverSha256 = sha256File(coverPath);
    (identity as any).coverBytes = fs.statSync(coverPath).size;
  }
  if (fs.existsSync(detailPath)) {
    (identity as any).detailSha256 = sha256File(detailPath);
    (identity as any).detailBytes = fs.statSync(detailPath).size;
  }

  if (!fs.existsSync(manifestPath)) {
    out.fatalError = 'ml_asset_pack_manifest_missing';
    out.identity = identity;
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
    return;
  }

  const manifest = parseJson<{
    assets?: unknown[];
    listingId?: string | null;
  }>(fs.readFileSync(manifestPath, 'utf8'));
  const coverRec = (manifest.assets || []).find(
    (a: unknown) => typeof a === 'object' && a !== null && (a as any).assetKey === 'cover_main'
  ) as { assetSource?: unknown; filename?: unknown; approvalState?: unknown } | undefined;
  const coverSource = String(coverRec?.assetSource ?? '');
  identity.manifestCoverAssetSource = coverSource;
  identity.manifestCoverApprovalState = coverRec?.approvalState ?? null;
  identity.manifestListingIdStale = manifest.listingId ?? null;

  const normalizedCoverSource = coverSource.toLowerCase();
  const hasRequiredMark = REQUIRED_COVER_SOURCE_MARKS.some((m) => normalizedCoverSource.includes(m));
  if (!hasRequiredMark) {
    out.fatalError = 'p101_fail_closed_cover_not_hardened_manifest';
    out.expectedCoverSourceMark = REQUIRED_COVER_SOURCE_MARKS.join('|');
    out.identity = identity;
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
    return;
  }

  if (!fs.existsSync(coverPath) || !fs.existsSync(detailPath)) {
    out.fatalError = 'pack_png_missing_on_disk';
    out.identity = identity;
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    process.exit(4);
    return;
  }

  const packInspect = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID });
  out.packInspection = {
    packApproved: packInspect.packApproved,
    missingRequired: packInspect.missingRequired,
    invalidRequired: packInspect.invalidRequired,
    unapprovedRequired: packInspect.unapprovedRequired,
    coverAsset: packInspect.assets.find((a) => a.assetKey === 'cover_main'),
    detailAsset: packInspect.assets.find((a) => a.assetKey === 'detail_mount_interface'),
  };

  if (!packInspect.packApproved) {
    out.fatalError = 'pack_inspection_not_approved_publish_aborted';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
    return;
  }

  const portadaBuf = fs.readFileSync(coverPath);
  const portadaGate = await evaluateMlPortadaStrictAndNaturalGateFromBuffer(portadaBuf);
  out.portadaStrictNaturalGate = portadaGate;
  if (!portadaGate.pass) {
    out.fatalError = 'portada_strict_natural_gate_failed_publish_aborted';
    out.identity = identity;
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    process.exit(6);
    return;
  }

  const row = await prisma.product.findUnique({ where: { id: PRODUCT_ID } });
  if (!row) {
    out.fatalError = 'product_not_found';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    throw new Error('product_32714_not_found');
  }

  const userId = row.userId;
  out.userId = userId;
  out.prePublishSnapshot = {
    status: row.status,
    isPublished: row.isPublished,
    finalPrice: row.finalPrice != null ? String(row.finalPrice) : null,
  };

  if ((row.isPublished || row.status === 'PUBLISHED') && !duplicateListing) {
    out.skippedReason =
      'product_marked_published_pass_--duplicate_or_--no-duplicate_if_you_are_sure_first_publish';
    out.identity = identity;
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const preflight = await buildMercadoLibrePublishPreflight({
    userId,
    productId: PRODUCT_ID,
    isAdmin: true,
  });
  out.preflightRecheck = {
    overallState: preflight.overallState,
    publishAllowed: preflight.publishAllowed,
    blockers: preflight.blockers,
    listingSalePriceUsd: preflight.listingSalePriceUsd,
    mercadoLibreApi: preflight.mercadoLibreApi,
    images: preflight.images,
  };

  if (!preflight.publishAllowed) {
    out.publishAttempted = false;
    out.failureReason = 'preflight_blocked';
    out.identity = identity;
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  out.mlPublishPayloadImageOrder = [
    { position: 0, role: 'portada_cover_main', absolutePath: coverPath, sha256: (identity as any).coverSha256 },
    { position: 1, role: 'detail_mount_interface', absolutePath: detailPath, sha256: (identity as any).detailSha256 },
  ];

  const originalImages = row.images;
  const localPathsJson = JSON.stringify([coverPath, detailPath]);
  out.imageSwap = { temporaryPublishInputs: [coverPath, detailPath] };

  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: { images: localPathsJson },
  });

  const marketplaceService = new MarketplaceService();
  const basePrice = Number(row.finalPrice ?? row.suggestedPrice ?? 0);
  const fallbackDescription =
    `Producto: ${String(row.title || '').trim()}. Publicado con control de calidad.`;

  let publishResult: Awaited<ReturnType<MarketplaceService['publishProduct']>>;
  try {
    publishResult = await Promise.race([
      marketplaceService.publishProduct(
        userId,
        {
          productId: PRODUCT_ID,
          marketplace: 'mercadolibre',
          duplicateListing,
          customData: {
            title: String(row.title || '').trim(),
            description: fallbackDescription,
            price: basePrice,
            quantity: 1,
          },
        },
        'production',
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`publish_timeout_after_${PUBLISH_TIMEOUT_MS}ms`)), PUBLISH_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    publishResult = {
      success: false,
      marketplace: 'mercadolibre',
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await prisma.product.update({
      where: { id: PRODUCT_ID },
      data: { images: originalImages },
    });
    out.imagesRestoredToOriginal = true;
  }

  out.publishAttempted = true;
  out.publishResult = publishResult;

  const creds = await marketplaceService.getCredentials(userId, 'mercadolibre', 'production');
  const mlCreds = (creds?.credentials || {}) as Record<string, string | undefined>;
  const accessToken = typeof mlCreds.accessToken === 'string' ? mlCreds.accessToken : '';

  const latestListing = await prisma.marketplaceListing.findFirst({
    where: { userId, productId: PRODUCT_ID, marketplace: 'mercadolibre' },
    orderBy: { id: 'desc' },
  });

  const productAfter = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: {
      id: true,
      status: true,
      isPublished: true,
      publishedAt: true,
      images: true,
    },
  });

  out.persistence = {
    marketplaceListingLatest: latestListing
      ? {
          id: latestListing.id,
          listingId: latestListing.listingId,
          listingUrl: latestListing.listingUrl,
          status: latestListing.status,
          publishedAt: latestListing.publishedAt,
        }
      : null,
    productRowAfter: productAfter,
  };

  const listingId =
    publishResult.success && 'listingId' in publishResult && publishResult.listingId
      ? String(publishResult.listingId)
      : latestListing?.listingId || null;

  out.liveListingValidation = { listingIdUsed: listingId };

  if (listingId && accessToken) {
    const body = await fetchMlItem(accessToken, listingId);
    out.mlItemVerification = body;
    const warnings = body && Array.isArray((body as any).warnings) ? (body as any).warnings : [];
    const status = body && typeof (body as any).status === 'string' ? (body as any).status : null;
    const subStatus = body && Array.isArray((body as any).sub_status) ? (body as any).sub_status : [];
    const permalink = body && typeof (body as any).permalink === 'string' ? (body as any).permalink : null;
    out.liveListingValidation = {
      ...((out.liveListingValidation as object) || {}),
      permalink,
      status,
      sub_status: subStatus,
      warnings,
      picturesCount: Array.isArray((body as any)?.pictures) ? (body as any).pictures.length : null,
      imageModerationHint:
        warnings.length > 0
          ? 'api_warnings_present_review_ml_ui_for_picture_health'
          : 'no_warnings_array_in_item_payload',
    };
    try {
      const mlService = new MercadoLibreService({
        clientId: String(mlCreds.clientId || ''),
        clientSecret: String(mlCreds.clientSecret || ''),
        accessToken,
        refreshToken: mlCreds.refreshToken,
        userId: String(mlCreds.userId || ''),
        siteId: String(mlCreds.siteId || 'MLC'),
      });
      out.mlItemStatusProbe = await mlService.getItemStatus(listingId);
    } catch (e) {
      out.mlItemStatusProbe = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  out.identity = identity;
  out.runtimeGates = {
    enableMlPublishBefore: gateBefore,
    enableMlPublishDuringExecution: process.env.ENABLE_ML_PUBLISH,
  };

  if (publishResult.success && listingId && manifestPath) {
    try {
      const m = parseJson<Record<string, unknown>>(fs.readFileSync(manifestPath, 'utf8'));
      m.listingId = listingId;
      m.generatedAt = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');
      out.manifestListingIdUpdated = true;
    } catch {
      out.manifestListingIdUpdated = false;
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    const err = { executedAt: new Date().toISOString(), fatalError: e instanceof Error ? e.message : String(e) };
    try {
      fs.writeFileSync(OUTPUT, JSON.stringify(err, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
