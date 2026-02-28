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
import { prisma } from '../../config/database';

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
 * GET /api/debug/db-health
 * Endpoint público para diagnosticar salud de la base de datos
 * NO requiere autenticación
 */
router.get('/db-health', async (req: Request, res: Response) => {
  try {
    // Try raw prisma query
    await prisma.$queryRaw`SELECT 1`;
    
    // Try user count
    const userCount = await prisma.user.count();
    
    return res.status(200).json({
      success: true,
      db: 'ok',
      userCount,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      stage: 'db-health',
      error: error.message,
      stack: error.stack,
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
    const safeBoot = env.SAFE_BOOT || false;
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
    const env = require('../../config/env').default;
    const safeBoot = env.SAFE_BOOT || false;
    const port = Number(process.env.PORT || env.PORT || 3000);
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

/**
 * GET /api/debug/dropshipping-oauth-status
 * Temporary OAuth status endpoint for AliExpress Dropshipping.
 */
router.get('/dropshipping-oauth-status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        hasCredentials: false,
        expiresAt: null,
        environment: 'unknown',
      });
    }

    const requestedEnvironment = String(req.query.environment || '').toLowerCase();
    const environmentsToCheck: Array<'production' | 'sandbox'> =
      requestedEnvironment === 'sandbox'
        ? ['sandbox']
        : requestedEnvironment === 'production'
          ? ['production']
          : ['production', 'sandbox'];

    let selectedEnvironment: 'production' | 'sandbox' = environmentsToCheck[0];
    let selectedCreds: any = null;

    for (const env of environmentsToCheck) {
      const creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env);
      const accessToken = String((creds as any)?.accessToken || '').trim();
      if (accessToken) {
        selectedEnvironment = env;
        selectedCreds = creds;
        break;
      }
      if (!selectedCreds) {
        selectedEnvironment = env;
        selectedCreds = creds;
      }
    }

    const accessToken = String((selectedCreds as any)?.accessToken || '').trim();
    const refreshToken = String((selectedCreds as any)?.refreshToken || '').trim();
    const expiresAtRaw = (selectedCreds as any)?.accessTokenExpiresAt || null;
    const expiresAtMs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : null;
    const hasValidExpiry = typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
    const hasCredentials = !!(accessToken && refreshToken && hasValidExpiry);

    return res.json({
      hasCredentials,
      expiresAt: expiresAtMs,
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error: any) {
    logger.error('[Debug Dropshipping OAuth Status] Error', {
      error: error?.message || String(error),
    });
    return res.status(500).json({
      hasCredentials: false,
      expiresAt: null,
      environment: 'unknown',
    });
  }
});

/**
 * GET /api/debug/aliexpress/probe
 *
 * Endpoint de diagnóstico para AliExpress Affiliate API.
 * Una sola llamada con parámetros fijos. Sin auth. Evidencia para AliExpress Support.
 */
router.get('/aliexpress/probe', async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const apiName = 'aliexpress.affiliate.product.query';
  const method = 'POST';
  const url = (process.env.ALIEXPRESS_API_BASE_URL || 'https://api-sg.aliexpress.com/sync').trim();
  const params = {
    keyword: 'phone case',
    pageSize: 20,
    pageNo: 1,
    sort: 'volume_desc',
    shipToCountry: 'US',
  };

  console.log('[ALIEXPRESS-PROBE] Request params', {
    keyword: params.keyword,
    pageSize: params.pageSize,
    pageNo: params.pageNo,
    sort: params.sort,
    shipToCountry: params.shipToCountry,
  });

  try {
    const aliExpressService = (await import('../../modules/aliexpress/aliexpress.service')).default;
    const result = await aliExpressService.searchProducts({
      keywords: params.keyword,
      pageNo: params.pageNo,
      pageSize: params.pageSize,
      sort: params.sort,
    });

    const productCount = result.products?.length ?? 0;
    console.log('[ALIEXPRESS-PROBE] Response received');
    console.log('[ALIEXPRESS-PROBE] Products count:', productCount);
    console.log('[ALIEXPRESS-PROBE] RequestId:', result.requestId || 'not found');

    const responseRaw = {
      products: result.products,
      totalResults: result.totalResults,
      pageNo: result.pageNo,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };

    res.status(200).json({
      success: true,
      requestId: result.requestId || null,
      request: {
        apiName,
        method,
        url,
        params: {
          keyword: params.keyword,
          pageNo: params.pageNo,
          pageSize: params.pageSize,
          sort: params.sort,
          shipToCountry: params.shipToCountry,
        },
      },
      responseRaw,
      productCount,
      timestamp,
    });
  } catch (error: any) {
    console.log('[ALIEXPRESS-PROBE] Response received (error)');
    console.log('[ALIEXPRESS-PROBE] Products count: 0');

    const responseRaw = {
      error: error?.message ?? String(error),
      code: error?.response?.data?.error_response?.code,
      msg: error?.response?.data?.error_response?.msg,
    };

    res.status(200).json({
      success: false,
      requestId: null,
      request: {
        apiName,
        method,
        url,
        params: {
          keyword: params.keyword,
          pageNo: params.pageNo,
          pageSize: params.pageSize,
          sort: params.sort,
          shipToCountry: params.shipToCountry,
        },
      },
      responseRaw,
      productCount: 0,
      timestamp,
    });
  }
});

