#!/usr/bin/env tsx
/**
 * P64: Re-export pack PNGs with contrast normalization for near-white generated assets.
 * Writes *_p64.png alongside originals; can promote to canonical names after review.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PACK = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-32690');

async function fixOne(name: string) {
  const src = path.join(PACK, name);
  const buf = fs.readFileSync(src);
  const outBuf = await sharp(buf, { failOnError: false })
    .flatten({ background: { r: 245, g: 245, b: 245 } })
    .normalize()
    .modulate({ saturation: 1.25, brightness: 0.98 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const outName = name.replace(/\.png$/i, '_p64.png');
  const outPath = path.join(PACK, outName);
  fs.writeFileSync(outPath, outBuf);
  const st = await sharp(outBuf).stats();
  const mean =
    (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  const sd =
    (st.channels[0].stdev + st.channels[1].stdev + st.channels[2].stdev) / 3;
  const meta = await sharp(outBuf).metadata();
  return { outName, mean: Number(mean.toFixed(2)), stdev: Number(sd.toFixed(2)), w: meta.width, h: meta.height };
}

async function main() {
  const r: unknown[] = [];
  for (const f of ['cover_main.png', 'detail_mount_interface.png']) {
    r.push(await fixOne(f));
  }
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
