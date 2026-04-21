/**
 * p50b — Download uploaded ML images and run analysis:
 * - actual dimensions
 * - whitePct
 * - edge gradient map (text/logo detection proxy)
 * - horizontal stroke density (text rows)
 * - color variance (product visibility)
 * - save locally for visual inspection
 */
import '../src/config/env';
import axios from 'axios';
import sharp from 'sharp';
import path from 'path';
import fsp from 'fs/promises';

const ML_IMAGE_URLS = [
  'http://http2.mlstatic.com/D_728031-MLC109195877498_042026-O.jpg',  // portada (img2)
  'http://http2.mlstatic.com/D_795904-MLC110040264341_042026-O.jpg',  // img3
  'http://http2.mlstatic.com/D_942000-MLC110040264365_042026-O.jpg',  // img1
  'http://http2.mlstatic.com/D_604051-MLC109195906900_042026-O.jpg',  // img0
];

// Also analyze the local source files
const LOCAL_GALLERY = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722/gallery');
const OUT_DIR = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722/analysis');

async function analyzeBuffer(buf: Buffer, label: string) {
  const meta = await sharp(buf).metadata();
  console.log(`\n--- ${label} ---`);
  console.log(`  Dimensions: ${meta.width}×${meta.height} | format: ${meta.format} | size: ${buf.length} bytes`);

  // Resize to 300×300 for analysis
  const { data, info } = await sharp(buf)
    .resize(300, 300, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height, ch = info.channels as number;
  const total = w * h;

  // White pixels
  let white = 0, nearWhite = 0;
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i]!, g = data[i+1]!, b = data[i+2]!;
    rSum += r; gSum += g; bSum += b;
    if (r > 252 && g > 252 && b > 252) white++;
    if (r > 240 && g > 240 && b > 240) nearWhite++;
  }
  const whitePct = white / total;
  const nearWhitePct = nearWhite / total;
  const avgR = rSum / total, avgG = gSum / total, avgB = bSum / total;
  console.log(`  whitePct(>252): ${(whitePct*100).toFixed(1)}%  nearWhitePct(>240): ${(nearWhitePct*100).toFixed(1)}%`);
  console.log(`  avgColor: rgb(${avgR.toFixed(0)},${avgG.toFixed(0)},${avgB.toFixed(0)})`);

  // Edge density (Sobel approx) in top 30% rows — text/logo indicator
  const topRows = Math.floor(h * 0.30);
  let edgeCount = 0;
  for (let y = 1; y < topRows - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const grayAt = (yy: number, xx: number) => {
        const i = (yy * w + xx) * ch;
        return (data[i]! * 0.299 + data[i+1]! * 0.587 + data[i+2]! * 0.114);
      };
      const gx = -grayAt(y-1,x-1) + grayAt(y-1,x+1) - 2*grayAt(y,x-1) + 2*grayAt(y,x+1) - grayAt(y+1,x-1) + grayAt(y+1,x+1);
      const gy = -grayAt(y-1,x-1) - 2*grayAt(y-1,x) - grayAt(y-1,x+1) + grayAt(y+1,x-1) + 2*grayAt(y+1,x) + grayAt(y+1,x+1);
      if (Math.sqrt(gx*gx + gy*gy) > 30) edgeCount++;
    }
  }
  const topEdgeDensity = edgeCount / (topRows * w);
  console.log(`  topEdgeDensity: ${(topEdgeDensity*100).toFixed(2)}% ${topEdgeDensity > 0.05 ? '⚠️ POSSIBLE TEXT/DETAIL IN TOP 30%' : '✅ clean'}`);

  // Check if product has any non-white non-transparent region
  let productPixels = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i]!, g = data[i+1]!, b = data[i+2]!;
    if (!(r > 230 && g > 230 && b > 230)) productPixels++;
  }
  console.log(`  productPixels: ${productPixels} / ${total} = ${(productPixels/total*100).toFixed(1)}%`);

  // Check for colored pixels (non-gray) that might indicate text/logo overlays
  let coloredNonProduct = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i]!, g = data[i+1]!, b = data[i+2]!;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const chroma = Math.max(Math.abs(r - luma), Math.abs(g - luma), Math.abs(b - luma));
    // High saturation + dark = logo/text overlay
    if (chroma > 40 && luma < 200) coloredNonProduct++;
  }
  console.log(`  coloredOverlayPixels: ${coloredNonProduct} = ${(coloredNonProduct/total*100).toFixed(2)}% ${coloredNonProduct/total > 0.02 ? '⚠️ colored overlay detected' : '✅'}`);

  return { whitePct, nearWhitePct, topEdgeDensity, productCoverage: productPixels/total };
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });
  console.log('[P50B] Analyzing uploaded ML images...\n');

  // Download and analyze ML CDN images
  console.log('=== ML CDN IMAGES (what ML actually has) ===');
  for (let i = 0; i < ML_IMAGE_URLS.length; i++) {
    const url = ML_IMAGE_URLS[i]!;
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      const buf = Buffer.from(resp.data);
      // Save locally for visual inspection
      const outPath = path.join(OUT_DIR, `ml_cdn_img${i}.jpg`);
      await fsp.writeFile(outPath, buf);
      await analyzeBuffer(buf, `ML CDN img${i}: ${url.split('/').pop()}`);
    } catch (e: any) {
      console.log(`  img${i}: FETCH FAILED — ${e?.message}`);
    }
  }

  // Analyze local processed files
  console.log('\n=== LOCAL PROCESSED FILES (what we generated) ===');
  const localFiles = ['img_0_processed.jpg','img_1_processed.jpg','img_2_processed.jpg','img_3_processed.jpg'];
  for (const f of localFiles) {
    const p = path.join(LOCAL_GALLERY, f);
    try {
      const buf = await fsp.readFile(p);
      await analyzeBuffer(buf, `LOCAL ${f}`);
    } catch { console.log(`  ${f}: not found`); }
  }

  // Analyze original AliExpress source images (download fresh)
  console.log('\n=== ORIGINAL ALIEXPRESS SOURCES (for comparison) ===');
  const sourceUrls = [
    'https://ae-pic-a1.aliexpress-media.com/kf/S0b0e7a4e560347d9bdf1eeced8ac2aa65.jpg',
    'https://ae-pic-a1.aliexpress-media.com/kf/Sa7d193ea3b3e40c6bdbdd320d5fdb3b41.jpg',
    'https://ae-pic-a1.aliexpress-media.com/kf/Scb11aee1ebcb4a439660a5764731a5afq.jpg',
    'https://ae-pic-a1.aliexpress-media.com/kf/S41adb5536ebe4fae965af685e51271c3g.jpg',
  ];
  for (let i = 0; i < sourceUrls.length; i++) {
    try {
      const resp = await axios.get(sourceUrls[i]!, { responseType: 'arraybuffer', timeout: 15000 });
      const buf = Buffer.from(resp.data);
      const outPath = path.join(OUT_DIR, `source_img${i}.jpg`);
      await fsp.writeFile(outPath, buf);
      await analyzeBuffer(buf, `AliExpress source[${i}]`);
    } catch(e: any) { console.log(`  source[${i}]: ${e?.message}`); }
  }

  console.log(`\n[P50B] Images saved to: ${OUT_DIR}`);
}

main().catch(e => { console.error(e?.message); process.exit(1); });