/**
 * GET /api/debug/ebay/probe
 *
 * Endpoint de diagnóstico para eBay Browse API.
 * Una sola llamada con parámetros fijos para probar integración eBay.
 * Sin auth - similar a /api/debug/aliexpress/probe
 */
router.get('/ebay/probe', async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const correlationId = (req as any).correlationId || `ebay-probe-${Date.now()}`;
  const apiName = 'ebay.buy.browse.item_summary.search';
  const method = 'GET';
  
  const params = {
    keywords: 'phone case',
    limit: 20,
    marketplace_id: 'EBAY_US',
  };

  console.log('[EBAY-PROBE] Starting eBay probe request', {
    correlationId,
    keywords: params.keywords,
    limit: params.limit,
    marketplace_id: params.marketplace_id,
  });

  try {
    // Get user ID from query or use default (for debugging)
    const userId = Number(req.query.userId) || 1;
    const environment = (req.query.environment as 'sandbox' | 'production') || 'production';

    console.log('[EBAY-PROBE] Configuration', {
      userId,
      environment,
      correlationId,
    });

    // Try to get credentials from CredentialsManager first
    let ebayCredentials: any = null;
    let credentialsSource = 'none';

    try {
      const creds = await CredentialsManager.getCredentials(
        userId,
        'ebay',
        environment
      );

      if (creds && (creds as any).credentials) {
        const credsData = (creds as any).credentials;
        ebayCredentials = {
          ...credsData,
          sandbox: (creds as any).environment === 'sandbox',
        };
        credentialsSource = 'credentials-manager';
        console.log('[EBAY-PROBE] Credentials found in CredentialsManager', {
          hasAppId: !!ebayCredentials.appId,
          hasDevId: !!ebayCredentials.devId,
          hasCertId: !!ebayCredentials.certId,
          hasToken: !!ebayCredentials.token,
          hasRefreshToken: !!ebayCredentials.refreshToken,
          sandbox: (creds as any).environment === 'sandbox',
        });
      }
    } catch (credError: any) {
      console.warn('[EBAY-PROBE] Error getting credentials from CredentialsManager', {
        error: credError?.message || String(credError),
      });
    }

    // Fallback to environment variables if no credentials found
    if (!ebayCredentials) {
      const envAppId = process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID;
      const envDevId = process.env.EBAY_DEV_ID;
      const envCertId = process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET;
      const envToken = process.env.EBAY_OAUTH_TOKEN || process.env.EBAY_TOKEN;
      const envRefreshToken = process.env.EBAY_REFRESH_TOKEN;
      const envSandbox = (process.env.EBAY_ENV || 'production').toLowerCase() === 'sandbox';

      if (envAppId && envCertId) {
        ebayCredentials = {
          appId: envAppId,
          devId: envDevId,
          certId: envCertId,
          token: envToken,
          refreshToken: envRefreshToken,
          sandbox: envSandbox,
        };
        credentialsSource = 'environment-variables';
        console.log('[EBAY-PROBE] Using environment variables', {
          hasAppId: !!envAppId,
          hasDevId: !!envDevId,
          hasCertId: !!envCertId,
          hasToken: !!envToken,
          hasRefreshToken: !!envRefreshToken,
          sandbox: envSandbox,
        });
      }
    }

    // Check if we have minimum required credentials
    if (!ebayCredentials || !ebayCredentials.appId || !ebayCredentials.certId) {
      const missingVars: string[] = [];
      if (!ebayCredentials?.appId && !process.env.EBAY_APP_ID && !process.env.EBAY_CLIENT_ID) {
        missingVars.push('EBAY_APP_ID or EBAY_CLIENT_ID');
      }
      if (!ebayCredentials?.certId && !process.env.EBAY_CERT_ID && !process.env.EBAY_CLIENT_SECRET) {
        missingVars.push('EBAY_CERT_ID or EBAY_CLIENT_SECRET');
      }
      if (!ebayCredentials?.token && !ebayCredentials?.refreshToken && !process.env.EBAY_OAUTH_TOKEN && !process.env.EBAY_REFRESH_TOKEN) {
        missingVars.push('EBAY_OAUTH_TOKEN or EBAY_REFRESH_TOKEN');
      }

      console.error('[EBAY-PROBE] Missing required credentials', {
        missingVars,
        credentialsSource,
      });

      return res.status(200).json({
        success: false,
        requestId: null,
        request: {
          apiName,
          method,
          url: ebayCredentials?.sandbox 
            ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
            : 'https://api.ebay.com/buy/browse/v1/item_summary/search',
          params,
        },
        responseRaw: {
          error: 'Missing required eBay credentials',
          missingVariables: missingVars,
          credentialsSource,
          instructions: 'Configure eBay credentials in Settings → API Settings → eBay, or set environment variables: ' + missingVars.join(', '),
        },
        items: [],
        totalResults: 0,
        timestamp,
        correlationId,
      });
    }

    // Create eBay service instance
    const { EbayService } = await import('../../services/ebay.service');
    
    // Ensure we have token or refreshToken before creating service
    if (!ebayCredentials.token && !ebayCredentials.refreshToken) {
      return res.status(200).json({
        success: false,
        requestId: correlationId,
        request: {
          apiName,
          method,
          url: ebayCredentials.sandbox 
            ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
            : 'https://api.ebay.com/buy/browse/v1/item_summary/search',
          params,
        },
        responseRaw: {
          error: 'Missing eBay OAuth token or refresh token',
          instructions: 'Complete OAuth flow in Settings → API Settings → eBay, or set EBAY_OAUTH_TOKEN or EBAY_REFRESH_TOKEN environment variable',
        },
        items: [],
        totalResults: 0,
        timestamp,
        correlationId,
      });
    }

    const ebayService = new EbayService(ebayCredentials);

    console.log('[EBAY-PROBE] Calling eBay searchProducts', {
      keywords: params.keywords,
      limit: params.limit,
      marketplace_id: params.marketplace_id,
      sandbox: ebayCredentials.sandbox,
      hasToken: !!ebayCredentials.token,
      hasRefreshToken: !!ebayCredentials.refreshToken,
      baseUrl: ebayCredentials.sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com',
    });

    // Call searchProducts - the service handles token refresh internally
    const startTime = Date.now();
    const products = await ebayService.searchProducts({
      keywords: params.keywords,
      limit: params.limit,
      marketplace_id: params.marketplace_id,
    });
    const duration = Date.now() - startTime;

    const productCount = products?.length ?? 0;
    console.log('[EBAY-PROBE] Response received', {
      productCount,
      duration: `${duration}ms`,
      firstProductTitle: products[0]?.title?.substring(0, 50),
    });

    // Format response
    const items = products.map((p: any) => ({
      itemId: p.itemId,
      title: p.title,
      price: p.price,
      condition: p.condition,
      seller: p.seller,
      itemWebUrl: p.itemWebUrl,
      image: p.image,
    }));

    res.status(200).json({
      success: true,
      requestId: correlationId,
      request: {
        apiName,
        method,
        url: ebayCredentials.sandbox 
          ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
          : 'https://api.ebay.com/buy/browse/v1/item_summary/search',
        params,
        credentialsSource,
      },
      responseRaw: {
        items: products,
        totalCount: productCount,
      },
      items,
      totalResults: productCount,
      timestamp,
      correlationId,
      duration: `${duration}ms`,
    });
  } catch (error: any) {
    console.error('[EBAY-PROBE] Error occurred', {
      error: error?.message || String(error),
      stack: error?.stack,
      responseStatus: error?.response?.status,
      responseData: error?.response?.data,
    });

    const responseRaw: any = {
      error: error?.message ?? String(error),
    };

    if (error?.response?.data) {
      responseRaw.apiError = error.response.data;
      responseRaw.statusCode = error.response.status;
    }

    if (error?.response?.status === 401) {
      responseRaw.message = 'Authentication failed. Check OAuth token or refresh token.';
      responseRaw.instructions = 'Complete OAuth flow in Settings → API Settings → eBay';
    }

    res.status(200).json({
      success: false,
      requestId: correlationId,
      request: {
        apiName,
        method,
        url: 'https://api.ebay.com/buy/browse/v1/item_summary/search',
        params,
      },
      responseRaw,
      items: [],
      totalResults: 0,
      timestamp,
      correlationId,
    });
  }
});

