#!/usr/bin/env tsx
import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../src/config/database';
import { evaluateMlPortadaStrictGateFromBuffer } from '../src/services/ml-portada-visual-compliance.service';
import {
  getCanonicalMercadoLibreAssetPackDir,
  inspectMercadoLibreAssetPack,
} from '../src/services/mercadolibre-image-remediation.service';
import { MarketplaceService } from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';

const PRODUCT_ID = 32714;
const LISTING_ID = 'MLC3804623142';
const OUTPUT = path.join(process.cwd(), '..', 'p102-live-update-result.json');

function sha256(buf: Buffer): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function main(): Promise<void> {
  const packDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  if (!fs.existsSync(coverPath) || !fs.existsSync(detailPath)) {
    throw new Error('required_pack_images_missing');
  }

  const currentCover = fs.readFileSync(coverPath);
  const side = 1200;
  const scale = 0.75;
  const target = Math.floor(side * scale);
  const inner = await sharp(currentCover).resize(target, target, { fit: 'inside' }).png().toBuffer();
  const m = await sharp(inner).metadata();
  const w = m.width ?? target;
  const h = m.height ?? target;
  const whitePadded = await sharp({
    create: { width: side, height: side, channels: 3, background: '#ffffff' },
  })
    .composite([{ input: inner, left: Math.floor((side - w) / 2), top: Math.floor((side - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  const gate = await evaluateMlPortadaStrictGateFromBuffer(whitePadded);
  if (!gate.pass) {
    const fail = { fatalError: 'whitepad_candidate_failed_strict_gate', gate };
    fs.writeFileSync(OUTPUT, JSON.stringify(fail, null, 2), 'utf8');
    console.log(JSON.stringify(fail, null, 2));
    process.exit(2);
    return;
  }

  fs.writeFileSync(coverPath, whitePadded);
  const manifestPath = path.join(packDir, 'ml-asset-pack.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.listingId = LISTING_ID;
  manifest.generatedAt = new Date().toISOString();
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  manifest.assets = assets.map((a: any) =>
    a?.assetKey === 'cover_main'
      ? {
          ...a,
          filename: 'cover_main.png',
          approvalState: 'approved',
          assetSource: 'p102_white_background_padding_recovery',
          notes: `P102 white-background recovery from prior clean portada by 0.75 white padding; strict+white gate passed`,
        }
      : a
  );
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const inspection = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID, listingId: LISTING_ID });
  if (!inspection.packApproved) {
    const fail = { fatalError: 'pack_not_approved_after_whitepad_write', inspection };
    fs.writeFileSync(OUTPUT, JSON.stringify(fail, null, 2), 'utf8');
    console.log(JSON.stringify(fail, null, 2));
    process.exit(3);
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { userId: true },
  });
  if (!product) throw new Error('product_missing');

  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(product.userId, 'mercadolibre', 'production');
  if (!creds?.credentials) throw new Error('ml_credentials_missing');
  const ml = new MercadoLibreService(creds.credentials as any);

  const before = await ml.getItem(LISTING_ID);
  const after = await ml.replaceListingPictures(LISTING_ID, [coverPath, detailPath]);
  const afterReload = await ml.getItem(LISTING_ID);

  const out = {
    productId: PRODUCT_ID,
    listingId: LISTING_ID,
    coverPath: path.resolve(coverPath),
    detailPath: path.resolve(detailPath),
    coverSha256: sha256(fs.readFileSync(coverPath)),
    detailSha256: sha256(fs.readFileSync(detailPath)),
    strictWhiteGate: gate,
    packApproved: inspection.packApproved,
    updateResponse: {
      beforeStatus: before?.status,
      afterStatus: after?.status,
      pictureIds: (after?.pictures || []).map((p: any) => p.id),
      permalink: after?.permalink,
    },
    liveItemAfterUpdate: {
      status: afterReload?.status,
      sub_status: afterReload?.sub_status,
      warnings: afterReload?.warnings || [],
      tags: afterReload?.tags || [],
      picturesCount: Array.isArray(afterReload?.pictures) ? afterReload.pictures.length : 0,
    },
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
