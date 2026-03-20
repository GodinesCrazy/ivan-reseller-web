/**
 * POST /api/internal/single-article-to-publish
 * Ciclo directo: un solo artículo → crear (o usar producto existente) → aprobar → publicar.
 * Sin tendencias ni opportunity-finder.
 */

import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { ProductService } from '../../services/product.service';
import MarketplaceService, { type PublishProductRequest } from '../../services/marketplace.service';
import { workflowConfigService } from '../../services/workflow-config.service';
import { logger } from '../../config/logger';

const EBAY_MIN_IMAGE = 500;
const FALLBACK_IMAGE = `https://placehold.co/${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.png`;

function enlargeImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  u = u.replace(/placehold\.co\/(\d+)x(\d+)/i, (_, w, h) => {
    const s = Math.max(EBAY_MIN_IMAGE, parseInt(w, 10) || EBAY_MIN_IMAGE, parseInt(h, 10) || EBAY_MIN_IMAGE);
    return `placehold.co/${s}x${s}`;
  });
  u = u.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  u = u.replace(/\.(jpg|jpeg|png|webp|gif)_[0-9]+x[0-9]+\.\1$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  return u;
}

type Marketplace = 'ebay' | 'mercadolibre';

function stagesSingleArticle() {
  return { discovery: 'single_article' as const, product: true, approved: true };
}

