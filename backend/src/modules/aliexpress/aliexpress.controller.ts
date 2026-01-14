/**
 * Controller para endpoints de AliExpress Affiliate API
 */

import { Request, Response } from 'express';
import aliExpressService from './aliexpress.service';
import logger from '@/config/logger';
import env from '@/config/env';

/**
 * Endpoint OAuth callback - Recibe el código de autorización de AliExpress
 * GET /api/aliexpress/callback?code=xxx&state=xxx
 */
export const handleOAuthCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string') {
      logger.warn('[AliExpress] Callback recibido sin code', {
        query: req.query,
      });
      return res.status(400).json({
        success: false,
        error: 'Código de autorización (code) requerido',
      });
    }

    // Validar state (protección CSRF)
    // En producción, deberías almacenar el state en sesión o cache
    // Por ahora, validamos que existe
    if (!state || typeof state !== 'string') {
      logger.warn('[AliExpress] Callback recibido sin state', {
        query: req.query,
      });
      return res.status(400).json({
        success: false,
        error: 'State requerido para validación CSRF',
      });
    }

    logger.info('[AliExpress] Procesando callback OAuth', {
      hasCode: !!code,
      hasState: !!state,
    });

    // Intercambiar code por token
    const tokenData = await aliExpressService.exchangeCodeForToken(code);

    // Guardar token de forma segura
    await aliExpressService.saveToken(tokenData, state);

    logger.info('[AliExpress] OAuth callback completado exitosamente');

    // Redirigir a una página de éxito o retornar JSON
    return res.status(200).json({
      success: true,
      message: 'Autenticación OAuth completada exitosamente',
      data: {
        tokenType: tokenData.tokenType,
        expiresAt: tokenData.expiresAt,
        hasRefreshToken: !!tokenData.refreshToken,
      },
    });
  } catch (error: any) {
    logger.error('[AliExpress] Error en callback OAuth', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al procesar callback OAuth',
      message: error.message,
    });
  }
};

/**
 * Endpoint para iniciar el flujo OAuth
 * GET /api/aliexpress/auth
 */
export const initiateOAuth = async (req: Request, res: Response) => {
  try {
    if (!env.ALIEXPRESS_APP_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ALIEXPRESS_APP_KEY no configurado',
      });
    }

    // Generar state para protección CSRF
    const state = aliExpressService.generateOAuthState();

    // Construir URL de autorización de AliExpress
    const authUrl = new URL('https://oauth.aliexpress.com/authorize');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', env.ALIEXPRESS_APP_KEY);
    authUrl.searchParams.append('redirect_uri', env.ALIEXPRESS_CALLBACK_URL || 'https://www.ivanreseller.com/api/aliexpress/callback');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'api'); // Scope requerido por AliExpress

    logger.info('[AliExpress] Iniciando flujo OAuth', {
      authUrl: authUrl.toString().substring(0, 100) + '...',
    });

    return res.status(200).json({
      success: true,
      data: {
        authUrl: authUrl.toString(),
        state,
        message: 'Redirige al usuario a authUrl para autorizar la aplicación',
      },
    });
  } catch (error: any) {
    logger.error('[AliExpress] Error al iniciar OAuth', {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al iniciar flujo OAuth',
      message: error.message,
    });
  }
};

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

    logger.info('[AliExpress] Generando link afiliado', {
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
    logger.error('[AliExpress] Error al generar link afiliado', {
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
  try {
    const { productId } = req.query;

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'productId es requerido como query parameter',
        example: '/api/aliexpress/test-link?productId=1005001234567890',
      });
    }

    logger.info('[AliExpress] Test: Generando link afiliado', {
      productId,
      trackingId: env.ALIEXPRESS_TRACKING_ID || 'ivanreseller',
    });

    const result = await aliExpressService.createAffiliateLink({
      productId,
      trackingId: env.ALIEXPRESS_TRACKING_ID || 'ivanreseller',
    });

    // Log sanitizado (sin exponer secretos)
    logger.info('[AliExpress] Test: Resultado', {
      success: result.success,
      trackingId: result.trackingId,
      productId: result.productId,
      hasPromotionUrl: !!result.promotionUrl,
      errorMessage: result.errorMessage,
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
    });
  } catch (error: any) {
    logger.error('[AliExpress] Test: Error al generar link', {
      error: error.message,
      // NO loguear stack completo en producción
    });

    return res.status(500).json({
      success: false,
      error: 'Error al generar link de prueba',
      message: error.message,
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
    logger.error('[AliExpress] Error al buscar productos', {
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
 * Endpoint para verificar estado del token
 * GET /api/aliexpress/token-status
 */
export const getTokenStatus = async (req: Request, res: Response) => {
  try {
    const tokenData = await aliExpressService.getActiveToken();

    if (!tokenData) {
      return res.status(200).json({
        success: true,
        data: {
          hasToken: false,
          message: 'No hay token activo. Se requiere autenticación OAuth.',
        },
      });
    }

    const isExpired = tokenData.expiresAt < new Date();
    const expiresInMinutes = Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000 / 60);

    return res.status(200).json({
      success: true,
      data: {
        hasToken: true,
        isExpired,
        expiresAt: tokenData.expiresAt,
        expiresInMinutes: isExpired ? 0 : expiresInMinutes,
        tokenType: tokenData.tokenType,
        hasRefreshToken: !!tokenData.refreshToken,
        scope: tokenData.scope,
      },
    });
  } catch (error: any) {
    logger.error('[AliExpress] Error al verificar estado del token', {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al verificar estado del token',
      message: error.message,
    });
  }
};

