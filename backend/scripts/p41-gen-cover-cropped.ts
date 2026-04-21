/**
 * P41 — Generate compliant portada for product 32722 via cropped isolation.
 * Strategy: crop img2 to left 55% (isolates yellow cat stand only) → run P103/P109
 * isolation variants → pass quality gate → compose on white → save as cover_main.jpg.
 * Falls back to aggressive soft neutralization on the crop if isolation still fails.
 */
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import dotenv from 'dotenv';
const backendRoot = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(backendRoot, '.env'))) dotenv.config({ path: path.join(backendRoot, '.env') });
if (fs.existsSync(path.join(backendRoot, '.env.local'))) dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });

import sharp from 'sharp';
import {
  isolateProductSubjectToPngWithVariant,
  DEFAULT_P109_SEGMENTATION_ORDER,
} from '../src/services/ml-portada-isolation.service';
import { composePortadaHeroWithRecipe } from '../src/services/ml-portada-recipes.service';

const PACK_DIR = path.resolve(backendRoot, '../artifacts/ml-image-packs/product-32722');
const SOURCES_DIR = path.join(PACK_DIR, 'sources');

function compositionQualityGate(raw: Buffer, total: number, ch: number, label: string): boolean {
  let white = 0, warmGray = 0;
  for (let i = 0; i < raw.length; i += ch) {
    const r = raw[i]!;
    const g = raw[i + 1]!;
    const b = raw[i + 2]!;
    if (r > 240 && g > 240 && b > 240) white++;
    if (r > 150 && r < 245 && g > 130 && b > 100 && r - b > 15) warmGray++;
  }
  const whitePct = white / total;
  const warmGrayPct = warmGray / total;
  console.log(`  [gate:${label}] white=${(whitePct * 100).toFixed(1)}% warmGray=${(warmGrayPct * 100).toFixed(1)}%`);
  if (whitePct > 0.95) { console.log('  FAIL: >95% white'); return false; }
  if (warmGrayPct > 0.05) { console.log('  FAIL: >5% warm-gray'); return false; }
  console.log('  PASS: quality gate');
  return true;
}

