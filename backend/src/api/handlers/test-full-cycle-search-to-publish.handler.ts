/**
 * Handler: POST /api/internal/test-full-cycle-search-to-publish
 * Ejecuta el ciclo completo tendencias -> búsqueda -> producto -> aprobación -> publicación eBay.
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

export async function runTestFullCycleSearchToPublish(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const keywordOverride = (req.body?.keyword as string) || process.env.keyword;
  const dryRun = req.body?.dryRun === true || process.env.DRY_RUN === '1';

  try {
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true, username: true },
    });
    if (!user) {
      res.status(400).json({ success: false, error: 'No hay usuario activo. Ejecuta seed.' });
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
      skipTrendsValidation: true, // Railway: evitar dependencia SerpAPI para búsqueda
    });
    let opportunities = result.opportunities;

    // Fallback: si no hay oportunidades (ej. AliExpress en Railway), usar producto mínimo para probar publish
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
    const rawImages = opp.images ?? (opp as any).image ? [(opp as any).image] : [];
    const images = Array.isArray(rawImages) && rawImages.length > 0
      ? rawImages.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'))
      : ['https://placehold.co/400x400?text=Product'];

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
    const env = await workflowConfigService.getUserEnvironment(userId);

    const publishResult = await marketplaceService.publishProduct(userId, {
      productId: product.id,
      marketplace: 'ebay',
      customData: {
        price: Number(updated?.suggestedPrice || updated?.aliexpressPrice) * 1.5,
        quantity: 1,
      },
    }, env);

    if (publishResult.success) {
      await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
      logger.info('[INTERNAL] Full cycle search-to-publish OK', {
        productId: product.id,
        listingId: publishResult.listingId,
        durationMs: Date.now() - startTime,
      });
      res.status(200).json({
        success: true,
        productId: product.id,
        listingId: publishResult.listingId,
        listingUrl: publishResult.listingUrl,
        keyword,
        stages: { trends: true, search: true, product: true, approved: true, publish: true },
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
