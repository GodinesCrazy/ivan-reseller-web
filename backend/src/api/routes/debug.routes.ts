/**
 * Debug Routes
 * 
 * Endpoints de debugging para probar APIs directamente sin pasar por toda la lógica
 * de oportunidades y scraping.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { AliExpressAffiliateAPIService } from '../../services/aliexpress-affiliate-api.service';
import { CredentialsManager } from '../../services/credentials-manager.service';
import { resolveEnvironment } from '../../utils/environment-resolver';
import { getBuildInfo } from '../../middleware/version-header.middleware';
import logger from '../../config/logger';

const router = Router();

/**
 * ✅ P0: GET /api/debug/ping
 * Endpoint simple para probar routing en Railway
 * Responde 200 siempre sin depender de nada
 * NO requiere autenticación
 */
router.get('/ping', (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || `ping-${Date.now()}`;
  // ✅ P0: Request logging para /api/debug/ping
  console.log(`[PING] ${req.method} ${req.path} from ${req.ip || req.socket.remoteAddress || 'unknown'} correlationId=${correlationId}`);
  try {
    res.setHeader('X-Correlation-Id', correlationId);
    res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      correlationId,
    });
  } catch (error: any) {
    // Even on error, respond 200 to indicate process is alive
    const errorCorrelationId = correlationId || `ping-error-${Date.now()}`;
    res.setHeader('X-Correlation-Id', errorCorrelationId);
    res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      correlationId: errorCorrelationId,
      error: error?.message || 'Unknown error',
    });
  }
});

/**
 * ✅ P0: GET /api/debug/build-info
 * Endpoint ultra mínimo para diagnóstico de 502 - diferencia Vercel proxy issue vs Railway container restart vs backend crash
 * NO requiere autenticación
 * NO depende de DB/Redis
 */