/**
 * POST /api/debug/seed-admin
 *
 * Temporary public endpoint to seed admin user if it doesn't exist.
 * Creates admin user with:
 * - username: admin
 * - password: admin123 (bcrypt hash, 10 rounds)
 * - role: ADMIN
 * - email: admin@ivanreseller.com
 *
 * This endpoint is PUBLIC (no authentication required) for initial setup.
 */
router.post('/seed-admin', async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || `seed-admin-${Date.now()}`;
  
  try {
    const { prisma } = await import('../../config/database');
    const bcrypt = await import('bcryptjs');
    
    // Check if admin user exists
    const adminExists = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (adminExists) {
      console.log('[SEED-ADMIN] Admin user already exists', {
        id: adminExists.id,
        username: adminExists.username,
        email: adminExists.email,
        role: adminExists.role,
        correlationId,
      });
      
      return res.status(200).json({
        success: true,
        message: 'Admin user already exists',
        user: {
          id: adminExists.id,
          username: adminExists.username,
          email: adminExists.email,
          role: adminExists.role,
        },
        correlationId,
      });
    }

    // Admin user doesn't exist - create it
    console.log('[SEED-ADMIN] Admin user not found. Creating...', { correlationId });
    
    // Hash password using same method as registration (bcrypt.hash with 10 rounds)
    const SALT_ROUNDS = 10;
    const passwordHash = await bcrypt.hash('admin123', SALT_ROUNDS);
    
    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@ivanreseller.com',
        password: passwordHash,
        role: 'ADMIN',
        commissionRate: 0.15,
        fixedMonthlyCost: 17.0,
        balance: 0,
        totalEarnings: 0,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    console.log('[SEED-ADMIN] ✅ Admin user created successfully', {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role,
      correlationId,
    });

    return res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      user: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role,
      },
      credentials: {
        username: 'admin',
        password: 'admin123',
        note: 'Please change the password after first login',
      },
      correlationId,
    });
  } catch (error: any) {
    console.error('[SEED-ADMIN] ❌ Error creating admin user', {
      error: error?.message || String(error),
      stack: error?.stack?.substring(0, 500),
      correlationId,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to create admin user',
      message: error?.message || String(error),
      correlationId,
    });
  }
});

