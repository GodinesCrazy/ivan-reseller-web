import { Router, Request, Response } from 'express';
import { MarketplaceService } from '../../services/marketplace.service';
import { EbayService } from '../../services/ebay.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import { authenticate } from '../../middleware/auth.middleware';
import { verifyStateAliExpressSafe } from '../../utils/oauth-state';
import { getAliExpressDropshippingRedirectUri, getAliExpressRedirectUriInstructions } from '../../utils/aliexpress-dropshipping-oauth';
import { getOAuthStateSecret } from '../../utils/oauth-state-secret';
import { getMercadoLibreRedirectUri } from '../../utils/oauth-redirect-uris';
import crypto from 'crypto';
import logger from '../../config/logger';

const router = Router();
const marketplaceService = new MarketplaceService();

function getFrontendReturnBaseUrl(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.WEB_BASE_URL ||
    'https://www.ivanreseller.com'
  ).replace(/\/$/, '');
}

function getRequestBaseUrl(req: Request): string {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || '';
  if (!host) return '';
  return `${protocol}://${host}`.replace(/\/$/, '');
}

/**
 * Canonical eBay OAuth redirect URI.
 * Prefer BACKEND_URL (direct callback, no proxy) when set; else EBAY_REDIRECT_URI.
 * Must match exactly what is configured in eBay Developer Portal.
 */
function getEbayRedirectUri(): string {
  const backendUrl = (process.env.BACKEND_URL || process.env.RAILWAY_STATIC_URL || '').replace(/\/$/, '');
  if (backendUrl) {
    return `${backendUrl}/api/marketplace-oauth/oauth/callback/ebay`;
  }
  const explicit = (process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || '').trim();
  if (explicit) return explicit;
  return `${getFrontendReturnBaseUrl()}/api/marketplace-oauth/oauth/callback/ebay`;
}

/**
 * GET /api/marketplace-oauth/authorize/ebay
 * Redirects to eBay OAuth page. NO auth required (direct link for production).
 * Uses userId=1 by default; callback saves tokens to api_credentials.
 */
router.get('/authorize/ebay', async (req: Request, res: Response) => {
  try {
    const clientId = (process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
    const runame = (process.env.EBAY_RUNAME || '').trim();
    const explicitRedirect = (process.env.EBAY_REDIRECT_URI || '').trim();
    // eBay OAuth 2.0 requires exact full URL. Prefer full URL (e.g. .../api/marketplace-oauth/c) over RuName to avoid invalid_request.
    const isFullUrl = (s: string) => /^https?:\/\//i.test(s);
    let redirectUri = (explicitRedirect && isFullUrl(explicitRedirect)) ? explicitRedirect : (runame || explicitRedirect || getEbayRedirectUri());
    const certId = (process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET || '').trim();

    if (!clientId || !redirectUri) {
      logger.error('[OAuth Authorize] Missing eBay env vars', { hasClientId: !!clientId, hasRedirectUri: !!redirectUri });
      return res.status(500).json({
        success: false,
        message: 'Missing EBAY_APP_ID or EBAY_REDIRECT_URI. Configure in Railway env vars.',
      });
    }

    // eBay requiere scopes en formato URL completo
    const scope = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
    ].filter((v, i, a) => a.indexOf(v) === i).join(' ');

    const userId = 1;
    const ts = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const secret = getOAuthStateSecret() || process.env.JWT_SECRET || 'default-key';
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
    const url = await marketplaceService.getEbayOAuthStartUrl(userId, environment, {
      requestBaseUrl: getRequestBaseUrl(req),
      frontendBaseUrl: getFrontendReturnBaseUrl(),
    });
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

/**
 * GET /api/marketplace-oauth/oauth/start/mercadolibre
 * Redirects to MercadoLibre OAuth page. Requires auth.
 */
router.get('/oauth/start/mercadolibre', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Debes estar autenticado' });
    }
    const env = (req.query.environment as string)?.toLowerCase();
    const environment = env === 'sandbox' ? 'sandbox' as const : 'production' as const;
    const url = await marketplaceService.getMercadoLibreOAuthStartUrl(userId, environment, {
      requestBaseUrl: getRequestBaseUrl(req),
      frontendBaseUrl: getFrontendReturnBaseUrl(),
    });
    logger.info('[OAuth Start] Redirecting to MercadoLibre', { userId, environment });
    return res.redirect(302, url);
  } catch (e: any) {
    logger.error('[OAuth Start] MercadoLibre OAuth start failed', { error: e?.message });
    return res.status(400).json({
      success: false,
      error: e?.message || 'No se pudo iniciar OAuth de MercadoLibre',
      message: 'Verifica clientId, clientSecret y MERCADOLIBRE_REDIRECT_URI en Settings o variables de entorno.',
    });
  }
});

/** base64url regex: A-Za-z0-9_- only */
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

const RETURN_ORIGIN_MAP: Record<string, string> = {
  '1': 'https://www.ivanreseller.com',
  '2': 'https://ivanreseller.com',
  '0': '',
};

