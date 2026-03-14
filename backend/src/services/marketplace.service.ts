import { trace } from '../utils/boot-trace';
trace('loading marketplace.service');

/** Words that are not brand names; if title starts with one, use "Genérico" for ML BRAND. */
const GENERIC_TITLE_WORDS = new Set([
  'wireless', 'bluetooth', 'portable', 'mini', 'professional', 'smart', 'usb', 'led', 'new', 'super', 'pro',
  'original', 'generic', 'universal', 'multi', 'cute', 'anime', 'car', 'home', 'office', 'magnetic', 'adjustable',
  'rechargeable', 'waterproof', 'digital', 'electric', 'manual', 'automatic', 'stainless', 'soft', 'hard', 'large',
  'small', 'set', 'kit', 'pack', 'case', 'cover', 'stand', 'holder', 'organizer', 'charger', 'cable', 'adapter',
  'battery', 'power', 'hd', 'rgb', 'wifi', 'gaming', 'fitness', 'sports', 'earbuds', 'earphones', 'headphones',
  'speaker', 'translator', 'adapter', 'converter', 'reader', 'monitor', 'keyboard', 'mouse', 'laptop', 'tablet',
  'phone', 'camera', 'drone', 'watch', 'band', 'strap', 'bag', 'box', 'pouch', 'sleeve', 'mat', 'pad', 'desk',
  'wall', 'floor', 'outdoor', 'indoor', 'travel', 'running', 'yoga', 'gift', 'christmas', 'valentine', 'premium',
  'deluxe', 'basic', 'standard', 'classic', 'modern', 'vintage', 'retro', 'eco', 'organic', 'natural', 'pure',
  'reusable', 'foldable', 'heavy', 'light', 'thin', 'thick', 'long', 'short', 'wide', 'narrow', 'flat', 'round',
  'square', 'flexible', 'sturdy', 'durable', 'single', 'double', 'triple', 'full', 'empty', 'open', 'closed',
  'anti', 'ultra', 'max', 'plus', 'zero', 'no', 'with', 'without', 'free', 'low', 'high', 'extra', 'all',
  'ai', 'a', 'the', 'for', 'and', 'with', 'inch', 'inches', 'cm', 'mm', 'ft', 'm', 'g', 'kg', 'lb', 'oz',
  'xl', 'xxl', 'xs', 's', 'm', 'l', '1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x', '12x',
]);

/** Max title length per marketplace (characters) */
const TITLE_MAX_BY_MARKETPLACE: Record<MarketplaceName, number> = {
  ebay: 80,
  mercadolibre: 60,
  amazon: 200,
};

/** Truncate title at word boundary to respect marketplace limit */
function truncateTitleByLimit(title: string, marketplace: MarketplaceName): string {
  const maxLen = TITLE_MAX_BY_MARKETPLACE[marketplace] ?? 80;
  if (!title || title.length <= maxLen) return title || '';
  const truncated = title.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) return truncated.slice(0, lastSpace).trim();
  return truncated.trim();
}

/** Build keywords array from product for SEO prompts (category + top words from title) */
function buildKeywordsFromProduct(product: any): string[] {
  const kw = new Set<string>();
  if (product?.category && typeof product.category === 'string') {
    product.category.split(/[\s,;-]+/).filter(Boolean).slice(0, 3).forEach((w: string) => kw.add(w.trim()));
  }
  if (product?.title && typeof product.title === 'string') {
    product.title.split(/\s+/).filter((w: string) => w.length > 2).slice(0, 5).forEach((w: string) => kw.add(w.replace(/[^a-zA-Z0-9áéíóúñü]/gi, '')));
  }
  if (product?.sourceKeyword && typeof product.sourceKeyword === 'string') {
    product.sourceKeyword.split(/\s+/).filter(Boolean).forEach((w: string) => kw.add(w.trim()));
  }
  return Array.from(kw).filter(Boolean).slice(0, 8);
}

/**
 * Infer brand from product title for MercadoLibre. Use "Genérico" when no clear brand.
 * Reduces ML rejections for "brand indicated as generic when product has a real brand".
 */
