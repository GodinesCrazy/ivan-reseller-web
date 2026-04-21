/**
 * p49 — Procesar TODAS las imágenes con AI bg removal + actualizar listing
 *
 * Problemas a resolver:
 * 1. Imagen de portada incorrecta — usar la de mayor visibilidad del producto
 * 2. Distorsión — garantizar fit: 'inside' (aspecto preservado, SIN distorsión)
 * 3. Solo 2 imágenes — procesar las 4 con ONNX y publicar todas
 *
 * Pipeline por imagen:
 *   fetch → sharp→PNG → ONNX bg removal → trim alpha → compose on 1200×1200 white (fit: inside)
 *
 * Selección de portada:
 *   - La imagen con MENOR whitePct = producto más visible = mejor portada
 */
import '../src/config/env';
import path from 'path';
import fsp from 'fs/promises';
import axios from 'axios';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import MarketplaceService from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';

const PRODUCT_ID = 32722;
const LISTING_ID = 'MLC3838127822'; // listing activo actual
const USER_ID = 1;
const CANVAS_PX = 1200;
const FILL_RATIO = 0.80;

const OUT_DIR = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722/gallery');
const prisma = new PrismaClient();

function parseImageUrls(raw: any): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed.filter((u: any): u is string => typeof u === 'string' && u.startsWith('http'));
  } catch { /* ignore */ }
  return [];
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 20 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
  });
  return Buffer.from(resp.data);
}

async function removeBackground(inputBuffer: Buffer): Promise<Buffer | null> {
  try {
    const { removeBackground: bgRemove } = await import('@imgly/background-removal-node');
    const pngBuf = await sharp(inputBuffer).png().toBuffer();
    const blob = new Blob([new Uint8Array(pngBuf)], { type: 'image/png' });
    const resultBlob = await bgRemove(blob, { model: 'small', output: { format: 'image/png', quality: 1 } });
    return Buffer.from(await resultBlob.arrayBuffer());
  } catch (err: any) {
    console.warn(`  [BG] removeBackground failed: ${err?.message}`);
    return null;
  }
}

async function trimAlpha(pngBuffer: Buffer): Promise<Buffer> {
  try {
    const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height, ch = info.channels as number;
    if (ch < 4) return pngBuffer;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * ch + 3]! > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX >= maxX || minY >= maxY) return pngBuffer;
    return sharp(pngBuffer)
      .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
      .png().toBuffer();
  } catch { return pngBuffer; }
}

/**
 * Place product PNG on a 1200×1200 pure white canvas.
 * Uses fit:'inside' → preserves aspect ratio, NO distortion.
 */
