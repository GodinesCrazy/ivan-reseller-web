/**
 * Controller para endpoints de AliExpress Affiliate API
 * 
 * ⚠️ IMPORTANTE: AliExpress Affiliate API does NOT support OAuth interactive login.
 * The API works EXCLUSIVELY with:
 * - app_key
 * - app_secret  
 * - sign (signature)
 * - timestamp (YYYYMMDDHHmmss)
 * 
 * All requests must be signed according to AliExpress TOP API specification.
 * No user login or authorization flow is required.
 */

import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import aliExpressService from './aliexpress.service';
import { aliExpressSearchService } from './aliexpress-search.service';
import logger from '../../config/logger';
import env from '../../config/env';
import { prisma } from '../../config/database';
import { getAuthorizationUrl, exchangeCodeForToken } from '../../services/aliexpress-oauth.service';
import { getToken } from '../../services/aliexpress-token.store';

/**
 * Endpoint para generar un link afiliado
 * POST /api/aliexpress/generate-link
 */
export const generateAffiliateLink = async (req: Request, res: Response) => {
  try {
    const { productId, productUrl, trackingId, promotionName } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'productId es requerido',
      });
    }

    logger.info('[AliExpress Affiliate] Generando link afiliado', {
      productId,
      trackingId: trackingId || env.ALIEXPRESS_TRACKING_ID,
    });

    const result = await aliExpressService.createAffiliateLink({
      productId,
      productUrl,
      trackingId: trackingId || env.ALIEXPRESS_TRACKING_ID || 'ivanreseller',
      promotionName,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.errorMessage || 'Error al generar link afiliado',
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('[AliExpress Affiliate] Error al generar link afiliado', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al generar link afiliado',
      message: error.message,
    });
  }
};

/**
 * Endpoint de prueba para generar un link afiliado real
 * GET /api/aliexpress/test-link?productId=xxx
 */
