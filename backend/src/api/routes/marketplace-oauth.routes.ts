import { Router, Request, Response } from 'express';
import { MarketplaceService } from '../../services/marketplace.service';
import { EbayService } from '../../services/ebay.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import { authenticate } from '../../middleware/auth.middleware';
import crypto from 'crypto';
import logger from '../../config/logger';

const router = Router();
const marketplaceService = new MarketplaceService();

/**
 * GET /api/marketplace-oauth/authorize/ebay
 * Redirects to eBay OAuth page. NO auth required (direct link for production).
 * Uses userId=1 by default; callback saves tokens to api_credentials.
 */
router.get('/authorize/ebay', async (req: Request, res: Response) => {
  try {
    const clientId = (process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
    const redirectUri = (process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || '').trim();
    const certId = (process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET || '').trim();

    if (!clientId || !redirectUri) {
      logger.error('[OAuth Authorize] Missing eBay env vars', { hasClientId: !!clientId, hasRedirectUri: !!redirectUri });
      return res.status(500).json({
        success: false,
        message: 'Missing EBAY_APP_ID or EBAY_REDIRECT_URI. Configure in Railway env vars.',
      });
    }

    const scope = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'sell.inventory.readonly',
      'sell.inventory',
      'sell.marketing.readonly',
      'sell.marketing',
    ].filter((v, i, a) => a.indexOf(v) === i).join(' ');

    const userId = 1;
    const ts = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key';
    const redirB64 = Buffer.from(redirectUri).toString('base64url');
    const expirationTime = Date.now() + 10 * 60 * 1000;
    const payload = [userId, 'ebay', ts, nonce, redirB64, 'production', expirationTime.toString()].join('|');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const state = Buffer.from([payload, sig].join('|')).toString('base64url');

    const authUrl =
      `https://auth.ebay.com/oauth2/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    logger.info('[OAuth Authorize] Redirecting to eBay', { userId });
    return res.redirect(302, authUrl);
  } catch (e: any) {
    logger.error('[OAuth Authorize] eBay authorize failed', { error: e?.message });
    return res.status(500).json({
      success: false,
      message: e?.message || 'Failed to build eBay authorize URL',
    });
  }
});

/**
 * GET /api/marketplace-oauth/oauth/start/ebay
 * Redirects to eBay OAuth page. Requires auth.
 */
router.get('/oauth/start/ebay', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Debes estar autenticado' });
    }
    const env = (req.query.environment as string)?.toLowerCase();
    const environment = env === 'sandbox' ? 'sandbox' as const : 'production' as const;
    const url = await marketplaceService.getEbayOAuthStartUrl(userId, environment);
    logger.info('[OAuth Start] Redirecting to eBay', { userId, environment });
    return res.redirect(302, url);
  } catch (e: any) {
    logger.error('[OAuth Start] eBay OAuth start failed', { error: e?.message });
    return res.status(400).json({
      success: false,
      error: e?.message || 'No se pudo iniciar OAuth de eBay',
      message: 'Verifica EBAY_APP_ID, EBAY_CERT_ID y EBAY_REDIRECT_URI en Settings o variables de entorno.'
    });
  }
});

function parseState(state: string) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    
    // 🔒 SEGURIDAD: Validar que el state tenga el formato correcto con expiración
    // Formato esperado: userId|marketplace|timestamp|nonce|redirectUri|environment|expirationTime|signature
    // O formato legacy: userId|marketplace|timestamp|nonce|redirectUri|environment|signature (sin expiración)
    if (parts.length < 6) return { ok: false, reason: 'invalid_format' };
    
    // Determinar si tiene expiración (8 partes) o es legacy (7 partes)
    const hasExpiration = parts.length === 8;
    const [userIdStr, mk, ts, nonce, redirB64, env = 'production', expirationTimeOrSig, sig] = hasExpiration
      ? parts
      : [...parts, null, 'production'];
    
    // Si tiene expiración, validarla
    if (hasExpiration && expirationTimeOrSig) {
      const expirationTime = parseInt(expirationTimeOrSig, 10);
      if (isNaN(expirationTime) || expirationTime < Date.now()) {
        return { ok: false, reason: 'expired', expiredAt: expirationTime, now: Date.now() };
      }
    }
    
    // Validar firma
    const payload = hasExpiration 
      ? [userIdStr, mk, ts, nonce, redirB64, env, expirationTimeOrSig].join('|')
      : [userIdStr, mk, ts, nonce, redirB64, env].join('|');
    
    const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key';
    if (!secret || secret === 'default-key') {
      return { ok: false, reason: 'missing_secret' };
    }
    
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (expectedSig !== sig) return { ok: false, reason: 'invalid_signature' };
    
    const redirectUri = Buffer.from(redirB64, 'base64url').toString('utf8');
    const userId = parseInt(userIdStr, 10);
    if (!userId || !mk) return { ok: false, reason: 'invalid_user_or_marketplace' };
    
    return { 
      ok: true, 
      userId, 
      marketplace: mk, 
      redirectUri, 
      environment: env as 'sandbox' | 'production',
      hasExpiration,
      expirationTime: hasExpiration ? parseInt(expirationTimeOrSig, 10) : null
    };
  } catch (error: any) {
    return { ok: false, reason: 'parse_error', error: error.message };
  }
}

// ✅ ALIEXPRESS CALLBACK DIRECTO: Endpoint específico para AliExpress según documentación
// https://ivanreseller.com/aliexpress/callback
// ✅ FIX: Maneja directamente el flujo completo sin redirect para evitar que Vercel sirva SPA
// NOTA: La ruta se registra como '/callback' porque app.use('/aliexpress', ...) ya agrega el prefijo
router.get('/callback', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId || 'unknown';
  
  // ✅ OBSERVABILIDAD: Headers de identificación
  res.setHeader('X-OAuth-Callback', 'aliexpress');
  res.setHeader('X-Correlation-ID', correlationId);
  
  try {
    const { code, state, error: errorParam } = req.query;
    const codeStr = String(code || '');
    const stateStr = String(state || '');
    const errorStr = String(errorParam || '');
    const marketplace = 'aliexpress-dropshipping';
    
    // ✅ LOGGING: Registrar inicio del callback (sin secretos)
    logger.info('[OAuth Callback] Direct AliExpress callback received', {
      service: 'marketplace-oauth',
      marketplace,
      correlationId,
      hasCode: !!code,
      codeLength: codeStr.length,
      hasState: !!state,
      stateLength: stateStr.length,
      hasError: !!errorParam,
      error: errorStr || undefined,
      queryParams: Object.keys(req.query)
    });
    
    // ✅ SMOKE TEST MODE: Si code=test y state=test, responder inmediatamente
    if (codeStr === 'test' && stateStr === 'test') {
      logger.info('[OAuth Callback] Smoke test mode detected', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId
      });
      return res.status(200).json({
        success: true,
        mode: 'smoke_test',
        message: 'callback reached backend',
        correlationId
      });
    }
    
    // Validar que no haya error en los parámetros de query
    if (errorStr) {
      logger.error('[OAuth Callback] OAuth error from provider', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId,
        error: errorStr,
        errorDescription: req.query.error_description || 'No description'
      });
      return res.status(400).json({
        success: false,
        error: errorStr,
        message: `Authorization error: ${errorStr}`,
        correlationId
      });
    }
    
    // Validar que el código no esté vacío
    if (!codeStr || codeStr.trim().length === 0) {
      logger.error('[OAuth Callback] Missing authorization code', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId,
        hasState: !!state
      });
      return res.status(400).json({
        success: false,
        message: 'Missing authorization code',
        correlationId
      });
    }
    
    // Validar que el state no esté vacío (para flujo real)
    if (!stateStr || stateStr.trim().length === 0) {
      logger.error('[OAuth Callback] Missing state parameter', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId,
        hasCode: !!code
      });
      return res.status(400).json({
        success: false,
        message: 'Missing state parameter',
        correlationId
      });
    }
    
    // Parsear y validar el state
    const parsed = parseState(stateStr);
    if (!parsed.ok) {
      let errorMessage = 'Invalid or expired authorization state';
      if (parsed.reason === 'expired') {
        errorMessage = 'Authorization state has expired. Please try again.';
      } else if (parsed.reason === 'invalid_signature') {
        errorMessage = 'Invalid authorization state signature';
      }
      
      logger.error('[OAuth Callback] Invalid state', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId,
        reason: parsed.reason,
        stateLength: stateStr.length
      });
      
      return res.status(400).json({
        success: false,
        message: errorMessage,
        correlationId
      });
    }
    
    const { userId, redirectUri, environment } = parsed as any;
    
    logger.info('[OAuth Callback] State parsed successfully', {
      service: 'marketplace-oauth',
      marketplace,
      correlationId,
      userId,
      environment,
      redirectUriLength: redirectUri?.length || 0,
      redirectUriPreview: redirectUri ? redirectUri.substring(0, 50) + '...' : 'N/A'
    });

    // ✅ REUTILIZAR LÓGICA EXISTENTE: Procesar AliExpress Dropshipping OAuth
    logger.info('[OAuth Callback] Processing AliExpress Dropshipping OAuth', {
      service: 'marketplace-oauth',
      correlationId,
      userId,
      environment,
      codeLength: codeStr.length
    });

    const { aliexpressDropshippingAPIService } = await import('../../services/aliexpress-dropshipping-api.service');
    const { CredentialsManager } = await import('../../services/credentials-manager.service');
    
    // Obtener credenciales base (appKey y appSecret)
    const cred = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment);
    
    if (!cred) {
      logger.error('[OAuth Callback] AliExpress Dropshipping credentials not found', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
      });
      return res.status(400).send(`
        <html>
          <body>
            <h2>Credenciales no encontradas</h2>
            <p>Por favor configura App Key y App Secret antes de autorizar.</p>
          </body>
        </html>
      `);
    }

    const { appKey, appSecret } = cred as any;
    
    if (!appKey || !appSecret) {
      logger.error('[OAuth Callback] Missing AliExpress Dropshipping base credentials', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
        hasAppKey: !!appKey,
        hasAppSecret: !!appSecret,
      });
      return res.status(400).send(`
        <html>
          <body>
            <h2>Credenciales incompletas</h2>
            <p>Por favor configura App Key (Client ID) y App Secret antes de autorizar.</p>
          </body>
        </html>
      `);
    }

    logger.info('[OAuth Callback] Exchanging code for AliExpress Dropshipping tokens', {
      service: 'marketplace-oauth',
      correlationId,
      userId,
      environment,
      codeLength: codeStr.length,
      redirectUriLength: redirectUri?.length || 0,
    });

    const webBaseUrl = process.env.WEB_BASE_URL ||
      (process.env.NODE_ENV === 'production' ? 'https://www.ivanreseller.com' : 'http://localhost:5173');

    try {
      // Intercambiar code por tokens
      // ✅ CORRECCIÓN: Callback debe incluir /api porque el serverless function está en /api/aliexpress/callback
      const defaultCallbackUrl = `${webBaseUrl}/api/aliexpress/callback`;
      
      const tokens = await aliexpressDropshippingAPIService.exchangeCodeForToken(
        codeStr,
        redirectUri || defaultCallbackUrl,
        appKey,
        appSecret
      );

      logger.info('[OAuth Callback] AliExpress Dropshipping token exchange successful', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
        hasAccessToken: !!tokens.accessToken,
        accessTokenLength: tokens.accessToken?.length || 0,
        hasRefreshToken: !!tokens.refreshToken,
        refreshTokenLength: tokens.refreshToken?.length || 0,
        expiresIn: tokens.expiresIn,
        refreshExpiresIn: tokens.refreshExpiresIn,
      });

      // ✅ FIX OAUTH: Validar tokens antes de guardar
      if (!tokens.accessToken || typeof tokens.accessToken !== 'string' || tokens.accessToken.trim().length === 0) {
        logger.error('[OAuth Callback] Invalid access token received', {
          service: 'marketplace-oauth',
          correlationId,
          userId,
          environment,
          tokenType: typeof tokens.accessToken,
          tokenLength: tokens.accessToken?.length || 0,
        });
        
        return res.status(400).send(`
          <html>
            <body>
              <h2>Error: Token inválido</h2>
              <p>El token de acceso recibido no es válido. Por favor, intenta de nuevo.</p>
              <p>Correlation ID: ${correlationId}</p>
              <script>setTimeout(() => window.close(), 5000);</script>
            </body>
          </html>
        `);
      }

      // ✅ FIX OAUTH: Guardar tokens en base de datos (solo si son válidos)
      const updatedCreds: any = {
        ...cred,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        refreshTokenExpiresAt: tokens.refreshExpiresIn 
          ? new Date(Date.now() + tokens.refreshExpiresIn * 1000).toISOString()
          : null,
        sandbox: environment === 'sandbox',
        updatedAt: new Date().toISOString(),
      };

      logger.info('[OAuth Callback] Saving AliExpress Dropshipping credentials', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
        sandbox: updatedCreds.sandbox,
        credentialKeys: Object.keys(updatedCreds),
        hasAccessToken: !!updatedCreds.accessToken,
        hasRefreshToken: !!updatedCreds.refreshToken,
      });

      await CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment);

      // Limpiar cache de credenciales
      const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
      clearCredentialsCache(userId, 'aliexpress-dropshipping', environment);
      clearCredentialsCache(userId, 'aliexpress-dropshipping', environment === 'sandbox' ? 'production' : 'sandbox');
      
      // Limpiar cache de API availability para forzar re-verificación
      const { APIAvailabilityService } = await import('../../services/api-availability.service');
      const apiAvailabilityService = new APIAvailabilityService();
      await apiAvailabilityService.checkAliExpressDropshippingAPI(userId, environment, true).catch((err) => {
        logger.warn('[OAuth Callback] Error forcing AliExpress Dropshipping API status refresh', {
          error: err?.message || String(err),
          correlationId,
          userId,
          environment
        });
      });

      logger.info('[OAuth Callback] AliExpress Dropshipping credentials saved successfully', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
        duration: Date.now() - startTime,
        cacheCleared: true,
        apiStatusRefreshed: true
      });

      // Opcional: Verificar que el token funciona
      try {
        aliexpressDropshippingAPIService.setCredentials(updatedCreds);
        await aliexpressDropshippingAPIService.getAccountInfo();
        logger.info('[OAuth Callback] Account info verification successful', {
          service: 'marketplace-oauth',
          correlationId,
          userId,
          environment,
        });
      } catch (verifyError: any) {
        logger.warn('[OAuth Callback] Account info verification failed (non-critical)', {
          service: 'marketplace-oauth',
          correlationId,
          userId,
          environment,
          error: verifyError?.message || String(verifyError),
        });
      }

      // ✅ FIX OAUTH: Redirect a frontend con query params para SPA routing
      const successUrl = `${webBaseUrl}/#/api-settings?oauth=success&provider=aliexpress-dropshipping&correlationId=${correlationId}`;
      const errorUrl = `${webBaseUrl}/#/api-settings?oauth=error&provider=aliexpress-dropshipping&correlationId=${correlationId}`;
      
      // ✅ REDIRIGIR A PÁGINA DE ÉXITO con fallback HTML
      res.send(`
        <html>
          <head>
            <title>Autorización completada</title>
            <meta http-equiv="refresh" content="2;url=${successUrl}" />
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              .success { color: green; font-size: 18px; margin: 20px 0; }
              .info { color: #666; font-size: 14px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="success">✅ Autorización completada exitosamente</div>
            <div class="info">Redirigiendo a la aplicación...</div>
            <div class="info" style="font-size: 12px; margin-top: 30px;">Si no eres redirigido, <a href="${successUrl}">haz clic aquí</a></div>
            <div class="info" style="font-size: 12px; margin-top: 10px;">Correlation ID: ${correlationId}</div>
            <script>
              // Intentar postMessage primero
              const sendMessage = () => {
                if (window.opener && !window.opener.closed) {
                  try {
                    window.opener.postMessage({ 
                      type: 'oauth_success', 
                      marketplace: 'aliexpress-dropshipping',
                      correlationId: '${correlationId}',
                      timestamp: Date.now()
                    }, '*');
                    console.log('[OAuth Callback] Success message sent to opener');
                  } catch (e) {
                    console.error('[OAuth Callback] Error sending message to opener:', e);
                  }
                } else {
                  console.warn('[OAuth Callback] No opener window found or opener is closed');
                }
              };
              
              sendMessage();
              setTimeout(sendMessage, 500);
              setTimeout(sendMessage, 1000);
              setTimeout(sendMessage, 2000);
              
              // Fallback: redirect si no hay opener
              setTimeout(() => {
                if (!window.opener || window.opener.closed) {
                  window.location.href = '${successUrl}';
                }
              }, 2000);
            </script>
          </body>
        </html>
      `);

    } catch (tokenError: any) {
      const elapsed = Date.now() - startTime;
      logger.error('[OAuth Callback] AliExpress Dropshipping token exchange failed', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
        elapsed,
        error: tokenError?.message || String(tokenError),
        responseData: tokenError?.response?.data,
        status: tokenError?.response?.status,
        stack: tokenError?.stack?.substring(0, 500),
      });

      // ✅ FIX OAUTH: Redirect a frontend con error
      const errorUrl = `${webBaseUrl}/#/api-settings?oauth=error&provider=aliexpress-dropshipping&correlationId=${correlationId}&error=${encodeURIComponent(tokenError?.message || 'Token exchange failed')}`;
      
      // ✅ ERROR HANDLING: Responder con error sin exponer secretos (redirect a frontend)
      const errorMessage = tokenError?.message || 'Token exchange failed';
      res.send(`
        <html>
          <head>
            <title>Error de autorización</title>
            <meta http-equiv="refresh" content="3;url=${errorUrl}" />
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              .error { color: red; font-size: 18px; margin: 20px 0; }
              .info { color: #666; font-size: 14px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="error">❌ Error en la autorización</div>
            <div class="info">${errorMessage}</div>
            <div class="info" style="font-size: 12px; margin-top: 30px;">Redirigiendo a la aplicación...</div>
            <div class="info" style="font-size: 12px; margin-top: 10px;">Si no eres redirigido, <a href="${errorUrl}">haz clic aquí</a></div>
            <div class="info" style="font-size: 12px; margin-top: 10px;">Correlation ID: ${correlationId}</div>
            <script>
              setTimeout(() => {
                window.location.href = '${errorUrl}';
              }, 3000);
            </script>
          </body>
        </html>
      `);
      res.status(500).send(`
        <html>
          <head>
            <title>Error de autorización</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              .error { color: red; font-size: 18px; margin: 20px 0; }
              .details { color: #666; font-size: 12px; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div class="error">❌ Error al completar la autorización OAuth</div>
            <div class="details">Error técnico: ${tokenError?.message || 'Unknown error'}</div>
            <div style="text-align: center; margin-top: 30px;">
              <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
                Cerrar ventana
              </button>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'oauth_error', 
                  marketplace: 'aliexpress-dropshipping',
                  error: '${(tokenError?.message || 'Unknown error').replace(/'/g, "\\'")}'
                }, '*');
              }
            </script>
          </body>
        </html>
      `);
    }
    
  } catch (e: any) {
    const errorMessage = e?.message || 'Unknown error';
    const errorResponse = e?.response?.data || {};
    const errorStatus = e?.response?.status || 500;
    
    logger.error('[OAuth Callback] Error processing AliExpress callback', {
      service: 'marketplace-oauth',
      correlationId,
      error: errorMessage,
      errorStatus,
      errorResponse,
      stack: e?.stack,
      duration: Date.now() - startTime
    });
    
    res.status(500).send(`
      <html>
        <head>
          <title>Error de autorización</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
            .error { color: red; font-size: 18px; margin: 20px 0; }
            .details { color: #666; font-size: 12px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="error">❌ Error al completar la autorización OAuth</div>
          <div class="details">Error técnico: ${errorMessage}</div>
          <div style="text-align: center; margin-top: 30px;">
            <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
              Cerrar ventana
            </button>
          </div>
        </body>
      </html>
    `);
  }
});