function parseCompactMlState(decoded: string) {
  const parts = decoded.split(':');
  // ml:<userId>:<tsHex>:<nonce>:<envChar>:<roFlag>:<sig16>
  if (parts.length !== 7 || parts[0] !== 'ml') {
    return { ok: false, reason: 'invalid_format' };
  }
  const [, userIdStr, tsHex, _nonce, envChar, roFlag, sig] = parts;
  const userId = parseInt(userIdStr, 10);
  if (!userId) return { ok: false, reason: 'invalid_user_or_marketplace' };

  const secret = getOAuthStateSecret() || process.env.JWT_SECRET || 'default-key';
  if (!secret || secret === 'default-key') return { ok: false, reason: 'missing_secret' };

  const payload = `ml:${userIdStr}:${tsHex}:${_nonce}:${envChar}:${roFlag}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 16);
  if (expectedSig !== sig) {
    logger.warn('[OAuth parseCompactMlState] Signature mismatch', {
      decodedLength: decoded.length,
      payloadLength: payload.length,
      sigLength: sig.length,
      expectedSigLength: expectedSig.length,
    });
    return { ok: false, reason: 'invalid_signature' };
  }

  const environment = envChar === 's' ? 'sandbox' : 'production';
  const returnOrigin = RETURN_ORIGIN_MAP[roFlag] || '';

  return {
    ok: true,
    userId,
    marketplace: 'mercadolibre',
    redirectUri: '',
    environment: environment as 'sandbox' | 'production',
    hasExpiration: false,
    expirationTime: null,
    returnOrigin,
  };
}

function parseState(state: string) {
  try {
    if (!state || typeof state !== 'string') {
      return { ok: false, reason: 'invalid_format' };
    }
    const trimmedState = state.trim();
    if (!trimmedState) {
      return { ok: false, reason: 'invalid_format' };
    }
    if (!BASE64URL_REGEX.test(trimmedState)) {
      logger.warn('[OAuth parseState] Invalid base64url encoding', {
        stateLength: trimmedState.length,
        statePreview: trimmedState.substring(0, 40) + (trimmedState.length > 40 ? '...' : ''),
        hasSpaces: /\s/.test(trimmedState),
      });
      return { ok: false, reason: 'invalid_state_encoding' };
    }
    const decoded = Buffer.from(trimmedState, 'base64url').toString('utf8');

    // Compact MercadoLibre format: ml:<userId>:<tsHex>:<nonce>:<envChar>:<roFlag>:<sig16>
    if (decoded.startsWith('ml:')) {
      return parseCompactMlState(decoded);
    }

    const parts = decoded.split('|');
    
    // Formato v3 eBay (9): userId|marketplace|ts|nonce|redirB64|env|expirationTime|returnOrigin|signature
    // Formato v2 eBay (8): userId|marketplace|ts|nonce|redirB64|env|expirationTime|signature
    // Formato v2 ML (8): userId|marketplace|ts|nonce|redirB64|env|returnOrigin|signature
    // Formato legacy (7): userId|marketplace|ts|nonce|redirB64|env|signature
    if (parts.length < 7) return { ok: false, reason: 'invalid_format' };
    
    let hasExpiration = false;
    let returnOrigin = '';
    let sig: string;
    let payloadForSig: string;
    const userIdStr = parts[0];
    const mk = parts[1];
    const ts = parts[2];
    const nonce = parts[3];
    const redirB64 = parts[4];
    const env = parts[5] || 'production';
    const p6 = parts[6];
    const p7 = parts[7];
    const p8 = parts[8];

    if (parts.length === 9) {
      // v3 eBay: expiration at 6, returnOrigin at 7, sig at 8
      hasExpiration = true;
      returnOrigin = (p7 || '').trim();
      sig = p8 || '';
      payloadForSig = [userIdStr, mk, ts, nonce, redirB64, env, p6, returnOrigin].join('|');
      const expirationTime = parseInt(p6, 10);
      if (isNaN(expirationTime) || expirationTime < Date.now()) {
        return { ok: false, reason: 'expired', expiredAt: expirationTime, now: Date.now() };
      }
    } else if (parts.length === 8) {
      if (/^\d+$/.test(p6)) {
        // v2 eBay: expiration at 6, sig at 7
        hasExpiration = true;
        sig = p7 || '';
        payloadForSig = [userIdStr, mk, ts, nonce, redirB64, env, p6].join('|');
        const expirationTime = parseInt(p6, 10);
        if (isNaN(expirationTime) || expirationTime < Date.now()) {
          return { ok: false, reason: 'expired', expiredAt: expirationTime, now: Date.now() };
        }
      } else if (/^https?:\/\//.test(p6) || p6 === '') {
        // v2 ML: returnOrigin at 6, sig at 7. Normalizar sin trailing slash. Permitir vacío.
        returnOrigin = (p6 || '').trim().replace(/\/$/, '');
        sig = p7 || '';
        payloadForSig = [userIdStr, mk, ts, nonce, redirB64, env, returnOrigin].join('|');
      } else {
        return { ok: false, reason: 'invalid_format' };
      }
    } else {
      // 7 parts legacy
      sig = p6 || '';
      payloadForSig = [userIdStr, mk, ts, nonce, redirB64, env].join('|');
    }
    
    const secret = getOAuthStateSecret() || process.env.JWT_SECRET || 'default-key';
    if (!secret || secret === 'default-key') {
      return { ok: false, reason: 'missing_secret' };
    }

    const expectedSig = crypto.createHmac('sha256', secret).update(payloadForSig).digest('hex');
    if (expectedSig !== sig) {
      let redirectUriDecoded = '';
      try {
        redirectUriDecoded = Buffer.from(redirB64, 'base64url').toString('utf8');
      } catch {
        redirectUriDecoded = '(decode failed)';
      }
      logger.warn('[OAuth parseState] Signature mismatch', {
        statePreview: trimmedState ? `${trimmedState.substring(0, 30)}...${trimmedState.substring(Math.max(0, trimmedState.length - 20))}` : 'empty',
        decodedLength: decoded?.length ?? 0,
        partsCount: parts?.length ?? 0,
        redirectUriDecoded: redirectUriDecoded ? redirectUriDecoded.substring(0, 80) + (redirectUriDecoded.length > 80 ? '...' : '') : '(empty)',
        payloadForSigPreview: payloadForSig ? payloadForSig.substring(0, 80) + (payloadForSig.length > 80 ? '...' : '') : '(empty)',
        payloadLength: payloadForSig.length,
        returnOriginLength: (returnOrigin || '').length,
        sigLength: sig?.length ?? 0,
        expectedSigLength: expectedSig?.length ?? 0,
      });
      return { ok: false, reason: 'invalid_signature' };
    }
    
    const redirectUri = Buffer.from(redirB64, 'base64url').toString('utf8');
    const userId = parseInt(userIdStr, 10);
    if (!userId || !mk) return { ok: false, reason: 'invalid_user_or_marketplace' };

    // Validar returnOrigin antes de usar (evitar open redirect)
    const allowedOrigins = [
      'https://ivanreseller.com', 'https://www.ivanreseller.com',
      'http://ivanreseller.com', 'http://www.ivanreseller.com',
      'http://localhost:5173', 'http://localhost:3000',
      'http://127.0.0.1:5173', 'http://127.0.0.1:3000',
    ];
    const safeReturnOrigin = returnOrigin && allowedOrigins.includes(returnOrigin) ? returnOrigin : '';
    
    return {
      ok: true,
      userId,
      marketplace: mk,
      redirectUri,
      environment: env as 'sandbox' | 'production',
      hasExpiration,
      expirationTime: hasExpiration ? parseInt(p6, 10) : null,
      returnOrigin: safeReturnOrigin
    };
  } catch (error: any) {
    return { ok: false, reason: 'parse_error', error: error.message };
  }
}

async function handleMercadoLibreCallback(req: Request, res: Response, code: string, state: string) {
  const startTime = Date.now();
  try {
    const parsed = parseState(state);
    if (!parsed.ok) {
      logger.error('[ML Callback] Invalid state', {
        service: 'marketplace-oauth',
        reason: parsed.reason,
        stateLength: state.length,
      });
      const errorUrl = `${getFrontendReturnBaseUrl()}/api-settings?oauth=error&provider=mercadolibre&reason=${encodeURIComponent(parsed.reason)}`;
      return res.redirect(302, errorUrl);
    }

    const { userId, environment, returnOrigin } = parsed as {
      userId: number;
      redirectUri: string;
      environment: 'sandbox' | 'production';
      returnOrigin?: string;
    };

    logger.info('[ML Callback] State parsed', { service: 'marketplace-oauth', userId, environment });

    const cred = await marketplaceService.getCredentials(userId, 'mercadolibre', environment);
    const clientId = process.env.MERCADOLIBRE_CLIENT_ID || cred?.credentials?.clientId || '';
    const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET || cred?.credentials?.clientSecret || '';
    const siteId = cred?.credentials?.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC';

    if (!clientId || !clientSecret) {
      logger.error('[ML Callback] Missing credentials', { service: 'marketplace-oauth', userId, hasClientId: !!clientId, hasClientSecret: !!clientSecret });
      return res.status(400).send('<html><body>Missing Client ID or Client Secret. Save credentials before authorizing.</body></html>');
    }

    const mlRedirectUri =
      cred?.credentials?.redirectUri
      || process.env.MERCADOLIBRE_REDIRECT_URI
      || process.env.MERCADOLIBRE_REDIRECT_URL
      || getMercadoLibreRedirectUri();

    const clientIdPreview = clientId ? `${clientId.substring(0, 10)}...${clientId.substring(Math.max(0, clientId.length - 4))}` : '(empty)';
    const secretLen = clientSecret?.length || 0;
    const secretPreview = secretLen > 6 ? `${clientSecret.substring(0, 3)}...${clientSecret.substring(secretLen - 3)}` : '(too short)';

    logger.info('[ML Callback] Exchanging code', {
      service: 'marketplace-oauth',
      userId,
      codeLength: code.length,
      redirectUri: mlRedirectUri,
      redirectUriSource: cred?.credentials?.redirectUri ? 'credentials' : 'env/canonical',
      clientIdPreview,
      clientIdLength: clientId.length,
      secretLength: secretLen,
      secretPreview,
      siteId,
      tokenEndpoint: 'https://api.mercadolibre.com/oauth/token',
    });

    const ml = new MercadoLibreService({ clientId, clientSecret, siteId });
    const tokens = await ml.exchangeCodeForToken(code, mlRedirectUri);

    logger.info('[ML Callback] Token exchange successful', {
      service: 'marketplace-oauth',
      userId,
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
    });

    const newCreds = {
      ...(cred?.credentials || {}),
      clientId,
      clientSecret,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId: tokens.userId,
      siteId: siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
      sandbox: environment === 'sandbox',
    };

    await marketplaceService.saveCredentials(userId, 'mercadolibre', newCreds, environment);

    const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
    clearCredentialsCache(userId, 'mercadolibre', environment);
    clearCredentialsCache(userId, 'mercadolibre', environment === 'sandbox' ? 'production' : 'sandbox');

    const persistedCreds = await marketplaceService.getCredentials(userId, 'mercadolibre', environment);
    const persistedAccessToken = String(
      persistedCreds?.credentials?.accessToken || persistedCreds?.credentials?.access_token || '',
    ).trim();
    const persistedRefreshToken = String(
      persistedCreds?.credentials?.refreshToken || persistedCreds?.credentials?.refresh_token || '',
    ).trim();
    const persistedUserId = String(persistedCreds?.credentials?.userId || tokens.userId || '').trim();
    const dbSaveConfirmed = !!persistedAccessToken && !!persistedRefreshToken;

    if (!dbSaveConfirmed) {
      logger.error('[ML Callback] OAuth DB persistence validation failed', {
        service: 'marketplace-oauth',
        userId,
        environment,
        hasPersistedAccessToken: !!persistedAccessToken,
        hasPersistedRefreshToken: !!persistedRefreshToken,
      });
      throw new Error('MercadoLibre OAuth persistence validation failed: access/refresh token not persisted');
    }

    const persistedMl = new MercadoLibreService({
      clientId,
      clientSecret,
      accessToken: persistedAccessToken,
      refreshToken: persistedRefreshToken,
      userId: persistedUserId || tokens.userId,
      siteId,
    });
    const runtimeCheck = await persistedMl.testConnection();
    if (!runtimeCheck.success) {
      logger.error('[ML Callback] OAuth runtime verification failed after save', {
        service: 'marketplace-oauth',
        userId,
        environment,
        message: runtimeCheck.message,
      });
      throw new Error(`MercadoLibre OAuth runtime verification failed: ${runtimeCheck.message}`);
    }

    const { apiAvailability } = await import('../../services/api-availability.service');
    await apiAvailability.clearAPICache(userId, 'mercadolibre').catch(() => {});
    await apiAvailability.checkMercadoLibreAPI(userId, environment).catch(() => {});

    logger.info('[ML Callback] Credentials saved', {
      service: 'marketplace-oauth',
      userId,
      duration: Date.now() - startTime,
      dbSaveConfirmed,
      runtimeUsable: true,
    });

    const safeReturnOrigin = returnOrigin || '';
    const baseForRedirect = safeReturnOrigin || getFrontendReturnBaseUrl();
    const fallbackReturnUrl = `${baseForRedirect}/api-settings?oauth=success&provider=mercadolibre`;
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Autorización completada</title>
          <style>body{font-family:Arial,sans-serif;padding:20px;text-align:center;max-width:500px;margin:2rem auto}.success{color:green;font-size:18px;margin:20px 0}.btn{display:inline-block;margin-top:1rem;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-weight:600}</style>
        </head>
        <body>
          <div class="success">Autorización MercadoLibre completada</div>
          <p>Redirigiendo...</p>
          <p><a href="${fallbackReturnUrl}" class="btn">Volver a API Settings</a></p>
          <script>
            (function(){
              if(window.opener&&!window.opener.closed){try{window.opener.postMessage({type:'oauth_success',marketplace:'mercadolibre',timestamp:Date.now()},'*')}catch(e){}}
              setTimeout(function(){window.location.href='${fallbackReturnUrl.replace(/'/g, "\\'")}'},2000);
            })();
          </script>
        </body>
      </html>
    `);
  } catch (e: any) {
    const errorMessage = e?.message || 'Unknown error';
    logger.error('[ML Callback] Error', {
      service: 'marketplace-oauth',
      error: errorMessage,
      status: e?.response?.status,
      responseData: e?.response?.data,
      duration: Date.now() - startTime,
    });
    const webBase = getFrontendReturnBaseUrl();
    const errorReturnUrl = `${webBase}/api-settings?oauth=error&provider=mercadolibre&reason=${encodeURIComponent(errorMessage)}`;
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Error de autorización - MercadoLibre</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; text-align: center; max-width: 600px; margin: 2rem auto; background: #f8f9fa; color: #333; }
            .card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .error-icon { font-size: 48px; margin-bottom: 1rem; }
            .error { color: #dc2626; font-size: 18px; font-weight: 600; margin: 12px 0; }
            .details { color: #666; font-size: 14px; margin-top: 12px; padding: 12px; background: #fef2f2; border-radius: 8px; word-break: break-word; }
            .btn { display: inline-block; margin-top: 1.5rem; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
            .btn:hover { background: #1d4ed8; }
            .hint { color: #888; font-size: 13px; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="error-icon">&#10060;</div>
            <div class="error">Error en la autorización de MercadoLibre</div>
            <div class="details">${errorMessage}</div>
            <p class="hint">Verifica que el Client ID y Client Secret en API Settings coincidan con los de tu aplicación en MercadoLibre Developers.</p>
            <p><a href="${errorReturnUrl}" class="btn">Volver a API Settings</a></p>
          </div>
          <script>
            if(window.opener&&!window.opener.closed){try{window.opener.postMessage({type:'oauth_error',marketplace:'mercadolibre',error:'${errorMessage.replace(/'/g, "\\'").replace(/\n/g, ' ')}'},'*')}catch(e){}}
            setTimeout(function(){window.location.href='${errorReturnUrl.replace(/'/g, "\\'")}'},8000);
          </script>
        </body>
      </html>
    `);
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

    // MercadoLibre callback lands on this shared /callback path.
    // Handle inline to avoid a 307 redirect round-trip through Vercel.
    if (stateStr) {
      try {
        const decoded = Buffer.from(stateStr.trim(), 'base64url').toString('utf8');
        if (decoded.startsWith('ml:')) {
          logger.info('[OAuth Callback] MercadoLibre state detected on /callback route, processing inline', {
            service: 'marketplace-oauth',
            stateLength: stateStr.length,
          });
          return handleMercadoLibreCallback(req, res, codeStr, stateStr);
        }
      } catch {}
    }

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
    
    const webBaseUrlForRedirect = getFrontendReturnBaseUrl();

    // Validar que no haya error en los parámetros de query
    if (errorStr) {
      logger.error('[OAuth Callback] OAuth error from provider', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId,
        error: errorStr,
        errorDescription: req.query.error_description || 'No description'
      });
      const errorUrl = `${webBaseUrlForRedirect}/api-settings?oauth=error&provider=aliexpress-dropshipping&reason=${encodeURIComponent(errorStr)}&correlationId=${correlationId}`;
      return res.redirect(302, errorUrl);
    }

    // Validar que el código no esté vacío
    if (!codeStr || codeStr.trim().length === 0) {
      logger.error('[OAuth Callback] Missing authorization code', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId,
        hasState: !!state
      });
      const errorUrl = `${webBaseUrlForRedirect}/api-settings?oauth=error&provider=aliexpress-dropshipping&reason=missing_code&correlationId=${correlationId}`;
      return res.redirect(302, errorUrl);
    }
    
    // Validar que el state no esté vacío (para flujo real)
    if (!stateStr || stateStr.trim().length === 0) {
      logger.error('[OAuth Callback] Missing state parameter', {
        service: 'marketplace-oauth',
        marketplace,
        correlationId,
        hasCode: !!code
      });
      const errorUrl = `${webBaseUrlForRedirect}/api-settings?oauth=error&provider=aliexpress-dropshipping&reason=missing_state&correlationId=${correlationId}`;
      return res.redirect(302, errorUrl);
    }

    // Validar state JWT stateless (AliExpress Dropshipping)
    const parsed = verifyStateAliExpressSafe(stateStr);
    let userId: number;

    if (parsed.ok) {
      userId = parsed.userId;
    } else {
      const reason = (parsed as { ok: false; reason: string }).reason;
      // Fallback: state="ivanreseller" (usado por script open-dropshipping-auth-url.ts)
      // Seguridad: solo aceptar si state es exactamente ese valor; usar userId=1.
      if (reason === 'invalid_signature' && stateStr === 'ivanreseller') {
        logger.warn('[OAuth Callback] Using fallback userId=1 for legacy state=ivanreseller', {
          service: 'marketplace-oauth',
          correlationId,
          marketplace,
        });
        userId = 1;
      } else {
        logger.error('[OAuth Callback] Invalid state', {
          service: 'marketplace-oauth',
          marketplace,
          correlationId,
          reason,
          stateLength: stateStr.length
        });
        const errorUrl = `${webBaseUrlForRedirect}/api-settings?oauth=error&provider=aliexpress-dropshipping&reason=${encodeURIComponent(reason)}&correlationId=${correlationId}`;
        return res.redirect(302, errorUrl);
      }
    }
    const environment: 'sandbox' | 'production' = 'production';
    const redirectUri: string | null = null; // JWT stateless: usar canonicalCallbackUrl más abajo

    logger.info('[OAuth Callback] State verified successfully', {
      service: 'marketplace-oauth',
      marketplace,
      correlationId,
      userId,
      environment
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
        appKeyPreview: appKey ? `${String(appKey).slice(0, 6)}...` : null,
        appSecretLength: appSecret ? String(appSecret).length : 0,
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

    const rawHost = req.get('host') || req.headers['x-forwarded-host'];
    const requestHost = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    const canonicalRedirectUri = getAliExpressDropshippingRedirectUri();
    try {
      const canonicalHost = new URL(canonicalRedirectUri).hostname;
      const requestHostname = requestHost ? String(requestHost).replace(/:.*$/, '').toLowerCase() : '';
      if (requestHostname && canonicalHost !== requestHostname && !requestHostname.endsWith('.' + canonicalHost)) {
        logger.warn('[OAuth Callback] Host may not match canonical redirect_uri domain', {
          requestHost,
          canonicalHost,
          canonicalRedirectUri,
          service: 'marketplace-oauth',
        });
      }
    } catch {
      // ignore URL parse errors
    }
    logger.info('[OAuth Callback] Exchanging code for AliExpress Dropshipping tokens', {
      service: 'marketplace-oauth',
      correlationId,
      userId,
      environment,
      codeLength: codeStr.length,
      redirectUriParamLength: redirectUri?.length || 0,
      appKeyPreview: `${String(appKey).slice(0, 6)}...`,
      appSecretLength: String(appSecret).length,
      redirectUriUsed: canonicalRedirectUri,
      canonicalRedirectUriLength: canonicalRedirectUri.length,
      requestUrl: req.originalUrl || req.url,
      requestHost,
      requestProtocol: req.headers['x-forwarded-proto'] || req.protocol,
      tokenExchangeStatus: 'started',
    });

    try {
      // redirect_uri EXACTAMENTE el mismo que en getAuthUrl (canonical)
      const tokens = await aliexpressDropshippingAPIService.exchangeCodeForToken(
        codeStr,
        canonicalRedirectUri,
        appKey,
        appSecret
      );

      logger.info('[OAuth Callback] AliExpress Dropshipping token exchange successful', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
        redirectUriUsed: canonicalRedirectUri,
        requestHost,
        tokenExchangeStatus: 'success',
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
        sandbox: (environment as string) === 'sandbox',
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

      const persistedCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment);
      const persistedAccessToken = String((persistedCreds as any)?.accessToken || '').trim();
      const persistedRefreshToken = String((persistedCreds as any)?.refreshToken || '').trim();
      const dbSaveConfirmed = !!persistedAccessToken && !!persistedRefreshToken;

      if (!dbSaveConfirmed) {
        logger.error('[OAuth Callback] Dropshipping OAuth DB persistence validation failed', {
          service: 'marketplace-oauth',
          correlationId,
          userId,
          environment,
          dbSaveConfirmed,
          hasPersistedAccessToken: !!persistedAccessToken,
          hasPersistedRefreshToken: !!persistedRefreshToken,
        });
        throw new Error('AliExpress OAuth persistence validation failed: access/refresh token not persisted');
      }

      // Limpiar cache de credenciales
      const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
      clearCredentialsCache(userId, 'aliexpress-dropshipping', environment);
      clearCredentialsCache(userId, 'aliexpress-dropshipping', (environment as string) === 'sandbox' ? 'production' : 'sandbox');
      
      // Limpiar cache de API availability del singleton para que /api/credentials/status devuelva estado actualizado
      const { apiAvailability } = await import('../../services/api-availability.service');
      await apiAvailability.clearAPICache(userId, 'aliexpress-dropshipping').catch((err) => {
        logger.warn('[OAuth Callback] Error clearing API cache', { error: err?.message || String(err), correlationId });
      });
      await apiAvailability.checkAliExpressDropshippingAPI(userId, environment, true).catch((err) => {
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
        dbSaveConfirmed,
        hasPersistedAccessToken: !!persistedAccessToken,
        hasPersistedRefreshToken: !!persistedRefreshToken,
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

      // Actualizar estado de AliExpress para que el Navbar muestre "Configurado" en lugar de "Estado desconocido"
      try {
        const { marketplaceAuthStatusService } = await import('../../services/marketplace-auth-status.service');
        await marketplaceAuthStatusService.setStatus(userId, 'aliexpress', 'configured', {
          message: 'OAuth AliExpress Dropshipping renovado correctamente',
        });
      } catch (statusErr: any) {
        logger.warn('[OAuth Callback] Failed to update marketplace auth status (non-critical)', {
          correlationId,
          userId,
          error: statusErr?.message || String(statusErr),
        });
      }

      // ✅ Redirect a frontend (una sola ventana; postMessage + redirect para volver a la app)
      const successUrl = `${webBaseUrlForRedirect}/api-settings?oauth=success&provider=aliexpress-dropshipping&correlationId=${correlationId}`;
      const errorUrl = `${webBaseUrlForRedirect}/api-settings?oauth=error&provider=aliexpress-dropshipping&correlationId=${correlationId}`;
      
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Autorización completada</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; max-width: 500px; margin: 2rem auto; }
              .success { color: green; font-size: 18px; margin: 20px 0; }
              .info { color: #666; font-size: 14px; margin-top: 20px; }
              .btn { display: inline-block; margin-top: 1rem; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
              .btn:hover { background: #1d4ed8; }
            </style>
          </head>
          <body>
            <div class="success">✅ Autorización AliExpress completada</div>
            <div class="info" id="msg">Comprobando ventana...</div>
            <p><a href="${successUrl}" class="btn">Volver a API Settings</a></p>
            <script>
              (function() {
                var u = '${successUrl.replace(/'/g, "\\'")}';
                var sendMessage = function() {
                  if (window.opener && !window.opener.closed) {
                    try {
                      window.opener.postMessage({ type: 'oauth_success', marketplace: 'aliexpress-dropshipping', correlationId: '${correlationId}', timestamp: Date.now() }, '*');
                      return true;
                    } catch (e) { return false; }
                  }
                  return false;
                };
                sendMessage();
                setTimeout(function() { sendMessage(); }, 300);
                setTimeout(function() { sendMessage(); }, 800);
                if (window.opener && !window.opener.closed) {
                  var msg = document.getElementById('msg');
                  if (msg) msg.textContent = 'Ventana se cerrar\u00e1. La app se actualizar\u00e1 autom\u00e1ticamente.';
                  setTimeout(function() { window.close(); }, 600);
                } else {
                  var msg = document.getElementById('msg');
                  if (msg) msg.textContent = 'Redirigiendo a la aplicaci\u00f3n en unos segundos...';
                  setTimeout(function() { window.location.href = u; }, 2000);
                }
              })();
            </script>
          </body>
        </html>
      `);

    } catch (tokenError: any) {
      const elapsed = Date.now() - startTime;
      const requestId = String(
        tokenError?.aliexpressRequestId ??
        tokenError?.response?.data?.request_id ??
        tokenError?.response?.data?.data?.request_id ??
        ''
      ).trim();
      const redirectUriUsed = tokenError?.redirectUriUsed ?? canonicalRedirectUri ?? '';
      logger.error('[OAuth Callback] AliExpress Dropshipping token exchange failed', {
        service: 'marketplace-oauth',
        correlationId,
        userId,
        environment,
        elapsed,
        redirectUriUsed: redirectUriUsed || canonicalRedirectUri,
        requestHost,
        tokenExchangeStatus: 'failed',
        aliexpressRequestId: requestId || undefined,
        error: tokenError?.message || String(tokenError),
        responseData: tokenError?.response?.data,
        status: tokenError?.response?.status,
        stack: tokenError?.stack?.substring(0, 500),
      });

      // ✅ FIX OAUTH: Redirect a frontend con error (una sola respuesta)
      const errorUrl = `${webBaseUrlForRedirect}/api-settings?oauth=error&provider=aliexpress-dropshipping&correlationId=${correlationId}&error=${encodeURIComponent(tokenError?.message || 'Token exchange failed')}`;
      const errorMessage = tokenError?.message || 'Token exchange failed';
      const redirectInstructions = getAliExpressRedirectUriInstructions();
      res.status(500).send(`
        <html>
          <head>
            <title>Error de autorización</title>
            <meta http-equiv="refresh" content="3;url=${errorUrl}" />
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              .error { color: red; font-size: 18px; margin: 20px 0; }
              .details { color: #666; font-size: 12px; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div class="error">❌ Error en la autorización</div>
            <div class="details">${errorMessage}</div>
            <div class="details" style="margin-top: 16px; padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; text-align: left; white-space: pre-wrap;">${redirectInstructions}</div>
            ${requestId ? `<div class="details" style="margin-top: 12px;"><strong>Request ID de AliExpress:</strong> ${requestId}</div>` : ''}
            <div class="details" style="margin-top: 12px;">Si contactas soporte AliExpress, facilita: correlationId ${correlationId}${requestId ? `, request_id ${requestId}` : ''}${redirectUriUsed ? `, redirect_uri ${redirectUriUsed}` : ''}.</div>
            <div style="font-size: 12px; margin-top: 20px;">Redirigiendo a la aplicación...</div>
            <div style="font-size: 12px; margin-top: 10px;">Si no eres redirigido, <a href="${errorUrl}">haz clic aquí</a></div>
            <div style="text-align: center; margin-top: 30px;">
              <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Cerrar ventana</button>
            </div>
            <script>
              if (window.opener && !window.opener.closed) {
                try {
                  window.opener.postMessage({ type: 'oauth_error', marketplace: 'aliexpress-dropshipping', error: '${(tokenError?.message || 'Unknown error').replace(/'/g, "\\'")}' }, '*');
                } catch (e) {}
              }
              setTimeout(function() { window.location.href = '${errorUrl}'; }, 3000);
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

/**
 * GET /api/marketplace-oauth/c
 * eBay callback alias: eBay Developer Portal puede tener "Auth accepted URL" = https://www.ivanreseller.com/api/marketplace-oauth/c
 * Redirige internamente a /oauth/callback/ebay para reutilizar el mismo handler.
 */
router.get('/c', (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;
  const params = new URLSearchParams();
  if (code) params.set('code', String(code));
  if (state) params.set('state', String(state));
  if (error) params.set('error', String(error));
  if (error_description) params.set('error_description', String(error_description));
  const qs = params.toString();
  const target = `/api/marketplace-oauth/oauth/callback/ebay${qs ? '?' + qs : ''}`;
  logger.info('[OAuth Callback] eBay /c alias redirecting to oauth/callback/ebay', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
  });
  return res.redirect(302, target);
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
    
    // Validar que no haya error en los parámetros de query (eBay devuelve error=invalid_scope, etc.)
    if (errorParam) {
      const errorDesc = String(req.query.error_description || 'Please try again.');
      const webBase = getFrontendReturnBaseUrl();
      const returnUrl = `${webBase}/api-settings`;
      const suggestedRedirect = marketplace === 'ebay' ? getEbayRedirectUri() : '';
      logger.error('[OAuth Callback] OAuth error from provider', {
        service: 'marketplace-oauth',
        marketplace,
        error: errorParam,
        errorDescription: errorDesc
      });
      const scopeHint = errorParam === 'invalid_scope'
        ? '<p style="color: #666; font-size: 14px;"><strong>invalid_scope:</strong> Ve a <a href="https://developer.ebay.com/my/keys" target="_blank">eBay Developer</a> → Tu app → OAuth Scopes y añade: sell.inventory, sell.marketing, sell.account, sell.fulfillment.</p>'
        : '';
      const redirectHint = errorParam === 'redirect_uri_mismatch' && suggestedRedirect
        ? `<p style="color: #666; font-size: 14px;"><strong>redirect_uri_mismatch:</strong> En eBay Developer Portal, Auth Accepted URL debe ser exactamente: <code style="word-break:break-all;">${suggestedRedirect}</code></p>`
        : '';
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Error de autorización</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1.5rem;">
          <h2>Error de autorización</h2>
          <p><strong>${marketplace === 'ebay' ? 'eBay' : marketplace}</strong> devolvió: ${errorParam}</p>
          <p>${errorDesc}</p>
          ${scopeHint}${redirectHint}
          <p><a href="${returnUrl}" style="display: inline-block; margin-top: 1rem; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Volver a API Settings</a></p>
        </body>
        </html>
      `);
    }
    
    const webBaseCallback = getFrontendReturnBaseUrl();
    const returnUrlCallback = `${webBaseCallback}/api-settings`;

    // Validar que el código no esté vacío
    if (!code || code.trim().length === 0) {
      logger.error('[OAuth Callback] Missing authorization code', {
        service: 'marketplace-oauth',
        marketplace,
        hasState: !!state
      });
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Error de autorización</title></head>
        <body style="font-family: sans-serif; max-width: 560px; margin: 2rem auto; padding: 1.5rem;">
          <h2>Error de autorización</h2>
          <p>No se recibió código de autorización. Vuelve a intentar desde API Settings.</p>
          <p><a href="${returnUrlCallback}" style="display: inline-block; margin-top: 1rem; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Volver a API Settings</a></p>
        </body>
        </html>
      `);
    }
    
    const isAliExpressDropshippingMarketplace =
      marketplace === 'aliexpress-dropshipping' || marketplace === 'aliexpress_dropshipping';

    let userId: number;
    let redirectUri: string;
    let environment: 'sandbox' | 'production';
    let returnOriginForRedirect = '';

    if (isAliExpressDropshippingMarketplace) {
      const parsedAliExpress = verifyStateAliExpressSafe(state);
      if (!parsedAliExpress.ok) {
        const reason = (parsedAliExpress as { ok: false; reason: string }).reason;
        logger.error('[OAuth Callback] Invalid AliExpress JWT state', {
          service: 'marketplace-oauth',
          marketplace,
          reason,
          stateLength: state.length,
        });
        const returnUrlState = getFrontendReturnBaseUrl() + '/api-settings';
        return res.status(200).send(`
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><title>Error de autorización</title></head>
          <body style="font-family: sans-serif; max-width: 560px; margin: 2rem auto; padding: 1.5rem;">
            <h2>Error de autorización</h2>
            <p>Error de verificación del estado OAuth de AliExpress (${reason}).</p>
            <p><strong>Qué hacer:</strong> Vuelve a API Settings y ejecuta OAuth nuevamente.</p>
            <p><a href="${returnUrlState}" style="display: inline-block; margin-top: 1rem; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Volver a API Settings</a></p>
          </body>
          </html>
        `);
      }

      userId = parsedAliExpress.userId;
      redirectUri = getAliExpressDropshippingRedirectUri();
      environment = 'production';
    } else {
      const parsed = parseState(state);
      if (!parsed.ok) {
        let decodedPreview = '';
        let partsCount = 0;
        try {
          const dec = Buffer.from(state.trim(), 'base64url').toString('utf8');
          decodedPreview = dec.substring(0, 120);
          partsCount = dec.split('|').length;
        } catch {}
        logger.error('[OAuth Callback] Invalid state', {
          service: 'marketplace-oauth',
          marketplace,
          reason: parsed.reason,
          stateLength: state.length,
          stateFirst40: state.substring(0, 40),
          stateLast20: state.substring(Math.max(0, state.length - 20)),
          decodedPreview,
          partsCount,
          rawQueryState: String(req.query.state || ''),
          rawQueryStateLength: String(req.query.state || '').length,
        });

        const errorRedirectUrl = `${getFrontendReturnBaseUrl()}/api-settings?oauth=error&provider=${marketplace}&reason=${encodeURIComponent(parsed.reason)}`;
        return res.redirect(302, errorRedirectUrl);
      }

      const parsedState = parsed as { userId: number; redirectUri: string; environment: 'sandbox' | 'production'; returnOrigin?: string };
      userId = parsedState.userId;
      redirectUri = parsedState.redirectUri;
      environment = parsedState.environment;
      returnOriginForRedirect = parsedState.returnOrigin || '';
    }
    
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
      // Use only environment from state; do NOT override with EBAY_SANDBOX (would cause client authentication failed)
      const sandbox = environment === 'sandbox';

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
      const appIdTrim = String(appId || '').trim();
      const certIdTrim = String(certId || '').trim();
      if (!appIdTrim || appIdTrim.length < 3) {
        logger.error('[OAuth Callback] Missing or invalid eBay App ID', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasAppId: !!appIdTrim,
          appIdLength: appIdTrim?.length || 0
        });
        return res
          .status(400)
          .send('<html><body>App ID de eBay incompleto o inválido. Guarda credenciales correctas antes de autorizar.</body></html>');
      }
      if (!certIdTrim || certIdTrim.length < 3) {
        logger.error('[OAuth Callback] Missing or invalid eBay Cert ID', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasCertId: !!certIdTrim,
          certIdLength: certIdTrim?.length || 0
        });
        return res
          .status(400)
          .send('<html><body>Cert ID de eBay incompleto o inválido. Guarda credenciales correctas antes de autorizar.</body></html>');
      }
      if (!redirectUri || !String(redirectUri).trim()) {
        logger.error('[OAuth Callback] Missing redirect URI in OAuth state', {
          service: 'marketplace-oauth',
          userId,
          environment,
          redirectUriLength: redirectUri?.length || 0
        });
        return res
          .status(400)
          .send('<html><body>Redirect URI ausente en el estado OAuth. Vuelve a API Settings, guarda el Redirect URI y pulsa OAuth de nuevo.</body></html>');
      }
      
      const ebay = new EbayService({ appId: appIdTrim, devId, certId: certIdTrim, sandbox });
      
      const requestHost = req.get('host') || req.headers['x-forwarded-host'] || 'unknown';
      logger.info('[OAuth Callback] Exchanging code for token', {
        service: 'marketplace-oauth',
        userId,
        environment,
        sandbox,
        codeLength: code.length,
        redirectUriLength: redirectUri.length,
        redirectUriPreview: redirectUri.substring(0, 50) + (redirectUri.length > 50 ? '...' : ''),
        requestHost: Array.isArray(requestHost) ? requestHost[0] : requestHost,
        appIdPreview: appIdTrim.substring(0, 8) + '...' + appIdTrim.substring(Math.max(0, appIdTrim.length - 4)),
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

      const persistedCreds = await marketplaceService.getCredentials(userId, 'ebay', environment);
      const persistedToken = String(
        (persistedCreds?.credentials?.token ||
          persistedCreds?.credentials?.authToken ||
          persistedCreds?.credentials?.accessToken ||
          '') as string
      ).trim();
      const persistedRefreshToken = String(
        (persistedCreds?.credentials?.refreshToken || '') as string
      ).trim();

      if (!persistedToken || !persistedRefreshToken) {
        logger.error('[OAuth Callback] eBay OAuth persistence validation failed', {
          service: 'marketplace-oauth',
          userId,
          environment,
          hasPersistedToken: !!persistedToken,
          hasPersistedRefreshToken: !!persistedRefreshToken,
          credentialIntegrity: persistedCreds?.credentialIntegrity,
        });
        throw new Error('eBay OAuth persistence validation failed: token and refreshToken were not readable after save');
      }
      
      // ✅ CORRECCIÓN: Limpiar cache del singleton para que /api/credentials/status y la UI reflejen el token
      const { apiAvailability } = await import('../../services/api-availability.service');
      await apiAvailability.clearAPICache(userId, 'ebay').catch(() => {});
      await apiAvailability.checkEbayAPI(userId, environment, true).catch((err) => {
        logger.warn('[OAuth Callback] Error forcing eBay API status refresh', {
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
      return handleMercadoLibreCallback(req, res, code, state);
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
          appKeyPreview: appKey ? `${String(appKey).slice(0, 6)}...` : null,
          appSecretLength: appSecret ? String(appSecret).length : 0,
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
        appKeyPreview: `${String(appKey).slice(0, 6)}...`,
        appSecretLength: String(appSecret).length,
        redirectUriUsed: redirectUri || getAliExpressDropshippingRedirectUri(),
        requestHost: req.get('host') || req.headers['x-forwarded-host'] || null,
        requestProtocol: req.headers['x-forwarded-proto'] || req.protocol,
        tokenExchangeStatus: 'started',
      });

      try {
        // 🔥 PASO 4: Intercambiar code por tokens
        // ✅ CANONICAL: Mismo redirect_uri que getAuthUrl en marketplace.routes (/api/marketplace-oauth/callback)
        const canonicalCallbackUrl = getAliExpressDropshippingRedirectUri();

        const tokens = await aliexpressDropshippingAPIService.exchangeCodeForToken(
          code,
          redirectUri || canonicalCallbackUrl,
          appKey,
          appSecret
        );

        logger.info('[OAuth Callback] AliExpress Dropshipping token exchange successful', {
          service: 'marketplace-oauth',
          userId,
          environment,
          redirectUriUsed: redirectUri || canonicalCallbackUrl,
          requestHost: req.get('host') || req.headers['x-forwarded-host'] || null,
          tokenExchangeStatus: 'success',
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

        const persistedCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment);
        const persistedAccessToken = String((persistedCreds as any)?.accessToken || '').trim();
        const persistedRefreshToken = String((persistedCreds as any)?.refreshToken || '').trim();
        const dbSaveConfirmed = !!persistedAccessToken && !!persistedRefreshToken;

        if (!dbSaveConfirmed) {
          logger.error('[OAuth Callback] Dropshipping OAuth DB persistence validation failed', {
            service: 'marketplace-oauth',
            userId,
            environment,
            dbSaveConfirmed,
            hasPersistedAccessToken: !!persistedAccessToken,
            hasPersistedRefreshToken: !!persistedRefreshToken,
          });
          throw new Error('AliExpress OAuth persistence validation failed: access/refresh token not persisted');
        }

        // ✅ CORRECCIÓN ALIEXPRESS DROPSHIPPING OAUTH: Limpiar cache de credenciales
        const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
        clearCredentialsCache(userId, 'aliexpress-dropshipping', environment);
        clearCredentialsCache(userId, 'aliexpress-dropshipping', environment === 'sandbox' ? 'production' : 'sandbox');
        
        // ✅ CORRECCIÓN: Limpiar cache de API availability del singleton para que la UI muestre estado actualizado
        const { apiAvailability } = await import('../../services/api-availability.service');
        await apiAvailability.clearAPICache(userId, 'aliexpress-dropshipping').catch(() => {});
        await apiAvailability.checkAliExpressDropshippingAPI(userId, environment, true).catch((err) => {
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
          dbSaveConfirmed,
          hasPersistedAccessToken: !!persistedAccessToken,
          hasPersistedRefreshToken: !!persistedRefreshToken,
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
          redirectUriUsed: redirectUri || getAliExpressDropshippingRedirectUri(),
          requestHost: req.get('host') || req.headers['x-forwarded-host'] || null,
          tokenExchangeStatus: 'failed',
          error: tokenError?.message || String(tokenError),
          responseData: tokenError?.response?.data,
          status: tokenError?.response?.status,
        });
        throw tokenError;
      }
    } else {
      return res.status(400).send('<html><body>Marketplace not supported</body></html>');
    }

    // ✅ FIX OAUTH LOGOUT: Usar returnOrigin del state para redirigir al mismo host (evita www vs no-www)
    const provider = req.params.marketplace;
    const returnOrigin = returnOriginForRedirect;
    const baseForRedirect = returnOrigin || getFrontendReturnBaseUrl();
    const fallbackReturnUrl = baseForRedirect + '/api-settings?oauth=success&provider=' + provider;
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Autorización completada</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; text-align: center; max-width: 500px; margin: 2rem auto; }
            .success { color: green; font-size: 18px; margin: 20px 0; }
            .info { color: #666; font-size: 14px; margin-top: 20px; }
            .btn { display: inline-block; margin-top: 1rem; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
            .btn:hover { background: #1d4ed8; }
          </style>
        </head>
        <body>
          <div class="success">✅ Autorización completada exitosamente</div>
          <div class="info">Redirigiendo a la aplicación en unos segundos...</div>
          <p><a href="${fallbackReturnUrl}" id="return-btn" class="btn">Volver a API Settings</a></p>
          <script>
            (function() {
              var returnOrigin = ${JSON.stringify(returnOrigin)};
              var returnUrl = (returnOrigin || window.location.origin) + '/api-settings?oauth=success&provider=${provider}';
              var btn = document.getElementById('return-btn');
              if (btn) btn.href = returnUrl;
              if (window.opener && !window.opener.closed) {
                try { window.opener.postMessage({ type: 'oauth_success', marketplace: '${provider}', timestamp: Date.now() }, '*'); } catch (e) {}
              }
              setTimeout(function() { window.location.href = returnUrl; }, 2000);
            })();
          </script>
        </body>
      </html>
    `);
  } catch (e: any) {
    const errorMessage = e?.message || 'Unknown error';
    const errorResponse = e?.response?.data || {};
    const errorStatus = e?.response?.status || 500;
    
    // 🔍 LOGGING: Registrar error completo (incl. eBay error codes para diagnóstico)
    logger.error('[OAuth Callback] Error processing OAuth callback', {
      service: 'marketplace-oauth',
      marketplace: req.params.marketplace,
      error: errorMessage,
      errorStatus,
      errorCode: errorResponse?.error,
      errorDescription: errorResponse?.error_description,
      errorResponse,
      stack: e?.stack,
      duration: Date.now() - startTime
    });
    
    const isUnauthorizedClient = errorMessage.toLowerCase().includes('unauthorized_client') ||
                                 errorMessage.toLowerCase().includes('oauth client was not found') ||
                                 errorMessage.toLowerCase().includes('client authentication failed') ||
                                 errorResponse?.error === 'unauthorized_client' ||
                                 errorResponse?.error === 'client_authentication_failed';
    
    let userFriendlyMessage = 'Error al completar la autorización OAuth.';
    let troubleshooting = '';
    
    if (isUnauthorizedClient) {
      userFriendlyMessage = 'Error: Autenticación de eBay fallida (App ID, Cert ID o ambiente).';
      troubleshooting = `
        <div style="text-align: left; max-width: 600px; margin: 20px auto; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px;">
          <h3 style="margin-top: 0;">Posibles causas:</h3>
          <ul>
            <li>El <strong>App ID</strong> o <strong>Cert ID</strong> no existen en eBay Developer Portal o están mal copiados</li>
            <li>El <strong>App ID</strong> es de <strong>Production</strong> pero estás usando <strong>Sandbox</strong> (o viceversa)</li>
            <li>El <strong>Auth accepted URL</strong> en eBay Developer no coincide exactamente con el Redirect URI configurado</li>
          </ul>
          <h3>Qué hacer:</h3>
          <ol>
            <li>Ve a <a href="https://developer.ebay.com/my/keys" target="_blank">eBay Developer Portal → Keys</a></li>
            <li>Confirma que App ID y Cert ID correspondan al ambiente (Production vs Sandbox)</li>
            <li>En <strong>Auth accepted URL</strong>, verifica que coincida exactamente con tu Redirect URI (ej: https://www.ivanreseller.com/api/marketplace-oauth/c)</li>
            <li>Guarda las credenciales en API Settings y vuelve a pulsar OAuth</li>
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
            <a href="${getFrontendReturnBaseUrl()}/api-settings" style="display: inline-block; margin-right: 10px; padding: 10px 20px; font-size: 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Volver a API Settings</a>
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

// ✅ DIAGNÓSTICO: Endpoint para obtener redirect_uri canónico (copiar/pegar en AliExpress Console)
// GET /api/marketplace-oauth/aliexpress/redirect-uri
router.get('/aliexpress/redirect-uri', (_req: Request, res: Response) => {
  const canonicalRedirectUri = getAliExpressDropshippingRedirectUri();
  const instructions = getAliExpressRedirectUriInstructions();
  return res.json({
    redirectUri: canonicalRedirectUri,
    instructions,
    message: 'Copia redirectUri y pégalo en AliExpress Open Platform → My Apps → Tu app Dropshipping → OAuth Redirect URL',
  });
});

// ✅ DIAGNÓSTICO: Endpoint para verificar estado del OAuth de AliExpress (sin información sensible)
router.get('/aliexpress/oauth/debug', async (req: Request, res: Response) => {
  try {
    const canonicalRedirectUri = getAliExpressDropshippingRedirectUri();
    const instructions = getAliExpressRedirectUriInstructions();
    const callbackReachable = true;
    
    // Obtener información del usuario si está autenticado
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return res.json({
        callbackReachable: true,
        canonicalRedirectUri,
        instructions,
        hasTokens: false,
        environment: 'unknown',
        lastError: null,
        lastAuthAt: null,
        status: 'not_authenticated',
        message: 'User not authenticated. En AliExpress Open Platform, la Redirect URL debe ser exactamente: ' + canonicalRedirectUri
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
      canonicalRedirectUri,
      instructions,
      hasTokens: hasTokensProd || hasTokensSandbox,
      hasTokensProduction: hasTokensProd,
      hasTokensSandbox: hasTokensSandbox,
      environment,
      lastError: null,
      lastAuthAt,
      status: (hasTokensProd || hasTokensSandbox) ? 'authorized' : 'not_authorized',
      message: 'Endpoint working correctly. En AliExpress Open Platform, la Redirect URL debe ser exactamente: ' + canonicalRedirectUri
    });
  } catch (error: any) {
    logger.error('[AliExpress OAuth Debug] Error', {
      error: error.message,
      stack: error.stack
    });
    const canonicalRedirectUri = getAliExpressDropshippingRedirectUri();
    const instructions = getAliExpressRedirectUriInstructions();
    return res.status(500).json({
      callbackReachable: true,
      canonicalRedirectUri,
      instructions,
      hasTokens: false,
      environment: 'unknown',
      lastError: error.message,
      lastAuthAt: null,
      status: 'error',
      message: 'Error checking OAuth status. En AliExpress Open Platform, la Redirect URL debe ser exactamente: ' + canonicalRedirectUri
    });
  }
});

export default router;
