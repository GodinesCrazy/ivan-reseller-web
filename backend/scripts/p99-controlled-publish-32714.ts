#!/usr/bin/env tsx
/**
 * P99 — Supervised real publish for product 32714 only via MarketplaceService.publishProduct
 * (same path as POST /api/marketplace/publish).
 *
 * ML upload accepts local file paths (mercadolibre.service uploadImage); preflight uses the pack on disk
 * but publish reads product.images from DB — this script temporarily sets images to absolute pack paths,
 * then restores the original supplier URLs after the attempt.
 *
 * Usage (from backend/):
 *   npx tsx scripts/p99-controlled-publish-32714.ts
 * Optional:
 *   npx tsx scripts/p99-controlled-publish-32714.ts --duplicate   # if product already marked published but you need a new ML listing (use with care)
 */
import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { MarketplaceService } from '../src/services/marketplace.service';
import { buildMercadoLibrePublishPreflight } from '../src/services/mercadolibre-publish-preflight.service';
import { getCanonicalMercadoLibreAssetPackDir } from '../src/services/mercadolibre-image-remediation.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';

const PRODUCT_ID = 32714;
const OUTPUT = path.join(process.cwd(), '..', 'p99-publish-result.json');
const PUBLISH_TIMEOUT_MS = 180_000;

function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fetchMlItem(accessToken: string, listingId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://api.mercadolibre.com/items/${listingId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'IvanReseller-P99/1.0',
      },
    });
    const text = await response.text();
    const body = parseJson<Record<string, unknown>>(text) ?? { raw: text };
    if (!response.ok) {
      return { fetchOk: false, status: response.status, body };
    }
    return body;
  } catch (e) {
    return { fetchOk: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  const allowDuplicate = process.argv.includes('--duplicate');
  const gateBefore = process.env.ENABLE_ML_PUBLISH ?? null;
  process.env.ENABLE_ML_PUBLISH = 'true';

  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    executedAt: new Date().toISOString(),
    publishPath: 'MarketplaceService.publishProduct → publishToMercadoLibre → MercadoLibreService.createListing',
    blockNewPublications: process.env.BLOCK_NEW_PUBLICATIONS ?? null,
  };

  const row = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
  });
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
    suggestedPrice: row.suggestedPrice != null ? String(row.suggestedPrice) : null,
    imagesFieldSample:
      typeof row.images === 'string' ? row.images.slice(0, 200) : JSON.stringify(row.images)?.slice(0, 200),
  };

  if ((row.isPublished || row.status === 'PUBLISHED') && !allowDuplicate) {
    out.skippedReason =
      'product_already_published_or_published_status; re-run with --duplicate if you intentionally want another listing';
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
    out.failureReason = 'preflight_not_publish_allowed';
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const packDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  if (!fs.existsSync(coverPath) || !fs.existsSync(detailPath)) {
    out.publishAttempted = false;
    out.failureReason = 'approved_pack_png_missing_on_disk';
    out.expectedPaths = { coverPath, detailPath };
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const originalImages = row.images;
  const localPathsJson = JSON.stringify([coverPath, detailPath]);
  out.imageSwap = {
    originalStored: typeof originalImages === 'string' ? 'string' : typeof originalImages,
    temporaryPublishInputs: [coverPath, detailPath],
  };

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
          duplicateListing: allowDuplicate,
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

  if (listingId && accessToken) {
    const mlService = new MercadoLibreService({
      clientId: String(mlCreds.clientId || ''),
      clientSecret: String(mlCreds.clientSecret || ''),
      accessToken,
      refreshToken: mlCreds.refreshToken,
      userId: String(mlCreds.userId || ''),
      siteId: String(mlCreds.siteId || 'MLC'),
    });
    out.mlItemVerification = await fetchMlItem(accessToken, listingId);
    try {
      const st = await mlService.getItemStatus(listingId);
      out.mlItemStatusProbe = st;
    } catch (e) {
      out.mlItemStatusProbe = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  out.runtimeGates = {
    enableMlPublishBefore: gateBefore,
    enableMlPublishDuringExecution: process.env.ENABLE_ML_PUBLISH,
  };

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
