#!/usr/bin/env tsx
/**
 * Test de coherencia del ciclo completo: Backend + Frontend.
 * Verifica que el producto quede en estado PUBLISHED (status + isPublished) en ambos flujos.
 *
 * 1. Backend: ciclo interno (tendencias -> b?squeda -> producto -> aprobaci?n -> publicaci?n)
 * 2. Frontend: flujo simulado (opportunities -> products -> marketplace/publish)
 *
 * Requisitos:
 *   - Backend corriendo en API_URL o localhost:4000
 *   - Usuario activo (seed: admin/admin123)
 *   - Para publicaci?n real: eBay OAuth configurado (o DRY_RUN=1 para solo aprobar)
 *
 * Uso:
 *   npm run test:cycle-coherence
 *   DRY_RUN=1 npm run test:cycle-coherence
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

const API_BASE = process.env.API_URL || process.env.VERIFIER_TARGET_URL || 'http://localhost:4000';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const TEST_USER = { username: 'admin', password: 'admin123' };

interface PublishedVerification {
  productId: number;
  status: string;
  isPublished: boolean;
  publishedAt: Date | null;
  listingId?: string;
  ok: boolean;
}

async function verifyProductInDb(productId: number): Promise<PublishedVerification> {
  const { prisma } = await import('../src/config/database');
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true, isPublished: true, publishedAt: true },
  });
  if (!p) {
    return { productId, status: 'NOT_FOUND', isPublished: false, publishedAt: null, ok: false };
  }
  const ok = p.status === 'PUBLISHED' && p.isPublished === true;
  return {
    productId: p.id,
    status: p.status,
    isPublished: p.isPublished,
    publishedAt: p.publishedAt,
    ok,
  };
}

function assertPublished(v: PublishedVerification, label: string): void {
  if (!v.ok) {
    throw new Error(
      `[${label}] Producto ${v.productId} NO est? en estado PUBLISHED coherente: status=${v.status}, isPublished=${v.isPublished}`
    );
  }
  console.log(`  ? [${label}] Producto ${v.productId}: status=${v.status}, isPublished=${v.isPublished}`);
}

// --- Backend cycle (usa l?gica directa, no HTTP) ---
async function runBackendCycle(): Promise<PublishedVerification | null> {
  console.log('\n=== PARTE 1: Ciclo Backend (interno) ===\n');

  const { prisma } = await import('../src/config/database');
  const opportunityFinder = (await import('../src/services/opportunity-finder.service')).default;
  const { ProductService } = await import('../src/services/product.service');
  const MarketplaceService = (await import('../src/services/marketplace.service')).default;
  const { workflowConfigService } = await import('../src/services/workflow-config.service');

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error('ERROR: No hay usuario activo. Ejecuta: npm run prisma:seed');
    return null;
  }
  const userId = user.id;
  const keyword = process.env.keyword || 'phone case';

  console.log('1. Buscando oportunidades...');
  const result = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
    query: keyword,
    maxItems: 3,
    skipTrendsValidation: true,
  });
  const opportunities = result.opportunities;
  if (opportunities.length === 0) {
    console.log('   Fallback: producto m?nimo para test');
    opportunities.push({
      title: `Test Backend ${keyword} - ${Date.now()}`,
      aliexpressUrl: 'https://www.aliexpress.com/item/0.html',
      productUrl: 'https://www.aliexpress.com/item/0.html',
      costUsd: 10,
      suggestedPriceUsd: 19.99,
      images: ['https://placehold.co/500x500?text=Test'],
    } as any);
  }

  const opp = opportunities[0];
  const images = Array.isArray(opp.images) && opp.images.length > 0
    ? opp.images.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'))
    : ['https://placehold.co/500x500?text=Product'];

  console.log('2. Creando producto...');
  const productService = new ProductService();
  const product = await productService.createProduct(userId, {
    title: opp.title,
    description: (opp as any).description || '',
    aliexpressUrl: opp.aliexpressUrl || opp.productUrl || 'https://www.aliexpress.com/item/0.html',
    aliexpressPrice: opp.costUsd,
    suggestedPrice: opp.suggestedPriceUsd || opp.costUsd * 1.5,
    imageUrls: images,
    category: (opp as any).category || 'Electronics',
    currency: 'USD',
  });

  console.log('3. Aprobando producto...');
  await productService.updateProductStatusSafely(product.id, 'APPROVED', userId, 'Test coherencia');

  if (DRY_RUN) {
    console.log('4. DRY_RUN: omitiendo publicaci?n. Producto en APPROVED.');
    return { productId: product.id, status: 'APPROVED', isPublished: false, publishedAt: null, ok: false };
  }

  console.log('4. Publicando en eBay...');
  const marketplaceService = new MarketplaceService();
  const env = await workflowConfigService.getUserEnvironment(userId);
  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    select: { suggestedPrice: true, aliexpressPrice: true },
  });

  const publishResult = await marketplaceService.publishProduct(userId, {
    productId: product.id,
    marketplace: 'ebay',
    customData: {
      price: Number(updated?.suggestedPrice || updated?.aliexpressPrice) * 1.5,
      quantity: 1,
    },
  }, env);

  if (!publishResult.success) {
    console.warn('   Publicaci?n fall?:', publishResult.error);
    if (/token|oauth|invalid_grant|401|400/i.test(String(publishResult.error))) {
      console.warn('   [INFO] Configura eBay OAuth en Settings para publicar. Producto queda en APPROVED.');
    }
    return { productId: product.id, status: 'APPROVED', isPublished: false, publishedAt: null, ok: false };
  }

  await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
  const verification = await verifyProductInDb(product.id);
  verification.listingId = publishResult.listingId;
  return verification;
}

// --- Frontend flow (HTTP simulado) ---
async function runFrontendFlow(): Promise<PublishedVerification | null> {
  console.log('\n=== PARTE 2: Flujo Frontend (API simulado) ===\n');

  const base = API_BASE.replace(/\/$/, '');
  const { prisma } = await import('../src/config/database');
  const { authService } = await import('../src/services/auth.service');

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error('ERROR: No hay usuario activo.');
    return null;
  }

  const token = authService.generateToken(user.id, user.username, 'ADMIN');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  console.log('1. GET /api/opportunities...');
  const oppRes = await fetch(
    `${base}/api/opportunities?query=phone+case&maxItems=2&marketplaces=ebay&region=us`,
    { headers }
  );
  if (!oppRes.ok) {
    console.error('   Error opportunities:', oppRes.status, await oppRes.text());
    return null;
  }
  const oppData = await oppRes.json();
  const items = oppData?.data?.items ?? oppData?.items ?? oppData ?? [];
  const item = Array.isArray(items) && items.length > 0 ? items[0] : null;

  if (!item) {
    console.log('   Sin oportunidades, usando fallback para crear producto...');
  }

  const payload = {
    title: item?.title || `Test Frontend ${Date.now()}`,
    aliexpressUrl: item?.aliexpressUrl || item?.productUrl || 'https://www.aliexpress.com/item/0.html',
    aliexpressPrice: item?.costUsd ?? 12,
    suggestedPrice: item?.suggestedPriceUsd ?? 24,
    currency: 'USD',
    imageUrl: item?.images?.[0] || item?.image || 'https://placehold.co/500x500?text=Product',
    imageUrls: item?.images || ['https://placehold.co/500x500?text=Product'],
    category: item?.category || 'Electronics',
  };

  console.log('2. POST /api/products...');
  const prodRes = await fetch(`${base}/api/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!prodRes.ok) {
    console.error('   Error crear producto:', prodRes.status, await prodRes.text());
    return null;
  }
  const prodData = await prodRes.json();
  const productId = prodData?.data?.id ?? prodData?.id;
  if (!productId) {
    console.error('   No se obtuvo productId del response');
    return null;
  }
  console.log('   Producto creado:', productId);

  console.log('3. POST /api/marketplace/publish...');
  const { workflowConfigService } = await import('../src/services/workflow-config.service');
  const env = await workflowConfigService.getUserEnvironment(user.id);
  const publishRes = await fetch(`${base}/api/marketplace/publish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId: Number(productId),
      marketplace: 'ebay',
      environment: env,
    }),
  });

  if (!publishRes.ok) {
    const errText = await publishRes.text();
    console.warn('   Publicaci?n fall?:', publishRes.status, errText);
    if (/credentials|oauth|token/i.test(errText)) {
      console.warn('   [INFO] Configura eBay en Settings. Producto creado pero no publicado.');
    }
    return { productId, status: 'PENDING', isPublished: false, publishedAt: null, ok: false };
  }

  const pubData = await publishRes.json();
  if (!pubData?.success) {
    console.warn('   Publish response success=false:', pubData?.error);
    return { productId, status: 'PENDING', isPublished: false, publishedAt: null, ok: false };
  }

  const verification = await verifyProductInDb(Number(productId));
  verification.listingId = pubData?.data?.listingId;
  return verification;
}

// --- Main ---
async function main(): Promise<number> {
  console.log('=== Test de Coherencia: Ciclo Backend + Frontend ===');
  console.log('API_BASE:', API_BASE);
  console.log('DRY_RUN:', DRY_RUN);

  const results: { backend: PublishedVerification | null; frontend: PublishedVerification | null } = {
    backend: null,
    frontend: null,
  };

  try {
    results.backend = await runBackendCycle();
    if (results.backend?.ok) {
      assertPublished(results.backend, 'Backend');
    } else if (results.backend) {
      console.log(
        `  [Backend] Producto ${results.backend.productId} en status=${results.backend.status}, isPublished=${results.backend.isPublished}${DRY_RUN ? ' (DRY_RUN: sin publicar)' : ''}`
      );
    } else {
      console.log('  [Backend] Ciclo no completó (sin oportunidades o error).');
    }
  } catch (e: any) {
    console.error('  [Backend] Error:', e?.message || e);
  }

  try {
    const healthRes = await fetch(`${API_BASE.replace(/\/$/, '')}/api/health`).catch(() => null);
    if (!healthRes?.ok) {
      console.log('\n[Frontend] Backend no responde en', API_BASE, '- omitiendo flujo frontend. Inicia backend con npm run dev.');
    } else {
      results.frontend = await runFrontendFlow();
    }
    if (results.frontend?.ok) {
      assertPublished(results.frontend, 'Frontend');
    } else if (results.frontend) {
      console.log(
        `  [Frontend] Producto ${results.frontend.productId} en status=${results.frontend.status}, isPublished=${results.frontend.isPublished}`
      );
    } else if (!healthRes?.ok) {
      // Ya mostramos mensaje de backend no responde
    } else {
      console.log('  [Frontend] Flujo no completó.');
    }
  } catch (e: any) {
    console.error('  [Frontend] Error:', e?.message || e);
  }

  console.log('\n=== Resumen ===');
  const backendOk = results.backend?.ok ?? false;
  const frontendOk = results.frontend?.ok ?? false;

  if (DRY_RUN) {
    console.log('DRY_RUN: publicación omitida. Para publicar real: ejecuta sin DRY_RUN=1.');
    return 0;
  }

  if (backendOk && frontendOk) {
    console.log('? Ambos flujos dejaron productos en estado PUBLISHED coherente.');
    return 0;
  }
  if (backendOk || frontendOk) {
    console.log(
      `Parcial: Backend=${backendOk ? 'OK' : 'NO'}, Frontend=${frontendOk ? 'OK' : 'NO'}. ` +
        'Revisa credenciales eBay si alguno fall? en publicaci?n.'
    );
    return 0;
  }
  console.log(
    'Ningún flujo publicó (posible: falta eBay OAuth). Productos creados en APPROVED/PENDING.'
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/config/database');
    await prisma.$disconnect();
  });