// Public callback (no auth) to complete OAuth
router.get('/oauth/callback/:marketplace', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { marketplace } = req.params;
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const errorParam = String(req.query.error || '');
    
    // 🔍 LOGGING: Registrar inicio del callback
    logger.info('[OAuth Callback] Received callback request', {
      service: 'marketplace-oauth',
      marketplace,
      hasCode: !!code,
      codeLength: code.length,
      hasState: !!state,
      stateLength: state.length,
      hasError: !!errorParam,
      error: errorParam || undefined,
      queryParams: Object.keys(req.query)
    });
    
    // Validar que no haya error en los parámetros de query
    if (errorParam) {
      logger.error('[OAuth Callback] OAuth error from provider', {
        service: 'marketplace-oauth',
        marketplace,
        error: errorParam,
        errorDescription: req.query.error_description || 'No description'
      });
      return res.status(400).send(`
        <html>
          <body>
            <h2>Authorization Error</h2>
            <p>eBay returned an error: ${errorParam}</p>
            <p>${req.query.error_description || 'Please try again.'}</p>
            <p>Please return to the application and try again.</p>
          </body>
        </html>
      `);
    }
    
    // Validar que el código no esté vacío
    if (!code || code.trim().length === 0) {
      logger.error('[OAuth Callback] Missing authorization code', {
        service: 'marketplace-oauth',
        marketplace,
        hasState: !!state
      });
      return res.status(400).send(`
        <html>
          <body>
            <h2>Authorization Error</h2>
            <p>No authorization code received from eBay.</p>
            <p>Please return to the application and try again.</p>
          </body>
        </html>
      `);
    }
    
    const parsed = parseState(state);
    if (!parsed.ok) {
      // 🔒 SEGURIDAD: Mensajes de error más específicos pero sin exponer detalles
      let errorMessage = 'Invalid or expired authorization state';
      if (parsed.reason === 'expired') {
        errorMessage = 'Authorization state has expired. Please try again.';
      } else if (parsed.reason === 'invalid_signature') {
        errorMessage = 'Invalid authorization state signature';
      }
      
      logger.error('[OAuth Callback] Invalid state', {
        service: 'marketplace-oauth',
        marketplace,
        reason: parsed.reason,
        stateLength: state.length
      });
      
      return res.status(400).send(`
        <html>
          <body>
            <h2>Authorization Error</h2>
            <p>${errorMessage}</p>
            <p>Please return to the application and try again.</p>
          </body>
        </html>
      `);
    }
    const { userId, redirectUri, environment } = parsed as any;
    
    logger.info('[OAuth Callback] State parsed successfully', {
      service: 'marketplace-oauth',
      marketplace,
      userId,
      environment,
      redirectUriLength: redirectUri?.length || 0,
      redirectUriPreview: redirectUri ? redirectUri.substring(0, 50) + '...' : 'N/A'
    });

    if (marketplace === 'ebay') {
      logger.info('[OAuth Callback] Processing eBay OAuth', {
        service: 'marketplace-oauth',
        userId,
        environment,
        codeLength: code.length
      });
      
      const cred = await marketplaceService.getCredentials(userId, 'ebay', environment);
      const appId = cred?.credentials?.appId || process.env.EBAY_APP_ID || '';
      const devId = (cred?.credentials?.devId || process.env.EBAY_DEV_ID || '').trim();
      const certId = cred?.credentials?.certId || process.env.EBAY_CERT_ID || '';
      const sandbox = !!(cred?.credentials?.sandbox || (process.env.EBAY_SANDBOX === 'true'));
      
      logger.info('[OAuth Callback] eBay credentials loaded', {
        service: 'marketplace-oauth',
        userId,
        environment,
        hasAppId: !!appId,
        appIdLength: appId.length,
        hasDevId: !!devId,
        hasCertId: !!certId,
        sandbox
      });
      
      // Token exchange solo requiere App ID y Cert ID; Dev ID es opcional
      if (!appId || !certId) {
        logger.error('[OAuth Callback] Missing eBay base credentials', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasAppId: !!appId,
          hasCertId: !!certId
        });
        return res
          .status(400)
          .send('<html><body>Base credentials missing. Please save App ID and Cert ID before authorizing.</body></html>');
      }
      
      const ebay = new EbayService({ appId, devId, certId, sandbox });
      
      logger.info('[OAuth Callback] Exchanging code for token', {
        service: 'marketplace-oauth',
        userId,
        environment,
        codeLength: code.length,
        redirectUriLength: redirectUri?.length || 0,
        redirectUriPreview: redirectUri ? redirectUri.substring(0, 50) + '...' : 'N/A'
      });
      
      const tokens = await ebay.exchangeCodeForToken(code, redirectUri);
      
      const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;
      
      logger.info('[OAuth Callback] Token exchange successful', {
        service: 'marketplace-oauth',
        userId,
        environment,
        hasToken: !!tokens.token,
        tokenLength: tokens.token?.length || 0,
        hasRefreshToken: !!tokens.refreshToken,
        refreshTokenLength: tokens.refreshToken?.length || 0,
        expiresIn: tokens.expiresIn,
        expiresAt: expiresAt?.toISOString()
      });
      
      // ✅ Tokens + expiresAt para auto-refresh y diagnóstico
      const newCreds = { 
        ...(cred?.credentials || {}), 
        token: tokens.token, 
        refreshToken: tokens.refreshToken,
        expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
        sandbox: environment === 'sandbox'
      };
      
      logger.info('[OAuth Callback] Saving credentials', {
        service: 'marketplace-oauth',
        userId,
        environment,
        sandbox: newCreds.sandbox,
        credentialKeys: Object.keys(newCreds),
        hasToken: !!newCreds.token,
        hasRefreshToken: !!newCreds.refreshToken
      });
      
      // ✅ CORRECCIÓN: Guardar credenciales con environment explícito
      await marketplaceService.saveCredentials(userId, 'ebay', newCreds, environment);
      
      // ✅ CORRECCIÓN EBAY OAUTH: Limpiar cache de credenciales para que la próxima consulta obtenga los tokens nuevos
      // Limpiar tanto sandbox como production por si acaso hay cache mixto
      const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
      clearCredentialsCache(userId, 'ebay', environment);
      clearCredentialsCache(userId, 'ebay', environment === 'sandbox' ? 'production' : 'sandbox');
      
      // ✅ CORRECCIÓN: Limpiar también el cache de API availability para forzar re-verificación del token
      const { APIAvailabilityService } = await import('../../services/api-availability.service');
      const apiAvailabilityService = new APIAvailabilityService();
      // Invalidar cache de status para forzar re-verificación
      await apiAvailabilityService.checkEbayAPI(userId, environment, true).catch((err) => {
        logger.warn('[OAuth Callback] Error forcing API status refresh', {
          error: err?.message || String(err),
          userId,
          environment
        });
      });
      
      logger.info('[OAuth Callback] Credentials saved successfully', {
        service: 'marketplace-oauth',
        userId,
        environment,
        duration: Date.now() - startTime,
        cacheCleared: true,
        apiStatusRefreshed: true
      });
    } else if (marketplace === 'mercadolibre') {
      logger.info('[OAuth Callback] Processing MercadoLibre OAuth', {
        service: 'marketplace-oauth',
        userId,
        environment,
        codeLength: code.length
      });
      
      const cred = await marketplaceService.getCredentials(userId, 'mercadolibre', environment);
      const clientId = cred?.credentials?.clientId || process.env.MERCADOLIBRE_CLIENT_ID || '';
      const clientSecret = cred?.credentials?.clientSecret || process.env.MERCADOLIBRE_CLIENT_SECRET || '';
      const siteId = cred?.credentials?.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLM';
      
      if (!clientId || !clientSecret) {
        logger.error('[OAuth Callback] Missing MercadoLibre base credentials', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret,
        });
        return res
          .status(400)
          .send('<html><body>Base credentials missing. Please save Client ID and Client Secret before authorizing.</body></html>');
      }
      
      logger.info('[OAuth Callback] Exchanging code for MercadoLibre tokens', {
        service: 'marketplace-oauth',
        userId,
        environment,
        codeLength: code.length,
        redirectUriLength: redirectUri?.length || 0,
      });
      
      const ml = new MercadoLibreService({ clientId, clientSecret, siteId });
      const tokens = await ml.exchangeCodeForToken(code, redirectUri);
      
      logger.info('[OAuth Callback] MercadoLibre token exchange successful', {
        service: 'marketplace-oauth',
        userId,
        environment,
        hasAccessToken: !!tokens.accessToken,
        accessTokenLength: tokens.accessToken?.length || 0,
        hasRefreshToken: !!tokens.refreshToken,
        refreshTokenLength: tokens.refreshToken?.length || 0,
        hasUserId: !!tokens.userId,
      });
      
      // ✅ CORRECCIÓN MERCADOLIBRE OAUTH: Sincronizar sandbox flag con environment
      const newCreds = { 
        ...(cred?.credentials || {}), 
        accessToken: tokens.accessToken, 
        refreshToken: tokens.refreshToken, 
        userId: tokens.userId,
        // ✅ CRÍTICO: Sincronizar sandbox flag con environment
        sandbox: environment === 'sandbox'
      };
      
      logger.info('[OAuth Callback] Saving MercadoLibre credentials', {
        service: 'marketplace-oauth',
        userId,
        environment,
        sandbox: newCreds.sandbox,
        credentialKeys: Object.keys(newCreds),
        hasAccessToken: !!newCreds.accessToken,
        hasRefreshToken: !!newCreds.refreshToken,
      });
      
      // ✅ CORRECCIÓN: Guardar credenciales con environment explícito
      await marketplaceService.saveCredentials(userId, 'mercadolibre', newCreds, environment);
      
      // ✅ CORRECCIÓN MERCADOLIBRE OAUTH: Limpiar cache de credenciales
      const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
      clearCredentialsCache(userId, 'mercadolibre', environment);
      clearCredentialsCache(userId, 'mercadolibre', environment === 'sandbox' ? 'production' : 'sandbox');
      
      // ✅ CORRECCIÓN: Limpiar también el cache de API availability para forzar re-verificación
      const { APIAvailabilityService } = await import('../../services/api-availability.service');
      const apiAvailabilityService = new APIAvailabilityService();
      // Invalidar cache de status para forzar re-verificación
      await apiAvailabilityService.checkMercadoLibreAPI(userId, environment).catch((err) => {
        logger.warn('[OAuth Callback] Error forcing MercadoLibre API status refresh', {
          error: err?.message || String(err),
          userId,
          environment
        });
      });
      
      logger.info('[OAuth Callback] MercadoLibre credentials saved successfully', {
        service: 'marketplace-oauth',
        userId,
        environment,
        duration: Date.now() - startTime,
        cacheCleared: true,
        apiStatusRefreshed: true
      });
    } else if (marketplace === 'aliexpress-dropshipping' || marketplace === 'aliexpress_dropshipping') {
      logger.info('[OAuth Callback] Processing AliExpress Dropshipping OAuth', {
        service: 'marketplace-oauth',
        userId,
        environment,
        codeLength: code.length
      });

      const { aliexpressDropshippingAPIService } = await import('../../services/aliexpress-dropshipping-api.service');
      const { CredentialsManager } = await import('../../services/credentials-manager.service');
      
      // Obtener credenciales base (appKey y appSecret)
      const cred = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment);
      
      if (!cred) {
        logger.error('[OAuth Callback] AliExpress Dropshipping credentials not found', {
          service: 'marketplace-oauth',
          userId,
          environment,
        });
        return res
          .status(400)
          .send('<html><body><h2>Credenciales no encontradas</h2><p>Por favor configura App Key y App Secret antes de autorizar.</p></body></html>');
      }

      const { appKey, appSecret } = cred as any;
      
      if (!appKey || !appSecret) {
        logger.error('[OAuth Callback] Missing AliExpress Dropshipping base credentials', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasAppKey: !!appKey,
          hasAppSecret: !!appSecret,
        });
        return res
          .status(400)
          .send('<html><body><h2>Credenciales incompletas</h2><p>Por favor configura App Key (Client ID) y App Secret antes de autorizar.</p></body></html>');
      }

      logger.info('[OAuth Callback] Exchanging code for AliExpress Dropshipping tokens', {
        service: 'marketplace-oauth',
        userId,
        environment,
        codeLength: code.length,
        redirectUriLength: redirectUri?.length || 0,
      });

      try {
        // 🔥 PASO 4: Intercambiar code por tokens
        // ✅ CANONICAL DOMAIN: Usar WEB_BASE_URL para mantener consistencia con el redirect_uri usado en getAuthUrl
        const webBaseUrl = process.env.WEB_BASE_URL || 
                          (process.env.NODE_ENV === 'production' ? 'https://www.ivanreseller.com' : 'http://localhost:5173');
        // ✅ CORRECCIÓN: Callback debe incluir /api porque el serverless function está en /api/aliexpress/callback
        const defaultCallbackUrl = `${webBaseUrl}/api/aliexpress/callback`;
        
        const tokens = await aliexpressDropshippingAPIService.exchangeCodeForToken(
          code,
          redirectUri || defaultCallbackUrl,
          appKey,
          appSecret
        );

        logger.info('[OAuth Callback] AliExpress Dropshipping token exchange successful', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasAccessToken: !!tokens.accessToken,
          accessTokenLength: tokens.accessToken?.length || 0,
          hasRefreshToken: !!tokens.refreshToken,
          refreshTokenLength: tokens.refreshToken?.length || 0,
          expiresIn: tokens.expiresIn,
          refreshExpiresIn: tokens.refreshExpiresIn,
        });

        // 🔥 PASO 5: Guardar tokens en base de datos
        // ✅ CORRECCIÓN ALIEXPRESS DROPSHIPPING OAUTH: Sincronizar sandbox flag con environment
        const updatedCreds: any = {
          ...cred,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          // Calcular fecha de expiración
          accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
          refreshTokenExpiresAt: new Date(Date.now() + tokens.refreshExpiresIn * 1000).toISOString(),
          // ✅ CRÍTICO: Sincronizar sandbox flag con environment
          sandbox: environment === 'sandbox'
        };

        logger.info('[OAuth Callback] Saving AliExpress Dropshipping credentials', {
          service: 'marketplace-oauth',
          userId,
          environment,
          sandbox: updatedCreds.sandbox,
          credentialKeys: Object.keys(updatedCreds),
          hasAccessToken: !!updatedCreds.accessToken,
          hasRefreshToken: !!updatedCreds.refreshToken,
        });

        await CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment);

        // ✅ CORRECCIÓN ALIEXPRESS DROPSHIPPING OAUTH: Limpiar cache de credenciales
        const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
        clearCredentialsCache(userId, 'aliexpress-dropshipping', environment);
        clearCredentialsCache(userId, 'aliexpress-dropshipping', environment === 'sandbox' ? 'production' : 'sandbox');
        
        // ✅ CORRECCIÓN: Limpiar también el cache de API availability para forzar re-verificación
        const { APIAvailabilityService } = await import('../../services/api-availability.service');
        const apiAvailabilityService = new APIAvailabilityService();
        // Invalidar cache de status para forzar re-verificación
        await apiAvailabilityService.checkAliExpressDropshippingAPI(userId, environment, true).catch((err) => {
          logger.warn('[OAuth Callback] Error forcing AliExpress Dropshipping API status refresh', {
            error: err?.message || String(err),
            userId,
            environment
          });
        });

        logger.info('[OAuth Callback] AliExpress Dropshipping credentials saved successfully', {
          service: 'marketplace-oauth',
          userId,
          environment,
          duration: Date.now() - startTime,
          cacheCleared: true,
          apiStatusRefreshed: true
        });

        // Opcional: Verificar que el token funciona (PASO 6)
        try {
          aliexpressDropshippingAPIService.setCredentials(updatedCreds);
          await aliexpressDropshippingAPIService.getAccountInfo();
          logger.info('[OAuth Callback] Account info verification successful', {
            service: 'marketplace-oauth',
            userId,
            environment,
          });
        } catch (verifyError: any) {
          logger.warn('[OAuth Callback] Account info verification failed (non-critical)', {
            service: 'marketplace-oauth',
            userId,
            environment,
            error: verifyError?.message || String(verifyError),
          });
          // No fallar el flujo si la verificación falla
        }

      } catch (tokenError: any) {
        logger.error('[OAuth Callback] AliExpress Dropshipping token exchange failed', {
          service: 'marketplace-oauth',
          userId,
          environment,
          error: tokenError?.message || String(tokenError),
          responseData: tokenError?.response?.data,
          status: tokenError?.response?.status,
        });
        throw tokenError;
      }
    } else {
      return res.status(400).send('<html><body>Marketplace not supported</body></html>');
    }

    res.send(`
      <html>
        <head>
          <title>Autorización completada</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
            .success { color: green; font-size: 18px; margin: 20px 0; }
            .error { color: red; font-size: 18px; margin: 20px 0; }
            .info { color: #666; font-size: 14px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">✅ Autorización completada exitosamente</div>
          <div class="info">Puedes cerrar esta ventana y regresar a la aplicación.</div>
          <script>
            // ✅ CORRECCIÓN: Enviar mensaje inmediatamente y también después de un delay
            // Esto asegura que el mensaje se envíe incluso si hay problemas de timing
            const sendMessage = () => {
              if (window.opener && !window.opener.closed) {
                try {
                  window.opener.postMessage({ 
                    type: 'oauth_success', 
                    marketplace: '${req.params.marketplace}',
                    timestamp: Date.now()
                  }, '*');
                  console.log('[OAuth Callback] Success message sent to opener');
                } catch (e) {
                  console.error('[OAuth Callback] Error sending message to opener:', e);
                }
              } else {
                console.warn('[OAuth Callback] No opener window found or opener is closed');
              }
            };
            
            // Intentar enviar inmediatamente
            sendMessage();
            
            // También intentar después de un delay (por si el opener aún no está listo)
            setTimeout(sendMessage, 500);
            setTimeout(sendMessage, 1000);
            setTimeout(sendMessage, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (e: any) {
    const errorMessage = e?.message || 'Unknown error';
    const errorResponse = e?.response?.data || {};
    const errorStatus = e?.response?.status || 500;
    
    // 🔍 LOGGING: Registrar error completo
    logger.error('[OAuth Callback] Error processing OAuth callback', {
      service: 'marketplace-oauth',
      marketplace: req.params.marketplace,
      error: errorMessage,
      errorStatus,
      errorResponse,
      stack: e?.stack,
      duration: Date.now() - startTime
    });
    
    const isUnauthorizedClient = errorMessage.toLowerCase().includes('unauthorized_client') || 
                                 errorMessage.toLowerCase().includes('oauth client was not found') ||
                                 errorResponse?.error === 'unauthorized_client';
    
    let userFriendlyMessage = 'Error al completar la autorización OAuth.';
    let troubleshooting = '';
    
    if (isUnauthorizedClient) {
      userFriendlyMessage = '❌ Error: El App ID de eBay no fue encontrado o no es válido.';
      troubleshooting = `
        <div style="text-align: left; max-width: 600px; margin: 20px auto; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px;">
          <h3 style="margin-top: 0;">Posibles causas:</h3>
          <ul>
            <li>El <strong>App ID</strong> que ingresaste no existe en eBay Developer Portal</li>
            <li>El <strong>App ID</strong> es de <strong>Production</strong> pero estás usando <strong>Sandbox</strong> (o viceversa)</li>
            <li>El <strong>App ID</strong> no está correctamente registrado en tu cuenta de eBay Developer</li>
            <li>El <strong>Redirect URI (RuName)</strong> no coincide con el registrado en eBay Developer Portal</li>
          </ul>
          <h3>¿Qué hacer?</h3>
          <ol>
            <li>Ve a <a href="https://developer.ebay.com" target="_blank">eBay Developer Portal</a></li>
            <li>Verifica que tu aplicación esté creada y activa</li>
            <li>Confirma que el <strong>App ID</strong>, <strong>Dev ID</strong> y <strong>Cert ID</strong> sean correctos</li>
            <li>Verifica que el <strong>Redirect URI (RuName)</strong> coincida exactamente</li>
            <li>Si estás usando <strong>Sandbox</strong>, asegúrate de usar credenciales de Sandbox</li>
            <li>Si estás usando <strong>Production</strong>, asegúrate de usar credenciales de Production</li>
          </ol>
        </div>
      `;
    }
    
    res.status(500).send(`
      <html>
        <head>
          <title>Error de autorización</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .error { color: red; font-size: 18px; margin: 20px 0; text-align: center; }
            .details { color: #666; font-size: 12px; margin-top: 10px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="error">${userFriendlyMessage}</div>
          <div class="details">Error técnico: ${errorMessage}</div>
          ${troubleshooting}
          <div style="text-align: center; margin-top: 30px;">
            <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
              Cerrar ventana
            </button>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'oauth_error', 
                marketplace: '${req.params.marketplace}',
                error: '${errorMessage.replace(/'/g, "\\'")}'
              }, '*');
            }
          </script>
        </body>
      </html>
    `);
  }
});

// ✅ DIAGNÓSTICO: Endpoint para verificar estado del OAuth de AliExpress (sin información sensible)
router.get('/aliexpress/oauth/debug', async (req: Request, res: Response) => {
  try {
    // Verificar que el callback es accesible (simulando que llegamos aquí)
    const callbackReachable = true;
    
    // Obtener información del usuario si está autenticado
    // Nota: Este endpoint es público para permitir debugging, pero verifica autenticación opcional
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.json({
        callbackReachable: true,
        hasTokens: false,
        environment: 'unknown',
        lastError: null,
        lastAuthAt: null,
        status: 'not_authenticated',
        message: 'User not authenticated. This endpoint works, but authentication is required to check token status.'
      });
    }
    
    // Obtener credenciales de AliExpress Dropshipping
    const { CredentialsManager } = await import('../../services/credentials-manager.service');
    
    // Intentar obtener credenciales de producción y sandbox
    const credProd = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
    const credSandbox = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
    
    const hasTokensProd = !!(credProd?.accessToken);
    const hasTokensSandbox = !!(credSandbox?.accessToken);
    
    const environment = hasTokensProd ? 'production' : (hasTokensSandbox ? 'sandbox' : 'none');
    const lastAuthAt = null; // updatedAt no está disponible en el tipo de credenciales
    
    logger.info('[AliExpress OAuth Debug] Status check', {
      userId,
      hasTokensProd,
      hasTokensSandbox,
      environment
    });
    
    return res.json({
      callbackReachable: true,
      hasTokens: hasTokensProd || hasTokensSandbox,
      hasTokensProduction: hasTokensProd,
      hasTokensSandbox: hasTokensSandbox,
      environment,
      lastError: null, // Se puede extender para loggear últimos errores
      lastAuthAt,
      status: (hasTokensProd || hasTokensSandbox) ? 'authorized' : 'not_authorized',
      message: 'Endpoint working correctly. Use /api/auth-status for detailed status.'
    });
  } catch (error: any) {
    logger.error('[AliExpress OAuth Debug] Error', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      callbackReachable: true,
      hasTokens: false,
      environment: 'unknown',
      lastError: error.message,
      lastAuthAt: null,
      status: 'error',
      message: 'Error checking OAuth status'
    });
  }
});

export default router;

