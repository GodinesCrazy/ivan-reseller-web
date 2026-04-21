import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
const backendRoot = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(backendRoot, '.env'))) dotenv.config({ path: path.join(backendRoot, '.env') });
if (fs.existsSync(path.join(backendRoot, '.env.local'))) dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });
import https from 'https';
import http from 'http';

const IMAGES = [
  { key: 'img1', url: 'https://ae-pic-a1.aliexpress-media.com/kf/S0b0e7a4e560347d9bdf1eeced8ac2aa65.jpg' },
  { key: 'img2', url: 'https://ae-pic-a1.aliexpress-media.com/kf/Sa7d193ea3b3e40c6bdbdd320d5fdb3b41.jpg' },
  { key: 'img3', url: 'https://ae-pic-a1.aliexpress-media.com/kf/Scb11aee1ebcb4a439660a5764731a5afq.jpg' },
  { key: 'img4', url: 'https://ae-pic-a1.aliexpress-media.com/kf/S41adb5536ebe4fae965af685e51271c3g.jpg' },
];

const OUT_DIR = path.resolve(backendRoot, '../artifacts/ml-image-packs/product-32722/sources');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location!, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function main() {
  for (const img of IMAGES) {
    const dest = path.join(OUT_DIR, `${img.key}.jpg`);
    try {
      await download(img.url, dest);
      const stat = fs.statSync(dest);
      console.log(`[${img.key}] downloaded: ${stat.size} bytes → ${dest}`);
    } catch (e: any) {
      console.error(`[${img.key}] FAILED: ${e.message}`);
    }
  }
}

main().catch(console.error);