router.get('/build-info', (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || `build-info-${Date.now()}`;
  // ✅ P0: Request logging para /api/debug/build-info
  console.log(`[BUILD-INFO] ${req.method} ${req.path} from ${req.ip || req.socket.remoteAddress || 'unknown'} correlationId=${correlationId}`);
  
  try {
    const buildInfo = getBuildInfo();
    const env = require('../../config/env').default;
    const safeBoot = env.SAFE_BOOT ?? (process.env.NODE_ENV === 'production');
    const port = Number(process.env.PORT || env.PORT || 3000);
    
    res.setHeader('X-Correlation-Id', correlationId);
    res.status(200).json({
      ok: true,
      gitSha: buildInfo.gitSha,
      buildTime: buildInfo.buildTime,
      node: buildInfo.nodeVersion,
      pid: process.pid,
      uptime: process.uptime(),
      safeBoot,
      port,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  } catch (error: any) {
    // Even on error, respond 200 to indicate process is alive
    const safeBoot = process.env.SAFE_BOOT === 'true' || (process.env.SAFE_BOOT !== 'false' && process.env.NODE_ENV === 'production');
    const port = Number(process.env.PORT || 3000);
    const errorCorrelationId = `build-info-error-${Date.now()}`;
    
    res.setHeader('X-Correlation-Id', errorCorrelationId);
    res.status(200).json({
      ok: true,
      gitSha: (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown').toString().substring(0, 7),
      buildTime: process.env.BUILD_TIME || process.env.RAILWAY_BUILD_TIME || new Date().toISOString(),
      node: process.version,
      pid: process.pid,
      uptime: process.uptime(),
      safeBoot,
      port,
      timestamp: new Date().toISOString(),
      correlationId: errorCorrelationId,
      error: error?.message || 'Unknown error',
    });
  }
});

/**
 * ✅ FIX STABILITY: GET /api/debug/auth-status-crash-safe
 * Endpoint de diagnóstico que responde 200 siempre sin depender de nada más
 * Útil para detectar si el backend está vivo aunque otros endpoints fallen
 * NO requiere autenticación para poder usarse como healthcheck
 */
router.get('/auth-status-crash-safe', async (_req: Request, res: Response) => {
  try {
    const memory = process.memoryUsage();
    const uptime = process.uptime();
    
    res.status(200).json({
      ok: true,
      pid: process.pid,
      uptime: Math.round(uptime),
      uptimeFormatted: `${Math.round(uptime / 60)}m ${Math.round(uptime % 60)}s`,
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
        unit: 'MB',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // ✅ FIX STABILITY: Incluso si hay error, responder 200 para indicar que el proceso está vivo
    res.status(200).json({
      ok: true,
      pid: process.pid,
      uptime: process.uptime(),
      error: error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * ✅ FIX AUTH: GET /api/debug/login-smoke
 * Endpoint temporal para probar login automático y verificar emisión de cookies
 * NO requiere autenticación - hace login automático con admin/admin123
 */
router.get('/login-smoke', async (req: Request, res: Response) => {
  try {
    const { authService } = await import('../../services/auth.service');
    const correlationId = (req as any).correlationId || 'unknown';
    
    // Hacer login automático
    const result = await authService.login('admin', 'admin123');
    
    // Configurar cookies igual que en /api/auth/login
    const isProduction = process.env.NODE_ENV === 'production';
    const requestProtocol = req.protocol || (req.headers['x-forwarded-proto'] as string) || 'http';
    const isHttps = requestProtocol === 'https';
    
    const cookieOptions: any = {
      httpOnly: true,
      secure: isProduction ? true : isHttps,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge: 60 * 60 * 1000,
      path: '/',
    };
    
    // NO establecer domain en producción (permite cross-domain)
    
    // Establecer cookies
    res.cookie('token', result.token, cookieOptions);
    res.cookie('refreshToken', result.refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    
    // Obtener headers Set-Cookie
    const setCookieHeaders = res.getHeader('Set-Cookie');
    const cookieHeaderArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : (setCookieHeaders ? [String(setCookieHeaders)] : []);
    const tokenCookieHeader = cookieHeaderArray.find(h => h.includes('token='));
    
    res.json({
      ok: true,
      hasSetCookie: !!setCookieHeaders && cookieHeaderArray.length > 0,
      cookiePreview: tokenCookieHeader ? tokenCookieHeader.substring(0, 100) + '...' : null,
      cookieHeaders: cookieHeaderArray,
      correlationId,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      hasDomain: !!cookieOptions.domain,
      isProduction,
    });
  } catch (error: any) {
    const correlationId = (req as any).correlationId || 'unknown';
    logger.error('[Debug Login Smoke] Error', {
      correlationId,
      error: error?.message || String(error),
    });
    
    res.status(500).json({
      ok: false,
      error: error?.message || 'Login failed',
      correlationId,
    });
  }
});

/**
 * GET /api/debug/echo-json
 * Endpoint diagnóstico para inspeccionar parsing de JSON body
 * No expone valores sensibles (password, tokens, etc.)
 */
router.post('/echo-json', (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || 'unknown';
  
  // Extraer keys del body sin valores sensibles
  const bodyKeys = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? Object.keys(req.body)
    : [];
  
  // Detectar si hay campos sensibles
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential', 'auth'];
  const hasSensitiveFields = bodyKeys.some(key => 
    sensitiveFields.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))
  );
  
  res.json({
    ok: true,
    correlationId,
    contentType: req.headers['content-type'] || 'not set',
    contentLength: req.headers['content-length'] || 'not set',
    bodyType: req.body ? typeof req.body : 'undefined',
    isArray: Array.isArray(req.body),
    isObject: req.body && typeof req.body === 'object' && !Array.isArray(req.body),
    bodyKeys: hasSensitiveFields ? bodyKeys.map(k => k + ' (redacted)') : bodyKeys,
    bodyKeyCount: bodyKeys.length,
    hasSensitiveFields,
    timestamp: new Date().toISOString(),
  });
});

/**
 * ✅ FIX OAUTH: GET /api/debug/aliexpress-dropshipping-credentials
 * Endpoint para verificar credenciales guardadas de AliExpress Dropshipping
 * Requiere autenticación
 */
router.get('/aliexpress-dropshipping-credentials', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'User ID not found',
      });
    }

    const { CredentialsManager } = await import('../../services/credentials-manager.service');
    const correlationId = (req as any).correlationId || 'unknown';
    
    // Obtener credenciales de ambos ambientes
    const [credProd, credSandbox] = await Promise.all([
      CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production'),
      CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox'),
    ]);

    const formatCredentials = (cred: any, env: string) => {
      if (!cred) {
        return {
          environment: env,
          hasAccessToken: false,
          hasRefreshToken: false,
          configured: false,
        };
      }

      const accessToken = cred.accessToken || cred.ACCESS_TOKEN || null;
      const refreshToken = cred.refreshToken || cred.REFRESH_TOKEN || null;
      
      // NO devolver tokens completos, solo preview (últimos 4 caracteres o hash)
      const accessTokenLast4 = accessToken && accessToken.length >= 4 
        ? accessToken.substring(accessToken.length - 4) 
        : null;
      const refreshTokenLast4 = refreshToken && refreshToken.length >= 4
        ? refreshToken.substring(refreshToken.length - 4)
        : null;

      return {
        environment: env,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenLast4: accessTokenLast4 || null,
        refreshTokenLast4: refreshTokenLast4 || null,
        expiresAt: cred.accessTokenExpiresAt || cred.ACCESS_TOKEN_EXPIRES_AT || null,
        refreshExpiresAt: cred.refreshTokenExpiresAt || cred.REFRESH_TOKEN_EXPIRES_AT || null,
        updatedAt: cred.updatedAt || null,
        apiName: 'aliexpress-dropshipping',
        configured: !!accessToken,
      };
    };

    const prodInfo = formatCredentials(credProd, 'production');
    const sandboxInfo = formatCredentials(credSandbox, 'sandbox');

    res.json({
      ok: true,
      correlationId,
      userId,
      credentials: {
        production: prodInfo,
        sandbox: sandboxInfo,
      },
      summary: {
        hasProductionToken: prodInfo.hasAccessToken,
        hasSandboxToken: sandboxInfo.hasAccessToken,
        anyConfigured: prodInfo.configured || sandboxInfo.configured,
      },
    });
  } catch (error: any) {
    const correlationId = (req as any).correlationId || 'unknown';
    logger.error('[Debug AliExpress Dropshipping Credentials] Error', {
      correlationId,
      error: error?.message || String(error),
      stack: error?.stack?.substring(0, 500),
    });
    
    res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to retrieve credentials',
      correlationId,
    });
  }
});

// Require authentication for other endpoints
router.use(authenticate);

/**
 * GET /debug/aliexpress/test-search
 * 
 * Prueba directa de la AliExpress Affiliate API sin pasar por scraping
 * 
 * Query params:
 * - query (required): Término de búsqueda
 * - userId (optional): ID del usuario (default: usuario autenticado)
 * - environment (optional): sandbox | production
 */
router.get('/aliexpress/test-search', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId || Number(req.query.userId);
    if (!userId || userId <= 0) {
      return res.status(401).json({ 
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'User ID is required' 
      });
    }

    const query = String(req.query.query || 'test');
    const environment = req.query.environment as 'sandbox' | 'production' | undefined;

    logger.info('[DEBUG-API] Test search requested', {
      userId,
      query,
      environment: environment || 'auto'
    });

    // Resolver ambiente
    const preferredEnvironment = await resolveEnvironment({
      explicit: environment,
      userId,
      default: 'production'
    });

    // Buscar credenciales en ambos ambientes
    const environmentsToTry: Array<'sandbox' | 'production'> = [preferredEnvironment];
    environmentsToTry.push(preferredEnvironment === 'production' ? 'sandbox' : 'production');

    let affiliateCreds: any = null;
    let resolvedEnv: 'sandbox' | 'production' | null = null;

    for (const env of environmentsToTry) {
      try {
        logger.debug('[DEBUG-API] Checking credentials', { environment: env, userId });
        
        const creds = await CredentialsManager.getCredentials(
          userId,
          'aliexpress-affiliate',
          env
        );

        if (creds) {
          creds.sandbox = env === 'sandbox';
          affiliateCreds = creds;
          resolvedEnv = env;
          logger.info('[DEBUG-API] Credentials found', {
            environment: env,
            appKey: creds.appKey ? `${creds.appKey.substring(0, 6)}...` : 'missing'
          });
          break;
        }
      } catch (credError: any) {
        logger.warn('[DEBUG-API] Error checking credentials', {
          environment: env,
          error: credError?.message || String(credError)
        });
      }
    }

    if (!affiliateCreds) {
      return res.status(400).json({
        status: 'error',
        code: 'NO_CREDENTIALS',
        message: 'AliExpress Affiliate API credentials not found',
        recommendation: 'Configure credentials in Settings → API Settings → AliExpress Affiliate API',
        environmentsChecked: environmentsToTry
      });
    }

    // Inicializar servicio de API
    const apiService = new AliExpressAffiliateAPIService();
    apiService.setCredentials(affiliateCreds);

    const startTime = Date.now();

    try {
      logger.info('[DEBUG-API] Calling AliExpress Affiliate API', {
        userId,
        query,
        environment: resolvedEnv
      });

      const products = await apiService.searchProducts({
        keywords: query,
        pageSize: 5,
        targetCurrency: 'USD',
        targetLanguage: 'ES',
        shipToCountry: 'CL',
        sort: 'LAST_VOLUME_DESC',
      });

      const duration = Date.now() - startTime;

      logger.info('[DEBUG-API] API call successful', {
        productsFound: products.length,
        duration: `${duration}ms`
      });

      return res.json({
        status: 'ok',
        items: products.length,
        duration: `${duration}ms`,
        environment: resolvedEnv,
        firstProduct: products[0] ? {
          title: products[0].productTitle?.substring(0, 100),
          price: products[0].salePrice,
          currency: products[0].currency,
          productId: products[0].productId,
          hasImages: !!(products[0].productMainImageUrl || products[0].productSmallImageUrls?.length)
        } : null,
        allProducts: products.map(p => ({
          productId: p.productId,
          title: p.productTitle?.substring(0, 80),
          price: p.salePrice,
          currency: p.currency
        }))
      });

    } catch (apiError: any) {
      const duration = Date.now() - startTime;
      const errorMessage = apiError?.message || String(apiError);
      
      logger.error('[DEBUG-API] API call failed', {
        error: errorMessage,
        duration: `${duration}ms`,
        stack: apiError?.stack?.substring(0, 500)
      });

      // Determinar tipo de error
      let code = 'API_ERROR';
      let httpStatus = 500;

      if (errorMessage.includes('timeout')) {
        code = 'TIMEOUT';
        httpStatus = 504;
      } else if (errorMessage.includes('authentication') || errorMessage.includes('401') || errorMessage.includes('403')) {
        code = 'AUTH_ERROR';
        httpStatus = 401;
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        code = 'RATE_LIMIT';
        httpStatus = 429;
      } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        code = 'NETWORK_ERROR';
        httpStatus = 503;
      }

      return res.status(httpStatus).json({
        status: 'error',
        code,
        message: errorMessage,
        duration: `${duration}ms`,
        recommendation: code === 'AUTH_ERROR' 
          ? 'Verify credentials in Settings → API Settings'
          : code === 'NETWORK_ERROR'
          ? 'Check network connectivity to AliExpress API'
          : 'Check logs for details'
      });
    }

  } catch (error: any) {
    logger.error('[DEBUG-API] Unexpected error', {
      error: error?.message || String(error),
      stack: error?.stack
    });

    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: error?.message || 'Internal server error'
    });
  }
});

export default router;

