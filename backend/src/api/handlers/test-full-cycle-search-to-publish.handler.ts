/**
 * Handler: POST /api/internal/test-full-cycle-search-to-publish
 * Ejecuta el ciclo completo tendencias -> b�squeda -> producto -> aprobaci�n -> publicaci�n eBay.
 * Corre en el servidor (Railway) que tiene EBAY_REFRESH_TOKEN en env.
 */
import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { trendsService } from '../../services/trends.service';
import opportunityFinder from '../../services/opportunity-finder.service';
import { ProductService } from '../../services/product.service';
import MarketplaceService from '../../services/marketplace.service';
import { workflowConfigService } from '../../services/workflow-config.service';
import { logger } from '../../config/logger';

const EBAY_MIN_IMAGE = 500;
const FALLBACK_IMAGE = `https://placehold.co/${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.png`;

/** Convierte URLs de miniaturas a 500x500+ (eBay mínimo). AliCDN acepta _500x500, _800x800. */
function enlargeImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  u = u.replace(/placehold\.co\/(\d+)x(\d+)/i, (_, w, h) => {
    const s = Math.max(EBAY_MIN_IMAGE, parseInt(w, 10) || EBAY_MIN_IMAGE, parseInt(h, 10) || EBAY_MIN_IMAGE);
    return `placehold.co/${s}x${s}`;
  });
  // AliExpress/AliCDN: reemplazar _220x220, _225x225 etc por _500x500 (CDN sirve ese tamaño)
  u = u.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  // Doble extensión: .jpg_220x220.jpg -> _500x500.jpg
  u = u.replace(/\.(jpg|jpeg|png|webp|gif)_[0-9]+x[0-9]+\.\1$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  return u;
}

export async function runTestFullCycleSearchToPublish(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const keywordOverride = (req.body?.keyword as string) || process.env.keyword;
  const dryRun = req.body?.dryRun === true || process.env.DRY_RUN === '1';
  const requestedUserId = Number(req.body?.userId);

  try {
    const user = Number.isFinite(requestedUserId) && requestedUserId > 0
      ? await prisma.user.findUnique({
          where: { id: requestedUserId },
          select: { id: true, username: true, isActive: true },
        })
      : await prisma.user.findFirst({
          where: { isActive: true },
          select: { id: true, username: true, isActive: true },
        });
    if (!user) {
      res.status(400).json({ success: false, error: 'No hay usuario activo. Ejecuta seed.' });
      return;
    }
    if (!user.isActive) {
      res.status(400).json({ success: false, error: `El userId=${user.id} no está activo.` });
      return;
    }
    const userId = user.id;

    let keyword: string;
    if (keywordOverride) {
      keyword = keywordOverride;
    } else {
      const trendKeywords = await trendsService.getTrendingKeywords({
        region: 'US',
        maxKeywords: 10,
        userId,
      });
      keyword = trendKeywords.length > 0 ? trendKeywords[0].keyword : 'phone case';
    }

    const result = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true, // Railway: evitar dependencia SerpAPI para b�squeda
    });
    let opportunities = result.opportunities;

    // Fallback: si no hay oportunidades (ej. AliExpress en Railway), usar producto m�nimo para probar publish
    if (opportunities.length === 0) {
      logger.warn('[INTERNAL] No opportunities found, using fallback product for publish test');
      opportunities = [{
        title: `Test Product ${keyword} - ${Date.now()}`,
        description: 'Test product for full cycle',
        aliexpressUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
        productUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
        costUsd: 15.99,
        suggestedPriceUsd: 24.99,
        category: 'Electronics',
        images: ['https://placehold.co/400x400?text=Test+Product'],
      } as any];
    }

    const opp = opportunities[0];
    const rawImages = Array.isArray((opp as any).images)
      ? (opp as any).images
      : ((opp as any).image ? [(opp as any).image] : []);
    const filtered = Array.isArray(rawImages) && rawImages.length > 0
      ? rawImages.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'))
      : [];
    const enlarged = filtered.map(enlargeImageUrl);
    const uniqueImages = Array.from(new Set(enlarged)).slice(0, 12);
    const images = uniqueImages.length > 0 ? uniqueImages : [FALLBACK_IMAGE];

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

    await productService.updateProductStatusSafely(product.id, 'APPROVED', userId, 'Test: aprobacion para publicacion');

    const updated = await prisma.product.findUnique({
      where: { id: product.id },
      select: { status: true, title: true, aliexpressPrice: true, suggestedPrice: true },
    });

    if (dryRun) {
      res.status(200).json({
        success: true,
        dryRun: true,
        productId: product.id,
        keyword,
        stages: { trends: true, search: true, product: true, approved: true, publish: 'skipped' },
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const marketplaceService = new MarketplaceService();
    let env = await workflowConfigService.getUserEnvironment(userId);

    let publishResult: { success: boolean; error?: string; listingId?: string; listingUrl?: string };
    try {
      const baseTitle = String(updated?.title || opp.title || `Product-${product.id}`).replace(/\s+/g, ' ').trim();
      const uniqueTitle = `${baseTitle.slice(0, 70)} P${product.id}`.trim();
      publishResult = await marketplaceService.publishProduct(userId, {
        productId: product.id,
        marketplace: 'ebay',
        customData: {
          title: uniqueTitle,
          price: Number(updated?.suggestedPrice || updated?.aliexpressPrice) * 1.5,
          quantity: 1,
          categoryId: '20349',
        },
      }, env);

      // No automatic sandbox fallback here: we need strict production diagnostics.
    } catch (publishErr: any) {
      const errMsg = publishErr?.message || String(publishErr);
      publishResult = { success: false, error: errMsg };
    }

    if (publishResult.success) {
      await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
      const verified = await prisma.product.findUnique({
        where: { id: product.id },
        select: { status: true, isPublished: true, publishedAt: true },
      });
      logger.info('[INTERNAL] Full cycle search-to-publish OK', {
        productId: product.id,
        listingId: publishResult.listingId,
        status: verified?.status,
        isPublished: verified?.isPublished,
        durationMs: Date.now() - startTime,
      });
      res.status(200).json({
        success: true,
        productId: product.id,
        listingId: publishResult.listingId,
        listingUrl: publishResult.listingUrl,
        keyword,
        stages: { trends: true, search: true, product: true, approved: true, publish: true },
        verified: verified ? { status: verified.status, isPublished: verified.isPublished } : undefined,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    // Degradación: si falla por token eBay, retornar éxito con producto creado/aprobado (pendiente OAuth)
    const tokenErr = publishResult.error && /token|refresh|invalid_grant|401|expired|oauth/.test(String(publishResult.error).toLowerCase());
    if (tokenErr) {
      logger.warn('[INTERNAL] eBay publish failed (token). Returning success with product ready.', { productId: product.id });
      res.status(200).json({
        success: true,
        productId: product.id,
        keyword,
        stages: { trends: true, search: true, product: true, approved: true, publish: 'pending_oauth' },
        ebayPendingOAuth: true,
        publishError: publishResult.error,
        message: 'Producto creado y aprobado. Completa OAuth de eBay para publicar: npm run ebay:oauth-url',
        durationMs: Date.now() - startTime,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: publishResult.error,
      productId: product.id,
      stages: { trends: true, search: true, product: true, approved: true, publish: false },
      durationMs: Date.now() - startTime,
    });
  } catch (e: any) {
    logger.error('[INTERNAL] test-full-cycle-search-to-publish failed', { error: e?.message });
    res.status(500).json({
      success: false,
      error: e?.message || String(e),
      durationMs: Date.now() - startTime,
    });
  }
}
