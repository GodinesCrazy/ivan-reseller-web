/**
 * P41b — Generate cover candidate from img4 (yellow stand centered, with phone).
 * img4 shows mainly the yellow cat stand with phone, more prominent/centered.
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

function qualityGate(raw: Buffer, total: number, ch: number, label: string): boolean {
  let white = 0, warmGray = 0;
  for (let i = 0; i < raw.length; i += ch) {
    const r = raw[i]!; const g = raw[i + 1]!; const b = raw[i + 2]!;
    if (r > 240 && g > 240 && b > 240) white++;
    if (r > 150 && r < 245 && g > 130 && b > 100 && r - b > 15) warmGray++;
  }
  const wp = white / total; const wgp = warmGray / total;
  console.log(`  [${label}] white=${(wp*100).toFixed(1)}% warmGray=${(wgp*100).toFixed(1)}%`);
  if (wp > 0.95) return false;
  if (wgp > 0.05) return false;
  console.log('  PASS');
  return true;
}

async function trySource(srcBuf: Buffer, label: string, outFile: string) {
  console.log(`\n=== Trying source: ${label} ===`);
  const meta = await sharp(srcBuf).metadata();
  console.log(`  ${meta.width}x${meta.height}`);

  // Phase 1: isolation
  for (const variant of DEFAULT_P109_SEGMENTATION_ORDER) {
    try {
      const isolated = await isolateProductSubjectToPngWithVariant(srcBuf, variant);
      if (!isolated?.png) continue;
      const composed = await composePortadaHeroWithRecipe(isolated.png, 'p107_white_078');
      if (!composed) continue;
      const jpegBuf = await sharp(composed).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      const { data: raw, info } = await sharp(jpegBuf).raw().toBuffer({ resolveWithObject: true });
      if (qualityGate(raw, info.width * info.height, info.channels as number, variant)) {
        console.log(`  => isolation SUCCESS: ${variant}`);
        await fsp.writeFile(outFile, jpegBuf);
        return { label: `phase1_${variant}`, buf: jpegBuf };
      }
    } catch (e: any) { console.log(`  ${variant} error: ${e.message}`); }
  }

  // Phase 2: aggressive soft neutralization
  const MIN_SIDE = 1200;
  const innerSide = Math.round(MIN_SIDE * 0.80);
  const margin = Math.floor((MIN_SIDE - innerSide) / 2);
  const closeThresh = 50;
  const farThresh = 100;

  const { data: raw800, info: i800 } = await sharp(srcBuf)
    .rotate().flatten({ background: '#ffffff' })
    .resize(800, 800, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });

  const rw = i800.width; const rh = i800.height; const rch = i800.channels as number;
  const topRows = Math.max(3, Math.floor(rh * 0.03));
  let sr = 0, sg = 0, sb = 0, ns = 0;
  for (let y = 0; y < topRows; y++) {
    for (let x = 0; x < rw; x++) {
      const i = (y * rw + x) * rch;
      sr += raw800[i]!; sg += raw800[i+1]!; sb += raw800[i+2]!; ns++;
    }
  }
  let bgR = sr/ns, bgG = sg/ns, bgB = sb/ns;
  // If top rows are white (product area), sample corners instead
  if (bgR > 230) {
    const corners = [
      [0,0], [rw-1,0], [0,rh-1], [rw-1,rh-1],
      [Math.floor(rw*0.1),0], [Math.floor(rw*0.9),0],
      [0,Math.floor(rh*0.1)], [0,Math.floor(rh*0.9)],
    ];
    sr = 0; sg = 0; sb = 0; ns = 0;
    for (const [x,y] of corners) {
      const band = 15;
      for (let dy = 0; dy < band; dy++) {
        for (let dx = 0; dx < band; dx++) {
          const px = Math.min(x! + dx, rw-1);
          const py = Math.min(y! + dy, rh-1);
          const i = (py * rw + px) * rch;
          sr += raw800[i]!; sg += raw800[i+1]!; sb += raw800[i+2]!; ns++;
        }
      }
    }
    bgR = sr/ns; bgG = sg/ns; bgB = sb/ns;
    console.log(`  bg resampled from corners: RGB(${bgR.toFixed(0)},${bgG.toFixed(0)},${bgB.toFixed(0)})`);
  } else {
    console.log(`  bg from top rows: RGB(${bgR.toFixed(0)},${bgG.toFixed(0)},${bgB.toFixed(0)})`);
  }

  const pixels = Buffer.from(raw800);
  for (let i = 0; i < pixels.length; i += rch) {
    const pr = pixels[i]!; const pg = pixels[i+1]!; const pb = pixels[i+2]!;
    const d = Math.sqrt((pr-bgR)**2 + (pg-bgG)**2 + (pb-bgB)**2);
    if (d <= closeThresh) { pixels[i] = 255; pixels[i+1] = 255; pixels[i+2] = 255; }
    else if (d < farThresh) {
      const t = 1 - (d-closeThresh)/(farThresh-closeThresh);
      pixels[i] = Math.round(t*255 + (1-t)*pr);
      pixels[i+1] = Math.round(t*255 + (1-t)*pg);
      pixels[i+2] = Math.round(t*255 + (1-t)*pb);
    }
  }

  let nw = 0;
  for (let i = 0; i < pixels.length; i += rch) {
    if (pixels[i]! > 215 && pixels[i+1]! > 215 && pixels[i+2]! > 215) nw++;
  }
  const nwPct = nw / (rw * rh);
  console.log(`  softNeutral nearWhite: ${(nwPct*100).toFixed(1)}%`);

  const finalBuf = await sharp(pixels, { raw: { width: rw, height: rh, channels: rch as 3 } })
    .resize(innerSide, innerSide, { fit: 'contain', background: { r:255,g:255,b:255 } })
    .extend({ top:margin, bottom:MIN_SIDE-innerSide-margin, left:margin, right:MIN_SIDE-innerSide-margin, background:{r:255,g:255,b:255} })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  await fsp.writeFile(outFile, finalBuf);
  return { label: `phase2_softNeutral_nw${(nwPct*100).toFixed(0)}pct`, buf: finalBuf };
}

async function main() {
  const img4 = await fsp.readFile(path.join(SOURCES_DIR, 'img4.jpg'));

  // Try img4 with left 70% crop (remove the hand area on the right)
  const meta4 = await sharp(img4).metadata();
  const cropW4 = Math.floor(meta4.width! * 0.70);
  const img4Crop = await sharp(img4).extract({ left: 0, top: 0, width: cropW4, height: meta4.height! }).toBuffer();
  await fsp.writeFile(path.join(PACK_DIR, 'debug_img4_crop.jpg'), img4Crop);

  const r4 = await trySource(img4Crop, 'img4_crop70', path.join(PACK_DIR, 'candidate_img4.jpg'));
  console.log(`\nimg4 result: ${r4.label}, bytes=${r4.buf.length}`);

  // Final stats comparison
  for (const [name, file] of [
    ['current_cover (img2-crop55)', path.join(PACK_DIR, 'cover_main.jpg')],
    ['candidate_img4 (img4-crop70)', path.join(PACK_DIR, 'candidate_img4.jpg')],
  ]) {
    const buf = await fsp.readFile(file as string);
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const total = info.width * info.height;
    const ch = info.channels as number;
    let wc = 0, nwc = 0;
    for (let i = 0; i < data.length; i += ch) {
      if (data[i]! > 250 && data[i+1]! > 250 && data[i+2]! > 250) wc++;
      if (data[i]! > 215 && data[i+1]! > 215 && data[i+2]! > 215) nwc++;
    }
    console.log(`\n[${name}] white=${(wc/total*100).toFixed(1)}% nearWhite=${(nwc/total*100).toFixed(1)}% product~${((1-nwc/total)*100).toFixed(1)}% size=${info.width}x${info.height}`);
  }
}

main().catch(e => { console.error('[P41b] FATAL', e?.message || e); process.exit(1); });
