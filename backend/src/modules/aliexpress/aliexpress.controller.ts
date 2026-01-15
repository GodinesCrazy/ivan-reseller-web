/**
 * Controller para endpoints de AliExpress Affiliate API
 */

import { Request, Response } from 'express';
import aliExpressService from './aliexpress.service';
import logger from '../../config/logger';
import env from '../../config/env';

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
  // Generate correlation ID for debugging
  const correlationId = req.headers['x-correlation-id'] as string || 
                       `oauth-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    // Log safe debug info (no secrets)
    const hasAppKey = !!env.ALIEXPRESS_APP_KEY;
    const hasAppSecret = !!env.ALIEXPRESS_APP_SECRET;
    const callbackUrl = env.ALIEXPRESS_CALLBACK_URL || 'https://www.ivanreseller.com/api/aliexpress/callback';
    const baseUrl = req.protocol + '://' + req.get('host');
    
    logger.info('[AliExpress] OAuth initiation request', {
      correlationId,
      hasAppKey,
      hasAppSecret,
      callbackUrl,
      baseUrl,
      queryParams: Object.keys(req.query),
    });

    // Validate required environment variables
    if (!env.ALIEXPRESS_APP_KEY) {
      logger.error('[AliExpress] OAuth initiation failed: missing APP_KEY', {
        correlationId,
        hasAppKey: false,
        hasAppSecret,
      });
      return res.status(500).json({
        success: false,
        error: 'ALIEXPRESS_APP_KEY no configurado',
        correlationId,
      });
    }

    // Generate state for CSRF protection
    const state = aliExpressService.generateOAuthState();

    // Build AliExpress authorization URL
    const authUrl = new URL('https://oauth.aliexpress.com/authorize');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', env.ALIEXPRESS_APP_KEY);
    authUrl.searchParams.append('redirect_uri', encodeURIComponent(callbackUrl));
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'api'); // Required scope by AliExpress

    logger.info('[AliExpress] OAuth URL generated, redirecting', {
      correlationId,
      authUrlLength: authUrl.toString().length,
      hasState: !!state,
      callbackUrl,
    });

    // Redirect to AliExpress OAuth (302)
    return res.redirect(302, authUrl.toString());
  } catch (error: any) {
    logger.error('[AliExpress] Error al iniciar OAuth', {
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al iniciar flujo OAuth',
      message: error.message,
      correlationId,
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
  // Generate correlation ID for debugging
  const correlationId = req.headers['x-correlation-id'] as string || 
                       `test-link-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    const { productId } = req.query;

    // Log safe debug info
    const hasAppKey = !!env.ALIEXPRESS_APP_KEY;
    const hasAppSecret = !!env.ALIEXPRESS_APP_SECRET;
    const baseUrl = req.protocol + '://' + req.get('host');
    
    logger.info('[AliExpress] Test link request', {
      correlationId,
      productId,
      hasAppKey,
      hasAppSecret,
      baseUrl,
      queryParams: Object.keys(req.query),
    });

    // Validate productId
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'productId es requerido como query parameter',
        example: '/api/aliexpress/test-link?productId=1005001234567890',
        correlationId,
      });
    }

    // Validate environment variables before attempting to create link
    if (!env.ALIEXPRESS_APP_KEY || !env.ALIEXPRESS_APP_SECRET) {
      logger.error('[AliExpress] Test link failed: missing env vars', {
        correlationId,
        hasAppKey,
        hasAppSecret,
      });
      return res.status(400).json({
        success: false,
        error: 'AliExpress env missing',
        message: 'ALIEXPRESS_APP_KEY y ALIEXPRESS_APP_SECRET deben estar configurados',
        correlationId,
      });
    }

    logger.info('[AliExpress] Test: Generando link afiliado', {
      correlationId,
      productId,
      trackingId: env.ALIEXPRESS_TRACKING_ID || 'ivanreseller',
    });

    // Try to create affiliate link
    // This may fail if no token is available, which is expected
    const result = await aliExpressService.createAffiliateLink({
      productId,
      trackingId: env.ALIEXPRESS_TRACKING_ID || 'ivanreseller',
    });

    // Log sanitized result (no secrets)
    logger.info('[AliExpress] Test: Resultado', {
      correlationId,
      success: result.success,
      trackingId: result.trackingId,
      productId: result.productId,
      hasPromotionUrl: !!result.promotionUrl,
      hasErrorMessage: !!result.errorMessage,
    });

    // If link generation failed, check if it's due to missing token
    if (!result.success && result.errorMessage) {
      const isTokenError = result.errorMessage.toLowerCase().includes('token') || 
                          result.errorMessage.toLowerCase().includes('oauth') ||
                          result.errorMessage.toLowerCase().includes('autenticación');
      
      if (isTokenError) {
        logger.warn('[AliExpress] Test link failed: token required', {
          correlationId,
          errorMessage: result.errorMessage,
        });
        return res.status(401).json({
          success: false,
          error: 'No token',
          message: 'Se requiere autenticación OAuth. Use /api/aliexpress/auth para autenticar.',
          correlationId,
        });
      }
    }

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
    logger.error('[AliExpress] Test: Error al generar link', {
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    // Check if error is due to missing token
    const errorMessage = error.message || '';
    const isTokenError = errorMessage.toLowerCase().includes('token') || 
                        errorMessage.toLowerCase().includes('oauth') ||
                        errorMessage.toLowerCase().includes('autenticación');

    if (isTokenError) {
      return res.status(401).json({
        success: false,
        error: 'No token',
        message: 'Se requiere autenticación OAuth. Use /api/aliexpress/auth para autenticar.',
        correlationId,
      });
    }

    // Check if error is due to missing env vars
    const isEnvError = errorMessage.toLowerCase().includes('configurado') ||
                      errorMessage.toLowerCase().includes('missing') ||
                      errorMessage.toLowerCase().includes('env');

    if (isEnvError) {
      return res.status(400).json({
        success: false,
        error: 'AliExpress env missing',
        message: error.message,
        correlationId,
      });
    }

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