export async function runSingleArticleInternalPublish(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const dryRun = req.body?.dryRun === true || process.env.DRY_RUN === '1';
  const requestedUserId = Number(req.body?.userId);
  const maxPriceUsdRaw = Number(req.body?.maxPriceUsd);
  const maxPriceUsd = Number.isFinite(maxPriceUsdRaw) && maxPriceUsdRaw > 0 ? maxPriceUsdRaw : 12;
  const marketplace: Marketplace =
    String(req.body?.marketplace || 'mercadolibre').toLowerCase() === 'ebay' ? 'ebay' : 'mercadolibre';

  const existingProductId = Number(req.body?.productId);
  const aliexpressUrlRaw = String(req.body?.aliexpressUrl || '').trim();

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
      res.status(400).json({ success: false, error: 'No hay usuario activo. Ejecuta seed o pasa userId.' });
      return;
    }
    if (!user.isActive) {
      res.status(400).json({ success: false, error: `El userId=${user.id} no está activo.` });
      return;
    }
    const userId = user.id;

    let env: 'sandbox' | 'production' = await workflowConfigService.getUserEnvironment(userId);
    const credEnvBody = String(req.body?.credentialEnvironment ?? '').toLowerCase();
    if (credEnvBody === 'production' || credEnvBody === 'sandbox') {
      env = credEnvBody;
    }

    const productService = new ProductService();
    let product: { id: number };
    let opp: {
      title: string;
      description: string;
      aliexpressUrl: string;
      costUsd: number;
      suggestedPriceUsd: number;
      category?: string;
    };

    if (Number.isFinite(existingProductId) && existingProductId > 0) {
      const row = await prisma.product.findFirst({
        where: { id: existingProductId, userId },
        select: {
          id: true,
          title: true,
          description: true,
          aliexpressUrl: true,
          aliexpressPrice: true,
          suggestedPrice: true,
          category: true,
          status: true,
          isPublished: true,
        },
      });
      if (!row) {
        res.status(404).json({
          success: false,
          error: `Producto ${existingProductId} no existe o no pertenece al userId=${userId}.`,
        });
        return;
      }
      product = { id: row.id };
      const cost = Number(row.aliexpressPrice) || 5;
      const sug = Number(row.suggestedPrice) || cost * 1.5;
      opp = {
        title: row.title || `Product ${row.id}`,
        description: row.description || '',
        aliexpressUrl: row.aliexpressUrl || '',
        costUsd: cost,
        suggestedPriceUsd: sug,
        category: row.category || undefined,
      };
      if (row.isPublished || row.status === 'PUBLISHED') {
        res.status(400).json({
          success: false,
          error: `Producto ${row.id} ya está publicado. Usa otro productId o despublica antes.`,
        });
        return;
      }
      if (row.status === 'REJECTED' || row.status === 'INACTIVE') {
        res.status(400).json({
          success: false,
          error: `Producto en estado ${row.status}; no se puede publicar.`,
        });
        return;
      }
      if (row.status === 'PENDING') {
        await productService.updateProductStatusSafely(
          product.id,
          'APPROVED',
          userId,
          'Internal single-article: aprobación automática'
        );
      } else if (row.status !== 'APPROVED' && row.status !== 'PUBLISHED') {
        await productService.updateProductStatusSafely(
          product.id,
          'APPROVED',
          userId,
          'Internal single-article: aprobación automática'
        );
      }
    } else {
      if (!aliexpressUrlRaw || !/aliexpress\.com/i.test(aliexpressUrlRaw)) {
        res.status(400).json({
          success: false,
          error:
            'Pasa body.aliexpressUrl (URL de producto AliExpress) o body.productId (producto existente del usuario).',
        });
        return;
      }
      const titleIn = String(req.body?.title || '').trim();
      const title =
        titleIn ||
        `Single ${new Date().toISOString().slice(0, 10)} ${aliexpressUrlRaw.split('/').pop()?.slice(0, 40) || 'item'}`;
      const desc = String(req.body?.description || '').trim() || 'Publicación interna — un solo artículo.';
      const costUsd = Number(req.body?.costUsd);
      const cost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 7.99;
      const sugIn = Number(req.body?.suggestedPriceUsd);
      const suggested = Number.isFinite(sugIn) && sugIn > 0 ? sugIn : Math.min(cost * 1.5, maxPriceUsd > 0 ? maxPriceUsd : cost * 1.5);
      const category = String(req.body?.category || 'General').trim() || 'General';
      const rawImages = Array.isArray(req.body?.imageUrls) ? req.body.imageUrls : [];
      const filtered = rawImages.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'));
      const enlarged = filtered.map(enlargeImageUrl);
      const images = enlarged.length > 0 ? enlarged.slice(0, 12) : [FALLBACK_IMAGE];

      opp = {
        title,
        description: desc,
        aliexpressUrl: aliexpressUrlRaw,
        costUsd: cost,
        suggestedPriceUsd: suggested,
        category,
      };

      product = await productService.createProduct(userId, {
        title: opp.title,
        description: opp.description,
        aliexpressUrl: opp.aliexpressUrl,
        aliexpressPrice: opp.costUsd,
        suggestedPrice: opp.suggestedPriceUsd,
        imageUrls: images,
        category: opp.category,
        currency: 'USD',
      });
      await productService.updateProductStatusSafely(
        product.id,
        'APPROVED',
        userId,
        'Internal single-article: aprobación para publicación'
      );
    }

    const updated = await prisma.product.findUnique({
      where: { id: product.id },
      select: { status: true, title: true, aliexpressPrice: true, suggestedPrice: true },
    });

    const keyword = Number.isFinite(existingProductId) && existingProductId > 0
      ? `existing_product:${product.id}`
      : 'single_article';

    if (dryRun) {
      res.status(200).json({
        success: true,
        dryRun: true,
        userId,
        productId: product.id,
        marketplace,
        keyword,
        stages: { ...stagesSingleArticle(), publish: 'skipped' },
        credentialEnvironment: env,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const marketplaceService = new MarketplaceService();
    let publishResult: { success: boolean; error?: string; listingId?: string; listingUrl?: string };
    try {
      const baseTitle = String(updated?.title || opp.title || `Product-${product.id}`).replace(/\s+/g, ' ').trim();
      let uniqueTitle = `${baseTitle.slice(0, marketplace === 'mercadolibre' ? 48 : 70)} P${product.id}`.replace(/\s+/g, ' ').trim();
      if (marketplace === 'mercadolibre' && uniqueTitle.length > 60) {
        uniqueTitle = uniqueTitle.slice(0, 60).trim();
      }
      const basePrice = Number(updated?.suggestedPrice || updated?.aliexpressPrice) * 1.5;
      const finalPrice = maxPriceUsd ? Math.min(basePrice, maxPriceUsd) : basePrice;
      const customData: Record<string, unknown> = {
        title: uniqueTitle,
        price: finalPrice,
        quantity: 1,
      };
      if (marketplace === 'ebay') {
        customData.categoryId = '20349';
      }
      publishResult = await marketplaceService.publishProduct(
        userId,
        {
          productId: product.id,
          marketplace,
          customData: customData as PublishProductRequest['customData'],
        },
        env
      );
    } catch (publishErr: any) {
      publishResult = { success: false, error: publishErr?.message || String(publishErr) };
    }

    if (publishResult.success) {
      await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
      const verified = await prisma.product.findUnique({
        where: { id: product.id },
        select: { status: true, isPublished: true, publishedAt: true },
      });
      logger.info('[INTERNAL] single-article-to-publish OK', {
        userId,
        marketplace,
        productId: product.id,
        listingId: publishResult.listingId,
        durationMs: Date.now() - startTime,
      });
      res.status(200).json({
        success: true,
        userId,
        productId: product.id,
        listingId: publishResult.listingId,
        listingUrl: publishResult.listingUrl,
        marketplace,
        maxPriceUsdApplied: maxPriceUsd,
        stages: { ...stagesSingleArticle(), publish: true },
        verified: verified ? { status: verified.status, isPublished: verified.isPublished } : undefined,
        credentialEnvironment: env,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const ebayErrLower = String(publishResult.error || '').toLowerCase();
    const ebayConfigMsg = /credentials not found|inactive for|falta token oauth|completa la autorizaci/i.test(ebayErrLower);
    const tokenErr =
      marketplace === 'ebay' &&
      publishResult.error &&
      !ebayConfigMsg &&
      /invalid_grant|unauthorized|401\b|403\b|expired|refresh.?token|access.?token|oauth.?error/i.test(ebayErrLower);
    if (tokenErr) {
      res.status(200).json({
        success: true,
        userId,
        productId: product.id,
        marketplace,
        stages: { ...stagesSingleArticle(), publish: 'pending_oauth' },
        ebayPendingOAuth: true,
        publishError: publishResult.error,
        message: 'Producto listo; completa OAuth eBay.',
        credentialEnvironment: env,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const mlErrLower = String(publishResult.error || '').toLowerCase();
    const mlConfigMsg =
      /credentials not found|inactive for \w+ environment|faltan mercadolibre|complet[ae] oauth en la app|base de datos/i.test(
        mlErrLower
      );
    const mlTokenErr =
      marketplace === 'mercadolibre' &&
      publishResult.error &&
      !mlConfigMsg &&
      /invalid_grant|invalid_token|unauthorized|401\b|403\b|token expired|access token|refresh.?token|revoked/i.test(mlErrLower);
    if (mlTokenErr) {
      res.status(200).json({
        success: true,
        userId,
        productId: product.id,
        marketplace,
        stages: { ...stagesSingleArticle(), publish: 'pending_oauth' },
        mercadolibrePendingOAuth: true,
        publishError: publishResult.error,
        message: 'Producto listo; renueva token Mercado Libre.',
        credentialEnvironment: env,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const dsHint =
      publishResult.error &&
      String(publishResult.error).includes('AliExpress Dropshipping API is not connected')
        ? 'Credenciales DS por usuario: body.userId debe ser quien conectó AliExpress Dropshipping.'
        : undefined;

    res.status(500).json({
      success: false,
      error: publishResult.error,
      userId,
      productId: product.id,
      marketplace,
      credentialEnvironment: env,
      hint: dsHint,
      stages: { ...stagesSingleArticle(), publish: false },
      durationMs: Date.now() - startTime,
    });
  } catch (e: any) {
    logger.error('[INTERNAL] single-article-to-publish failed', { error: e?.message });
    res.status(500).json({
      success: false,
      error: e?.message || String(e),
      durationMs: Date.now() - startTime,
    });
  }
}