function inferBrandFromTitle(title: string): string | null {
  if (!title || typeof title !== 'string') return null;
  const trimmed = title.trim();
  const first = trimmed.split(/\s+/)[0];
  if (!first) return null;
  const normalized = first.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (normalized.length < 2 || normalized.length > 30) return null;
  if (GENERIC_TITLE_WORDS.has(normalized)) return null;
  if (/^\d+$/.test(normalized)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const COLOR_WORDS = /\b(negro|blanco|azul|rojo|verde|amarillo|gris|rosa|morado|naranja|marrón|beige|plateado|dorado|multicolor|black|white|blue|red|green|yellow|gray|pink|purple|orange|brown|silver|gold|multi)\b/gi;
const MATERIAL_WORDS = /\b(metal|aluminio|acero|plástico|madera|cuero|tela|silicona|vidrio|cristal|metal\.|plastic|wood|leather|fabric|silicone|glass)\b/gi;

function extractFromTitle(title: string, pattern: RegExp): string | null {
  if (!title || typeof title !== 'string') return null;
  const m = title.match(pattern);
  if (!m || m.length === 0) return null;
  const word = m[0].trim();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

import { EbayService, EbayCredentials, EbayProduct } from './ebay.service';
import {
  MercadoLibreService,
  MercadoLibreCredentials,
  MLProduct,
  sanitizeTitleForML,
  sanitizeDescriptionForML,
  checkMLCompliance,
} from './mercadolibre.service';
import { AmazonService, AmazonCredentials, AmazonProduct } from './amazon.service';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../config/database';
import { retryMarketplaceOperation } from '../utils/retry.util';
import logger from '../config/logger';
import crypto from 'crypto';
import type { CredentialScope } from '@prisma/client';
import { toNumber } from '../utils/decimal.utils';
import { fastHttpClient } from '../config/http-client'; // ✅ PRODUCTION READY: Usar cliente HTTP configurado
import { resolveDestination } from './destination.service';
import {
  sanitizeTitleForEbay,
  sanitizeDescriptionForEbay,
  sanitizeTitleForAmazon,
  sanitizeDescriptionForAmazon,
  sanitizeTitleForMarketplace,
  sanitizeDescriptionForMarketplace,
  checkMarketplaceCompliance,
} from '../utils/compliance';

// ✅ BAJA PRIORIDAD: Tipo union estricto para marketplace
export type MarketplaceName = 'ebay' | 'mercadolibre' | 'amazon';

export interface MarketplaceCredentials {
  id?: number;
  userId: number;
  marketplace: MarketplaceName; // ✅ Estandarizado a tipo union estricto
  credentials: any;
  isActive: boolean;
  environment: 'sandbox' | 'production';
  scope?: CredentialScope;
  issues?: string[];
  warnings?: string[];
}

export interface PublishProductRequest {
  productId: number;
  marketplace: MarketplaceName; // ✅ Estandarizado a tipo union estricto
  /** When true, allow publishing an already-published product (creates duplicate listing). */
  duplicateListing?: boolean;
  customData?: {
    categoryId?: string;
    price?: number;
    quantity?: number;
    title?: string;
    description?: string;
    primaryImageIndex?: number;
  };
}

export interface PublishResult {
  success: boolean;
  marketplace: string;
  listingId?: string;
  listingUrl?: string;
  error?: string;
}

export class MarketplaceService {
  /**
   * Get user's marketplace credentials
   * @param userId - User ID
   * @param marketplace - Marketplace name (ebay, mercadolibre, amazon)
   * @param environment - Environment (sandbox/production). If not provided, uses user's workflow config
   */
  async getCredentials(
    userId: number,
    marketplace: MarketplaceName, // ✅ Estandarizado a tipo union estricto
    environment?: 'sandbox' | 'production'
  ): Promise<MarketplaceCredentials | null> {
    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const { resolveEnvironment } = await import('../utils/environment-resolver');

      // 🔄 CONSISTENCIA: Usar resolver de ambiente centralizado
      // Obtener ambiente de credenciales existentes para usarlo como fallback
      const tempEntryProd = await CredentialsManager.getCredentialEntry(userId, marketplace as any, 'production');
      const tempEntrySandbox = await CredentialsManager.getCredentialEntry(userId, marketplace as any, 'sandbox');
      const fromCredentials = tempEntryProd ? 'production' : (tempEntrySandbox ? 'sandbox' : undefined);
      
      const preferredEnvironment = await resolveEnvironment({
        explicit: environment,
        fromCredentials: fromCredentials as 'sandbox' | 'production' | undefined,
        userId,
        default: 'production'
      });

      const environmentsToTry: Array<'sandbox' | 'production'> = [preferredEnvironment];
      if (!environment) {
        environmentsToTry.push(preferredEnvironment === 'production' ? 'sandbox' : 'production');
      } else if (!environmentsToTry.includes(environment)) {
        environmentsToTry.push(environment);
      }

      let resolvedEnv: 'sandbox' | 'production' | null = null;
      let resolvedEntry: Awaited<ReturnType<typeof CredentialsManager.getCredentialEntry>> | null = null;
      let resolvedCredentials: any = null;
      let resolvedScope: CredentialScope | null = null;
      const warnings: string[] = [];
      const issues: string[] = [];

      for (const env of environmentsToTry) {
        const entry = await CredentialsManager.getCredentialEntry(
          userId,
          marketplace as any,
          env
        );

        if (!entry || entry.isActive === false) {
          continue;
        }

        const creds = entry.credentials;
        if (creds) {
          resolvedEnv = env;
          resolvedEntry = entry;
          resolvedCredentials = creds;
          resolvedScope = entry.scope;
          if (env !== preferredEnvironment) {
            warnings.push(`Se utilizaron credenciales de ${env} porque ${preferredEnvironment} no está disponible.`);
          }
          if (entry.scope === 'global') {
            warnings.push('Se utilizaron credenciales globales compartidas por un administrador.');
          }
          break;
        }
      }

      // ✅ PRODUCTION: Env fallback for eBay when no DB credentials (Railway / APIS2.txt)
      if ((!resolvedEnv || !resolvedCredentials) && marketplace === 'ebay') {
        const clientId = (process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '').trim();
        const clientSecret = (process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '').trim();
        const redirectUri = (process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || '').trim();
        if (clientId && clientSecret) {
          const tokenVal = (process.env.EBAY_OAUTH_TOKEN || process.env.EBAY_TOKEN || '').trim();
          const refreshVal = (process.env.EBAY_REFRESH_TOKEN || '').trim();
          const envCreds = {
            appId: clientId,
            devId: (process.env.EBAY_DEV_ID || '').trim() || undefined,
            certId: clientSecret,
            redirectUri: redirectUri || undefined,
            token: tokenVal || undefined,
            refreshToken: refreshVal || undefined,
            sandbox: preferredEnvironment === 'sandbox',
          };
          const envWarnings: string[] = redirectUri ? [] : ['EBAY_REDIRECT_URI not set; OAuth may require it'];
          const envIssues: string[] = [];
          if (!tokenVal && !refreshVal) {
            envIssues.push('Falta token OAuth de eBay. Completa la autorización en Settings → API Settings → eBay.');
          }
          return {
            id: undefined,
            userId,
            marketplace: marketplace as any,
            credentials: envCreds as any,
            isActive: envIssues.length === 0,
            environment: preferredEnvironment,
            scope: 'user',
            warnings: envWarnings.length ? envWarnings : undefined,
            issues: envIssues.length ? envIssues : undefined,
          };
        }
      }

      if (!resolvedEnv || !resolvedCredentials || !resolvedEntry) {
        return null;
      }

      // Normalizar campos por marketplace usando CredentialsManager (centralizado)
      if (marketplace === 'ebay') {
        const { CredentialsManager } = await import('./credentials-manager.service');
        const normalizedCreds = CredentialsManager.normalizeCredential(
          'ebay',
          resolvedCredentials as any,
          resolvedEnv || 'production'
        );
        
        // Update resolved credentials with normalized version
        Object.assign(resolvedCredentials, normalizedCreds);
        
        // ✅ CORRECCIÓN: Verificar tokens de forma más robusta - considerar tanto token como refreshToken
        // También verificar que el token no esté vacío o solo espacios
        const hasValidToken = normalizedCreds.token && String(normalizedCreds.token).trim().length > 0;
        const hasValidRefreshToken = normalizedCreds.refreshToken && String(normalizedCreds.refreshToken).trim().length > 0;
        
        // App ID + Cert ID son suficientes para OAuth; Dev ID es opcional
        const hasBasicCredentials = normalizedCreds.appId && normalizedCreds.certId;
        
        // ✅ CORRECCIÓN CICLO COMPLETO: Sin token OAuth, la publicación falla. Marcar como issue para que
        // el autopilot skipee publicación y notifique al usuario (en lugar de intentar y fallar en EbayService).
        if (!hasValidToken && !hasValidRefreshToken) {
          if (hasBasicCredentials) {
            // Credenciales básicas guardadas pero falta OAuth - es un ISSUE para bloquear publicación
            issues.push('Falta token OAuth de eBay. Completa la autorización en Settings → API Settings → eBay.');
            warnings.push('Credenciales básicas guardadas. Completa la autorización OAuth para poder publicar.');
          } else {
            // Faltan credenciales básicas - es un issue crítico
            issues.push('Faltan credenciales básicas (App ID, Dev ID, Cert ID). Guárdalas primero.');
          }
        } else {
          // ✅ Si hay tokens, asegurar que el sandbox flag esté sincronizado con environment
          if (typeof normalizedCreds.sandbox === 'undefined' || normalizedCreds.sandbox !== (resolvedEnv === 'sandbox')) {
            logger.debug('[MarketplaceService] Syncing sandbox flag with environment', {
              marketplace: 'ebay',
              userId,
              environment: resolvedEnv,
              currentSandbox: normalizedCreds.sandbox,
              expectedSandbox: resolvedEnv === 'sandbox'
            });
          }
        }
      }

      if (marketplace === 'amazon') {
        const amazonCreds = resolvedCredentials as any;
        if (resolvedEnv) {
          amazonCreds.sandbox = resolvedEnv === 'sandbox';
        }
        const requiredFields = ['clientId', 'clientSecret', 'refreshToken', 'awsAccessKeyId', 'awsSecretAccessKey', 'marketplaceId'];
        for (const field of requiredFields) {
          if (!amazonCreds?.[field]) {
            issues.push(`Falta el campo ${field} en las credenciales de Amazon.`);
          }
        }
      }

      if (marketplace === 'mercadolibre') {
        const mlCreds = resolvedCredentials as any;
        if (resolvedEnv) {
          mlCreds.sandbox = resolvedEnv === 'sandbox';
        }
        const requiredFields = ['clientId', 'clientSecret', 'accessToken', 'refreshToken'];
        for (const field of requiredFields) {
          if (!mlCreds?.[field]) {
            issues.push(`Falta el campo ${field} en las credenciales de MercadoLibre.`);
          }
        }
      }

      return {
        id: resolvedEntry?.id,
        userId,
        marketplace: marketplace as any,
        credentials: resolvedCredentials as any,
        isActive: resolvedEntry?.isActive ?? false,
        environment: resolvedEnv,
        scope: resolvedScope ?? 'user',
        issues: issues.length ? issues : undefined,
        warnings: warnings.length ? warnings : undefined,
      };
    } catch (error) {
      throw new AppError(`Failed to get marketplace credentials: ${error.message}`, 500);
    }
  }

  /**
   * Save or update marketplace credentials
   */
  async saveCredentials(userId: number, marketplace: MarketplaceName, credentials: any, environment?: 'sandbox' | 'production'): Promise<void> {
    try {
      // ✅ Obtener environment del usuario si no se proporciona
      const { workflowConfigService } = await import('./workflow-config.service');
      const { CredentialsManager, clearCredentialsCache } = await import('./credentials-manager.service');
      const userEnvironment = environment || await workflowConfigService.getUserEnvironment(userId);

      // ✅ CORRECCIÓN EBAY OAUTH: Sincronizar sandbox flag con environment para eBay
      if (marketplace === 'ebay' && credentials && typeof credentials === 'object') {
        const creds = credentials as any;
        // Asegurar que sandbox flag coincida con environment
        creds.sandbox = userEnvironment === 'sandbox';
      }

      await CredentialsManager.saveCredentials(
        userId,
        marketplace as any,
        credentials,
        userEnvironment,
        { scope: 'user' }
      );
      
      // ✅ CORRECCIÓN EBAY OAUTH: Limpiar cache de credenciales después de guardar para que los cambios se reflejen inmediatamente
      clearCredentialsCache(userId, marketplace as any, userEnvironment);
      
      logger.debug('[MarketplaceService] Credentials saved and cache cleared', {
        userId,
        marketplace,
        environment: userEnvironment
      });
    } catch (error) {
      throw new AppError(`Failed to save marketplace credentials: ${error.message}`, 500);
    }
  }

  /**
   * Build eBay OAuth start URL for redirect (production: https://auth.ebay.com/oauth2/authorize)
   * Used by GET /api/marketplace-oauth/oauth/start/ebay
   */
  async getEbayOAuthStartUrl(userId: number, environment?: 'sandbox' | 'production'): Promise<string> {
    const cred = await this.getCredentials(userId, 'ebay', environment);
    const appId = (cred?.credentials?.appId || process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
    const certId = (cred?.credentials?.certId || process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET || '').trim();
    const runame = (process.env.EBAY_RUNAME || '').trim();
    const explicitRedirect = (cred?.credentials?.redirectUri || process.env.EBAY_REDIRECT_URI || '').trim();
    const backendUrl = (process.env.BACKEND_URL || process.env.RAILWAY_STATIC_URL || '').replace(/\/$/, '');
    const canonicalBackend = backendUrl ? `${backendUrl}/api/marketplace-oauth/oauth/callback/ebay` : '';
    const frontendBase = (process.env.FRONTEND_URL || process.env.WEB_BASE_URL || 'https://www.ivanreseller.com').replace(/\/$/, '');
    const defaultRedirect = canonicalBackend || explicitRedirect || `${frontendBase}/api/marketplace-oauth/oauth/callback/ebay`;
    // eBay OAuth 2.0 requires exact full URL. Prefer full URL (e.g. .../api/marketplace-oauth/c) over RuName to avoid invalid_request.
    const isFullUrl = (s: string) => /^https?:\/\//i.test(s);
    const redirectUri = (explicitRedirect && isFullUrl(explicitRedirect)) ? explicitRedirect : (runame || explicitRedirect || canonicalBackend || defaultRedirect);
    // eBay requiere RuName (no URL). Configurar EBAY_RUNAME o EBAY_REDIRECT_URI en env.
    if (!appId || !certId || !redirectUri) {
      throw new AppError(
        'eBay OAuth requiere EBAY_APP_ID, EBAY_CERT_ID y EBAY_REDIRECT_URI. Configúralos en Settings o variables de entorno.',
        400
      );
    }
    const { resolveEnvironment } = await import('../utils/environment-resolver');
    const resolvedEnv = await resolveEnvironment({
      explicit: environment,
      fromCredentials: cred?.environment as 'sandbox' | 'production' | undefined,
      userId,
      default: 'production'
    });
    const sandbox = resolvedEnv === 'sandbox';
    const authBase = sandbox ? 'https://auth.sandbox.ebay.com/oauth2/authorize' : 'https://auth.ebay.com/oauth2/authorize';
    const ts = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key';
    const redirB64 = Buffer.from(redirectUri).toString('base64url');
    const expirationTime = Date.now() + 10 * 60 * 1000;
    const payload = [userId, 'ebay', ts, nonce, redirB64, resolvedEnv, expirationTime.toString()].join('|');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const state = Buffer.from([payload, sig].join('|')).toString('base64url');
    // eBay requiere scopes en formato URL completo (evitar invalid_scope)
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    ];
    const needsEncoding = /[^a-zA-Z0-9\-_.]/.test(redirectUri);
    const encodedRedirectUri = needsEncoding ? encodeURIComponent(redirectUri) : redirectUri;
    const params = [
      `client_id=${encodeURIComponent(appId)}`,
      `redirect_uri=${encodedRedirectUri}`,
      `response_type=code`,
      `scope=${encodeURIComponent(scopes.join(' '))}`,
      `state=${encodeURIComponent(state)}`
    ].join('&');
    return `${authBase}?${params}`;
  }

  /**
   * Test marketplace connection
   * @param userId - User ID
   * @param marketplace - Marketplace name
   * @param environment - Environment (sandbox/production). If not provided, uses user's workflow config
   */
  async testConnection(
    userId: number, 
    marketplace: MarketplaceName,
    environment?: 'sandbox' | 'production'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const credentials = await this.getCredentials(userId, marketplace, environment);
      if (!credentials) {
        return { success: false, message: 'No credentials found' };
      }

       if (credentials.issues?.length) {
        return { success: false, message: credentials.issues.join(' ') };
      }

      switch (marketplace) {
        case 'ebay': {
          const { CredentialsManager, clearCredentialsCache } = await import('./credentials-manager.service');
          const ebayService = new EbayService(
            {
              ...(credentials.credentials as EbayCredentials),
              sandbox: credentials.environment === 'sandbox',
            },
            {
              onCredentialsUpdate: async (updatedCreds) => {
                try {
                  const { sandbox, ...persistable } = updatedCreds;
                  await CredentialsManager.saveCredentials(
                    userId,
                    'ebay',
                    { ...persistable, sandbox },
                    credentials.environment,
                    { scope: (credentials.scope as 'user' | 'global') || 'user' }
                  );
                  clearCredentialsCache(userId, 'ebay', credentials.environment);
                  logger.info('[Marketplace] eBay token refreshed and persisted after test', { userId, env: credentials.environment });
                } catch (err: any) {
                  logger.warn('[Marketplace] Failed to persist refreshed eBay token', { userId, error: err?.message });
                }
              },
            }
          );
          return await ebayService.testConnection();
        }

        case 'mercadolibre': {
          let credsWithSiteId: MercadoLibreCredentials = {
            ...(credentials.credentials as MercadoLibreCredentials),
            siteId: (credentials.credentials as MercadoLibreCredentials).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
          };
          let mlService = new MercadoLibreService(credsWithSiteId);
          let result = await mlService.testConnection();
          // Auto-refresh on 401/unauthorized and retry (avoids manual reconnection when user returns)
          if (!result.success && credsWithSiteId.refreshToken) {
            const is401 = /unauthorized|invalid access token|401/i.test(result.message || '');
            if (is401) {
              try {
                const refreshed = await mlService.refreshAccessToken();
                credsWithSiteId = { ...credsWithSiteId, accessToken: refreshed.accessToken };
                const { CredentialsManager, clearCredentialsCache } = await import('./credentials-manager.service');
                const env = (credentials.environment || 'production') as 'sandbox' | 'production';
                await CredentialsManager.saveCredentials(userId, 'mercadolibre', credsWithSiteId, env);
                clearCredentialsCache(userId, 'mercadolibre', env);
                mlService = new MercadoLibreService(credsWithSiteId);
                result = await mlService.testConnection();
                if (result.success) {
                  logger.info('[Marketplace] MercadoLibre token refreshed and testConnection succeeded', { userId, env });
                }
              } catch (e: any) {
                logger.warn('[Marketplace] MercadoLibre token refresh failed', { userId, error: e?.message });
              }
            }
          }
          return result;
        }

        case 'amazon':
          const amazonService = new AmazonService();
          await amazonService.setCredentials(credentials.credentials as AmazonCredentials);
          const isConnected = await amazonService.testConnection();
          return { success: isConnected, message: isConnected ? 'Connected' : 'Connection failed' };

        default:
          return { success: false, message: 'Marketplace not supported' };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Publish product to marketplace
   * @param userId - User ID
   * @param request - Publish request with productId, marketplace, and optional customData
   * @param environment - Environment (sandbox/production). If not provided, uses user's workflow config
   */
  async publishProduct(
    userId: number, 
    request: PublishProductRequest,
    environment?: 'sandbox' | 'production'
  ): Promise<PublishResult> {
    try {
      // Get product from database
      const product = await prisma.product.findFirst({
        where: {
          id: request.productId,
          userId: userId,
        },
      }) as any; // Type assertion para permitir todos los estados posibles

      if (!product) {
        throw new AppError('Product not found', 404);
      }

      // ✅ Validar estado del producto antes de publicar
      if (product.status === 'REJECTED') {
        throw new AppError('Cannot publish a rejected product. Please approve it first.', 400);
      }

      if (product.status === 'INACTIVE') {
        throw new AppError('Cannot publish an inactive product. Please reactivate it first.', 400);
      }

      // ✅ CORREGIDO: Validar que el producto esté en estado APPROVED antes de publicar
      // PENDING solo se permite si está en flujo automático de aprobación
      if (product.status === 'PENDING') {
        // Verificar si está en flujo automático
        try {
          const { workflowConfigService } = await import('./workflow-config.service');
          const publishMode = await workflowConfigService.getStageMode(userId, 'publish');
          if (publishMode !== 'automatic') {
            throw new AppError('Cannot publish a product in PENDING status. Please approve it first.', 400);
          }
          // Si es automático, permitir continuar
        } catch (error) {
          // Si no se puede verificar o no es automático, no permitir publicar productos PENDING
          if (error instanceof AppError) {
            throw error;
          }
          throw new AppError('Cannot publish a product in PENDING status. Please approve it first.', 400);
        }
      } else if (product.status !== 'APPROVED') {
        // Solo permitir publicar productos APPROVED (o PENDING en flujo automático)
        throw new AppError(`Cannot publish a product with status: ${product.status}. Product must be APPROVED.`, 400);
      }

      // ✅ Verificar si el producto ya está publicado (permitir duplicateListing para ganadores)
      if (!request.duplicateListing && (product.isPublished || product.status === 'PUBLISHED')) {
        throw new AppError('Product is already published. Use updateListing to modify it.', 400);
      }

      // ✅ Validar que el producto tenga datos mínimos requeridos
      if (!product.title || !product.aliexpressPrice || product.aliexpressPrice <= 0) {
        throw new AppError('Product is missing required data (title, price). Please complete product information.', 400);
      }

      // ✅ Obtener environment del usuario si no se proporciona
      let userEnvironment: 'sandbox' | 'production' = 'production';
      if (!environment) {
        const { workflowConfigService } = await import('./workflow-config.service');
        userEnvironment = await workflowConfigService.getUserEnvironment(userId);
      } else {
        userEnvironment = environment;
      }

      // Get marketplace credentials (con environment)
      const credentials = await this.getCredentials(userId, request.marketplace, userEnvironment);
      if (!credentials || !credentials.isActive) {
        throw new AppError(`${request.marketplace} credentials not found or inactive for ${userEnvironment} environment`, 400);
      }

      if (credentials.issues?.length) {
        throw new AppError(credentials.issues.join(' '), 400);
      }

      // Publish to specific marketplace
      switch (request.marketplace) {
        case 'ebay':
          return await this.publishToEbay(product, credentials, request.customData, userId);

        case 'mercadolibre':
          return await this.publishToMercadoLibre(product, credentials.credentials, request.customData, userId);

        case 'amazon':
          return await this.publishToAmazon(product, credentials.credentials, request.customData, userId);

        default:
          throw new AppError('Marketplace not supported', 400);
      }
    } catch (error) {
      return {
        success: false,
        marketplace: request.marketplace,
        error: error.message,
      };
    }
  }

  /**
   * Publish to multiple marketplaces
   * @param userId - User ID
   * @param productId - Product ID
   * @param marketplaces - Array of marketplace names
   * @param environment - Environment (sandbox/production). If not provided, uses user's workflow config
   */
  async publishToMultipleMarketplaces(
    userId: number, 
    productId: number, 
    marketplaces: string[],
    environment?: 'sandbox' | 'production'
  ): Promise<PublishResult[]> {
    const results: PublishResult[] = [];

    for (const marketplace of marketplaces) {
      const result = await this.publishProduct(
        userId,
        {
          productId,
          marketplace: marketplace as any,
        },
        environment
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Publish to eBay
   */
  private async publishToEbay(
    product: any,
    credentialEntry: MarketplaceCredentials,
    customData?: any,
    userId?: number
  ): Promise<PublishResult> {
    try {
      const ebayCreds = {
        ...(credentialEntry.credentials as EbayCredentials),
        sandbox: credentialEntry.environment === 'sandbox',
      };

      const ebayService = new EbayService(
        ebayCreds,
        {
          onCredentialsUpdate: async (updatedCreds) => {
            try {
              const { CredentialsManager } = await import('./credentials-manager.service');
              const { sandbox, ...persistable } = updatedCreds;
              await CredentialsManager.saveCredentials(
                credentialEntry.userId,
                'ebay',
                {
                  ...persistable,
                  sandbox: sandbox,
                },
                credentialEntry.environment,
                { scope: credentialEntry.scope || 'user' }
              );
            } catch (error) {
              logger.warn('Failed to persist refreshed eBay token', {
                userId: credentialEntry.userId,
                environment: credentialEntry.environment,
                error: (error as Error).message,
              });
            }
          },
        }
      );

      // Suggest category if not provided (con retry)
      let categoryId = customData?.categoryId;
      if (!categoryId) {
        // ✅ Usar retry para suggestCategory
        const categoryResult = await retryMarketplaceOperation(
          () => ebayService.suggestCategory(product.title),
          'ebay',
          {
            maxRetries: 2,
            onRetry: (attempt, error, delay) => {
              logger.warn(`Retrying suggestCategory in marketplace service (attempt ${attempt})`, {
                productTitle: product.title,
                error: error.message,
                delay,
              });
            },
          }
        );

        if (categoryResult.success && categoryResult.data) {
          categoryId = categoryResult.data;
        } else {
          // Fallback a categoría por defecto si falla
          categoryId = '20698'; // Leaf category: Kitchen Storage & Organization
        }
      }

      // ✅ MULTI-IMAGE: Preparar todas las imágenes disponibles (hasta el límite de eBay)
      const images = this.prepareImagesForMarketplace(product.images, 'ebay');
      if (!images || images.length === 0) {
        throw new AppError('Product must have at least one image before publishing. Please add images to the product.', 400);
      }

      const price = this.resolveListingPrice(product, customData?.price);
      if (price <= 0) {
        throw new AppError('Product is missing pricing information. Actualiza el precio sugerido antes de publicar.', 400);
      }

      const costNum = toNumber(product.aliexpressPrice);
      const shippingNum = toNumber(product.shippingCost ?? 0);
      const importTaxNum = toNumber(product.importTax ?? 0);
      const totalCost = toNumber(product.totalCost) > 0
        ? toNumber(product.totalCost)
        : costNum + shippingNum + importTaxNum;
      if (price <= totalCost) {
        throw new AppError(`Price (${price}) must be greater than total cost (${totalCost.toFixed(2)}: product + shipping + import tax) to generate profit.`, 400);
      }

      const ebayConfig = this.getMarketplaceConfig('ebay', credentialEntry.credentials as any);
      const ebayKeywords = buildKeywordsFromProduct(product);
      let finalTitle = customData?.title || product.title;
      let finalDescription = customData?.description || product.description || '';

      if (!customData?.title && userId) {
        try {
          finalTitle = await this.generateAITitle(product, ebayConfig.displayName, ebayConfig.language, userId, ebayKeywords);
          finalTitle = truncateTitleByLimit(String(finalTitle || '').replace(/\s+/g, ' ').trim(), 'ebay');
        } catch (error) {
          logger.debug('Failed to generate AI title for eBay, using original', { error });
        }
      }

      if (!customData?.description && userId) {
        try {
          finalDescription = await this.generateAIDescription(product, ebayConfig.displayName, ebayConfig.language, userId);
        } catch (error) {
          logger.debug('Failed to generate AI description for eBay, using original', { error });
        }
      }

      finalTitle = String(finalTitle || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (finalTitle.length > 80) finalTitle = truncateTitleByLimit(finalTitle, 'ebay');
      if (!finalTitle) {
        finalTitle = String(product.title || 'Product')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80) || `Product-${product.id}`;
      }

      // Apply eBay compliance sanitization (IP policy, Keyword Spam, 80 chars)
      finalTitle = sanitizeTitleForEbay(finalTitle);
      finalDescription = sanitizeDescriptionForEbay(finalDescription || '');

      const complianceCheck = checkMarketplaceCompliance('ebay', finalTitle, finalDescription || '');
      if (!complianceCheck.compliant && complianceCheck.violations.length > 0) {
        logger.warn('[MARKETPLACE] eBay compliance check: remaining violations after sanitization', {
          productId: product.id,
          violations: complianceCheck.violations,
        });
      }

      const ebayProduct: EbayProduct = {
        title: finalTitle,
        description: finalDescription,
        categoryId,
        startPrice: price,
        quantity: this.resolveListingQuantity(product, customData?.quantity),
        condition: 'NEW',
        images: images, // ✅ MULTI-IMAGE: Todas las imágenes preparadas para eBay
      };

      logger.info('Publishing product to eBay with multiple images', {
        productId: product.id,
        imageCount: images.length,
        categoryId,
        price,
      });

      const result = await ebayService.createListing(`IVAN-${product.id}`, ebayProduct);

      // ✅ P1: Solo actualizar BD y estado si la publicación fue exitosa
      if (result.success && result.itemId) {
        // Update product with marketplace info (solo si fue exitoso)
        await this.updateProductMarketplaceInfo(product.id, 'ebay', {
          listingId: result.itemId,
          listingUrl: result.listingUrl,
          publishedAt: new Date(),
        });

        // ✅ NOTA: El estado del producto se actualizará desde publisher.routes.ts
        // después de evaluar todos los resultados de múltiples marketplaces.
        // Si se llama desde un flujo de publicación única, aquí se actualiza.
        // Si se llama desde publishToMultipleMarketplaces, el estado se maneja allí.
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(
          product.id,
          'PUBLISHED',
          true,
          userId
        );
      }

      // ✅ P1: Retornar resultado correcto según éxito o fallo
      if (result.success && result.itemId) {
        return {
          success: true,
          marketplace: 'ebay',
          listingId: result.itemId,
          listingUrl: result.listingUrl,
        };
      } else {
        return {
          success: false,
          marketplace: 'ebay',
          error: result.error || 'Failed to create listing on eBay',
        };
      }
    } catch (error) {
      return {
        success: false,
        marketplace: 'ebay',
        error: error.message,
      };
    }
  }

  /**
   * Publish to MercadoLibre
   */
  private async publishToMercadoLibre(
    product: any, 
    credentials: MercadoLibreCredentials, 
    customData?: any,
    userId?: number
  ): Promise<PublishResult> {
    try {
      // Merge primaryImageIndex from productData (set in ProductPreview) into customData
      let mergedCustomData = { ...customData };
      if (typeof mergedCustomData.primaryImageIndex !== 'number') {
        try {
          const pd = product.productData ? (typeof product.productData === 'string' ? JSON.parse(product.productData) : product.productData) : {};
          if (typeof pd.primaryImageIndexForML === 'number' && pd.primaryImageIndexForML >= 0) {
            mergedCustomData = { ...mergedCustomData, primaryImageIndex: pd.primaryImageIndexForML };
          }
        } catch {
          // ignore parse errors
        }
      }

      // ML policy: no duplicate publications of same product with same conditions
      if (userId) {
        const existing = await prisma.marketplaceListing.findFirst({
          where: { productId: product.id, userId, marketplace: 'mercadolibre' },
        });
        if (existing) {
          throw new AppError(
            'Este producto ya está publicado en Mercado Libre. ML no permite publicaciones duplicadas del mismo producto.',
            400
          );
        }
      }

      const credsWithSiteId: MercadoLibreCredentials = {
        ...credentials,
        siteId: credentials.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
      };
      const mlService = new MercadoLibreService(credsWithSiteId);

      // Predict category if not provided
      let categoryId = mergedCustomData?.categoryId;
      if (!categoryId) {
        categoryId = await mlService.predictCategory(product.title, product.description);
      }

      // ✅ CORREGIDO: Validar imágenes antes de publicar
      // ✅ MULTI-IMAGE: Preparar todas las imágenes disponibles (hasta el límite de MercadoLibre)
      const images = this.prepareImagesForMarketplace(product.images, 'mercadolibre', mergedCustomData);
      if (!images || images.length === 0) {
        throw new AppError('Product must have at least one image before publishing. Please add images to the product.', 400);
      }

      // ✅ CORREGIDO: Validar categoría antes de publicar (ya se obtuvo arriba, no redeclarar)
      if (!categoryId || categoryId.trim().length === 0) {
        throw new AppError('Product must have a valid category before publishing. Please specify a category.', 400);
      }

      const priceUsd = this.resolveListingPrice(product, mergedCustomData?.price);
      if (priceUsd <= 0) {
        throw new AppError('Product is missing pricing information. Actualiza el precio sugerido antes de publicar.', 400);
      }

      const costNumMl = toNumber(product.aliexpressPrice);
      const shippingNumMl = toNumber(product.shippingCost ?? 0);
      const importTaxNumMl = toNumber(product.importTax ?? 0);
      const totalCostMl = toNumber(product.totalCost) > 0
        ? toNumber(product.totalCost)
        : costNumMl + shippingNumMl + importTaxNumMl;
      if (priceUsd <= totalCostMl) {
        throw new AppError(`Price (${priceUsd}) must be greater than total cost (${totalCostMl.toFixed(2)}: product + shipping + import tax) to generate profit.`, 400);
      }

      const siteId = credsWithSiteId.siteId || 'MLC';
      const targetCurrency = mlService.getSiteCurrency(siteId);
      const dest = resolveDestination('mercadolibre', credsWithSiteId);
      logger.info('[ML Publish] Origin CN → Destination', {
        siteId,
        countryCode: dest.countryCode,
        currency: dest.currency,
      });
      let price = priceUsd;
      if (targetCurrency !== 'USD') {
        const fxService = (await import('./fx.service')).default;
        price = fxService.convert(priceUsd, 'USD', targetCurrency);
        logger.info('[ML Publish] Price converted to local currency', {
          priceUsd, targetCurrency, priceLocal: price, siteId,
        });
      }

      const mlConfig = this.getMarketplaceConfig('mercadolibre', credsWithSiteId);
      const mlKeywords = buildKeywordsFromProduct(product);
      let finalTitle = mergedCustomData?.title || product.title;
      let finalDescription = mergedCustomData?.description || product.description || '';

      if (!mergedCustomData?.title && userId) {
        try {
          finalTitle = await this.generateAITitle(product, mlConfig.displayName, mlConfig.language, userId, mlKeywords);
          finalTitle = truncateTitleByLimit(String(finalTitle || '').replace(/\s+/g, ' ').trim(), 'mercadolibre');
        } catch (error) {
          logger.debug('Failed to generate AI title for MercadoLibre, using original', { error });
        }
      }

      if (!mergedCustomData?.description && userId) {
        try {
          finalDescription = await this.generateAIDescription(product, mlConfig.displayName, mlConfig.language, userId);
        } catch (error) {
          logger.debug('Failed to generate AI description for MercadoLibre, using original', { error });
        }
      }
      // Include AliExpress delivery estimate in description when available
      const productData = typeof product.productData === 'string' ? (() => { try { return JSON.parse(product.productData || '{}'); } catch { return {}; } })() : (product.productData || {});
      const estimatedDays = productData.estimatedDeliveryDays ?? productData.shipping?.estimatedDays ?? productData.deliveryDays;
      if (typeof estimatedDays === 'number' && estimatedDays > 0) {
        const minDays = Math.max(1, Math.floor(estimatedDays * 0.8));
        const maxDays = Math.ceil(estimatedDays * 1.2);
        const deliveryText = `\n\nEntrega estimada: ${minDays}-${maxDays} días (envío internacional).`;
        const descWithDelivery = (finalDescription || '').trim() + deliveryText;
        if (descWithDelivery.length <= 5000) finalDescription = descWithDelivery;
      }
      finalDescription = sanitizeDescriptionForML(finalDescription || '');
      finalTitle = sanitizeTitleForML(finalTitle);

      // ML policy: titles must differ from existing publications (exact + similarity > 0.85)
      if (userId) {
        finalTitle = await this.ensureUniqueMlTitle(userId, product, finalTitle);
      }

      let attributes = mergedCustomData?.attributes;
      if (!attributes || attributes.length === 0) {
        try {
          const catAttrs = await mlService.getCategoryAttributes(categoryId);
          const requiredAttrs = catAttrs.filter((a: any) =>
            a.tags?.required || a.tags?.catalog_required
          );
          const optionalImportant = ['COLOR', 'MATERIAL'];
          const attrIds = new Set(attributes?.map((a: any) => a.id) || []);
          attributes = [];
          const dimensionDefaults: Record<string, { val: number; unit: string }> = {
            WIDTH: { val: 20, unit: 'cm' }, HEIGHT: { val: 15, unit: 'cm' },
            DEPTH: { val: 10, unit: 'cm' }, LENGTH: { val: 25, unit: 'cm' },
            WEIGHT: { val: 500, unit: 'g' }, MAX_WEIGHT: { val: 1000, unit: 'g' },
            NET_WEIGHT: { val: 400, unit: 'g' },
          };
          for (const attr of requiredAttrs) {
            if (attr.id === 'BRAND') {
              const inferredBrand = inferBrandFromTitle(finalTitle);
              attributes.push({ id: 'BRAND', value: inferredBrand || 'Genérico' });
              attrIds.add('BRAND');
            } else if (attr.id === 'MODEL') {
              const model = finalTitle.substring(0, 20).replace(/[^a-zA-Z0-9\- ]/g, '').trim();
              attributes.push({ id: 'MODEL', value: model || 'Standard' });
              attrIds.add('MODEL');
            } else if (dimensionDefaults[attr.id]) {
              const d = dimensionDefaults[attr.id];
              const unit = attr.default_unit || d.unit;
              attributes.push({ id: attr.id, value: `${d.val} ${unit}` });
              attrIds.add(attr.id);
            } else if (attr.values && attr.values.length > 0) {
              attributes.push({ id: attr.id, value: attr.values[0].name });
              attrIds.add(attr.id);
            }
          }
          for (const optId of optionalImportant) {
            if (attrIds.has(optId)) continue;
            const catAttr = catAttrs.find((a: any) => a.id === optId);
            if (!catAttr) continue;
            const val = optId === 'COLOR' ? extractFromTitle(finalTitle, COLOR_WORDS)
              : optId === 'MATERIAL' ? extractFromTitle(finalTitle, MATERIAL_WORDS) : null;
            if (val) {
              attributes.push({ id: optId, value: val });
              attrIds.add(optId);
            }
          }
          logger.info('[ML Publish] Auto-resolved required attributes', {
            categoryId,
            attributeCount: attributes.length,
            attrs: attributes.map((a: any) => a.id).join(','),
          });
        } catch (e: any) {
          logger.warn('[ML Publish] Failed to get category attributes', { error: e.message });
          attributes = [
            { id: 'BRAND', value: 'Genérico' },
            { id: 'MODEL', value: 'Standard' },
          ];
        }
      }

      const mlProduct: MLProduct = {
        title: finalTitle,
        description: finalDescription,
        categoryId,
        price,
        quantity: this.resolveListingQuantity(product, mergedCustomData?.quantity),
        condition: 'new',
        images: images,
        ...(attributes && attributes.length > 0 && { attributes }),
        shipping: {
          mode: 'not_specified',
          freeShipping: false,
        },
      };

      logger.info('Publishing product to MercadoLibre with multiple images', {
        productId: product.id,
        imageCount: images.length,
        categoryId,
        price,
      });

      const result = await mlService.createListing(mlProduct);

      if (result.success && result.itemId && result.status && result.status !== 'active') {
        logger.warn('[MARKETPLACE] ML listing created but NOT active — may be paused or under review', {
          productId: product.id,
          itemId: result.itemId,
          mlStatus: result.status,
        });
      }

      if (result.success && result.itemId) {
        await this.updateProductMarketplaceInfo(product.id, 'mercadolibre', {
          listingId: result.itemId,
          listingUrl: result.permalink,
          publishedAt: new Date(),
          mlStatus: result.status,
        });

        // ✅ NOTA: El estado del producto se actualizará desde publisher.routes.ts
        // después de evaluar todos los resultados de múltiples marketplaces.
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(
          product.id,
          'PUBLISHED',
          true,
          userId
        );
      }

      // ✅ P1: Retornar resultado correcto según éxito o fallo
      if (result.success && result.itemId) {
        return {
          success: true,
          marketplace: 'mercadolibre',
          listingId: result.itemId,
          listingUrl: result.permalink,
        };
      } else {
        return {
          success: false,
          marketplace: 'mercadolibre',
          error: result.error || 'Failed to create listing on MercadoLibre',
        };
      }
    } catch (error) {
      return {
        success: false,
        marketplace: 'mercadolibre',
        error: error.message,
      };
    }
  }

  /**
   * Repair Mercado Libre listings (VIP67 fix): update title, description, attributes with sanitized data.
   * @param userId - User ID
   * @param listingIds - Optional array of listingIds to repair; if empty, repairs all ML listings for user in batches
   * @param maxLimit - When repairing all, max total listings to process (default 2000). Batches of 50.
   * @returns Results per listing
   */
  async repairMercadoLibreListings(
    userId: number,
    listingIds?: string[],
    maxLimit: number = 2000
  ): Promise<Array<{ listingId: string; success: boolean; error?: string }>> {
    const credentials = await this.getCredentials(userId, 'mercadolibre');
    if (!credentials || !credentials.isActive) {
      throw new AppError('Mercado Libre credentials not found or inactive. Connect ML in API Settings.', 400);
    }
    let credsWithSiteId: MercadoLibreCredentials = {
      ...(credentials.credentials as MercadoLibreCredentials),
      siteId: (credentials.credentials as MercadoLibreCredentials).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    };
    let mlService = new MercadoLibreService(credsWithSiteId);

    // Refresh token if available so repair can run without "invalid access token"
    if (credsWithSiteId.refreshToken) {
      try {
        const refreshed = await mlService.refreshAccessToken();
        const updatedCreds = { ...credsWithSiteId, accessToken: refreshed.accessToken };
        const { CredentialsManager, clearCredentialsCache } = await import('./credentials-manager.service');
        const env = (credentials.environment || 'production') as 'sandbox' | 'production';
        await CredentialsManager.saveCredentials(userId, 'mercadolibre', updatedCreds, env);
        clearCredentialsCache(userId, 'mercadolibre', env);
        credsWithSiteId = updatedCreds;
        mlService = new MercadoLibreService(credsWithSiteId);
        logger.info('[ML Repair] Token refreshed before repair');
      } catch (e: any) {
        logger.warn('[ML Repair] Token refresh failed, continuing with existing token', { error: e?.message });
      }
    }

    const BATCH_SIZE = 50;
    const where: any = { userId, marketplace: 'mercadolibre' };
    if (listingIds && listingIds.length > 0) {
      where.listingId = { in: listingIds };
    }

    const results: Array<{ listingId: string; success: boolean; error?: string }> = [];
    let skip = 0;

    while (true) {
      const listings = await prisma.marketplaceListing.findMany({
        where,
        include: { product: true },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });
      if (listings.length === 0) break;
      for (const listing of listings) {
      try {
        const product = listing.product;
        if (!product) {
          results.push({ listingId: listing.listingId, success: false, error: 'Product not found' });
          continue;
        }

        // Skip listings already closed or paused on ML (update would fail or be irrelevant)
        const itemStatus = await mlService.getItemStatus(listing.listingId);
        if (itemStatus && (itemStatus.status === 'closed' || itemStatus.status === 'paused')) {
          results.push({
            listingId: listing.listingId,
            success: false,
            error: `Listing ${itemStatus.status} on ML; use bulk-close to remove from DB`,
          });
          logger.debug('[ML Repair] Skipped closed/paused listing', { listingId: listing.listingId, status: itemStatus.status });
          continue;
        }

        let categoryId: string | undefined = product.category || undefined;
        if (!categoryId) {
          const mlItem = await mlService.getItem(listing.listingId);
          categoryId = mlItem?.category_id;
        }
        if (!categoryId) {
          categoryId = await mlService.predictCategory(product.title, product.description);
        }

        let attributes: Array<{ id: string; value: string | number }> = [];
        try {
          const catAttrs = await mlService.getCategoryAttributes(categoryId);
          const requiredAttrs = catAttrs.filter((a: any) =>
            a.tags?.required || a.tags?.catalog_required
          );
          const finalTitle = sanitizeTitleForML(product.title);
          const dimensionDefaults: Record<string, { val: number; unit: string }> = {
            WIDTH: { val: 20, unit: 'cm' }, HEIGHT: { val: 15, unit: 'cm' },
            DEPTH: { val: 10, unit: 'cm' }, LENGTH: { val: 25, unit: 'cm' },
            WEIGHT: { val: 500, unit: 'g' }, MAX_WEIGHT: { val: 1000, unit: 'g' },
            NET_WEIGHT: { val: 400, unit: 'g' },
          };
          for (const attr of requiredAttrs) {
            if (attr.id === 'BRAND') {
              attributes.push({ id: 'BRAND', value: inferBrandFromTitle(finalTitle) || 'Genérico' });
            } else if (attr.id === 'MODEL') {
              const model = finalTitle.substring(0, 20).replace(/[^a-zA-Z0-9\- ]/g, '').trim();
              attributes.push({ id: 'MODEL', value: model || 'Standard' });
            } else if (dimensionDefaults[attr.id]) {
              const d = dimensionDefaults[attr.id];
              const unit = attr.default_unit || d.unit;
              attributes.push({ id: attr.id, value: `${d.val} ${unit}` });
            } else if (attr.values && attr.values.length > 0) {
              attributes.push({ id: attr.id, value: attr.values[0].name });
            }
          }
        } catch (e: any) {
          logger.warn('[ML Repair] Failed to get category attributes', { listingId: listing.listingId, error: e.message });
          attributes = []; // No attributes when category unknown — only update title/description to avoid body.invalid_field_types
        }

        const title = sanitizeTitleForML(product.title);
        const description = sanitizeDescriptionForML(product.description || `Producto: ${product.title}.`);

        // When we couldn't load category attributes, only send title and description (no attributes/categoryId) to avoid invalid_field_types
        const sendAttributes = attributes.length > 0;
        const sendCategoryId = categoryId && sendAttributes;

        await mlService.updateListing(listing.listingId, {
          title,
          description,
          attributes: sendAttributes ? attributes : undefined,
          categoryId: sendCategoryId ? categoryId : undefined,
        });
        results.push({ listingId: listing.listingId, success: true });
        logger.info('[ML Repair] Listing updated', { listingId: listing.listingId });
      } catch (err: any) {
        const msg = err.message || String(err);
        results.push({ listingId: listing.listingId, success: false, error: msg });
        logger.warn('[ML Repair] Failed', { listingId: listing.listingId, error: msg });
      }
      }
      skip += listings.length;
      if (listings.length < BATCH_SIZE || results.length >= maxLimit) break;
    }
    return results;
  }

  /**
   * Bulk close Mercado Libre listings and remove them from DB so software reflects reality.
   * @param userId - User ID (only their ML listings are affected)
   * @param options - listingIds: optional list of ML item IDs; onlyAlreadyClosed: if true, only close those already closed/paused on ML (to clean DB)
   */
  async mlBulkCloseAndSync(
    userId: number,
    options?: { listingIds?: string[]; onlyAlreadyClosed?: boolean }
  ): Promise<{
    closed: number;
    failed: number;
    deletedFromDb: number;
    productIdsUpdated: number[];
    errors: Array<{ listingId: string; error: string }>;
  }> {
    const credentials = await this.getCredentials(userId, 'mercadolibre');
    if (!credentials || !credentials.isActive) {
      throw new AppError('Mercado Libre credentials not found or inactive. Connect ML in API Settings.', 400);
    }
    const credsWithSiteId: MercadoLibreCredentials = {
      ...(credentials.credentials as MercadoLibreCredentials),
      siteId: (credentials.credentials as MercadoLibreCredentials).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    };
    const mlService = new MercadoLibreService(credsWithSiteId);

    const where: any = { userId, marketplace: 'mercadolibre' };
    if (options?.listingIds && options.listingIds.length > 0) {
      where.listingId = { in: options.listingIds };
    }
    const listings = await prisma.marketplaceListing.findMany({
      where,
      select: { id: true, listingId: true, productId: true },
      orderBy: { id: 'asc' },
    });

    const errors: Array<{ listingId: string; error: string }> = [];
    const deletedListingIds: number[] = [];
    const productIdsThatLostListing = new Set<number>();

    for (const listing of listings) {
      if (options?.onlyAlreadyClosed) {
        const status = await mlService.getItemStatus(listing.listingId);
        if (!status || (status.status !== 'closed' && status.status !== 'paused')) {
          continue; // only close those already closed/paused on ML
        }
      }
      try {
        await mlService.closeListing(listing.listingId);
        await prisma.marketplaceListing.deleteMany({
          where: { id: listing.id },
        });
        deletedListingIds.push(listing.id);
        productIdsThatLostListing.add(listing.productId);
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push({ listingId: listing.listingId, error: msg });
        logger.warn('[ML BulkClose] Failed to close listing', { listingId: listing.listingId, error: msg });
      }
    }

    const productIdsUpdated: number[] = [];
    for (const productId of productIdsThatLostListing) {
      const remaining = await prisma.marketplaceListing.count({ where: { productId } });
      if (remaining === 0) {
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(productId, 'APPROVED', false, userId);
        productIdsUpdated.push(productId);
      }
    }

    return {
      closed: deletedListingIds.length,
      failed: errors.length,
      deletedFromDb: deletedListingIds.length,
      productIdsUpdated,
      errors,
    };
  }

  /**
   * Bulk close eBay listings for user: end each listing on eBay, remove from DB, update products to APPROVED.
   */
  async ebayBulkCloseAndSync(userId: number): Promise<{
    closed: number;
    failed: number;
    deletedFromDb: number;
    productIdsUpdated: number[];
    errors: Array<{ listingId: string; error: string }>;
  }> {
    const { resolveEnvironment } = await import('../utils/environment-resolver');
    const env = await resolveEnvironment({ userId, default: 'production' });
    const credentials = await this.getCredentials(userId, 'ebay', env);
    if (!credentials || !credentials.isActive) {
      throw new AppError('eBay credentials not found or inactive. Connect eBay in API Settings.', 400);
    }
    const ebayCreds = {
      ...(credentials.credentials as EbayCredentials),
      sandbox: env === 'sandbox',
    };
    const ebayService = new EbayService(ebayCreds);

    const listings = await prisma.marketplaceListing.findMany({
      where: { userId, marketplace: 'ebay' },
      select: { id: true, listingId: true, sku: true, productId: true },
      orderBy: { id: 'asc' },
    });

    const errors: Array<{ listingId: string; error: string }> = [];
    const productIdsThatLostListing = new Set<number>();
    let closed = 0;

    for (const listing of listings) {
      // eBay withdrawOffer needs offerId or SKU. Prefer SKU (IVAN-{productId}) over listingId (eBay item ID).
      const ebayIdentifier = listing.sku || `IVAN-${listing.productId}`;
      try {
        await ebayService.endListing(ebayIdentifier, 'NotAvailable');
        await prisma.marketplaceListing.deleteMany({ where: { id: listing.id } });
        productIdsThatLostListing.add(listing.productId);
        closed++;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push({ listingId: ebayIdentifier, error: msg });
        logger.warn('[eBay BulkClose] Failed to end listing', { listingId: ebayIdentifier, error: msg });
      }
      await new Promise((r) => setTimeout(r, 150)); // rate limit cushion
    }

    const productIdsUpdated: number[] = [];
    for (const productId of productIdsThatLostListing) {
      const remaining = await prisma.marketplaceListing.count({ where: { productId } });
      if (remaining === 0) {
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(productId, 'APPROVED', false, userId);
        productIdsUpdated.push(productId);
      }
    }

    logger.info('[eBay BulkClose] Completed', {
      userId,
      closed,
      failed: errors.length,
      productIdsUpdated: productIdsUpdated.length,
    });

    return {
      closed,
      failed: errors.length,
      deletedFromDb: closed,
      productIdsUpdated,
      errors,
    };
  }

  /**
   * Close ALL eBay offers by fetching them from eBay Inventory API (not just from our DB).
   * Ensures everything on eBay is withdrawn even if our DB is out of sync.
   */
  async ebayCloseAllFromApi(userId: number): Promise<{
    closed: number;
    failed: number;
    deletedFromDb: number;
    productIdsUpdated: number[];
    errors: Array<{ sku: string; error: string }>;
  }> {
    const { resolveEnvironment } = await import('../utils/environment-resolver');
    const env = await resolveEnvironment({ userId, default: 'production' });
    const credentials = await this.getCredentials(userId, 'ebay', env);
    if (!credentials || !credentials.isActive) {
      throw new AppError('eBay credentials not found or inactive. Connect eBay in API Settings.', 400);
    }
    const ebayService = new EbayService({
      ...(credentials.credentials as EbayCredentials),
      sandbox: env === 'sandbox',
    });

    const skus = await ebayService.getAllInventorySkus();
    const errors: Array<{ sku: string; error: string }> = [];
    let closed = 0;

    for (const sku of skus) {
      try {
        await ebayService.endListing(sku, 'NotAvailable');
        closed++;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push({ sku, error: msg });
        logger.warn('[eBay CloseAllFromApi] Failed to withdraw', { sku, error: msg });
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    const deleted = await prisma.marketplaceListing.deleteMany({
      where: { userId, marketplace: 'ebay' },
    });
    const productIdsUpdated: number[] = [];
    for (const p of await prisma.product.findMany({
      where: { userId },
      select: { id: true },
    })) {
      const remaining = await prisma.marketplaceListing.count({ where: { productId: p.id } });
      if (remaining === 0) {
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(p.id, 'APPROVED', false, userId);
        productIdsUpdated.push(p.id);
      }
    }

    logger.info('[eBay CloseAllFromApi] Completed', {
      userId,
      closed,
      failed: errors.length,
      deletedFromDb: deleted.count,
      productIdsUpdated: productIdsUpdated.length,
    });

    return {
      closed,
      failed: errors.length,
      deletedFromDb: deleted.count,
      productIdsUpdated,
      errors,
    };
  }

  /**
   * Close ALL Mercado Libre publications by fetching them from ML API (not just from our DB).
   * Use when user has publications in ML that we don't track (e.g. created manually or lost sync).
   * Then syncs our DB: removes closed listings and sets products to APPROVED.
   */
  async mlCloseAllFromApi(userId: number): Promise<{
    closed: number;
    failed: number;
    deletedFromDb: number;
    productIdsUpdated: number[];
    errors: Array<{ listingId: string; error: string }>;
  }> {
    const credentials = await this.getCredentials(userId, 'mercadolibre');
    if (!credentials || !credentials.isActive) {
      throw new AppError('Mercado Libre credentials not found or inactive. Connect ML in API Settings.', 400);
    }
    const credsWithSiteId: MercadoLibreCredentials = {
      ...(credentials.credentials as MercadoLibreCredentials),
      siteId: (credentials.credentials as MercadoLibreCredentials).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    };
    const mlService = new MercadoLibreService(credsWithSiteId);

    // Refresh token if available
    if (credsWithSiteId.refreshToken) {
      try {
        const refreshed = await mlService.refreshAccessToken();
        credsWithSiteId.accessToken = refreshed.accessToken;
        const { CredentialsManager, clearCredentialsCache } = await import('./credentials-manager.service');
        const env = (credentials.environment || 'production') as 'sandbox' | 'production';
        await CredentialsManager.saveCredentials(userId, 'mercadolibre', { ...credsWithSiteId, accessToken: refreshed.accessToken }, env);
        clearCredentialsCache(userId, 'mercadolibre', env);
      } catch (e: any) {
        logger.warn('[ML CloseAllFromApi] Token refresh failed, continuing', { error: e?.message });
      }
    }

    const itemIds = await mlService.getAllUserItemIds();
    const errors: Array<{ listingId: string; error: string }> = [];
    let closed = 0;

    for (const itemId of itemIds) {
      try {
        await mlService.closeListing(itemId);
        closed++;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push({ listingId: itemId, error: msg });
        logger.warn('[ML CloseAllFromApi] Failed to close', { listingId: itemId, error: msg });
      }
      await new Promise((r) => setTimeout(r, 100)); // rate limit cushion
    }

    // Sync DB: remove all ML listings for this user (they're now closed in ML)
    const deleted = await prisma.marketplaceListing.deleteMany({
      where: { userId, marketplace: 'mercadolibre' },
    });
    const productIdsUpdated: number[] = [];
    for (const p of await prisma.product.findMany({
      where: { userId },
      select: { id: true },
    })) {
      const remaining = await prisma.marketplaceListing.count({ where: { productId: p.id } });
      if (remaining === 0) {
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(p.id, 'APPROVED', false, userId);
        productIdsUpdated.push(p.id);
      }
    }

    logger.info('[ML CloseAllFromApi] Completed', {
      userId,
      closed,
      failed: errors.length,
      deletedFromDb: deleted.count,
      productIdsUpdated: productIdsUpdated.length,
    });

    return {
      closed,
      failed: errors.length,
      deletedFromDb: deleted.count,
      productIdsUpdated,
      errors,
    };
  }

  /**
   * Get ML listing status for each Mercado Libre listing in DB (diagnosis).
   * Returns listingId, productId, title, mlStatus (active, closed, paused, under_review, etc).
   */
  async getMlListingsStatus(userId: number, limit: number = 200): Promise<Array<{
    listingId: string;
    productId: number;
    productTitle: string | null;
    mlStatus: string | null;
    mlSubStatus?: string[];
    mlHealth?: number;
  }>> {
    const credentials = await this.getCredentials(userId, 'mercadolibre');
    if (!credentials || !credentials.isActive) {
      throw new AppError('Mercado Libre credentials not found or inactive. Connect ML in API Settings.', 400);
    }
    const credsWithSiteId: MercadoLibreCredentials = {
      ...(credentials.credentials as MercadoLibreCredentials),
      siteId: (credentials.credentials as MercadoLibreCredentials).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    };
    const mlService = new MercadoLibreService(credsWithSiteId);

    const listings = await prisma.marketplaceListing.findMany({
      where: { userId, marketplace: 'mercadolibre' },
      include: { product: { select: { title: true } } },
      orderBy: { id: 'asc' },
      take: Math.min(limit, 500),
    });

    const results: Array<{
      listingId: string;
      productId: number;
      productTitle: string | null;
      mlStatus: string | null;
      mlSubStatus?: string[];
      mlHealth?: number;
    }> = [];

    for (const listing of listings) {
      let mlStatus: string | null = null;
      let mlSubStatus: string[] | undefined;
      let mlHealth: number | undefined;
      try {
        const status = await mlService.getItemStatus(listing.listingId);
        if (status) {
          mlStatus = status.status;
          mlSubStatus = status.sub_status;
          mlHealth = status.health;
        }
      } catch {
        // API may fail for deleted/unknown items
      }
      results.push({
        listingId: listing.listingId,
        productId: listing.productId,
        productTitle: listing.product?.title ?? null,
        mlStatus,
        mlSubStatus,
        mlHealth,
      });
    }
    return results;
  }

  private static mlActiveCountCache: Map<number, { count: number; expiresAt: number }> = new Map();
  private static ML_ACTIVE_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * Get count of active listings on Mercado Libre (from ML API).
   * Cached 5 min to avoid excessive API calls.
   */
  async getMlActiveCount(userId: number): Promise<number | null> {
    const cached = MarketplaceService.mlActiveCountCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.count;
    }
    try {
      const credentials = await this.getCredentials(userId, 'mercadolibre');
      if (!credentials || !credentials.isActive) return null;
      const creds = credentials.credentials as MercadoLibreCredentials;
      const mlService = new MercadoLibreService({
        ...creds,
        siteId: creds.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
      });
      const total = await mlService.getActiveListingsCount();
      if (total !== null && Number.isFinite(total)) {
        MarketplaceService.mlActiveCountCache.set(userId, {
          count: total,
          expiresAt: Date.now() + MarketplaceService.ML_ACTIVE_COUNT_CACHE_TTL_MS,
        });
        return total;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check ML listings for IP policy compliance (title/description: no "tipo X", "símil", "réplica", etc.).
   */
  async checkMercadoLibreCompliance(
    userId: number,
    options?: { limit?: number }
  ): Promise<Array<{
    listingId: string;
    productId: number;
    productTitle: string | null;
    compliant: boolean;
    violations: string[];
    titleSnippet?: string;
  }>> {
    const credentials = await this.getCredentials(userId, 'mercadolibre');
    if (!credentials || !credentials.isActive) {
      throw new AppError('Mercado Libre credentials not found or inactive. Connect ML in API Settings.', 400);
    }
    const credsWithSiteId: MercadoLibreCredentials = {
      ...(credentials.credentials as MercadoLibreCredentials),
      siteId: (credentials.credentials as MercadoLibreCredentials).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
    };
    const mlService = new MercadoLibreService(credsWithSiteId);

    const limit = Math.min(options?.limit ?? 500, 500);
    const listings = await prisma.marketplaceListing.findMany({
      where: { userId, marketplace: 'mercadolibre' },
      include: { product: { select: { title: true } } },
      orderBy: { id: 'asc' },
      take: limit,
    });

    const results: Array<{
      listingId: string;
      productId: number;
      productTitle: string | null;
      compliant: boolean;
      violations: string[];
      titleSnippet?: string;
    }> = [];

    for (const listing of listings) {
      const item = await mlService.getItemForCompliance(listing.listingId);
      if (!item) {
        results.push({
          listingId: listing.listingId,
          productId: listing.productId,
          productTitle: listing.product?.title ?? null,
          compliant: false,
          violations: ['No se pudo obtener título/descripción desde ML'],
        });
        continue;
      }
      const { compliant, violations } = checkMLCompliance(item.title, item.description);
      results.push({
        listingId: listing.listingId,
        productId: listing.productId,
        productTitle: listing.product?.title ?? null,
        compliant,
        violations,
        titleSnippet: item.title ? item.title.substring(0, 80) : undefined,
      });
    }
    return results;
  }

  /**
   * Publish to Amazon
   */
  private async publishToAmazon(
    product: any, 
    credentials: AmazonCredentials, 
    customData?: any,
    userId?: number
  ): Promise<PublishResult> {
    try {
      const amazonService = new AmazonService();
      await amazonService.setCredentials(credentials);

      const metadata = this.parseProductMetadata(product);
      // ✅ CORREGIDO: Validar imágenes antes de publicar
      // ✅ MULTI-IMAGE: Preparar todas las imágenes disponibles (hasta el límite de Amazon)
      const images = this.prepareImagesForMarketplace(product.images, 'amazon');
      if (!images || images.length === 0) {
        throw new AppError('Product must have at least one image before publishing. Please add images to the product.', 400);
      }

      // Get category suggestions if not provided
      let category = customData?.categoryId;
      if (!category) {
        const categories = await amazonService.getProductCategories(product.title);
        category = categories[0]?.categoryId || 'default';
      }
      // ✅ CORREGIDO: Validar categoría antes de publicar
      if (!category || category === 'default') {
        throw new AppError('Product must have a valid category before publishing. Please specify a category.', 400);
      }

      const price = this.resolveListingPrice(product, customData?.price);
      if (price <= 0) {
        throw new AppError('Product is missing pricing information. Actualiza el precio sugerido antes de publicar.', 400);
      }

      const costNumAmz = toNumber(product.aliexpressPrice);
      const shippingNumAmz = toNumber(product.shippingCost ?? 0);
      const importTaxNumAmz = toNumber(product.importTax ?? 0);
      const totalCostAmz = toNumber(product.totalCost) > 0
        ? toNumber(product.totalCost)
        : costNumAmz + shippingNumAmz + importTaxNumAmz;
      if (price <= totalCostAmz) {
        throw new AppError(`Price (${price}) must be greater than total cost (${totalCostAmz.toFixed(2)}: product + shipping + import tax) to generate profit.`, 400);
      }

      // Moneda e idioma del destino (marketplace)
      const dest = resolveDestination('amazon', credentials);
      const currency = dest.currency;
      let priceInDestCurrency = price;
      const productCurrency = (metadata?.currency || product.currency || 'USD').toUpperCase();
      if (productCurrency !== currency) {
        try {
          const fxService = (await import('./fx.service')).default;
          priceInDestCurrency = fxService.convert(price, productCurrency, currency);
          logger.info('[Amazon Publish] Price converted to destination currency', {
            price,
            productCurrency,
            currency,
            priceInDestCurrency,
          });
        } catch (err: any) {
          logger.warn('[Amazon Publish] FX conversion failed, using original price', {
            error: err?.message,
          });
        }
      }

      const amazonConfig = this.getMarketplaceConfig('amazon', credentials);
      const amazonKeywords = buildKeywordsFromProduct(product);
      let finalTitle = customData?.title || product.title;
      let finalDescription = customData?.description || product.description || '';

      if (!customData?.title && userId) {
        try {
          finalTitle = await this.generateAITitle(product, amazonConfig.displayName, amazonConfig.language, userId, amazonKeywords);
          finalTitle = truncateTitleByLimit(String(finalTitle || '').replace(/\s+/g, ' ').trim(), 'amazon');
        } catch (error) {
          logger.debug('Failed to generate AI title for Amazon, using original', { error });
        }
      }

      if (!customData?.description && userId) {
        try {
          finalDescription = await this.generateAIDescription(product, amazonConfig.displayName, amazonConfig.language, userId);
        } catch (error) {
          logger.debug('Failed to generate AI description for Amazon, using original', { error });
        }
      }

      // Apply Amazon compliance sanitization (IP policy, Product Title Policy, 200 chars, no decorative chars)
      finalTitle = sanitizeTitleForAmazon(String(finalTitle || '').trim());
      finalDescription = sanitizeDescriptionForAmazon(String(finalDescription || ''));

      const complianceCheck = checkMarketplaceCompliance('amazon', finalTitle, finalDescription);
      if (!complianceCheck.compliant && complianceCheck.violations.length > 0) {
        logger.warn('[MARKETPLACE] Amazon compliance check: remaining violations after sanitization', {
          productId: product.id,
          violations: complianceCheck.violations,
        });
      }

      const amazonProduct: AmazonProduct = {
        sku: `IVAN-${product.id}`,
        title: finalTitle,
        description: finalDescription,
        price: priceInDestCurrency,
        currency: currency,
        quantity: this.resolveListingQuantity(product, customData?.quantity),
        images: images, // ✅ MULTI-IMAGE: Todas las imágenes preparadas para Amazon
        category,
        brand: product.brand || 'Generic',
        manufacturer: product.manufacturer || product.brand || 'Generic',
        dimensions: {
          length: product.length || 10,
          width: product.width || 10,
          height: product.height || 10,
          weight: product.weight || 1,
          unit: 'inches',
          weightUnit: 'pounds'
        },
        attributes: {
          upc: product.upc || 'N/A',
          condition: 'New',
          fulfillmentCenterId: 'DEFAULT'
        }
      };

      const result = await amazonService.createListing(amazonProduct);

      // ✅ P1: Solo actualizar BD y estado si la publicación fue exitosa
      if (result.success && result.asin) {
        // Update product with Amazon information (solo si fue exitoso)
        await this.updateProductMarketplaceInfo(product.id, 'amazon', {
          listingId: result.asin,
          listingUrl: result.asin ? `https://amazon.com/dp/${result.asin}` : '',
          publishedAt: new Date(),
        });

        // ✅ NOTA: El estado del producto se actualizará desde publisher.routes.ts
        // después de evaluar todos los resultados de múltiples marketplaces.
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(
          product.id,
          'PUBLISHED',
          true,
          userId
        );
      }

      // ✅ P1: Retornar resultado correcto según éxito o fallo
      if (result.success && result.asin) {
        return {
          success: true,
          marketplace: 'amazon',
          listingId: result.asin,
          listingUrl: result.asin ? `https://amazon.com/dp/${result.asin}` : undefined,
        };
      } else {
        return {
          success: false,
          marketplace: 'amazon',
          error: result.message || (result.errors && result.errors.length > 0 ? result.errors.join(', ') : 'Failed to create listing on Amazon'),
        };
      }
    } catch (error) {
      return {
        success: false,
        marketplace: 'amazon',
        error: error.message,
      };
    }
  }

  /**
   * Update product with marketplace information
   */
  private async updateProductMarketplaceInfo(
    productId: number, 
    marketplace: string, 
    info: { listingId: string; listingUrl: string; publishedAt: Date; mlStatus?: string }
  ): Promise<void> {
    try {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return;
      const data: any = { listingUrl: info.listingUrl, publishedAt: info.publishedAt };
      if (info.mlStatus) data.sku = `status:${info.mlStatus}`;
      const existing = await prisma.marketplaceListing.findFirst({ where: { marketplace, listingId: info.listingId } });
      if (existing) {
        await prisma.marketplaceListing.update({ where: { id: existing.id }, data });
      } else {
        await prisma.marketplaceListing.create({ data: { productId, userId: product.userId, marketplace, listingId: info.listingId, ...data } });
      }
    } catch (error) {
      logger.error('Failed to update product marketplace info', {
        productId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Sync inventory across marketplaces
   * @param userId - User ID
   * @param productId - Product ID
   * @param newQuantity - New quantity
   * @param environment - Environment (sandbox/production). If not provided, uses user's workflow config
   */
  async syncInventory(
    userId: number, 
    productId: number, 
    newQuantity: number,
    environment?: 'sandbox' | 'production'
  ): Promise<void> {
    try {
      // ✅ Obtener environment del usuario si no se proporciona
      let userEnvironment: 'sandbox' | 'production' = 'production';
      if (!environment) {
        const { workflowConfigService } = await import('./workflow-config.service');
        userEnvironment = await workflowConfigService.getUserEnvironment(userId);
      } else {
        userEnvironment = environment;
      }

      // Get product marketplace listings
      const product = await prisma.product.findFirst({
        where: { id: productId, userId },
      });

      if (!product) {
        throw new AppError('Product not found', 404);
      }

      // Get active listings for this product
      const listings = await prisma.marketplaceListing.findMany({ 
        where: { productId },
        select: { marketplace: true, listingId: true }
      });
      const marketplaces = Array.from(new Set(listings.map(l => l.marketplace)));
      
      for (const marketplace of marketplaces) {
        try {
          const credentials = await this.getCredentials(userId, marketplace as MarketplaceName, userEnvironment);
          if (!credentials || credentials.issues?.length) continue;

          switch (marketplace) {
            case 'ebay': {
              const { CredentialsManager } = await import('./credentials-manager.service');
              const ebayService = new EbayService(
                {
                  ...(credentials.credentials as EbayCredentials),
                  sandbox: credentials.environment === 'sandbox',
                },
                {
                  onCredentialsUpdate: async (updatedCreds) => {
                    const { sandbox, ...persistable } = updatedCreds;
                    await CredentialsManager.saveCredentials(userId, 'ebay', persistable, credentials.environment);
                  },
                },
              );
              await ebayService.updateInventoryQuantity(`IVAN-${product.id}`, newQuantity);
              break;
            }

            case 'mercadolibre': {
              const mlService = new MercadoLibreService(credentials.credentials);
              // Obtener listingId desde la base de datos
              const mlListing = listings.find(l => l.marketplace === 'mercadolibre' && l.listingId);
              if (mlListing && mlListing.listingId) {
                await mlService.updateListingQuantity(mlListing.listingId, newQuantity);
              } else {
                logger.warn('MercadoLibre listing ID not found for inventory sync', { productId, userId });
              }
              break;
            }
          }
        } catch (error) {
          logger.error(`Failed to sync inventory on ${marketplace}`, {
            marketplace,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      }
    } catch (error) {
      throw new AppError(`Failed to sync inventory: ${error.message}`, 500);
    }
  }

  /**
   * Generate SEO-optimized title with AI. Uses language and optional keywords.
   */
  private async generateAITitle(
    product: any,
    marketplace: string,
    language: string,
    userId?: number,
    keywords?: string[]
  ): Promise<string> {
    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const groqCreds = await CredentialsManager.getCredentials(userId || 0, 'groq', 'production');

      if (!groqCreds || !groqCreds.apiKey) {
        return product.title;
      }

      const LANG_MAP: Record<string, string> = {
        es: 'Write the title in Spanish (es).',
        en: 'Write the title in English (en).',
        de: 'Write the title in German (de).',
        fr: 'Write the title in French (fr).',
        it: 'Write the title in Italian (it).',
        pt: 'Write the title in Portuguese (pt).',
      };
      const langInstruction = LANG_MAP[language] || LANG_MAP['en'];
      const mlDifferentiator =
        (marketplace || '').toLowerCase().includes('mercado')
          ? ' For Mercado Libre: include a differentiating characteristic (specs, variant, use case, or feature) to comply with duplicate publication policy.'
          : '';
      const keywordLine =
        keywords && keywords.length > 0
          ? `\nInclude these search-relevant keywords naturally: ${keywords.join(', ')}.`
          : '';

      const response = await fastHttpClient.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a professional e-commerce copywriter. Create SEO-optimized product titles for ${marketplace}. ${langInstruction} Titles should be clear, keyword-rich, and under 80 characters.${mlDifferentiator} Return only the title, no explanations.`,
            },
            {
              role: 'user',
              content: `Create an optimized product title for ${marketplace}:\nOriginal: ${product.title}\nCategory: ${product.category || 'general'}${keywordLine}\n\nReturn only the optimized title, no explanations.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 100,
        },
        {
          headers: {
            Authorization: `Bearer ${groqCreds.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data?.choices?.[0]?.message?.content) {
        logger.warn('Invalid response structure from GROQ API', {
          hasData: !!response.data,
          hasChoices: !!response.data?.choices,
          choicesLength: response.data?.choices?.length,
        });
        return product.title;
      }

      const aiTitle = response.data.choices[0].message.content.trim();
      return aiTitle && aiTitle.length > 0 ? aiTitle : product.title;
    } catch (error) {
      logger.debug('Failed to generate AI title, using original', {
        error: error instanceof Error ? error.message : String(error),
        marketplace,
      });
      return product.title;
    }
  }

  /**
   * Generate listing preview for a product
   * Returns preview data without publishing
   */
  async generateListingPreview(
    userId: number,
    productId: number,
    marketplace: MarketplaceName,
    environment?: 'sandbox' | 'production'
  ): Promise<{
    success: boolean;
    preview?: {
      product: any;
      marketplace: string;
      title: string;
      description: string;
      price: number;
      currency: string;
      language: string;
      images: string[];
      category?: string;
      tags?: string[];
      profitMargin: number;
      potentialProfit: number;
      fees: any;
      seoKeywords?: string[];
    };
    error?: string;
  }> {
    try {
      // Get product from database
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          userId: userId,
        },
      });

      if (!product) {
        return { success: false, error: 'Product not found' };
      }

      // ✅ CORREGIDO: No requerir credenciales para generar preview
      // El preview puede generarse sin credenciales (solo para mostrar cómo se verá el producto)
      // Si no hay credenciales, usar configuración por defecto del marketplace
      const credentials = await this.getCredentials(userId, marketplace, environment);
      // No retornar error si no hay credenciales, usar valores por defecto

      // Determine marketplace currency and language from destination (credentials) when available
      const marketplaceConfig = this.getMarketplaceConfig(
        marketplace,
        credentials?.credentials ? (credentials.credentials as any) : undefined
      );
      const metadata = this.parseProductMetadata(product);
      const productCurrency = (metadata?.currency || product.currency || 'USD').toUpperCase();
      
      // Si hay credenciales, usar currency/language del marketplace desde las credenciales
      // Si no, usar los valores por defecto del marketplace config
      
      // Convert price to marketplace currency
      const fxService = (await import('./fx.service')).default;
      const suggestedPriceBase = toNumber(product.finalPrice || product.suggestedPrice);
      let priceInMarketplaceCurrency = suggestedPriceBase;
      try {
        priceInMarketplaceCurrency = fxService.convert(
          suggestedPriceBase,
          productCurrency,
          marketplaceConfig.currency
        );
      } catch (error: any) {
        logger.warn('[MarketplaceService] FX conversion failed for suggested price', {
          from: productCurrency,
          to: marketplaceConfig.currency,
          amount: suggestedPriceBase,
          error: error?.message
        });
        // Fallback: usar precio sin convertir
        priceInMarketplaceCurrency = suggestedPriceBase;
      }

      const previewKeywords = buildKeywordsFromProduct(product);
      let finalTitle = product.title;
      let finalDescription = product.description || '';

      try {
        finalTitle = await this.generateAITitle(product, marketplaceConfig.displayName, marketplaceConfig.language, userId, previewKeywords);
        finalTitle = truncateTitleByLimit(String(finalTitle || '').replace(/\s+/g, ' ').trim(), marketplace);
      } catch (error) {
        logger.debug('Failed to generate AI title for preview, using original', { error });
      }

      try {
        finalDescription = await this.generateAIDescription(product, marketplaceConfig.displayName, marketplaceConfig.language, userId);
      } catch (error) {
        logger.debug('Failed to generate AI description for preview, using original', { error });
      }

      // Apply marketplace compliance sanitization so preview matches what will be published
      finalTitle = sanitizeTitleForMarketplace(marketplace, String(finalTitle || '').trim());
      finalDescription = sanitizeDescriptionForMarketplace(marketplace, String(finalDescription || ''));

      // ✅ MULTI-IMAGE: Obtener todas las imágenes del producto para la vista previa
      const images = this.parseImageUrls(product.images);
      
      // ✅ LOGGING: Verificar cuántas imágenes se parsearon
      logger.info('[MARKETPLACE-SERVICE] Preview images parsed', {
        productId,
        userId,
        imagesField: typeof product.images,
        imagesFieldLength: typeof product.images === 'string' ? product.images.length : 'N/A',
        imagesParsed: images.length,
        firstImage: images[0]?.substring(0, 80) || 'none',
        allImages: images.slice(0, 5).map(img => img.substring(0, 60))
      });
      
      const costBase = toNumber(product.aliexpressPrice);
      let shippingCost = toNumber(product.shippingCost ?? metadata?.shippingCost ?? 0);
      let importTaxVal = toNumber(product.importTax ?? metadata?.importTax ?? 0);
      const targetCountry = (product.targetCountry || metadata?.targetCountry || '').toString().toUpperCase() || undefined;

      if (targetCountry && (shippingCost > 0 || costBase > 0) && importTaxVal === 0) {
        try {
          const taxCalculatorService = (await import('./tax-calculator.service')).default;
          const subtotal = costBase + shippingCost;
          const taxResult = taxCalculatorService.calculateTax(subtotal, targetCountry);
          importTaxVal = taxResult.totalTax;
        } catch (e) {
          // Ignore tax calc errors
        }
      }

      // Convert cost, shipping, importTax to marketplace currency
      let costInMarketplaceCurrency = costBase;
      let shippingInMpCurrency = shippingCost;
      let importTaxInMpCurrency = importTaxVal;
      const mpCurrency = marketplaceConfig.currency;
      if (productCurrency.toUpperCase() !== mpCurrency.toUpperCase()) {
        try {
          costInMarketplaceCurrency = fxService.convert(costBase, productCurrency, mpCurrency);
          if (shippingCost > 0) shippingInMpCurrency = fxService.convert(shippingCost, productCurrency, mpCurrency);
          if (importTaxVal > 0) importTaxInMpCurrency = fxService.convert(importTaxVal, productCurrency, mpCurrency);
        } catch (error: any) {
          logger.warn('[MarketplaceService] FX conversion failed for cost/shipping', { error: error?.message });
        }
      }

      // Calculate fees with full cost breakdown (shipping + import tax)
      const { CostCalculatorService } = await import('./cost-calculator.service');
      const costCalculator = new CostCalculatorService();
      const fees = costCalculator.calculateAdvanced(
        marketplace,
        marketplaceConfig.region || 'us',
        priceInMarketplaceCurrency,
        costInMarketplaceCurrency,
        mpCurrency,
        mpCurrency,
        {
          shippingCost: shippingInMpCurrency > 0 ? shippingInMpCurrency : undefined,
          importTax: importTaxInMpCurrency > 0 ? importTaxInMpCurrency : undefined,
        }
      );

      const potentialProfit = fees.netProfit;
      const profitMargin = priceInMarketplaceCurrency > 0
        ? (potentialProfit / priceInMarketplaceCurrency) * 100
        : 0;

      // Extract tags/keywords from product data
      const tags = metadata?.tags || [];
      const seoKeywords = tags.length > 0 ? tags : [product.category || 'general'];

      return {
        success: true,
        preview: {
          product: {
            id: product.id,
            title: product.title,
            category: product.category,
            aliexpressPrice: costBase,
            aliexpressCurrency: productCurrency,
          },
          marketplace: marketplace,
          title: finalTitle,
          description: finalDescription,
          price: priceInMarketplaceCurrency,
          currency: marketplaceConfig.currency,
          language: marketplaceConfig.language,
          images: images,
          category: product.category || undefined,
          tags: tags,
          profitMargin: profitMargin,
          potentialProfit: potentialProfit,
          fees: fees,
          seoKeywords: seoKeywords,
        },
      };
    } catch (error) {
      logger.error('Failed to generate listing preview', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        productId,
        marketplace,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate preview',
      };
    }
  }

  /**
   * Get marketplace configuration (currency, language, region).
   * When credentials provided, derives from destination (account site/country).
   */
  private getMarketplaceConfig(
    marketplace: MarketplaceName,
    credentials?: { siteId?: string; marketplace?: string; marketplace_id?: string }
  ): { currency: string; language: string; displayName: string; region?: string } {
    const displayNames: Record<MarketplaceName, string> = {
      ebay: 'eBay',
      mercadolibre: 'MercadoLibre',
      amazon: 'Amazon',
    };
    if (credentials) {
      const dest = resolveDestination(marketplace, credentials);
      return {
        currency: dest.currency,
        language: dest.language || 'en',
        displayName: displayNames[marketplace] || marketplace,
        region: dest.region,
      };
    }
    const configs: Record<MarketplaceName, { currency: string; language: string; displayName: string; region?: string }> = {
      ebay: { currency: 'USD', language: 'en', displayName: 'eBay', region: 'us' },
      mercadolibre: { currency: 'CLP', language: 'es', displayName: 'MercadoLibre', region: 'cl' },
      amazon: { currency: 'USD', language: 'en', displayName: 'Amazon', region: 'us' },
    };
    return configs[marketplace] || configs.ebay;
  }

  /**
   * Generate SEO-optimized description with AI. Uses language for correct locale.
   */
  private async generateAIDescription(
    product: any,
    marketplace: string,
    language: string,
    userId?: number
  ): Promise<string> {
    try {
      const currentDescription = product.description || '';
      const isDescriptionValid =
        currentDescription.length >= 50 &&
        !currentDescription.toLowerCase().startsWith('fortalezas:') &&
        !currentDescription.toLowerCase().startsWith('recomendaciones:') &&
        !currentDescription.toLowerCase().includes('fortalezas:') &&
        !currentDescription.toLowerCase().includes('recomendaciones:');

      const { CredentialsManager } = await import('./credentials-manager.service');
      const groqCreds = await CredentialsManager.getCredentials(userId || 0, 'groq', 'production');

      if (!groqCreds || !groqCreds.apiKey) {
        if (isDescriptionValid) return currentDescription;
        return `Product Description:\n\n${product.title}\n\nThis product offers excellent quality and value. Perfect for your needs.`;
      }

      const LANG_MAP: Record<string, string> = {
        es: 'Write the description in Spanish (es).',
        en: 'Write the description in English (en).',
        de: 'Write the description in German (de).',
        fr: 'Write the description in French (fr).',
        it: 'Write the description in Italian (it).',
        pt: 'Write the description in Portuguese (pt).',
      };
      const langInstruction = LANG_MAP[language] || LANG_MAP['en'];
      const userPrompt = isDescriptionValid
        ? `Create an optimized product description for ${marketplace}:\nTitle: ${product.title}\nOriginal description: ${currentDescription}\nCategory: ${product.category || 'general'}\n\n${langInstruction} Return only the optimized description, no explanations.`
        : `Create a comprehensive and compelling product description for ${marketplace} based only on the product title:\nTitle: ${product.title}\nCategory: ${product.category || 'general'}\n\n${langInstruction} Generate a detailed product description (200-400 words) that highlights key features, benefits, and specifications. Make it SEO-friendly and optimized for conversions. Return only the description, no explanations.`;

      const response = await fastHttpClient.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a professional e-commerce copywriter. Create compelling, SEO-friendly product descriptions for ${marketplace}. ${langInstruction} Descriptions should highlight key features, benefits, and be optimized for conversions. Keep it between 200-500 words.`,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            'Authorization': `Bearer ${groqCreds.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // ✅ PRODUCTION READY: Validar estructura de respuesta antes de acceder
      if (!response.data?.choices?.[0]?.message?.content) {
        logger.warn('Invalid response structure from GROQ API for description', {
          hasData: !!response.data,
          hasChoices: !!response.data?.choices,
          choicesLength: response.data?.choices?.length,
        });
        return isDescriptionValid ? currentDescription : `Product Description:\n\n${product.title}\n\nThis product offers excellent quality and value. Perfect for your needs.`;
      }
      
      const aiDescription = response.data.choices[0].message.content.trim();
      return aiDescription && aiDescription.length > 0 ? aiDescription : (isDescriptionValid ? currentDescription : `Product Description:\n\n${product.title}\n\nThis product offers excellent quality and value. Perfect for your needs.`);
    } catch (error) {
      logger.debug('Failed to generate AI description, using original', {
        error: error instanceof Error ? error.message : String(error),
        marketplace,
      });
      // ✅ CORREGIDO: Retornar descripción válida o generada desde título
      const currentDescription = product.description || '';
      const isDescriptionValid = currentDescription.length >= 50 && 
        !currentDescription.toLowerCase().startsWith('fortalezas:') && 
        !currentDescription.toLowerCase().startsWith('recomendaciones:');
      if (isDescriptionValid) {
        return currentDescription;
      }
      return `Product Description:\n\n${product.title}\n\nThis product offers excellent quality and value. Perfect for your needs.`;
    }
  }

  /**
   * ✅ CORREGIDO: Sincronizar precio de producto publicado con marketplaces
   * Actualiza el precio en todos los listings activos del producto
   */
  async syncProductPrice(
    userId: number,
    productId: number,
    newPrice: number,
    environment?: 'sandbox' | 'production'
  ): Promise<{ success: boolean; updated: number; errors: Array<{ marketplace: string; error: string }> }> {
    try {
      // Obtener producto y verificar que esté publicado
      const product = await prisma.product.findFirst({
        where: { id: productId, userId },
        include: { marketplaceListings: true }
      });

      if (!product) {
        throw new AppError('Product not found', 404);
      }

      if (!product.isPublished || product.status !== 'PUBLISHED') {
        throw new AppError('Product must be published before syncing price', 400);
      }

      const aliexpressPriceNum = toNumber(product.aliexpressPrice);
      if (newPrice <= 0 || newPrice <= aliexpressPriceNum) {
        throw new AppError(`New price (${newPrice}) must be greater than AliExpress cost (${aliexpressPriceNum})`, 400);
      }

      // Obtener listings activos (filtrar por isActive si existe, sino todos)
      const listings = product.marketplaceListings.filter(l => {
        // MarketplaceListing no tiene isActive en el schema, usar todos los listings
        return true;
      });
      if (listings.length === 0) {
        return { success: true, updated: 0, errors: [] };
      }

      // Obtener environment del usuario si no se proporciona
      let userEnvironment: 'sandbox' | 'production' = 'production';
      if (!environment) {
        const { workflowConfigService } = await import('./workflow-config.service');
        userEnvironment = await workflowConfigService.getUserEnvironment(userId);
      } else {
        userEnvironment = environment;
      }

      const results = { success: true, updated: 0, errors: [] as Array<{ marketplace: string; error: string }> };

      // Actualizar precio en cada marketplace
      for (const listing of listings) {
        try {
          const marketplace = listing.marketplace as 'ebay' | 'amazon' | 'mercadolibre';
          
          // Obtener credenciales
          const credentials = await this.getCredentials(userId, marketplace, userEnvironment);
          if (!credentials || !credentials.isActive) {
            results.errors.push({ marketplace, error: 'Credentials not found or inactive' });
            continue;
          }

          // ✅ Q5: Actualizar precio según marketplace usando APIs reales
          switch (marketplace) {
            case 'ebay': {
              const ebayCreds = {
                ...(credentials.credentials as any),
                sandbox: credentials.environment === 'sandbox',
              };
              const { EbayService } = await import('./ebay.service');
              const { CredentialsManager: CM } = await import('./credentials-manager.service');
              const ebayService = new EbayService(ebayCreds, {
                onCredentialsUpdate: async (updatedCreds) => {
                  const { sandbox, ...persistable } = updatedCreds;
                  await CM.saveCredentials(userId, 'ebay', persistable, credentials.environment);
                },
              });
              
              // eBay usa offerId para actualizar precios
              // Si no tenemos offerId, intentamos usar listingId como SKU
              const offerId = listing.listingId || listing.sku;
              if (!offerId) {
                throw new AppError('eBay listing ID (offerId) is required to update price', 400);
              }

              // Obtener moneda del producto desde productData o usar USD por defecto
              let currency = 'USD';
              try {
                if (product.productData) {
                  const productData = typeof product.productData === 'string' 
                    ? JSON.parse(product.productData) 
                    : product.productData;
                  currency = productData.currency || 'USD';
                }
              } catch {
                // Si falla parsear, usar USD
              }
              
              await ebayService.updateListingPrice(offerId, newPrice, currency);
              
              // Actualizar en BD
              await prisma.marketplaceListing.update({
                where: { id: listing.id },
                data: { updatedAt: new Date() }
              });
              results.updated++;
              break;
            }

            case 'amazon': {
              const { AmazonService } = await import('./amazon.service');
              const amazonService = new AmazonService();
              await amazonService.setCredentials(credentials.credentials as any);
              
              // Amazon usa SKU para actualizar precios
              const sku = listing.sku || listing.listingId;
              if (!sku) {
                throw new AppError('Amazon SKU is required to update price', 400);
              }

              // Obtener moneda del producto desde productData o usar USD por defecto
              let currency = 'USD';
              try {
                if (product.productData) {
                  const productData = typeof product.productData === 'string' 
                    ? JSON.parse(product.productData) 
                    : product.productData;
                  currency = productData.currency || 'USD';
                }
              } catch {
                // Si falla parsear, usar USD
              }
              const success = await amazonService.updatePrice(sku, newPrice, currency);
              
              if (!success) {
                throw new AppError('Failed to update price on Amazon', 500);
              }

              // Actualizar en BD
              await prisma.marketplaceListing.update({
                where: { id: listing.id },
                data: { updatedAt: new Date() }
              });
              results.updated++;
              break;
            }

            case 'mercadolibre': {
              const { MercadoLibreService } = await import('./mercadolibre.service');
              const mlService = new MercadoLibreService(credentials.credentials as any);
              
              // MercadoLibre usa itemId para actualizar precios
              const itemId = listing.listingId;
              if (!itemId) {
                throw new AppError('MercadoLibre item ID is required to update price', 400);
              }

              await mlService.updateListingPrice(itemId, newPrice);
              
              // Actualizar en BD
              await prisma.marketplaceListing.update({
                where: { id: listing.id },
                data: { updatedAt: new Date() }
              });
              results.updated++;
              break;
            }
          }
        } catch (error) {
          results.errors.push({
            marketplace: listing.marketplace,
            error: error instanceof Error ? error.message : String(error)
          });
          results.success = false;
        }
      }

      // Actualizar precio del producto
      if (results.updated > 0) {
        await prisma.product.update({
          where: { id: productId },
          data: { finalPrice: newPrice, suggestedPrice: newPrice }
        });
      }

      return results;
    } catch (error) {
      throw new AppError(`Failed to sync product price: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
  }

  /**
   * Get marketplace statistics
   */
  async getMarketplaceStats(userId: number): Promise<any> {
    try {
      // FUTURE: Implement marketplace statistics (sales, views, conversion rates)
      return {
        totalListings: 0,
        activeListings: 0,
        totalSales: 0,
        marketplaces: {
          ebay: { listings: 0, sales: 0 },
          mercadolibre: { listings: 0, sales: 0 },
          amazon: { listings: 0, sales: 0 },
        },
      };
    } catch (error) {
      throw new AppError(`Failed to get marketplace stats: ${error.message}`, 500);
    }
  }

  /**
   * Dice coefficient for word sets: 2*|A∩B|/(|A|+|B|). Returns 0-1.
   */
  private titleSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const toWords = (s: string) => new Set((s || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1));
    const wa = toWords(a);
    const wb = toWords(b);
    if (wa.size === 0 && wb.size === 0) return 1;
    if (wa.size === 0 || wb.size === 0) return 0;
    let intersection = 0;
    for (const w of wa) {
      if (wb.has(w)) intersection++;
    }
    return (2 * intersection) / (wa.size + wb.size);
  }

  /**
   * Extract attribute (color, material, etc.) from product for title differentiator.
   */
  private getDifferentiatorFromProduct(product: any): string | null {
    const pd = product?.productData;
    if (!pd) return null;
    const data = typeof pd === 'string' ? (() => { try { return JSON.parse(pd); } catch { return {}; } })() : pd;
    const color = data.color || data.colour || data.Colour || data.Color;
    const material = data.material || data.Material;
    const size = data.size || data.Size;
    if (typeof color === 'string' && color.trim().length > 0 && color.length <= 20) return color.trim();
    if (typeof material === 'string' && material.trim().length > 0 && material.length <= 15) return material.trim();
    if (typeof size === 'string' && size.trim().length > 0 && size.length <= 12) return size.trim();
    return null;
  }

  /**
   * Ensure ML title differs from existing user publications (avoids duplicate policy).
   * Exact match or similarity > 0.85 → add differentiator (attribute or #productId).
   */
  private async ensureUniqueMlTitle(userId: number, product: any, title: string): Promise<string> {
    const productId = product?.id;
    const normalize = (t: string) =>
      (t || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\sáéíóúñü]/gi, '')
        .trim();
    const norm = normalize(title);
    if (!norm) return title;

    const listings = await prisma.marketplaceListing.findMany({
      where: { userId, marketplace: 'mercadolibre' },
      include: { product: { select: { title: true } } },
    });
    const existingTitles = listings
      .filter((l) => l.productId !== productId)
      .map((l) => normalize((l as any).product?.title || ''))
      .filter(Boolean);

    const exactMatch = existingTitles.some((t) => t === norm);
    const similarMatch = existingTitles.some((t) => this.titleSimilarity(norm, t) > 0.85);
    if (!exactMatch && !similarMatch) return title;

    const maxLen = TITLE_MAX_BY_MARKETPLACE.mercadolibre ?? 60;
    const attr = this.getDifferentiatorFromProduct(product);
    const suffix = attr ? ` ${attr}` : ` #${productId}`;
    const candidate = (title.slice(0, maxLen - suffix.length).trim() + suffix).slice(0, maxLen);
    logger.info('[ML Publish] Title duplicate/similar, added differentiator', {
      productId,
      originalTitle: title.slice(0, 40),
      differentiator: attr || `#${productId}`,
      candidate,
    });
    return candidate;
  }

  private parseProductMetadata(product: any): Record<string, any> {
    const raw = product?.productData;
    if (!raw) return {};
    if (typeof raw === 'object' && raw !== null) {
      return raw as any;
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * Parse image URLs from various formats (JSON string, array, single URL)
   * Returns all valid image URLs without truncation
   */
  private parseImageUrls(value: any): string[] {
    if (!value) {
      logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: value is null/undefined');
      return [];
    }

    // Si ya es un array, filtrar y retornar
    if (Array.isArray(value)) {
      const validUrls = value.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
      logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: Already array', { 
        originalLength: value.length, 
        validUrls: validUrls.length 
      });
      return validUrls;
    }

    // Si es string, intentar parsear como JSON
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: Empty string');
        return [];
      }
      
      // ✅ MEJORADO: Intentar parsear como JSON si parece ser un array JSON
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            const validUrls = parsed.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
            logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: Parsed JSON array', { 
              originalLength: parsed.length, 
              validUrls: validUrls.length 
            });
            return validUrls;
          }
        } catch (parseError: any) {
          logger.warn('[MARKETPLACE-SERVICE] parseImageUrls: Failed to parse JSON array', { 
            error: parseError?.message,
            valuePreview: trimmed.substring(0, 100)
          });
          // Continuar con fallback
        }
      }
      
      // ✅ FALLBACK: Si es una sola URL válida, retornarla como array
      if (/^https?:\/\//i.test(trimmed)) {
        logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: Single URL found');
        return [trimmed];
      }
      
      // ✅ MEJORADO: Intentar parsear aunque no empiece con [
      // A veces el JSON puede estar con espacios o formateado diferente
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const validUrls = parsed.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
          logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: Parsed JSON array (no leading bracket)', { 
            originalLength: parsed.length, 
            validUrls: validUrls.length 
          });
          return validUrls;
        }
      } catch {
        // No es JSON válido, retornar vacío
        logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: Not valid JSON or URL');
      }
    }

    logger.debug('[MARKETPLACE-SERVICE] parseImageUrls: No valid images found', { 
      valueType: typeof value,
      valuePreview: typeof value === 'string' ? value.substring(0, 100) : String(value).substring(0, 100)
    });
    return [];
  }

  /**
   * Get maximum images allowed per marketplace
   * eBay: 12 images maximum
   * MercadoLibre: Up to 10 images (depending on plan)
   * Amazon: Up to 9 images (main + 8 additional)
   */
  private getMarketplaceImageLimit(marketplace: MarketplaceName): number {
    const limits: Record<MarketplaceName, number> = {
      ebay: 12,
      mercadolibre: 10,
      amazon: 9,
    };
    return limits[marketplace] || 12; // Default to eBay limit
  }

  /**
   * Prepare images array for marketplace publication
   * Ensures all images are included up to marketplace limit, maintaining order
   */
  private prepareImagesForMarketplace(
    productImages: any,
    marketplace: MarketplaceName,
    customData?: { primaryImageIndex?: number }
  ): string[] {
    const rawImages = this.parseImageUrls(productImages);

    if (rawImages.length === 0) {
      logger.warn('No valid images found for product', { marketplace });
      return [];
    }

    let images = Array.from(new Set(rawImages));

    if (marketplace === 'mercadolibre') {
      images = images.map(url => this.upgradeToHighResImage(url));
      images = images.filter(url => !this.isLowQualityImage(url));
      images = Array.from(new Set(images));
      // ML policy: first image (portada) must not have logos/text
      if (typeof customData?.primaryImageIndex === 'number' && customData.primaryImageIndex >= 0 && customData.primaryImageIndex < images.length) {
        const idx = customData.primaryImageIndex;
        const selected = images[idx];
        images = [selected, ...images.filter((_, i) => i !== idx)];
        logger.info('[ML] Using user-selected cover image', { primaryImageIndex: idx });
      } else if (images.length >= 2 && this.areAllFromAliExpress(images)) {
        // Heuristic: AliExpress first image often has watermark; prefer 2nd as cover
        const [first, second, ...rest] = images;
        images = [second, first, ...rest];
        logger.info('[ML] AliExpress heuristic: using 2nd image as cover');
      } else {
        images = this.reorderMlImagesForCleanPortada(images);
      }
    }

    const maxImages = this.getMarketplaceImageLimit(marketplace);
    const preparedImages = images.slice(0, maxImages);

    logger.info(`Preparing ${preparedImages.length} images for ${marketplace} publication`, {
      totalImages: rawImages.length,
      afterDedup: images.length,
      kept: preparedImages.length,
      marketplace,
    });

    return preparedImages;
  }

  private upgradeToHighResImage(url: string): string {
    const isAliCdn = /aliexpress-media\.com|alicdn\.com|ae0[0-9]\.alicdn\.com/i.test(url);
    if (!isAliCdn) return url;

    let upgraded = url;

    // Strip any existing size suffix (e.g., _200x200, _500x500xz, etc.)
    upgraded = upgraded
      .replace(/_\d+x\d+\w*\.(jpg|jpeg|png|webp)/gi, '.$1')
      .replace(/\.(jpg|jpeg|png)_\d+x\d+\w*\.(jpg|jpeg|png)/gi, '.$1');

    // Convert webp to jpg for maximum marketplace compatibility
    upgraded = upgraded.replace(/\.webp/gi, '.jpg');

    // Remove query params that force low-res variants
    upgraded = upgraded.replace(/[?&](bw|bh)=\d+/gi, '');

    // Ensure HTTPS
    if (upgraded.startsWith('http://')) {
      upgraded = upgraded.replace('http://', 'https://');
    }

    return upgraded;
  }

  private isLowQualityImage(url: string): boolean {
    const lowResPatterns = [
      /_50x50/i, /_100x100/i, /_120x120/i, /_200x200/i, /_220x220/i,
      /_350x350/i, /thumbnail/i, /favicon/i, /icon/i, /logo\./i,
      /\bplaceholder\b/i, /no-?image/i, /default_img/i,
    ];
    if (lowResPatterns.some(p => p.test(url))) return true;
    if (/\.(gif|bmp|svg)(\?|$)/i.test(url)) return true;
    // Block webp for ML (not always supported)
    if (/\.(webp)(\?|$)/i.test(url)) return true;
    return false;
  }

  private areAllFromAliExpress(urls: string[]): boolean {
    const aliPattern = /aliexpress-media\.com|alicdn\.com|ae0[0-9]\.alicdn\.com/i;
    return urls.length > 0 && urls.every(u => aliPattern.test(u));
  }

  /**
   * ML policy: first image (portada) must not have logos/text. Reorder images so URLs
   * without logo/watermark/banner/text in path come first. Prefer higher-res (no size suffix).
   */
  private reorderMlImagesForCleanPortada(urls: string[]): string[] {
    if (urls.length <= 1) return urls;
    const suspects = /logo|watermark|water.?mark|text|banner|watermarking|original|wm_|o1\.|o2\.|_q\d+/i;
    const hasSizeSuffix = /_\d{2,4}x\d{2,4}/i; // e.g. _200x200
    const cleanFirst = urls.filter(u => !suspects.test(u));
    const suspect = urls.filter(u => suspects.test(u));
    const combined = [...cleanFirst, ...suspect];
    // Within clean images, prefer those without thumbnail size suffix (likely higher res)
    return combined.sort((a, b) => {
      const aHiRes = !hasSizeSuffix.test(a) ? 1 : 0;
      const bHiRes = !hasSizeSuffix.test(b) ? 1 : 0;
      return bHiRes - aHiRes;
    });
  }

  /**
   * Precio efectivo que se usará al publicar. No devuelve precio <= costo; así listado y publicación usan la misma regla.
   * Público para que GET /publisher/pending pueda filtrar y mostrar los mismos valores que la publicación.
   */
  getEffectiveListingPrice(product: any, override?: number): number {
    const costNum = toNumber(product?.aliexpressPrice ?? 0);
    if (typeof override === 'number' && override > 0 && override > costNum) {
      return override;
    }
    const metadata = this.parseProductMetadata(product);
    const metaPrice = typeof metadata?.price === 'number' ? metadata.price : 0;
    if (metaPrice > 0 && metaPrice > costNum) return metaPrice;
    const finalPrice = toNumber(product?.finalPrice ?? 0);
    if (finalPrice > 0 && finalPrice > costNum) return finalPrice;
    const suggestedPrice = toNumber(product?.suggestedPrice ?? 0);
    if (suggestedPrice > 0 && suggestedPrice > costNum) return suggestedPrice;
    if (costNum > 0) {
      const fallbackPrice = Math.round(costNum * 2.5 * 100) / 100;
      if (fallbackPrice > costNum) return fallbackPrice;
    }
    return 0;
  }

  private resolveListingPrice(product: any, override?: number): number {
    return this.getEffectiveListingPrice(product, override);
  }

  private resolveListingQuantity(product: any, override?: number): number {
    if (typeof override === 'number' && override > 0) {
      return override;
    }
    const metadata = this.parseProductMetadata(product);
    if (typeof metadata?.quantity === 'number' && metadata.quantity > 0) {
      return metadata.quantity;
    }
    if (typeof metadata?.stock === 'number' && metadata.stock > 0) {
      return metadata.stock;
    }
    return 1;
  }

  // Encryption helpers (AES-256-GCM base64)
  private encrypt(plain: string): string {
    const secret = process.env.ENCRYPTION_KEY || 'default-key';
    const key = crypto.scryptSync(secret, 'ivan-reseller-salt', 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  private decrypt(encBase64: string): string {
    try {
      const buf = Buffer.from(encBase64, 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const data = buf.subarray(28);
      const secret = process.env.ENCRYPTION_KEY || 'default-key';
      const key = crypto.scryptSync(secret, 'ivan-reseller-salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      return dec.toString('utf8');
    } catch {
      return encBase64;
    }
  }
}

export default MarketplaceService;
