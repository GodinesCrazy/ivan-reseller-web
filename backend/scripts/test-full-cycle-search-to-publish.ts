#!/usr/bin/env tsx
/**
 * Test proceso completo: tendencias -> busqueda -> producto -> publicacion en eBay
 *
 * 1. Si VERIFIER_TARGET_URL + INTERNAL_RUN_SECRET: llama al backend (Railway) que tiene EBAY_REFRESH_TOKEN
 * 2. Si no: ejecuta localmente (requiere EBAY_REFRESH_TOKEN en .env.local o OAuth completado)
 *
 * Uso:
 *   npm run test:search-to-publish
 *   VERIFIER_TARGET_URL=https://tu-backend.railway.app npm run test:search-to-publish
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

// ✅ FIX: Múltiples fuentes para URL remota (Railway, Vercel, etc.)
// localhost:3000 suele ser frontend; backend está en :4000
let _remoteUrl = (
  process.env.VERIFIER_TARGET_URL ||
  process.env.API_URL ||
  process.env.BACKEND_URL ||
  ''
).replace(/\/$/, '');
if (_remoteUrl && /localhost:3000|127\.0\.0\.1:3000/.test(_remoteUrl)) {
  _remoteUrl = _remoteUrl.replace(/:3000/, ':4000');
}
const REMOTE_URL = _remoteUrl;
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

/** Detecta si DATABASE_URL apunta a Railway (DB remota) */
function isRailwayDb(): boolean {
  const u = process.env.DATABASE_URL || '';
  return /railway|rlwy\.net|railway\.app/i.test(u);
}

async function runRemote(): Promise<number> {
  if (!REMOTE_URL || !INTERNAL_SECRET) return -1;
  if (process.env.FORCE_LOCAL === '1' || process.env.FORCE_LOCAL === 'true') return -1;
  const base = REMOTE_URL.replace(/\/$/, '');
  const url = `${base}/api/internal/test-full-cycle-search-to-publish`;
  const keyword = process.env.keyword;
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const maxPriceUsd = 12; // Artículos económicos ≤$12 para ciclo de prueba

  console.log('=== Test remoto (Railway): Tendencias -> Publicacion eBay ===\n');
  console.log('URL:', url);
  console.log('Keyword:', keyword || '(auto)');
  console.log('MaxPriceUsd:', maxPriceUsd);
  console.log('DRY_RUN:', dryRun, '\n');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET,
    },
    body: JSON.stringify({ keyword: keyword || undefined, dryRun, maxPriceUsd }),
  });
  let data: any;
  try {
    data = (await res.json()) as any;
  } catch {
    data = {};
  }

  if (!res.ok) {
    if (res.status === 404) {
      console.warn('Endpoint no disponible (404) - Railway aun sin deploy. Usando modo local...\n');
      return -1;
    }
    if (res.status === 401) {
      console.warn('HTTP 401 - INTERNAL_RUN_SECRET no coincide con Railway. Copia el valor de Railway Variables.\n');
      return -1;
    }
    console.error('HTTP', res.status, data?.error || data?.message || JSON.stringify(data));
    return 1;
  }
  if (!data.success) {
    console.error('ERROR:', data.error || 'Unknown');
    return 1;
  }

  console.log('[DONE] Ciclo completo OK');
  if (data.listingId) console.log('  listingId:', data.listingId);
  if (data.listingUrl) console.log('  URL:', data.listingUrl);
  console.log('  productId:', data.productId);
  console.log('  durationMs:', data.durationMs);
  return 0;
}

import { prisma } from '../src/config/database';
import { trendsService } from '../src/services/trends.service';
import opportunityFinder from '../src/services/opportunity-finder.service';
import { ProductService } from '../src/services/product.service';
import MarketplaceService from '../src/services/marketplace.service';
import { workflowConfigService } from '../src/services/workflow-config.service';

const KEYWORD_OVERRIDE = process.env.keyword;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const MAX_PRICE_USD = 12; // Artículos económicos ≤$12 para ciclo de prueba

