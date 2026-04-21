#!/usr/bin/env tsx
/**
 * P64 helper: stats for ML pack PNGs + pipeline JPEG output (no full-pixel loops).
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { processBuffer } from '../src/services/image-pipeline.service';

async function audit(filePath: string) {
  const buf = fs.readFileSync(filePath);
  const meta = await sharp(buf, { failOnError: false }).metadata();
  const stats = await sharp(buf, { failOnError: false }).stats();
  const processed = await processBuffer(buf, 'image/png');
  const jStats = await sharp(processed.buffer).stats();

  const ch = stats.channels;
  const meanRgb = (ch[0].mean + ch[1].mean + ch[2].mean) / 3;
  const hasAlpha = meta.hasAlpha === true || (ch[3] != null);
  const meanAlpha = ch[3]?.mean ?? 255;

  const jMean = (jStats.channels[0].mean + jStats.channels[1].mean + jStats.channels[2].mean) / 3;

  return {
    file: path.basename(filePath),
    width: meta.width,
    height: meta.height,
    format: meta.format,
    hasAlpha,
    meanRgb: Number(meanRgb.toFixed(2)),
    meanAlpha: Number(meanAlpha.toFixed(2)),
    stdevRgb: Number(
      (
        (ch[0].stdev + ch[1].stdev + ch[2].stdev) /
        3
      ).toFixed(2)
    ),
    afterPipelineMeanRgb: Number(jMean.toFixed(2)),
    afterPipelineStdev: Number(
      (
        (jStats.channels[0].stdev + jStats.channels[1].stdev + jStats.channels[2].stdev) /
        3
      ).toFixed(2)
    ),
    outWidth: processed.width,
    outHeight: processed.height,
  };
}

async function main() {
  const base = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-32690');
  for (const f of ['cover_main.png', 'detail_mount_interface.png']) {
    const p = path.join(base, f);
    if (!fs.existsSync(p)) {
      console.log(JSON.stringify({ file: f, error: 'missing' }));
      continue;
    }
    console.log(JSON.stringify(await audit(p), null, 0));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