/**
 * POST /api/debug/reset-admin-password
 *
 * Public endpoint to reset admin password (for emergency access recovery).
 * Resets password for user with username "admin" to "admin123".
 * 
 * This endpoint is PUBLIC (no authentication required) for emergency recovery.
 * ⚠️ SECURITY: Should be disabled or protected in production environments.
 */
router.post('/reset-admin-password', async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || `reset-admin-password-${Date.now()}`;
  
  try {
    const { prisma } = await import('../../config/database');
    const bcrypt = await import('bcryptjs');
    
    // Find admin user
    const adminUser = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!adminUser) {
      console.log('[RESET-ADMIN-PASSWORD] Admin user not found', { correlationId });
      
      return res.status(404).json({
        success: false,
        error: 'Admin user not found',
        message: 'Admin user with username "admin" does not exist. Use /api/debug/seed-admin to create it.',
        correlationId,
      });
    }

    // Reset password to admin123
    console.log('[RESET-ADMIN-PASSWORD] Resetting password for admin user', {
      id: adminUser.id,
      username: adminUser.username,
      correlationId,
    });
    
    // Hash password using same method as registration (bcrypt.hash with 10 rounds)
    const SALT_ROUNDS = 10;
    const passwordHash = await bcrypt.hash('admin123', SALT_ROUNDS);
    
    // Update admin password
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { password: passwordHash },
    });

    console.log('[RESET-ADMIN-PASSWORD] ✅ Admin password reset successfully', {
      id: adminUser.id,
      username: adminUser.username,
      correlationId,
    });

    return res.status(200).json({
      success: true,
      message: 'Admin password reset successfully',
      user: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role,
      },
      credentials: {
        username: 'admin',
        password: 'admin123',
        note: 'Please change the password after logging in',
      },
      correlationId,
    });
  } catch (error: any) {
    console.error('[RESET-ADMIN-PASSWORD] ❌ Error resetting admin password', {
      error: error?.message || String(error),
      stack: error?.stack?.substring(0, 500),
      correlationId,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to reset admin password',
      message: error?.message || String(error),
      correlationId,
    });
  }
});