async function main() {
  const img2 = await fsp.readFile(path.join(SOURCES_DIR, 'img2.jpg'));
  const meta = await sharp(img2).metadata();
  const W = meta.width!;
  const H = meta.height!;
  console.log(`[P41] img2 dimensions: ${W}x${H}`);

  // Crop to left 55% to isolate yellow cat stand
  const cropW = Math.floor(W * 0.55);
  const cropped = await sharp(img2).extract({ left: 0, top: 0, width: cropW, height: H }).toBuffer();
  console.log(`[P41] cropped to ${cropW}x${H} (left 55%)`);

  // Save crop for inspection
  await fsp.writeFile(path.join(PACK_DIR, 'debug_crop.jpg'), cropped);
  console.log('[P41] crop saved to debug_crop.jpg');

  // Phase 1: Try isolation on cropped image
  let coverBuf: Buffer | null = null;
  let coverLabel = '';

  for (const variant of DEFAULT_P109_SEGMENTATION_ORDER) {
    try {
      console.log(`\n[P41] trying isolation variant: ${variant}`);
      const isolated = await isolateProductSubjectToPngWithVariant(cropped, variant);
      if (!isolated?.png) { console.log('  skip: no PNG returned'); continue; }
      const composed = await composePortadaHeroWithRecipe(isolated.png, 'p107_white_078');
      if (!composed) { console.log('  skip: compose failed'); continue; }
      const jpegBuf = await sharp(composed).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      const { data: raw, info } = await sharp(jpegBuf).raw().toBuffer({ resolveWithObject: true });
      if (compositionQualityGate(raw, info.width * info.height, info.channels as number, variant)) {
        coverBuf = jpegBuf;
        coverLabel = `phase1_crop_isolation_${variant}`;
        console.log(`[P41] isolation succeeded: ${variant}`);
        break;
      }
    } catch (e: any) {
      console.log(`  variant error: ${e.message}`);
    }
  }

  // Phase 2: Aggressive soft neutralization on cropped image
  if (!coverBuf) {
    console.log('\n[P41] all isolation failed → aggressive soft neutralization on crop');
    const MIN_SIDE = 1200;
    const innerSide = Math.round(MIN_SIDE * 0.80);
    const margin = Math.floor((MIN_SIDE - innerSide) / 2);
    const closeThresh = 45;
    const farThresh = 90;
    const SOFT_WHITE = 255;

    const { data: rawCrop, info: infoCrop } = await sharp(cropped)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(800, 800, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rw = infoCrop.width;
    const rh = infoCrop.height;
    const rch = infoCrop.channels as number;

    // Detect background from top rows
    const topRows = Math.max(3, Math.floor(rh * 0.02));
    let sr = 0, sg = 0, sb = 0, ns = 0;
    for (let y = 0; y < topRows; y++) {
      for (let x = 0; x < rw; x++) {
        const i = (y * rw + x) * rch;
        sr += rawCrop[i]!; sg += rawCrop[i + 1]!; sb += rawCrop[i + 2]!; ns++;
      }
    }
    const bgR = sr / ns;
    const bgG = sg / ns;
    const bgB = sb / ns;
    console.log(`  detected bg mean: RGB(${bgR.toFixed(0)},${bgG.toFixed(0)},${bgB.toFixed(0)})`);

    const pixels = Buffer.from(rawCrop);
    for (let i = 0; i < pixels.length; i += rch) {
      const pr = pixels[i]!;
      const pg = pixels[i + 1]!;
      const pb = pixels[i + 2]!;
      const d = Math.sqrt((pr - bgR) ** 2 + (pg - bgG) ** 2 + (pb - bgB) ** 2);
      if (d <= closeThresh) {
        pixels[i] = SOFT_WHITE; pixels[i + 1] = SOFT_WHITE; pixels[i + 2] = SOFT_WHITE;
      } else if (d < farThresh) {
        const t = 1 - (d - closeThresh) / (farThresh - closeThresh);
        pixels[i] = Math.round(t * SOFT_WHITE + (1 - t) * pr);
        pixels[i + 1] = Math.round(t * SOFT_WHITE + (1 - t) * pg);
        pixels[i + 2] = Math.round(t * SOFT_WHITE + (1 - t) * pb);
      }
    }

    let nearWhiteCount = 0;
    for (let i = 0; i < pixels.length; i += rch) {
      if (pixels[i]! > 215 && pixels[i + 1]! > 215 && pixels[i + 2]! > 215) nearWhiteCount++;
    }
    const nearWhitePct = nearWhiteCount / (rw * rh);
    console.log(`  soft neutralization nearWhite: ${(nearWhitePct * 100).toFixed(1)}%`);

    if (nearWhitePct <= 0.95) {
      coverBuf = await sharp(pixels, { raw: { width: rw, height: rh, channels: rch as 3 } })
        .resize(innerSide, innerSide, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
        .extend({
          top: margin,
          bottom: MIN_SIDE - innerSide - margin,
          left: margin,
          right: MIN_SIDE - innerSide - margin,
          background: { r: 255, g: 255, b: 255 },
        })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
      coverLabel = 'phase2_aggressive_soft_neutral_crop';
      console.log(`[P41] soft neutralization succeeded (nearWhite=${(nearWhitePct * 100).toFixed(1)}%)`);
    } else {
      console.log('[P41] soft neutralization too white, using absolute fallback (no bg removal)');
      coverBuf = await sharp(cropped)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(innerSide, innerSide, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
        .extend({
          top: margin,
          bottom: MIN_SIDE - innerSide - margin,
          left: margin,
          right: MIN_SIDE - innerSide - margin,
          background: { r: 255, g: 255, b: 255 },
        })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
      coverLabel = 'phase3_fallback_crop_square_white';
      console.log('[P41] using absolute fallback');
    }
  }

  // Check final result
  const { data: finalRaw, info: finalInfo } = await sharp(coverBuf!).raw().toBuffer({ resolveWithObject: true });
  const total = finalInfo.width * finalInfo.height;
  let whiteCount = 0;
  let nearWhiteCount2 = 0;
  const ch = finalInfo.channels as number;
  for (let i = 0; i < finalRaw.length; i += ch) {
    const r = finalRaw[i]!;
    const g = finalRaw[i + 1]!;
    const b = finalRaw[i + 2]!;
    if (r > 250 && g > 250 && b > 250) whiteCount++;
    if (r > 215 && g > 215 && b > 215) nearWhiteCount2++;
  }
  const whitePct = whiteCount / total;
  const nearWhitePct2 = nearWhiteCount2 / total;
  console.log('\n[P41] Final cover stats:');
  console.log(`  size: ${finalInfo.width}x${finalInfo.height}`);
  console.log(`  pure white (>250): ${(whitePct * 100).toFixed(1)}%`);
  console.log(`  near white (>215): ${(nearWhitePct2 * 100).toFixed(1)}%`);
  console.log(`  product pixels estimate: ${((1 - nearWhitePct2) * 100).toFixed(1)}%`);
  console.log(`  path: ${coverLabel}`);
  console.log(`  bytes: ${coverBuf!.length}`);

  // Save the new cover
  const outPath = path.join(PACK_DIR, 'cover_main.jpg');
  await fsp.writeFile(outPath, coverBuf!);
  console.log(`\n[P41] cover saved to ${outPath}`);

  // Update manifest
  const manifestPath = path.join(PACK_DIR, 'ml-asset-pack.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));
  manifest.generatedAt = new Date().toISOString();
  manifest.remediationPathSelected = 'internal_process_existing_images_v2_crop';
  for (const asset of manifest.assets) {
    if (asset.assetKey === 'cover_main') {
      asset.notes = `generated by p41-gen-cover-cropped: ${coverLabel}`;
      asset.portadaGateBypass = false;
      asset.approvalState = 'pending_visual_review';
    }
  }
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('[P41] manifest updated');
}

main().catch(e => { console.error('[P41] FATAL', e?.message || e); process.exit(1); });