async function composeOnWhite(croppedPng: Buffer): Promise<Buffer> {
  const maxSide = Math.floor(CANVAS_PX * FILL_RATIO); // 960

  // Resize to fit inside 960×960, preserving aspect ratio (no distortion)
  const resized = await sharp(croppedPng)
    .resize(maxSide, maxSide, {
      fit: 'inside',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return sharp({
    create: { width: CANVAS_PX, height: CANVAS_PX, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function whitePct(jpegBuf: Buffer): Promise<number> {
  const { data, info } = await sharp(jpegBuf)
    .resize(200, 200, { fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  const ch = info.channels as number;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i]! > 240 && data[i + 1]! > 240 && data[i + 2]! > 240) white++;
  }
  return white / (info.width * info.height);
}

interface ProcessedImage {
  url: string;
  idx: number;
  localPath: string;
  wpct: number;
}

async function main() {
  console.log(`\n[P49] === Procesar todas las imágenes con AI bg removal + actualizar listing ===\n`);

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, images: true },
  });
  if (!product) throw new Error('Product not found');

  const imageUrls = parseImageUrls(product.images);
  console.log(`[P49] ${imageUrls.length} imágenes fuente de AliExpress:`);
  imageUrls.forEach((u, i) => console.log(`  [${i}] ${u.substring(0, 80)}`));

  await fsp.mkdir(OUT_DIR, { recursive: true });

  const processed: ProcessedImage[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]!;
    console.log(`\n[P49] Procesando imagen [${i}]...`);
    try {
      const raw = await fetchBuffer(url);
      console.log(`  fetch: ${raw.length} bytes`);

      const pngAlpha = await removeBackground(raw);
      if (!pngAlpha) { console.warn(`  SKIP: bg removal falló`); continue; }
      console.log(`  bg removed: ${pngAlpha.length} bytes PNG RGBA`);

      const cropped = await trimAlpha(pngAlpha);
      const croppedMeta = await sharp(cropped).metadata();
      console.log(`  trimmed to product: ${croppedMeta.width}×${croppedMeta.height}`);

      const jpeg = await composeOnWhite(cropped);
      const wp = await whitePct(jpeg);
      console.log(`  composed: 1200×1200 JPEG | whitePct=${(wp * 100).toFixed(1)}% | bytes=${jpeg.length}`);

      if (wp > 0.85) {
        console.warn(`  SKIP: whitePct=${(wp*100).toFixed(1)}% ≥85% — no es foto de producto (banner promo, overlay, etc.)`);
        continue;
      }

      const filename = `img_${i}_processed.jpg`;
      const localPath = path.join(OUT_DIR, filename);
      await fsp.writeFile(localPath, jpeg);
      processed.push({ url, idx: i, localPath, wpct: wp });
      console.log(`  ✅ guardado: ${filename}`);
    } catch (err: any) {
      console.warn(`  ERROR: ${err?.message}`);
    }
  }

  if (processed.length === 0) throw new Error('Ninguna imagen procesada exitosamente');

  // Ordenar: menor whitePct primero (más producto visible → mejor portada)
  processed.sort((a, b) => a.wpct - b.wpct);

  console.log(`\n[P49] ${processed.length} imágenes procesadas (ordenadas por visibilidad del producto):`);
  processed.forEach((p, i) => console.log(`  [${i}] idx=${p.idx} whitePct=${(p.wpct * 100).toFixed(1)}% → portada=${i === 0 ? '✅ COVER' : 'gallery'} | ${path.basename(p.localPath)}`));

  // También incluir el cover_main.jpg del pack (AI bg removal de la portada del pack)
  // Usar las imágenes procesadas ordenadas: la mejor (menor whitePct) como portada
  const allLocalPaths = processed.map(p => p.localPath);

  // ── Actualizar listing ───────────────────────────────────────────────────
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(USER_ID, 'mercadolibre', 'production');
  if (!creds?.isActive) throw new Error('ML creds not found');

  const mlSvc = new MercadoLibreService({
    ...creds.credentials,
    siteId: (creds.credentials as any).siteId || 'MLC',
  } as any);
  try {
    const r = await mlSvc.refreshAccessToken();
    (mlSvc as any).credentials.accessToken = r.accessToken;
    console.log('\n[P49] token refreshed');
  } catch(e: any) { console.warn('[P49] token refresh failed:', e?.message); }

  console.log(`\n[P49] Reemplazando imágenes en ${LISTING_ID} con ${allLocalPaths.length} imágenes limpias...`);
  const result = await mlSvc.replaceListingPictures(LISTING_ID, allLocalPaths);
  console.log(`[P49] replace_pictures: status=${result.status} | pics=${result.pictures?.length}`);
  result.pictures?.forEach((p: any, i: number) => console.log(`  [${i}] ${p.id} | ${p.max_size}`));

  // Verificar
  const token = (mlSvc as any).credentials.accessToken;
  const finalResp = await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const d = finalResp.data;
  console.log(`\n[P49] Status final: ${d.status} | sub_status=${JSON.stringify(d.sub_status)} | pics=${d.pictures?.length}`);

  if (d.status === 'active') {
    console.log(`\n[P49] ✅ LISTO — ${LISTING_ID} ACTIVO con ${d.pictures?.length} imágenes AI bg removal`);
    console.log(`  Portada: imagen original idx=${processed[0]!.idx} | whitePct=${(processed[0]!.wpct * 100).toFixed(1)}%`);
    console.log(`  URL: ${d.permalink}`);
  } else {
    console.log(`[P49] ⚠️  estado=${d.status} — revisar seller center`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('[P49] FATAL:', e?.response?.data || e?.message || e);
  prisma.$disconnect();
  process.exit(1);
});
