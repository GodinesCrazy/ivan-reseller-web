/**
 * p51 — Publicar listing limpio con pipeline V3 (sin imagen HOT SALE)
 *
 * Pipeline V3: gate whitePct <85% descarta banners/promos/overlays.
 * Para este producto: img_0 (HOT SALE fire banner) fue correctamente descartada.
 * Se publican 3 imágenes reales: img_2 (portada), img_3, img_1.
 */
import '../src/config/env';
import axios from 'axios';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import MarketplaceService from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';

const PRODUCT_ID = 32722;
const USER_ID = 1;
const GALLERY_DIR = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722/gallery');
const prisma = new PrismaClient();

// Imágenes en orden portada-primero (menor whitePct = más producto visible)
const CLEAN_IMAGES = [
  path.join(GALLERY_DIR, 'img_2_processed.jpg'), // portada: 66.2% white, 3 variantes stand
  path.join(GALLERY_DIR, 'img_3_processed.jpg'), // galería: 70.0% white, lifestyle con mano
  path.join(GALLERY_DIR, 'img_1_processed.jpg'), // galería: 72.5% white, 3 variantes
];

async function main() {
  console.log(`\n[P51] === Publicar listing limpio — pipeline V3 (sin HOT SALE) ===\n`);

  // Marcar todos los listings anteriores como superseded
  const old = await prisma.marketplaceListing.findMany({
    where: { productId: PRODUCT_ID, marketplace: 'mercadolibre', NOT: { status: 'superseded' } },
  });
  if (old.length > 0) {
    await prisma.marketplaceListing.updateMany({
      where: { id: { in: old.map(r => r.id) } },
      data: { status: 'superseded' },
    });
    console.log(`[P51] ${old.length} listings anteriores marcados como superseded`);
    old.forEach(r => console.log(`  ${r.listingId} → superseded`));
  }

  // Credenciales
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(USER_ID, 'mercadolibre', 'production');
  if (!creds?.isActive) throw new Error('ML credentials not found');
  const mlSvc = new MercadoLibreService({
    ...creds.credentials, siteId: (creds.credentials as any).siteId || 'MLC',
  } as any);
  try {
    const r = await mlSvc.refreshAccessToken();
    (mlSvc as any).credentials.accessToken = r.accessToken;
    console.log('[P51] token refreshed');
  } catch(e: any) { console.warn('[P51] token refresh failed:', e?.message); }
  const token = (mlSvc as any).credentials.accessToken as string;

  // Datos del producto
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { title: true, description: true, productData: true, aliexpressPrice: true },
  });
  if (!product) throw new Error('Product not found');
  const pd = typeof product.productData === 'string' ? JSON.parse(product.productData || '{}') : product.productData || {};
  const categoryId: string = pd?.categoryId || pd?.preventivePublish?.categoryId || 'MLC3530';
  const priceCLP: number = pd?.preventivePublish?.listingSalePriceUsd || 11305;

  console.log(`[P51] Imágenes (pipeline V3, HOT SALE ya descartada):`);
  CLEAN_IMAGES.forEach((p, i) => console.log(`  [${i}] ${path.basename(p)}${i === 0 ? ' ← PORTADA' : ''}`));
  console.log(`[P51] precio: ${priceCLP} CLP | categoría: ${categoryId}`);

  // Crear listing nuevo
  console.log(`\n[P51] Creando nuevo listing ML...`);
  const result = await mlSvc.createListing({
    title: product.title || 'Soporte Escritorio Teléfono Gatito Decorativo Minimalista',
    description: product.description || 'Soporte decorativo con diseño de gatito. Elegante y funcional.',
    categoryId,
    price: priceCLP,
    quantity: 10,
    condition: 'new',
    images: CLEAN_IMAGES,
    shipping: { mode: 'me2', freeShipping: false, handlingTime: 25 },
    attributes: [
      { id: 'BRAND', value: 'Genérico' },
      { id: 'MODEL', value: 'Soporte Gatito' },
    ],
  });

  console.log(`\n[P51] createListing: success=${result.success} | itemId=${result.itemId} | status=${result.status}`);
  if (!result.success || !result.itemId) throw new Error(`createListing falló: ${result.error}`);

  const newId = result.itemId;

  // Verificar
  await new Promise(r => setTimeout(r, 2000));
  const live = (await axios.get(`https://api.mercadolibre.com/items/${newId}`, {
    headers: { Authorization: 'Bearer ' + token },
  })).data;

  console.log(`\n[P51] Estado en vivo:`);
  console.log(JSON.stringify({ status: live.status, sub_status: live.sub_status, pics: live.pictures?.length, permalink: live.permalink }, null, 2));

  // Guardar en DB
  await prisma.marketplaceListing.create({
    data: { productId: PRODUCT_ID, userId: USER_ID, marketplace: 'mercadolibre', listingId: newId, status: live.status, publishedAt: new Date() },
  });
  await prisma.product.update({ where: { id: PRODUCT_ID }, data: { isPublished: true } });

  if (live.status === 'active') {
    console.log(`\n[P51] ✅ ACTIVO — ${newId}`);
    console.log(`  ${live.permalink}`);
    console.log(`  ${live.pictures?.length} imágenes | sin HOT SALE banner`);
  } else {
    console.log(`\n[P51] ⚠️  estado=${live.status}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('[P51] FATAL:', e?.response?.data || e?.message || e); prisma.$disconnect(); process.exit(1); });