export const testAffiliateLink = async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string || 
                       `test-link-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    const { productId } = req.query;

    // Check process.env directly
    const rawAppKey = process.env.ALIEXPRESS_APP_KEY;
    const rawAppSecret = process.env.ALIEXPRESS_APP_SECRET;
    
    console.log('[ALIEXPRESS-AFFILIATE] Test link - ALIEXPRESS_APP_KEY present:', !!rawAppKey);
    console.log('[ALIEXPRESS-AFFILIATE] Test link - ALIEXPRESS_APP_SECRET present:', !!rawAppSecret);
    
    const appKey = rawAppKey || '';
    const appSecret = rawAppSecret || '';
    const baseUrl = req.protocol + '://' + req.get('host');
    
    const hasAppKey = !!appKey && appKey.trim().length > 0;
    const hasAppSecret = !!appSecret && appSecret.trim().length > 0;
    
    logger.info('[AliExpress Affiliate] Test link request', {
      correlationId,
      productId,
      hasAppKey,
      hasAppSecret,
      baseUrl,
      queryParams: Object.keys(req.query),
      appKeyLength: appKey ? appKey.length : 0,
      appSecretLength: appSecret ? appSecret.length : 0,
    });

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'productId es requerido como query parameter',
        example: '/api/aliexpress/test-link?productId=1005001234567890',
        correlationId,
      });
    }

    if (!hasAppKey || !hasAppSecret) {
      logger.error('[AliExpress Affiliate] Test link failed: missing env vars', {
        correlationId,
        hasAppKey,
        hasAppSecret,
        rawAppKeyPresent: !!rawAppKey,
        rawAppSecretPresent: !!rawAppSecret,
      });
      return res.status(400).json({
        success: false,
        error: 'AliExpress env missing',
        message: 'ALIEXPRESS_APP_KEY y ALIEXPRESS_APP_SECRET deben estar configurados',
        correlationId,
      });
    }

    logger.info('[AliExpress Affiliate] Test: Generando link afiliado', {
      correlationId,
      productId,
      trackingId: env.ALIEXPRESS_TRACKING_ID || 'ivanreseller',
    });

    const result = await aliExpressService.createAffiliateLink({
      productId,
      trackingId: env.ALIEXPRESS_TRACKING_ID || 'ivanreseller',
    });

    logger.info('[AliExpress Affiliate] Test: Resultado', {
      correlationId,
      success: result.success,
      trackingId: result.trackingId,
      productId: result.productId,
      hasPromotionUrl: !!result.promotionUrl,
      hasErrorMessage: !!result.errorMessage,
    });

    return res.status(200).json({
      success: result.success,
      data: {
        trackingId: result.trackingId,
        productId: result.productId,
        promotionUrl: result.promotionUrl,
        message: result.success
          ? 'Link afiliado generado exitosamente'
          : 'Error al generar link afiliado',
        errorMessage: result.errorMessage,
      },
      correlationId,
    });
  } catch (error: any) {
    logger.error('[AliExpress Affiliate] Test: Error al generar link', {
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al generar link de prueba',
      message: error.message,
      correlationId,
    });
  }
};

/**
 * Endpoint para buscar productos
 * GET /api/aliexpress/search?keywords=xxx
 */
export const searchProducts = async (req: Request, res: Response) => {
  try {
    const { keywords, categoryId, minPrice, maxPrice, pageNo, pageSize, sort } = req.query;

    if (!keywords || typeof keywords !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'keywords es requerido',
      });
    }

    const result = await aliExpressService.searchProducts({
      keywords,
      categoryId: categoryId as string | undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      pageNo: pageNo ? Number(pageNo) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sort: sort as string | undefined,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('[AliExpress Affiliate] Error al buscar productos', {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al buscar productos',
      message: error.message,
    });
  }
};

/**
 * Endpoint de health check y diagnóstico
 * GET /api/aliexpress/health
 */
export const getHealthStatus = async (req: Request, res: Response) => {
  try {
    const rawAppKey = process.env.ALIEXPRESS_APP_KEY;
    const rawAppSecret = process.env.ALIEXPRESS_APP_SECRET;
    const rawTrackingId = process.env.ALIEXPRESS_TRACKING_ID;
    const rawApiBaseUrl = process.env.ALIEXPRESS_API_BASE_URL;
    
    const appKey = (rawAppKey || '').trim();
    const appSecret = (rawAppSecret || '').trim();
    const trackingId = (rawTrackingId || 'ivanreseller').trim();
    const apiBaseUrl = (rawApiBaseUrl || 'https://api-sg.aliexpress.com/sync').trim();
    
    const hasAppKey = !!appKey && appKey.length > 0;
    const hasAppSecret = !!appSecret && appSecret.length > 0;
    
    // Test signature generation
    let signatureTest = false;
    let signatureError = null;
    try {
      if (hasAppKey && hasAppSecret) {
        const testParams = {
          app_key: appKey,
          method: 'test',
          timestamp: '20250124120000',
        };
        // Access private method via type assertion (service exposes it)
        const testSign = aliExpressService.generateSignature(testParams, 'md5');
        signatureTest = !!testSign && testSign.length > 0;
      }
    } catch (error: any) {
      signatureError = error.message;
    }
    
    // Test API connectivity (without making actual request)
    const connectivityTest = {
      endpoint: apiBaseUrl,
      reachable: true, // Assume reachable, actual test would require network call
    };
    
    const healthStatus = {
      status: hasAppKey && hasAppSecret ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: {
        hasAppKey,
        hasAppSecret,
        appKeyLength: appKey.length,
        appSecretLength: appSecret.length,
        trackingId,
        apiBaseUrl,
      },
      signature: {
        test: signatureTest,
        error: signatureError,
      },
      connectivity: connectivityTest,
      warnings: [] as string[],
      errors: [] as string[],
    };
    
    if (!hasAppKey) {
      healthStatus.errors.push('ALIEXPRESS_APP_KEY no configurado');
    }
    if (!hasAppSecret) {
      healthStatus.errors.push('ALIEXPRESS_APP_SECRET no configurado');
    }
    if (!signatureTest) {
      healthStatus.errors.push(`Error al generar firma: ${signatureError || 'unknown'}`);
    }
    
    const statusCode = healthStatus.errors.length > 0 ? 503 : 200;
    
    logger.info('[AliExpress Affiliate] Health check', {
      status: healthStatus.status,
      hasAppKey,
      hasAppSecret,
      signatureTest,
    });
    
    return res.status(statusCode).json({
      success: healthStatus.status === 'healthy',
      data: healthStatus,
    });
  } catch (error: any) {
    logger.error('[AliExpress Affiliate] Error en health check', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al verificar estado de salud',
      message: error.message,
    });
  }
};

/**
 * Endpoint para obtener productos candidatos basados en tendencias
 * GET /api/aliexpress/candidates
 * FASE 2: Búsqueda en AliExpress
 */
export const getCandidates = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'Se requiere autenticación',
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const priority = req.query.priority as 'high' | 'medium' | 'low' | undefined;
    const minTrendScore = req.query.minTrendScore ? parseInt(req.query.minTrendScore as string, 10) : undefined;
    const region = (req.query.region as string) || 'US';
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

    console.log('[ALIEXPRESS-SEARCH] Start keyword search');
    logger.info('[AliExpress Search] Obteniendo productos candidatos', {
      userId,
      limit,
      priority,
      minTrendScore,
      region,
      days,
    });

    // Buscar candidatos
    const result = await aliExpressSearchService.searchCandidates({
      userId,
      limit,
      priority,
      minTrendScore,
      region,
      days,
    });

    console.log('[ALIEXPRESS-SEARCH] Candidates ready:', result.candidates.length);

    // Persistir productos candidatos (ligera)
    if (result.candidates.length > 0) {
      try {
        await persistCandidates(userId, result.candidates);
      } catch (persistError: any) {
        logger.warn('[AliExpress Search] Error persistiendo candidatos (no crítico)', {
          error: persistError.message,
          userId,
        });
        // No fallar el request si la persistencia falla
      }
    }

    logger.info('[AliExpress Search] Candidatos obtenidos exitosamente', {
      count: result.candidates.length,
      totalFound: result.totalFound,
      keywordsProcessed: result.keywordsProcessed,
      processingTime: result.processingTime,
      userId,
    });

    return res.status(200).json({
      success: true,
      data: {
        candidates: result.candidates,
        meta: {
          totalFound: result.totalFound,
          totalFiltered: result.totalFiltered,
          keywordsProcessed: result.keywordsProcessed,
          processingTime: result.processingTime,
          generatedAt: new Date().toISOString(),
        },
      },
    });

  } catch (error: any) {
    logger.error('[AliExpress Search] Error obteniendo candidatos', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al obtener productos candidatos',
      message: error.message,
    });
  }
};

/**
 * Persistir productos candidatos en base de datos
 */
async function persistCandidates(userId: number, candidates: any[]): Promise<void> {
  try {
    console.log('[ALIEXPRESS-SEARCH] Persisting candidates to database');

    for (const candidate of candidates.slice(0, 50)) { // Limitar a 50 para no sobrecargar
      try {
        // Verificar si el producto ya existe
        const existing = await prisma.product.findFirst({
          where: {
            userId,
            aliexpressUrl: candidate.productUrl,
          },
        });

        if (!existing) {
          // Crear nuevo producto candidato
          await prisma.product.create({
            data: {
              userId,
              aliexpressUrl: candidate.productUrl,
              title: candidate.title,
              aliexpressPrice: candidate.basePrice,
              currency: candidate.currency,
              suggestedPrice: candidate.basePrice, // Por ahora igual al precio base
              shippingCost: candidate.shippingCost,
              category: candidate.sourceKeyword, // Usar keyword como categoría temporal
              images: JSON.stringify([candidate.productImageUrl]),
              productData: JSON.stringify({
                productId: candidate.productId,
                sourceKeyword: candidate.sourceKeyword,
                trendScore: candidate.trendScore,
                priority: candidate.priority,
                rating: candidate.rating,
                ordersCount: candidate.ordersCount,
                estimatedDeliveryDays: candidate.estimatedDeliveryDays,
                shopName: candidate.shopName,
                shopUrl: candidate.shopUrl,
              }),
              status: 'candidate', // Estado especial para candidatos
              isPublished: false,
            },
          });
        }
      } catch (error: any) {
        logger.warn('[AliExpress Search] Error persistiendo candidato individual', {
          productId: candidate.productId,
          error: error.message,
        });
        // Continuar con siguiente candidato
      }
    }

    console.log('[ALIEXPRESS-SEARCH] Candidates persisted');

  } catch (error: any) {
    logger.error('[AliExpress Search] Error en persistencia de candidatos', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * GET /api/aliexpress/affiliate/health - Token status for Affiliate API
 */
export const getAffiliateHealth = async (_req: Request, res: Response) => {
  try {
    const tokenData = getToken();
    const hasToken = !!tokenData?.accessToken;
    const expiresAt = tokenData?.expiresAt ? new Date(tokenData.expiresAt).toISOString() : null;
    const expired = tokenData ? tokenData.expiresAt <= Date.now() : true;
    return res.status(200).json({ hasToken, expiresAt, expired });
  } catch (err: any) {
    return res.status(200).json({ hasToken: false, expiresAt: null, expired: true });
  }
};

/**
 * Get OAuth authorization URL to start OAuth flow
 * GET /api/aliexpress/oauth/url
 */
export const getOAuthUrl = async (req: Request, res: Response) => {
  try {
    const url = getAuthorizationUrl();
    return res.status(200).json({ url });
  } catch (err: any) {
    logger.error('[AliExpress OAuth] getOAuthUrl failed', { error: err?.message });
    return res.status(500).json({ success: false, error: err?.message || 'OAuth URL not configured' });
  }
};

/**
 * OAuth callback: exchange code for tokens, persist to store + DB, return success.
 * GET /api/aliexpress/callback?code=...
 */
export const oauthCallback = async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
  if (!code) {
    logger.warn('[AliExpress OAuth] Callback missing code', { query: req.query });
    return res.status(400).json({ success: false, error: 'MISSING_CODE' });
  }

  try {
    const tokenData = await exchangeCodeForToken(code);
    const expiresAt = new Date(tokenData.expiresAt);

    try {
      await prisma.aliExpressToken.upsert({
        where: { id: 'global' },
        create: {
          id: 'global',
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt,
          tokenType: 'Bearer',
          scope: null,
          state: (req.query.state as string) || null,
        },
        update: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt,
          tokenType: 'Bearer',
          scope: null,
          updatedAt: new Date(),
        },
      });
      logger.info('[AliExpress OAuth] Tokens persisted to database');
    } catch (dbError: any) {
      logger.error('[AliExpress OAuth] Failed to persist tokens to database', { error: dbError?.message });
    }

    return res.status(200).json({
      success: true,
      access_token: tokenData.accessToken,
      refresh_token: tokenData.refreshToken,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    const status = err?.response?.status ?? 500;
    const data = err?.response?.data;
    logger.error('[AliExpress OAuth] Token exchange failed', { message: err?.message, status, responseData: data });
    return res.status(status).json({
      success: false,
      error: data?.error ?? data?.error_msg ?? 'TOKEN_EXCHANGE_FAILED',
      message: err?.message || 'Token exchange failed',
    });
  }
};
