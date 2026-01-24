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
  // ✅ LOG OBLIGATORIO: Entrada al callback
  console.log('[ALIEXPRESS-OAUTH] ════════════════════════════════════════════════════════');
  console.log('[ALIEXPRESS-OAUTH] Callback received');
  console.log('[ALIEXPRESS-OAUTH] Method:', req.method);
  console.log('[ALIEXPRESS-OAUTH] Path:', req.path);
  console.log('[ALIEXPRESS-OAUTH] URL:', req.url);
  console.log('[ALIEXPRESS-OAUTH] Query params:', Object.keys(req.query));
  console.log('[ALIEXPRESS-OAUTH] Has code:', !!req.query.code);
  console.log('[ALIEXPRESS-OAUTH] Has state:', !!req.query.state);
  console.log('[ALIEXPRESS-OAUTH] Timestamp:', new Date().toISOString());
  console.log('[ALIEXPRESS-OAUTH] ════════════════════════════════════════════════════════');
  
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
  // ✅ LOG OBLIGATORIO: Entrada al endpoint
  console.log('[ALIEXPRESS-AUTH] OAuth initiation endpoint hit');
  console.log('[ALIEXPRESS-OAUTH] Auth route hit');
  console.log('[ALIEXPRESS-OAUTH] Method:', req.method);
  console.log('[ALIEXPRESS-OAUTH] Path:', req.path);
  console.log('[ALIEXPRESS-OAUTH] URL:', req.url);
  console.log('[ALIEXPRESS-OAUTH] Timestamp:', new Date().toISOString());
  
  // Generate correlation ID for debugging
  const correlationId = req.headers['x-correlation-id'] as string || 
                       `oauth-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    // Check process.env directly (before Zod parsing)
    const rawAppKey = process.env.ALIEXPRESS_APP_KEY;
    const rawAppSecret = process.env.ALIEXPRESS_APP_SECRET;
    const rawCallbackUrl = process.env.ALIEXPRESS_CALLBACK_URL;
    
    // Log direct process.env presence (safe - no values)
    console.log('[AliExpress] ALIEXPRESS_APP_KEY present:', !!rawAppKey);
    console.log('[AliExpress] ALIEXPRESS_APP_SECRET present:', !!rawAppSecret);
    console.log('[AliExpress] ALIEXPRESS_CALLBACK_URL present:', !!rawCallbackUrl);
    
    // ✅ FASE 2: Forzar uso de ALIEXPRESS_APP_KEY (Affiliate) y validar
    // NO usar ALIEXPRESS_DROPSHIPPING_APP_KEY por error
    let appKey = (env.ALIEXPRESS_APP_KEY || rawAppKey || '').trim();
    const appSecret = (env.ALIEXPRESS_APP_SECRET || rawAppSecret || '').trim();
    const callbackUrl = (env.ALIEXPRESS_CALLBACK_URL || rawCallbackUrl || 'https://www.ivanreseller.com/api/aliexpress/callback').trim();
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // ✅ FASE 2: Validar que no se use la key de Dropshipping por error
    const dropshippingKey = (process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
    if (dropshippingKey && appKey === dropshippingKey) {
      logger.error('[AliExpress] OAuth initiation failed: using Dropshipping key instead of Affiliate key', {
        correlationId,
        detectedKey: dropshippingKey.substring(0, 4) + '**' + dropshippingKey.substring(dropshippingKey.length - 2),
        expectedKey: '524880 (Affiliate)',
      });
      return res.status(400).json({
        success: false,
        error: 'ALIEXPRESS_APP_KEY incorrecto',
        message: 'Se detectó uso de ALIEXPRESS_DROPSHIPPING_APP_KEY. Use ALIEXPRESS_APP_KEY (Affiliate: 524880)',
        correlationId,
      });
    }
    
    // Log safe debug info (no secrets)
    const hasAppKey = !!appKey && appKey.length > 0;
    const hasAppSecret = !!appSecret && appSecret.length > 0;
    
    logger.info('[AliExpress] OAuth initiation request', {
      correlationId,
      hasAppKey,
      hasAppSecret,
      callbackUrl,
      baseUrl,
      queryParams: Object.keys(req.query),
      appKeyLength: appKey ? appKey.length : 0,
      appSecretLength: appSecret ? appSecret.length : 0,
    });

    // Validate required environment variables (check both env object and process.env)
    if (!hasAppKey) {
      logger.error('[AliExpress] OAuth initiation failed: missing APP_KEY', {
        correlationId,
        hasAppKey: false,
        hasAppSecret,
        rawAppKeyPresent: !!rawAppKey,
        envAppKeyPresent: !!env.ALIEXPRESS_APP_KEY,
      });
      return res.status(400).json({
        success: false,
        error: 'ALIEXPRESS_APP_KEY no configurado',
        message: 'Las variables de entorno de AliExpress no están configuradas',
        correlationId,
      });
    }

    // Generate state for CSRF protection
    const state = aliExpressService.generateOAuthState();

    // Build AliExpress authorization URL
    const oauthBaseUrl = 'https://oauth.aliexpress.com';
    const oauthHost = 'oauth.aliexpress.com';
    const authUrl = new URL(`${oauthBaseUrl}/authorize`);
    const responseType = 'code';
    const scope = 'api';
    
    authUrl.searchParams.append('response_type', responseType);
    authUrl.searchParams.append('client_id', appKey);
    authUrl.searchParams.append('redirect_uri', encodeURIComponent(callbackUrl));
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', scope); // Required scope by AliExpress

    // Sanitize URL for logging (remove secrets)
    const sanitizedUrl = authUrl.toString()
      .replace(/client_secret=[^&]*/gi, 'client_secret=***')
      .replace(/secret=[^&]*/gi, 'secret=***')
      .replace(/sign=[^&]*/gi, 'sign=***')
      .replace(/token=[^&]*/gi, 'token=***');

    // Mask appKey for logging (show first 4 and last 2 digits)
    const appKeyMasked = appKey.length >= 6 
      ? `${appKey.substring(0, 4)}**${appKey.substring(appKey.length - 2)}`
      : '******';

    // ✅ FASE 1: Log completo con todos los campos requeridos (SECURE - NO SECRETS)
    logger.info('[AliExpress OAuth] Redirect URL generated', {
      correlationId,
      appKeyMasked,
      callbackUrl,
      oauthBaseUrl,
      oauthHost,
      clientId: appKeyMasked,
      clientIdLength: appKey.length,
      redirectUri: callbackUrl,
      scope,
      responseType,
      state: state.substring(0, 8) + '...', // Show first 8 chars only
      baseUrl,
      authUrlSanitized: sanitizedUrl,
      envSource: env.ALIEXPRESS_APP_KEY ? 'env.ts' : 'process.env',
    });

    // ✅ LOG OBLIGATORIO: Antes de redirect
    console.log('[ALIEXPRESS-OAUTH] Redirecting to AliExpress');
    console.log('[ALIEXPRESS-OAUTH] Redirect URL:', sanitizedUrl);
    console.log('[ALIEXPRESS-OAUTH] Status: 302 (redirect)');
    console.log('[ALIEXPRESS-OAUTH] ════════════════════════════════════════════════════════');

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
 * Endpoint DEBUG para verificar configuración OAuth (solo admin en producción)
 * GET /api/aliexpress/oauth-debug
 * 
 * Requiere header X-Debug-Key si NODE_ENV === 'production'
 */
export const oauthDebug = async (req: Request, res: Response) => {
  try {
    const isProduction = env.NODE_ENV === 'production';
    const debugKey = req.headers['x-debug-key'] as string;
    const expectedDebugKey = env.DEBUG_KEY || process.env.DEBUG_KEY;

    // En producción, verificar debug key
    if (isProduction) {
      if (!expectedDebugKey) {
        logger.warn('[AliExpress] OAuth debug endpoint accessed in production but DEBUG_KEY not configured');
        return res.status(403).json({
          success: false,
          error: 'Debug endpoint disabled',
          message: 'DEBUG_KEY no está configurado en producción',
        });
      }

      if (!debugKey || debugKey !== expectedDebugKey) {
        logger.warn('[AliExpress] OAuth debug endpoint accessed with invalid key', {
          hasKey: !!debugKey,
          keyLength: debugKey?.length || 0,
        });
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'Header X-Debug-Key requerido y válido en producción',
        });
      }
    }

    // Check process.env directly (before Zod parsing)
    const rawAppKey = process.env.ALIEXPRESS_APP_KEY;
    const rawAppSecret = process.env.ALIEXPRESS_APP_SECRET;
    const rawCallbackUrl = process.env.ALIEXPRESS_CALLBACK_URL;
    
    // ✅ FASE 1: Use process.env directly if env object doesn't have it, with trim
    const appKey = (env.ALIEXPRESS_APP_KEY || rawAppKey || '').trim();
    const appSecret = (env.ALIEXPRESS_APP_SECRET || rawAppSecret || '').trim();
    const callbackUrl = (env.ALIEXPRESS_CALLBACK_URL || rawCallbackUrl || 'https://www.ivanreseller.com/api/aliexpress/callback').trim();
    
    // ✅ FASE 1: Mask appKey for response (show first 4 and last 2 digits)
    const appKeyMasked = appKey.length >= 6 
      ? `${appKey.substring(0, 4)}**${appKey.substring(appKey.length - 2)}`
      : '******';

    // Build sanitized OAuth URL
    const oauthBaseUrl = 'https://oauth.aliexpress.com';
    const oauthHost = 'oauth.aliexpress.com';
    const authUrl = new URL(`${oauthBaseUrl}/authorize`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', appKey);
    authUrl.searchParams.append('redirect_uri', encodeURIComponent(callbackUrl));
    authUrl.searchParams.append('state', 'debug-state');
    authUrl.searchParams.append('scope', 'api');

    // Sanitize URL (remove sensitive data)
    const sanitizedUrl = authUrl.toString()
      .replace(/client_secret=[^&]*/gi, 'client_secret=***')
      .replace(/secret=[^&]*/gi, 'secret=***')
      .replace(/sign=[^&]*/gi, 'sign=***')
      .replace(/token=[^&]*/gi, 'token=***');

    logger.info('[AliExpress] OAuth debug endpoint accessed', {
      isProduction,
      hasAppKey: !!appKey && appKey.trim().length > 0,
      hasAppSecret: !!appSecret && appSecret.trim().length > 0,
      appKeyLength: appKey ? appKey.length : 0,
      envSource: env.ALIEXPRESS_APP_KEY ? 'env.ts' : 'process.env',
      oauthHost,
    });

    return res.status(200).json({
      success: true,
      data: {
        appKeyMasked,
        appKeyLength: appKey ? appKey.length : 0,
        hasAppKey: !!appKey && appKey.trim().length > 0,
        hasAppSecret: !!appSecret && appSecret.trim().length > 0,
        callbackUrl,
        envSource: env.ALIEXPRESS_APP_KEY ? 'env.ts' : 'process.env',
        oauthBaseUrl,
        oauthHost,
        oauthAuthorizeUrlSanitized: sanitizedUrl,
        environment: env.NODE_ENV,
      },
    });
  } catch (error: any) {
    logger.error('[AliExpress] Error en OAuth debug endpoint', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al obtener información de debug OAuth',
      message: error.message,
    });
  }
};

/**
 * Endpoint protegido para obtener información de la URL de OAuth redirect
 * GET /api/aliexpress/oauth-redirect-url
 * 
 * Requiere header X-Debug-Key si NODE_ENV === 'production'
 * Retorna información de la URL de OAuth sin revelar secretos
 */
export const getOAuthRedirectUrl = async (req: Request, res: Response) => {
  try {
    const isProduction = env.NODE_ENV === 'production';
    const debugKey = req.headers['x-debug-key'] as string;
    const expectedDebugKey = env.DEBUG_KEY || process.env.DEBUG_KEY;

    // En producción, verificar debug key
    if (isProduction) {
      if (!expectedDebugKey) {
        logger.warn('[AliExpress] OAuth redirect URL endpoint accessed in production but DEBUG_KEY not configured');
        return res.status(403).json({
          success: false,
          error: 'Debug endpoint disabled',
          message: 'DEBUG_KEY no está configurado en producción',
        });
      }

      if (!debugKey || debugKey !== expectedDebugKey) {
        logger.warn('[AliExpress] OAuth redirect URL endpoint accessed with invalid key', {
          hasKey: !!debugKey,
          keyLength: debugKey?.length || 0,
        });
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'Header X-Debug-Key requerido y válido en producción',
        });
      }
    }

    // Check process.env directly (before Zod parsing)
    const rawAppKey = process.env.ALIEXPRESS_APP_KEY;
    const rawCallbackUrl = process.env.ALIEXPRESS_CALLBACK_URL;
    
    // Use process.env directly if env object doesn't have it, with trim
    const appKey = (env.ALIEXPRESS_APP_KEY || rawAppKey || '').trim();
    const callbackUrl = (env.ALIEXPRESS_CALLBACK_URL || rawCallbackUrl || 'https://www.ivanreseller.com/api/aliexpress/callback').trim();
    
    // Build OAuth URL info
    const oauthBaseUrl = 'https://oauth.aliexpress.com';
    const scope = 'api';
    
    // Mask appKey for response (show first 4 and last 2 digits)
    const appKeyMasked = appKey.length >= 6 
      ? `${appKey.substring(0, 4)}**${appKey.substring(appKey.length - 2)}`
      : '******';
    
    // Extract last 4 digits for validation
    const clientIdTail = appKey.length >= 4 
      ? appKey.substring(appKey.length - 4)
      : '****';

    // Generate a sample state to show length
    const sampleState = aliExpressService.generateOAuthState();
    const stateLength = sampleState.length;

    logger.info('[AliExpress] OAuth redirect URL endpoint accessed', {
      isProduction,
      hasAppKey: !!appKey && appKey.trim().length > 0,
      appKeyLength: appKey ? appKey.length : 0,
      envSource: env.ALIEXPRESS_APP_KEY ? 'env.ts' : 'process.env',
    });

    return res.status(200).json({
      success: true,
      data: {
        oauthBaseUrl,
        clientIdMasked: appKeyMasked,
        clientIdTail,
        redirectUri: callbackUrl,
        scope,
        stateLength,
      },
    });
  } catch (error: any) {
    logger.error('[AliExpress] Error en OAuth redirect URL endpoint', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al obtener información de OAuth redirect URL',
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
  // Generate correlation ID for debugging
  const correlationId = req.headers['x-correlation-id'] as string || 
                       `test-link-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    const { productId } = req.query;

    // Check process.env directly (before Zod parsing)
    const rawAppKey = process.env.ALIEXPRESS_APP_KEY;
    const rawAppSecret = process.env.ALIEXPRESS_APP_SECRET;
    
    // Log direct process.env presence (safe - no values)
    console.log('[AliExpress] Test link - ALIEXPRESS_APP_KEY present:', !!rawAppKey);
    console.log('[AliExpress] Test link - ALIEXPRESS_APP_SECRET present:', !!rawAppSecret);
    
    // Use process.env directly if env object doesn't have it
    const appKey = env.ALIEXPRESS_APP_KEY || rawAppKey || '';
    const appSecret = env.ALIEXPRESS_APP_SECRET || rawAppSecret || '';
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // Log safe debug info
    const hasAppKey = !!appKey && appKey.trim().length > 0;
    const hasAppSecret = !!appSecret && appSecret.trim().length > 0;
    
    logger.info('[AliExpress] Test link request', {
      correlationId,
      productId,
      hasAppKey,
      hasAppSecret,
      baseUrl,
      queryParams: Object.keys(req.query),
      appKeyLength: appKey ? appKey.length : 0,
      appSecretLength: appSecret ? appSecret.length : 0,
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
    if (!hasAppKey || !hasAppSecret) {
      logger.error('[AliExpress] Test link failed: missing env vars', {
        correlationId,
        hasAppKey,
        hasAppSecret,
        rawAppKeyPresent: !!rawAppKey,
        rawAppSecretPresent: !!rawAppSecret,
        envAppKeyPresent: !!env.ALIEXPRESS_APP_KEY,
        envAppSecretPresent: !!env.ALIEXPRESS_APP_SECRET,
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

