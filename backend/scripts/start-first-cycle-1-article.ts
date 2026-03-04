#!/usr/bin/env tsx
/**
 * Inicio del primer ciclo con 1 artculo econmico.
 * Aplica preset de prueba (maxActiveProducts=1, minProfitUsd=1, minSupplierPrice=0.5, minRoiPct=15)
 * y ejecuta: tendencias -> bsqueda -> 1 producto barato -> publicar eBay.
 *
 * Uso: npx tsx scripts/start-first-cycle-1-article.ts
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

const TEST_PRESET = {
  maxActiveProducts: 1,
  minProfitUsd: 1,
  minSupplierPrice: 0.5,
  minRoiPct: 15,
};

async function applyTestPreset(prisma: any): Promise<void> {
  const existing = await prisma.systemConfig.findUnique({
    where: { key: 'autopilot_config' },
  });

  const defaultBase = {
    enabled: false,
    cycleIntervalMinutes: 90,
    publicationMode: 'manual' as const,
    targetMarketplace: 'ebay',
    maxOpportunitiesPerCycle: 5,
    workingCapital: 500,
    minProfitUsd: 8,
    minRoiPct: 40,
    optimizationEnabled: false,
  };

  let merged = { ...defaultBase, ...TEST_PRESET };
  if (existing?.value) {
    try {
      const saved = JSON.parse(existing.value as string) as Record<string, unknown>;
      merged = { ...merged, ...saved, ...TEST_PRESET };
    } catch {
      merged = { ...merged, ...TEST_PRESET };
    }
  }

  await prisma.systemConfig.upsert({
    where: { key: 'autopilot_config' },
    create: { key: 'autopilot_config', value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (user) {
    await prisma.userWorkflowConfig.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        workingCapital: 500,
        minProfitUsd: TEST_PRESET.minProfitUsd,
        minRoiPct: TEST_PRESET.minRoiPct,
        workflowMode: 'automatic',
        stagePublish: 'automatic',
      },
      update: {
        minProfitUsd: TEST_PRESET.minProfitUsd,
        minRoiPct: TEST_PRESET.minRoiPct,
        workflowMode: 'automatic',
        stagePublish: 'automatic',
      },
    });
  }

  console.log('[PRESET] Aplicado: maxActiveProducts=%d, minProfitUsd=%d, minSupplierPrice=%s, minRoiPct=%d\n',
    TEST_PRESET.maxActiveProducts, TEST_PRESET.minProfitUsd, String(TEST_PRESET.minSupplierPrice), TEST_PRESET.minRoiPct);
}

async function main(): Promise<number> {
  const { prisma } = await import('../src/config/database');
  const { trendsService } = await import('../src/services/trends.service');
  const opportunityFinder = (await import('../src/services/opportunity-finder.service')).default;
  const { ProductService } = await import('../src/services/product.service');
  const MarketplaceService = (await import('../src/services/marketplace.service')).default;
  const { workflowConfigService } = await import('../src/services/workflow-config.service');

  console.log('=== Inicio primer ciclo: 1 artculo econmico ===\n');

  try {
    // 1. Aplicar preset de prueba
    await applyTestPreset(prisma);

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

    // 2. Obtener keyword (tendencias o fallback)
    const trendKeywords = await trendsService.getTrendingKeywords({
      region: 'US',
      maxKeywords: 10,
      userId,
    });
    const keyword = (trendKeywords.length > 0 ? trendKeywords[0].keyword : 'phone case').trim();
    console.log('[2] Keyword:', keyword, '\n');

    // 3. Buscar oportunidades (mx 12 USD para artculo econmico)
    const MAX_PRICE_USD = 12;
    const result = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });
    let opportunities = result.opportunities;

    if (opportunities.length === 0) {
      console.warn('No hay oportunidades, usando producto fallback para prueba...');
      const fallbackPrice = Math.min(11.99, MAX_PRICE_USD);
      const fallbackCost = Math.min(7.99, fallbackPrice / 1.5);
      opportunities = [{
        title: `Test Product ${keyword} - ${Date.now()}`,
        description: 'Test product for first cycle',
        aliexpressUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
        productUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
        costUsd: fallbackCost,
        suggestedPriceUsd: fallbackPrice,
        category: 'Electronics',
        images: ['https://placehold.co/500x500?text=Test+Product'],
      } as any];
    }

    const maxCostForCap = MAX_PRICE_USD / 1.5;
    const opp = opportunities.find((o: any) => Number(o?.costUsd || 0) > 0 && Number(o.costUsd) <= maxCostForCap)
      || opportunities[0];

    const EBAY_MIN = 500;
    const enlargeImg = (url: string): string => {
      if (!url || typeof url !== 'string') return url;
      let u = url.trim();
      u = u.replace(/placehold\.co\/(\d+)x(\d+)/i, (_, w, h) => {
        const s = Math.max(EBAY_MIN, parseInt(w, 10) || EBAY_MIN, parseInt(h, 10) || EBAY_MIN);
        return `placehold.co/${s}x${s}`;
      });
      u = u.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, `_${EBAY_MIN}x${EBAY_MIN}.$1`);
      u = u.replace(/\.(jpg|jpeg|png|webp|gif)_[0-9]+x[0-9]+\.\1$/i, `_${EBAY_MIN}x${EBAY_MIN}.$1`);
      return u;
    };

    const rawImages = opp.images ?? (opp as any).image ? [(opp as any).image] : [];
    const imagesRaw = Array.isArray(rawImages) && rawImages.length > 0
      ? rawImages.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'))
      : ['https://placehold.co/500x500?text=Product'];
    const images = imagesRaw.map(enlargeImg);

    console.log('[3] Oportunidad elegida:', opp.title?.slice(0, 50) || 'N/A', '| costUsd:', opp.costUsd, '\n');

    // 4. Crear producto
    const productService = new ProductService();
    const product = await productService.createProduct(userId, {
      title: opp.title,
      description: (opp as any).description || '',
      aliexpressUrl: opp.aliexpressUrl || opp.productUrl || 'https://www.aliexpress.com/item/0.html',
      aliexpressPrice: opp.costUsd,
      suggestedPrice: opp.suggestedPriceUsd || opp.costUsd * 1.5,
      imageUrls: images,
      category: opp.category || 'Electronics',
      currency: 'USD',
    });
    console.log('[4] Producto creado: id=', product.id, '\n');

    // 5. Aprobar
    await productService.updateProductStatusSafely(product.id, 'APPROVED', userId, 'Primer ciclo: aprobacin para publicacin');
    const updated = await prisma.product.findUnique({
      where: { id: product.id },
      select: { status: true, title: true, aliexpressPrice: true, suggestedPrice: true },
    });

    // 6. Publicar en eBay
    const basePrice = Number(updated?.suggestedPrice || updated?.aliexpressPrice) * 1.5;
    const finalPrice = Math.min(basePrice, MAX_PRICE_USD);
    const marketplaceService = new MarketplaceService();
    const env = await workflowConfigService.getUserEnvironment(userId);

    const publishResult = await marketplaceService.publishProduct(userId, {
      productId: product.id,
      marketplace: 'ebay',
      customData: {
        title: String(updated?.title || opp.title || `Product-${product.id}`).replace(/\s+/g, ' ').trim().slice(0, 80),
        price: finalPrice,
        quantity: 1,
        categoryId: '20349',
      },
    }, env);

    if (publishResult.success) {
      console.log('[5] Publicado en eBay OK');
      if (publishResult.listingId) console.log('    listingId:', publishResult.listingId);
      if (publishResult.listingUrl) console.log('    URL:', publishResult.listingUrl);
      await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
      console.log('\n[DONE] Primer ciclo completado: 1 artculo econmico publicado en eBay.');
      return 0;
    }

    // Si falla publish (ej. sin token eBay), producto queda APPROVED
    console.warn('[5] Publicacin eBay fall:', publishResult.error || 'Unknown');
    console.log('    Producto id=%d en estado APPROVED. Configura EBAY_REFRESH_TOKEN y vuelve a publicar desde la UI.', product.id);
    return 0;
  } catch (err: any) {
    console.error('ERROR:', err?.message || err);
    return 1;
  } finally {
    const { prisma } = await import('../src/config/database');
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code));