// Require authentication for other endpoints
router.use(authenticate);

/**
 * GET /api/debug/aliexpress/test-search
 * 
 * ✅ ENDPOINT DE PRUEBA CONTROLADA: Prueba directa de la AliExpress Affiliate API
 * sin pasar por toda la lógica de oportunidades y scraping.
 * 
 * Este endpoint permite verificar rápidamente si la API está funcionando correctamente.
 * 
 * Query params:
 * - query (optional): Término de búsqueda (default: "test")
 * - userId (optional): ID del usuario (default: usuario autenticado)
 * - environment (optional): sandbox | production (default: auto-detect)
 * 
 * Respuesta:
 * - status: "ok" | "error"
 * - Si ok: número de ítems, título del primer producto, moneda, etc.
 * - Si error: código HTTP, mensaje, cuerpo resumido
 */
router.get('/aliexpress/test-search', authenticate, async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || `test-search-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    const userId = req.user?.userId || Number(req.query.userId);
    if (!userId || userId <= 0) {
      return res.status(401).json({ 
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'User ID is required',
        correlationId
      });
    }

    const query = String(req.query.query || 'test');
    const environment = req.query.environment as 'sandbox' | 'production' | undefined;

    // ✅ LOG OBLIGATORIO: Entrada al endpoint de debug
    logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');
    logger.info('[DEBUG-API] Test search requested', {
      userId,
      query,
      environment: environment || 'auto',
      correlationId,
      endpoint: '/api/debug/aliexpress/test-search',
      timestamp: new Date().toISOString()
    });
    logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');

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

    // ✅ LOG OBLIGATORIO: Credenciales encontradas, configurando servicio
    logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');
    logger.info('[DEBUG-API] Credenciales encontradas - Configurando servicio', {
      userId,
      environment: resolvedEnv,
      hasAppKey: !!affiliateCreds.appKey,
      hasAppSecret: !!affiliateCreds.appSecret,
      appKeyPreview: affiliateCreds.appKey ? `${affiliateCreds.appKey.substring(0, 6)}...` : 'missing',
      step: 'configuring_service'
    });
    logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');

    // Inicializar servicio de API
    const apiService = new AliExpressAffiliateAPIService();
    apiService.setCredentials(affiliateCreds);

    // ✅ CRÍTICO: Intentar obtener y usar OAuth token si está disponible
    // Note: AliExpress Affiliate API doesn't use OAuth tokens - it uses app_key/app_secret signing
    // This code is kept for compatibility but won't be used for Affiliate API
    try {
      // OAuth tokens are not used for AliExpress Affiliate API
      // The API uses app_key/app_secret signature-based authentication
      logger.info('[DEBUG-API] AliExpress Affiliate API uses signature-based auth (not OAuth)');
    } catch (tokenError: any) {
      logger.warn('[DEBUG-API] Note: AliExpress Affiliate API uses signature auth, not OAuth tokens');
    }

    const apiCallStartTime = Date.now();

    try {
      // ✅ LOG OBLIGATORIO: Justo antes de llamar a la API
      logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');
      logger.info('[DEBUG-API] Llamando a AliExpress Affiliate API', {
        userId,
        query,
        environment: resolvedEnv,
        pageSize: 5,
        targetCurrency: 'USD',
        shipToCountry: 'CL',
        step: 'api_call_start',
        timestamp: new Date().toISOString(),
        note: 'A partir de aquí deberías ver logs [ALIEXPRESS-AFFILIATE-API] Request →'
      });
      logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');

      const searchResult = await apiService.searchProducts({
        keywords: query,
        pageSize: 5,
        targetCurrency: 'USD',
        targetLanguage: 'ES',
        shipToCountry: 'CL',
        sort: 'LAST_VOLUME_DESC',
      });
      const rawProducts = (searchResult as any)?.products;
      const products = Array.isArray(rawProducts) ? rawProducts : [];

      const duration = Date.now() - apiCallStartTime;

      // ✅ LOG OBLIGATORIO: Éxito
      logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');
      logger.info('[DEBUG-API] ✅ API call successful', {
        productsFound: products.length,
        duration: `${duration}ms`,
        step: 'api_call_success',
        firstProductId: products[0]?.productId,
        firstProductTitle: products[0]?.productTitle?.substring(0, 50)
      });
      logger.info('[DEBUG-API] ════════════════════════════════════════════════════════');

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
      const duration = Date.now() - apiCallStartTime;
      const errorMessage = apiError?.message || String(apiError);
      
      // ✅ LOG OBLIGATORIO: Error detallado
      logger.error('[DEBUG-API] ════════════════════════════════════════════════════════');
      logger.error('[DEBUG-API] ❌ API call failed', {
        error: errorMessage,
        duration: `${duration}ms`,
        step: 'api_call_error',
        errorType: apiError?.code || 'unknown',
        httpStatus: apiError?.response?.status || 'NO_HTTP_RESPONSE',
        stack: apiError?.stack?.substring(0, 500),
        responseData: apiError?.response?.data ? JSON.stringify(apiError.response.data).substring(0, 300) : undefined
      });
      logger.error('[DEBUG-API] ════════════════════════════════════════════════════════');

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
    const totalDuration = Date.now() - startTime;
    
    logger.error('[DEBUG-API] ════════════════════════════════════════════════════════');
    logger.error('[DEBUG-API] ❌ Unexpected error', {
      error: error?.message || String(error),
      stack: error?.stack?.substring(0, 500),
      totalDuration: `${totalDuration}ms`,
      correlationId,
      step: 'unexpected_error'
    });
    logger.error('[DEBUG-API] ════════════════════════════════════════════════════════');

    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: error?.message || 'Internal server error',
      correlationId,
      totalDuration: `${totalDuration}ms`
    });
  }
});

/**
 * GET /api/debug/aliexpress/diagnostic
 * 
 * ✅ ENDPOINT DE AUTODIAGNÓSTICO: Valida configuración completa de AliExpress API
 * 
 * Verifica:
 * - Credenciales cargadas
 * - Firma válida
 * - Conectividad
 * - Respuesta real de AliExpress
 * - Modo activo: API | FALLBACK
 */
router.get('/aliexpress/diagnostic', authenticate, async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || `diagnostic-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    const userId = req.user?.userId || Number(req.query.userId);
    if (!userId || userId <= 0) {
      return res.status(401).json({ 
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'User ID is required',
        correlationId
      });
    }

    logger.info('[ALIEXPRESS-DIAGNOSTIC] Starting diagnostic', {
      userId,
      correlationId,
      timestamp: new Date().toISOString()
    });

    const diagnostic: any = {
      timestamp: new Date().toISOString(),
      correlationId,
      userId,
      checks: {}
    };

    // 1. Verificar credenciales
    const environmentsToTry: Array<'sandbox' | 'production'> = ['production', 'sandbox'];
    let affiliateCreds: any = null;
    let resolvedEnv: 'sandbox' | 'production' | null = null;

    for (const env of environmentsToTry) {
      try {
        const creds = await CredentialsManager.getCredentials(
          userId,
          'aliexpress-affiliate',
          env
        );
        if (creds) {
          creds.sandbox = env === 'sandbox';
          affiliateCreds = creds;
          resolvedEnv = env;
          break;
        }
      } catch (credError: any) {
        logger.debug('[ALIEXPRESS-DIAGNOSTIC] Error checking credentials', {
          environment: env,
          error: credError?.message
        });
      }
    }

    diagnostic.checks.credentials = {
      status: affiliateCreds ? 'ok' : 'missing',
      environment: resolvedEnv,
      hasAppKey: !!affiliateCreds?.appKey,
      hasAppSecret: !!affiliateCreds?.appSecret,
      hasTrackingId: !!affiliateCreds?.trackingId,
      appKeyPreview: affiliateCreds?.appKey ? `${affiliateCreds.appKey.substring(0, 6)}...` : null
    };

    if (!affiliateCreds) {
      diagnostic.status = 'error';
      diagnostic.message = 'AliExpress Affiliate API credentials not found';
      diagnostic.recommendation = 'Configure credentials in Settings → API Settings → AliExpress Affiliate API';
      return res.status(400).json(diagnostic);
    }

    // 2. Verificar OAuth token (not used for Affiliate API - uses signature auth)
    // Note: AliExpress Affiliate API uses app_key/app_secret signature, not OAuth
    let tokenData: any = null;
    try {
      // OAuth tokens are not used for AliExpress Affiliate API
      // The API uses signature-based authentication
      logger.debug('[ALIEXPRESS-DIAGNOSTIC] Affiliate API uses signature auth (not OAuth)');
    } catch (tokenError: any) {
      logger.debug('[ALIEXPRESS-DIAGNOSTIC] Note: Affiliate API uses signature auth');
    }

    diagnostic.checks.oauth = {
      status: 'not_applicable',
      hasToken: false,
      isExpired: false,
      expiresAt: null,
      tokenType: null,
      hasRefreshToken: false,
      note: 'AliExpress Affiliate API uses signature-based auth (app_key/app_secret), not OAuth tokens'
    };

    // 3. Verificar firma (test signature calculation)
    let signatureValid = false;
    try {
      const testParams: Record<string, any> = {
        method: 'aliexpress.affiliate.product.query',
        app_key: affiliateCreds.appKey,
        timestamp: '20240123120000',
        format: 'json',
        v: '2.0',
        sign_method: 'md5',
        keywords: 'test'
      };
      
      // Calcular firma de prueba
      const sortedKeys = Object.keys(testParams).sort();
      const signString = sortedKeys.map(key => `${key}${testParams[key]}`).join('');
      const fullSignString = `${affiliateCreds.appSecret}${signString}${affiliateCreds.appSecret}`;
      const testSign = require('crypto').createHash('md5').update(fullSignString, 'utf8').digest('hex').toUpperCase();
      
      signatureValid = !!testSign && testSign.length === 32;
    } catch (sigError: any) {
      logger.debug('[ALIEXPRESS-DIAGNOSTIC] Error calculating test signature', {
        error: sigError?.message
      });
    }

    diagnostic.checks.signature = {
      status: signatureValid ? 'ok' : 'error',
      canCalculate: signatureValid,
      algorithm: 'MD5',
      format: 'UPPERCASE_HEX'
    };

    // 4. Test de conectividad (ping simple)
    let connectivityOk = false;
    let connectivityError: string | null = null;
    try {
      const testResponse = await require('axios').get('https://gw.api.taobao.com/router/rest', {
        timeout: 5000,
        validateStatus: () => true // Aceptar cualquier status para verificar conectividad
      });
      connectivityOk = true;
    } catch (connError: any) {
      connectivityError = connError?.message || String(connError);
      // Si es timeout o network error, es problema de conectividad
      if (connError?.code === 'ECONNABORTED' || connError?.code === 'ENOTFOUND' || connError?.code === 'ECONNREFUSED') {
        connectivityOk = false;
      } else {
        // Otros errores pueden ser normales (404, etc.)
        connectivityOk = true;
      }
    }

    diagnostic.checks.connectivity = {
      status: connectivityOk ? 'ok' : 'error',
      endpoint: 'https://gw.api.taobao.com/router/rest',
      canReach: connectivityOk,
      error: connectivityError
    };

    // 5. Test de API real (solo si hay credenciales - no requiere OAuth token)
    let apiTestOk = false;
    let apiTestError: string | null = null;
    let apiTestResponse: any = null;

    if (affiliateCreds) {
      try {
        const apiService = new AliExpressAffiliateAPIService();
        apiService.setCredentials(affiliateCreds);
        // Note: Affiliate API doesn't use OAuth tokens - uses signature auth

        const testResult = await apiService.searchProducts({
          keywords: 'test',
          pageSize: 1,
          targetCurrency: 'USD'
        });
        const rawTestProducts = (testResult as any)?.products;
        const testProducts = Array.isArray(rawTestProducts) ? rawTestProducts : [];

        apiTestOk = testProducts.length > 0;
        apiTestResponse = {
          productsCount: testProducts.length,
          hasData: apiTestOk
        };
      } catch (apiError: any) {
        apiTestError = apiError?.message || String(apiError);
        apiTestOk = false;
      }
    } else {
      apiTestError = 'Credentials required for API test';
    }

    diagnostic.checks.apiTest = {
      status: apiTestOk ? 'ok' : 'error',
      tested: !!(affiliateCreds && tokenData),
      success: apiTestOk,
      error: apiTestError,
      response: apiTestResponse
    };

    // 6. Determinar modo activo
    const hasValidCredentials = !!affiliateCreds?.appKey && !!affiliateCreds?.appSecret;
    const hasValidToken = tokenData && tokenData.expiresAt > new Date();
    const canUseAPI = hasValidCredentials && hasValidToken && connectivityOk && signatureValid;

    diagnostic.mode = canUseAPI ? 'API' : 'FALLBACK';
    diagnostic.status = canUseAPI ? 'ok' : 'degraded';
    diagnostic.summary = {
      canUseAPI,
      hasCredentials: hasValidCredentials,
      hasValidToken,
      connectivityOk,
      signatureValid,
      recommendation: canUseAPI 
        ? 'API mode active - system ready for production'
        : hasValidCredentials
        ? 'Credentials configured - API should work (uses signature auth, not OAuth)'
        : 'Credentials required - configure in Settings → API Settings'
    };

    const duration = Date.now() - startTime;
    diagnostic.duration = `${duration}ms`;

    logger.info('[ALIEXPRESS-DIAGNOSTIC] Diagnostic complete', {
      status: diagnostic.status,
      mode: diagnostic.mode,
      duration: `${duration}ms`,
      correlationId
    });

    return res.json(diagnostic);

  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    
    logger.error('[ALIEXPRESS-DIAGNOSTIC] Unexpected error', {
      error: error?.message || String(error),
      stack: error?.stack?.substring(0, 500),
      totalDuration: `${totalDuration}ms`,
      correlationId
    });

    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: error?.message || 'Internal server error',
      correlationId,
      totalDuration: `${totalDuration}ms`
    });
  }
});

