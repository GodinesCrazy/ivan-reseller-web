/**
 * p46b — isolated test of AI bg removal on one image
 * Just tests the ONNX pipeline, no listing upload.
 */
import '../src/config/env';
import path from 'path';
import fsp from 'fs/promises';
import { generateWhiteBgPortada } from '../src/services/ml-portada-bg-removal.service';

const IMAGE_URLS = [
  'https://ae-pic-a1.aliexpress-media.com/kf/S0b0e7a4e560347d9bdf1eeced8ac2aa65.jpg',
  'https://ae-pic-a1.aliexpress-media.com/kf/Sa7d193ea3b3e40c6bdbdd320d5fdb3b41.jpg',
];

const OUT_DIR = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722');
const OUT_FILE = path.join(OUT_DIR, 'cover_main_ai_test.jpg');

async function main() {
  console.log('[P46B] Testing AI bg removal...\n');
  console.log('[P46B] Note: first run downloads ONNX models (~80MB), may take 1-2 min...\n');

  const result = await generateWhiteBgPortada(IMAGE_URLS, { productId: 32722, logLabel: 'p46b-test' });

  if (!result.success || !result.jpegBuffer) {
    console.error('[P46B] ❌ FAILED:', result.error);
    process.exit(1);
  }

  await fsp.mkdir(OUT_DIR, { recursive: true });
  await fsp.writeFile(OUT_FILE, result.jpegBuffer);

  console.log(`\n[P46B] ✅ SUCCESS`);
  console.log(`  source: ${result.source.substring(0, 80)}`);
  console.log(`  whitePct: ${(result.whitePct! * 100).toFixed(1)}%`);
  console.log(`  bytes: ${result.jpegBuffer.length}`);
  console.log(`  saved: ${OUT_FILE}`);
}

main().catch(e => { console.error('[P46B] FATAL:', e?.message || e); process.exit(1); });
