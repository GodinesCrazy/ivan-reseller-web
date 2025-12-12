import { Router, Request, Response } from 'express';
import { MarketplaceService } from '../../services/marketplace.service';
import { EbayService } from '../../services/ebay.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import crypto from 'crypto';
import logger from '../../config/logger';

const router = Router();
const marketplaceService = new MarketplaceService();

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
router.get('/aliexpress/callback', async (req: Request, res: Response) => {
  // Redirigir al callback estándar con marketplace=aliexpress-dropshipping
  const { code, state, error } = req.query;
  
  logger.info('[OAuth Callback] Direct AliExpress callback received', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
  });

  // Si el state es simple (como "ivanreseller"), necesitamos manejarlo de forma especial
  // Por ahora, redirigimos al callback estándar
  const marketplace = 'aliexpress-dropshipping';
  const redirectUrl = `/api/marketplace-oauth/oauth/callback/${marketplace}?${new URLSearchParams(req.query as any).toString()}`;
  
  return res.redirect(redirectUrl);
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
      const devId = cred?.credentials?.devId || process.env.EBAY_DEV_ID || '';
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
      
      if (!appId || !devId || !certId) {
        logger.error('[OAuth Callback] Missing eBay base credentials', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasAppId: !!appId,
          hasDevId: !!devId,
          hasCertId: !!certId
        });
        return res
          .status(400)
          .send('<html><body>Base credentials missing. Please save App ID, Dev ID and Cert ID before authorizing.</body></html>');
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
      
      logger.info('[OAuth Callback] Token exchange successful', {
        service: 'marketplace-oauth',
        userId,
        environment,
        hasToken: !!tokens.token,
        tokenLength: tokens.token?.length || 0,
        hasRefreshToken: !!tokens.refreshToken,
        refreshTokenLength: tokens.refreshToken?.length || 0,
        expiresIn: tokens.expiresIn
      });
      
      // ✅ CORRECCIÓN: Sincronizar sandbox flag con environment y asegurar que tokens se guarden correctamente
      const newCreds = { 
        ...(cred?.credentials || {}), 
        token: tokens.token, 
        refreshToken: tokens.refreshToken,
        // ✅ CRÍTICO: Sincronizar sandbox flag con environment para que la validación funcione
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
      await apiAvailabilityService.checkMercadoLibreAPI(userId, environment, true).catch((err) => {
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
        const tokens = await aliexpressDropshippingAPIService.exchangeCodeForToken(
          code,
          redirectUri || 'https://ivanreseller.com/aliexpress/callback',
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

export default router;