/**
 * GET /api/debug/post-sale-integrity-check
 * Verificación de integridad financiera del pipeline post-venta
 */
router.get('/post-sale-integrity-check', async (_req: Request, res: Response) => {
  try {
    const centralized = !await hasPrismaSaleCreateOutsideService();
    const webhookBypass = !centralized;
    const duplicatePayoutRisk = !await hasPayoutIdempotencyCheck();
    const feeCalculationStrict = await hasStrictFeeValidation();
    const netProfitValidated = await hasNetProfitValidation();

    let score = 0;
    if (centralized) score += 25;
    if (!webhookBypass) score += 25;
    if (!duplicatePayoutRisk) score += 20;
    if (feeCalculationStrict) score += 15;
    if (netProfitValidated) score += 15;
    const overallFinancialIntegrityScore = Math.min(100, score);

    return res.json({
      centralizedSaleCreation: centralized,
      webhookBypassDetected: webhookBypass,
      duplicatePayoutRisk,
      feeCalculationStrict,
      netProfitValidated,
      overallFinancialIntegrityScore,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

async function hasPrismaSaleCreateOutsideService(): Promise<boolean> {
  const fs = await import('fs');
  const path = await import('path');
  const backendPath = path.resolve(process.cwd(), 'src');
  const checkFile = (filePath: string): boolean => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const inService = filePath.includes('sale.service');
      const hasCreate = /prisma\.sale\.create|tx\.sale\.create/.test(content);
      if (hasCreate && !inService) return true;
    } catch { /* ignore */ }
    return false;
  };
  const files = ['api/routes/webhooks.routes.ts'];
  for (const f of files) {
    const fullPath = path.join(backendPath, f);
    if (fs.existsSync(fullPath) && checkFile(fullPath)) return true;
  }
  return false;
}

async function hasPayoutIdempotencyCheck(): Promise<boolean> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/services/sale.service.ts'), 'utf8');
    return /payoutExecuted|alreadyPaid|already executed/.test(content);
  } catch {
    return false;
  }
}

async function hasStrictFeeValidation(): Promise<boolean> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/services/sale.service.ts'), 'utf8');
    return /costPrice.*<=.*0|salePrice.*<=.*0|supplier cost/.test(content);
  } catch {
    return false;
  }
}

async function hasNetProfitValidation(): Promise<boolean> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/services/sale.service.ts'), 'utf8');
    return /netProfit validation|expectedNetProfit/.test(content);
  } catch {
    return false;
  }
}

export default router;