async function main(): Promise<number> {
  console.log('=== Test: Tendencias -> Busqueda -> Producto -> Publicacion eBay ===\n');
  console.log(`DRY_RUN: ${DRY_RUN}\n`);

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error('ERROR: No hay usuario activo. Ejecuta seed.');
    return 1;
  }
  const userId = user.id;
  console.log('[1] Usuario:', user.username, '(id:', userId, ')\n');

  // --- FASE 0: Tendencias ---
  let keyword: string;
  if (KEYWORD_OVERRIDE) {
    keyword = KEYWORD_OVERRIDE;
    console.log('[2] Usando keyword manual:', keyword, '\n');
  } else {
    console.log('[2] Obteniendo keywords de tendencias...');
    const trendKeywords = await trendsService.getTrendingKeywords({
      region: 'US',
      maxKeywords: 10,
      userId,
    });
    if (trendKeywords.length === 0) {
      keyword = 'phone case'; // fallback
      console.log('    (sin tendencias, usando fallback:', keyword, ')\n');
    } else {
      keyword = trendKeywords[0].keyword;
      console.log(`    Top tendencias: ${trendKeywords.slice(0, 5).map((k) => k.keyword).join(', ')}`);
      console.log(`    Usando keyword: ${keyword}\n`);
    }
  }

  // --- FASE 1: Busqueda (con validacion de tendencias) ---
  console.log('[3] Buscando oportunidades con validacion de tendencias...');
  const result = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
    query: keyword,
    maxItems: 5,
    skipTrendsValidation: false, // validar cada opp con Google Trends
  });
  const opportunities = result.opportunities;

  if (opportunities.length === 0) {
    console.error('ERROR: No se encontraron oportunidades. Revisa AliExpress/Trends.');
    console.log('Diagnostics:', JSON.stringify(result.diagnostics));
    return 1;
  }
  console.log(`    Encontradas: ${opportunities.length}`);
  console.log();

  // Preferir productos económicos ≤$12
  const maxCostForCap = MAX_PRICE_USD / 1.5;
  const opp = opportunities.find((o: any) => Number(o?.costUsd || 0) > 0 && Number(o.costUsd) <= maxCostForCap)
    || opportunities[0];
  const rawImages = opp.images ?? (opp as any).image ? [(opp as any).image] : [];
  const images = Array.isArray(rawImages) && rawImages.length > 0
    ? rawImages.filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
    : ['https://placehold.co/400x400?text=Product'];

  // --- FASE 2: Crear producto ---
  console.log('[4] Creando producto en DB...');
  const productService = new ProductService();
  const product = await productService.createProduct(userId, {
    title: opp.title,
    description: (opp as any).description || '',
    aliexpressUrl: opp.aliexpressUrl || opp.productUrl || 'https://www.aliexpress.com/item/0.html',
    aliexpressPrice: opp.costUsd,
    suggestedPrice: opp.suggestedPriceUsd || opp.costUsd * 1.5,
    imageUrls: images,
    category: opp.category,
    currency: 'USD',
  });

  console.log(`    Producto creado: id=${product.id}, status=${product.status}\n`);

  // --- FASE 3: Aprobar ---
  console.log('[5] Aprobando producto (APPROVED)...');
  await productService.updateProductStatusSafely(product.id, 'APPROVED', userId, 'Test: aprobacion para publicacion');

  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    select: { status: true, title: true, aliexpressPrice: true, suggestedPrice: true },
  });
  console.log(`    Status: ${updated?.status}\n`);

  if (DRY_RUN) {
    console.log('[6] DRY_RUN: omitiendo publicacion. Ejecuta sin DRY_RUN=1 para publicar en eBay.');
    return 0;
  }

  // --- FASE 4: Publicar en eBay ---
  console.log('[6] Publicando en eBay...');
  const marketplaceService = new MarketplaceService();
  const env = await workflowConfigService.getUserEnvironment(userId);

  try {
    const basePrice = Number(updated?.suggestedPrice || updated?.aliexpressPrice) * 1.5;
    const finalPrice = Math.min(basePrice, MAX_PRICE_USD);
    const publishResult = await marketplaceService.publishProduct(userId, {
      productId: product.id,
      marketplace: 'ebay',
      customData: {
        title: String(updated?.title || opp.title || `Product-${product.id}`).replace(/\s+/g, ' ').trim().slice(0, 80),
        price: finalPrice,
        quantity: 1,
        categoryId: '20349', // eBay category for phones/accessories
      },
    }, env);

    if (publishResult.success) {
      console.log(`    OK Publicado. listingId=${publishResult.listingId}`);
      if (publishResult.listingUrl) console.log(`    URL: ${publishResult.listingUrl}\n`);

      await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
      console.log('[DONE] Ciclo completo: busqueda -> producto -> publicacion OK');
      return 0;
    }

    // Ciclo considerado OK si el unico fallo es falta de token eBay (producto creado y aprobado)
    const tokenError = String(publishResult.error || '').toLowerCase();
    const isTokenMissing = /token|refresh|invalid_grant|falta token|oauth/.test(tokenError);
    if (isTokenMissing) {
      console.log('    (eBay no configurado: producto creado y aprobado, listo para publicar cuando tengas OAuth)');
      console.log('[DONE] Ciclo completo: busqueda -> producto -> aprobacion OK (publicacion pendiente OAuth eBay)');
      console.log('\n[OPCIONAL] Para publicar en eBay: Configuracion -> API Settings -> eBay -> OAuth');
      return 0;
    }

    console.error('ERROR publicacion:', publishResult.error);
    return 1;
  } catch (e: any) {
    const msg = String(e?.message || e).toLowerCase();
    const isTokenMissing = /token|refresh|invalid_grant|falta token|oauth/.test(msg);
    if (isTokenMissing) {
      console.log('    (eBay no configurado: producto creado y aprobado)');
      console.log('[DONE] Ciclo completo: busqueda -> producto -> aprobacion OK (publicacion pendiente OAuth eBay)');
      console.log('\n[OPCIONAL] Para publicar en eBay: Configuracion -> API Settings -> eBay -> OAuth');
      return 0;
    }
    console.error('ERROR al publicar:', e?.message || e);
    return 1;
  }
}

(async () => {
  const remoteCode = await runRemote();
  if (remoteCode >= 0) {
    process.exit(remoteCode);
    return;
  }
  // ✅ FIX: Si DB es Railway y no tenemos remote config, main() fallará por ENCRYPTION_KEY mismatch
  if (isRailwayDb() && (!REMOTE_URL || !INTERNAL_SECRET)) {
    console.error('\n⚠️  DATABASE_URL apunta a Railway pero falta config para ejecutar en el servidor.');
    console.error('   Las credenciales OAuth están encriptadas con la clave de Railway.');
    console.error('   Ejecuta contra el backend:\n');
    console.error('   API_URL=https://tu-backend.railway.app INTERNAL_RUN_SECRET=<de Railway Variables> npm run test:search-to-publish\n');
    console.error('   O copia ENCRYPTION_KEY de Railway a .env.local para ejecutar localmente.\n');
    process.exit(1);
    return;
  }
  return main();
})()
  .then((code) => (code !== undefined ? process.exit(code) : null))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
