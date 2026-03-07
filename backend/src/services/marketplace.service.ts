import { trace } from '../utils/boot-trace';
trace('loading marketplace.service');

import { EbayService, EbayCredentials, EbayProduct } from './ebay.service';
import { MercadoLibreService, MercadoLibreCredentials, MLProduct } from './mercadolibre.service';
import { AmazonService, AmazonCredentials, AmazonProduct } from './amazon.service';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../config/database';
import { retryMarketplaceOperation } from '../utils/retry.util';
import logger from '../config/logger';
import crypto from 'crypto';
import type { CredentialScope } from '@prisma/client';
import { toNumber } from '../utils/decimal.utils';
import { fastHttpClient } from '../config/http-client'; // ✅ PRODUCTION READY: Usar cliente HTTP configurado

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
    const redirectUri = runame || explicitRedirect || canonicalBackend || defaultRedirect;
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

        case 'mercadolibre':
          const mlService = new MercadoLibreService(credentials.credentials as MercadoLibreCredentials);
          return await mlService.testConnection();

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

      // ✅ Margen estricto: precio debe ser mayor que el costo
      const costNum = toNumber(product.aliexpressPrice);
      if (price <= costNum) {
        throw new AppError(`Price (${price}) must be greater than AliExpress cost (${product.aliexpressPrice}) to generate profit.`, 400);
      }

      // ✅ Q6: Generar título y descripción con IA si está disponible (solo si no se proporcionan en customData)
      let finalTitle = customData?.title || product.title;
      let finalDescription = customData?.description || product.description || '';
      
      if (!customData?.title && userId) {
        try {
          finalTitle = await this.generateAITitle(product, 'eBay', userId);
        } catch (error) {
          logger.debug('Failed to generate AI title for eBay, using original', { error });
        }
      }
      
      if (!customData?.description && userId) {
        try {
          finalDescription = await this.generateAIDescription(product, 'eBay', userId);
        } catch (error) {
          logger.debug('Failed to generate AI description for eBay, using original', { error });
        }
      }

      // eBay Inventory API requires title length 1..80 characters.
      // Normalize here even when title is AI-generated.
      finalTitle = String(finalTitle || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
      if (!finalTitle) {
        finalTitle = String(product.title || 'Product')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80) || `Product-${product.id}`;
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
      const mlService = new MercadoLibreService(credentials);

      // Predict category if not provided
      let categoryId = customData?.categoryId;
      if (!categoryId) {
        categoryId = await mlService.predictCategory(product.title);
      }

      // ✅ CORREGIDO: Validar imágenes antes de publicar
      // ✅ MULTI-IMAGE: Preparar todas las imágenes disponibles (hasta el límite de MercadoLibre)
      const images = this.prepareImagesForMarketplace(product.images, 'mercadolibre');
      if (!images || images.length === 0) {
        throw new AppError('Product must have at least one image before publishing. Please add images to the product.', 400);
      }

      // ✅ CORREGIDO: Validar categoría antes de publicar (ya se obtuvo arriba, no redeclarar)
      if (!categoryId || categoryId.trim().length === 0) {
        throw new AppError('Product must have a valid category before publishing. Please specify a category.', 400);
      }

      const price = this.resolveListingPrice(product, customData?.price);
      if (price <= 0) {
        throw new AppError('Product is missing pricing information. Actualiza el precio sugerido antes de publicar.', 400);
      }

      // ✅ Margen estricto: precio debe ser mayor que el costo
      const costNumMl = toNumber(product.aliexpressPrice);
      if (price <= costNumMl) {
        throw new AppError(`Price (${price}) must be greater than AliExpress cost (${product.aliexpressPrice}) to generate profit.`, 400);
      }

      // ✅ Q6: Generar título y descripción con IA si está disponible
      let finalTitle = customData?.title || product.title;
      let finalDescription = customData?.description || product.description || '';
      
      if (!customData?.title && userId) {
        try {
          finalTitle = await this.generateAITitle(product, 'MercadoLibre', userId);
        } catch (error) {
          logger.debug('Failed to generate AI title for MercadoLibre, using original', { error });
        }
      }
      
      if (!customData?.description && userId) {
        try {
          finalDescription = await this.generateAIDescription(product, 'MercadoLibre', userId);
        } catch (error) {
          logger.debug('Failed to generate AI description for MercadoLibre, using original', { error });
        }
      }

      const mlProduct: MLProduct = {
        title: finalTitle,
        description: finalDescription,
        categoryId,
        price,
        quantity: this.resolveListingQuantity(product, customData?.quantity),
        condition: 'new',
        images: images, // ✅ MULTI-IMAGE: Todas las imágenes preparadas para MercadoLibre
        shipping: {
          mode: 'me2',
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

      // ✅ P1: Solo actualizar BD y estado si la publicación fue exitosa
      if (result.success && result.itemId) {
        // Update product with marketplace info (solo si fue exitoso)
        await this.updateProductMarketplaceInfo(product.id, 'mercadolibre', {
          listingId: result.itemId,
          listingUrl: result.permalink,
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

      // ✅ Margen estricto: precio debe ser mayor que el costo
      const costNumAmz = toNumber(product.aliexpressPrice);
      if (price <= costNumAmz) {
        throw new AppError(`Price (${price}) must be greater than AliExpress cost (${product.aliexpressPrice}) to generate profit.`, 400);
      }

      // ✅ Obtener moneda base del usuario en lugar de usar USD hardcodeado
      let currency = 'USD'; // Fallback por defecto
      if (metadata?.currency) {
        currency = metadata.currency.toUpperCase();
      } else {
        try {
          const userSettingsService = (await import('./user-settings.service')).default;
          const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);
          currency = baseCurrency;
        } catch (error) {
          // Si falla obtener moneda del usuario, usar fallback USD
          logger.warn('[MARKETPLACE] Failed to get user base currency, using USD fallback', {
            userId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // ✅ Q6: Generar título y descripción con IA si está disponible
      let finalTitle = customData?.title || product.title;
      let finalDescription = customData?.description || product.description || '';
      
      if (!customData?.title && userId) {
        try {
          finalTitle = await this.generateAITitle(product, 'Amazon', userId);
        } catch (error) {
          logger.debug('Failed to generate AI title for Amazon, using original', { error });
        }
      }
      
      if (!customData?.description && userId) {
        try {
          finalDescription = await this.generateAIDescription(product, 'Amazon', userId);
        } catch (error) {
          logger.debug('Failed to generate AI description for Amazon, using original', { error });
        }
      }

      const amazonProduct: AmazonProduct = {
        sku: `IVAN-${product.id}`,
        title: finalTitle,
        description: finalDescription,
        price,
        currency: currency.toUpperCase(),
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
    info: { listingId: string; listingUrl: string; publishedAt: Date }
  ): Promise<void> {
    try {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return;
      const existing = await prisma.marketplaceListing.findFirst({ where: { marketplace, listingId: info.listingId } });
      if (existing) {
        await prisma.marketplaceListing.update({ where: { id: existing.id }, data: { listingUrl: info.listingUrl, publishedAt: info.publishedAt } });
      } else {
        await prisma.marketplaceListing.create({ data: { productId, userId: product.userId, marketplace, listingId: info.listingId, listingUrl: info.listingUrl, publishedAt: info.publishedAt } });
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
            case 'ebay':
              const ebayService = new EbayService({
                ...(credentials.credentials as EbayCredentials),
                sandbox: credentials.environment === 'sandbox',
              });
              await ebayService.updateInventoryQuantity(`IVAN-${product.id}`, newQuantity);
              break;

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
   * ✅ Q6: Generar título optimizado con IA (si está disponible)
   */
  private async generateAITitle(product: any, marketplace: string, userId?: number): Promise<string> {
    try {
      // Intentar obtener credenciales de GROQ
      const { CredentialsManager } = await import('./credentials-manager.service');
      const groqCreds = await CredentialsManager.getCredentials(userId || 0, 'groq', 'production');
      
      if (!groqCreds || !groqCreds.apiKey) {
        return product.title; // Fallback a título original
      }

      // ✅ PRODUCTION READY: Usar cliente HTTP configurado con timeout
      const response = await fastHttpClient.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a professional e-commerce copywriter. Create SEO-optimized product titles for ${marketplace} marketplace. Titles should be clear, keyword-rich, and under 80 characters.`,
            },
            {
              role: 'user',
              content: `Create an optimized product title for ${marketplace}:\nOriginal: ${product.title}\nCategory: ${product.category || 'general'}\n\nReturn only the optimized title, no explanations.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 100,
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
      return product.title; // Fallback a título original
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

      // Determine marketplace currency and language
      // ✅ CORREGIDO: Si no hay credenciales, usar configuración por defecto
      const marketplaceConfig = this.getMarketplaceConfig(marketplace);
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

      // Generate AI title and description (reuse existing methods)
      let finalTitle = product.title;
      let finalDescription = product.description || '';
      
      try {
        finalTitle = await this.generateAITitle(product, marketplaceConfig.displayName, userId);
      } catch (error) {
        logger.debug('Failed to generate AI title for preview, using original', { error });
      }
      
      try {
        finalDescription = await this.generateAIDescription(product, marketplaceConfig.displayName, userId);
      } catch (error) {
        logger.debug('Failed to generate AI description for preview, using original', { error });
      }

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
      
      // Calculate profit
      const costBase = toNumber(product.aliexpressPrice);
      let costInMarketplaceCurrency = costBase;
      try {
        costInMarketplaceCurrency = fxService.convert(
          costBase,
          productCurrency,
          marketplaceConfig.currency
        );
      } catch (error: any) {
        logger.warn('[MarketplaceService] FX conversion failed for cost', {
          from: productCurrency,
          to: marketplaceConfig.currency,
          amount: costBase,
          error: error?.message
        });
        // Fallback: usar costo sin convertir
        costInMarketplaceCurrency = costBase;
      }
      const potentialProfit = priceInMarketplaceCurrency - costInMarketplaceCurrency;
      const profitMargin = priceInMarketplaceCurrency > 0 
        ? (potentialProfit / priceInMarketplaceCurrency) * 100 
        : 0;

      // Calculate fees (reuse cost calculator)
      const { CostCalculatorService } = await import('./cost-calculator.service');
      const costCalculator = new CostCalculatorService();
      const fees = costCalculator.calculateAdvanced(
        marketplace,
        marketplaceConfig.region || 'us',
        priceInMarketplaceCurrency,
        costInMarketplaceCurrency,
        marketplaceConfig.currency,
        marketplaceConfig.currency
      );

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
   * Get marketplace configuration (currency, language, region)
   */
  private getMarketplaceConfig(marketplace: MarketplaceName): {
    currency: string;
    language: string;
    displayName: string;
    region?: string;
  } {
    const configs: Record<MarketplaceName, { currency: string; language: string; displayName: string; region?: string }> = {
      ebay: { currency: 'USD', language: 'en', displayName: 'eBay', region: 'us' },
      mercadolibre: { currency: 'CLP', language: 'es', displayName: 'MercadoLibre', region: 'cl' },
      amazon: { currency: 'USD', language: 'en', displayName: 'Amazon', region: 'us' },
    };
    return configs[marketplace] || configs.ebay;
  }

  /**
   * ✅ Q6: Generar descripción optimizada con IA (si está disponible)
   */
  private async generateAIDescription(product: any, marketplace: string, userId?: number): Promise<string> {
    try {
      // ✅ CORREGIDO: Determinar si la descripción es válida o solo contiene análisis
      // Si la descripción está vacía, solo contiene "Fortalezas:" o "Recomendaciones:", o tiene menos de 50 caracteres, usar el título para generar una mejor descripción
      const currentDescription = product.description || '';
      const isDescriptionValid = currentDescription.length >= 50 && 
        !currentDescription.toLowerCase().startsWith('fortalezas:') && 
        !currentDescription.toLowerCase().startsWith('recomendaciones:') &&
        !currentDescription.toLowerCase().includes('fortalezas:') &&
        !currentDescription.toLowerCase().includes('recomendaciones:');
      
      // ✅ Si la descripción no es válida, usar el título del producto para generar una descripción coherente
      const descriptionToUse = isDescriptionValid ? currentDescription : '';
      
      // Intentar obtener credenciales de GROQ
      const { CredentialsManager } = await import('./credentials-manager.service');
      const groqCreds = await CredentialsManager.getCredentials(userId || 0, 'groq', 'production');
      
      if (!groqCreds || !groqCreds.apiKey) {
        // ✅ Si no hay credenciales, retornar descripción válida o generar una básica desde el título
        if (isDescriptionValid) {
          return currentDescription;
        }
        // Generar descripción básica desde el título si no hay descripción válida
        return `Product Description:\n\n${product.title}\n\nThis product offers excellent quality and value. Perfect for your needs.`;
      }

      // ✅ PRODUCTION READY: Usar cliente HTTP configurado con timeout
      // ✅ MEJORADO: Mejorar el prompt para generar descripción más coherente cuando no hay descripción válida
      const userPrompt = isDescriptionValid
        ? `Create an optimized product description for ${marketplace}:\nTitle: ${product.title}\nOriginal description: ${currentDescription}\nCategory: ${product.category || 'general'}\n\nReturn only the optimized description, no explanations.`
        : `Create a comprehensive and compelling product description for ${marketplace} based only on the product title:\nTitle: ${product.title}\nCategory: ${product.category || 'general'}\n\nGenerate a detailed product description (200-400 words) that highlights key features, benefits, and specifications. Make it SEO-friendly and optimized for conversions. Return only the description, no explanations.`;

      const response = await fastHttpClient.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a professional e-commerce copywriter. Create compelling, SEO-friendly product descriptions for ${marketplace} marketplace. Descriptions should highlight key features, benefits, and be optimized for conversions. Keep it between 200-500 words.`,
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
              const ebayService = new EbayService(ebayCreds);
              
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
    marketplace: MarketplaceName
  ): string[] {
    const allImages = this.parseImageUrls(productImages);
    
    if (allImages.length === 0) {
      logger.warn('No valid images found for product', { marketplace });
      return [];
    }

    const maxImages = this.getMarketplaceImageLimit(marketplace);
    const preparedImages = allImages.slice(0, maxImages);

    if (allImages.length > maxImages) {
      logger.info(`Product has ${allImages.length} images, limiting to ${maxImages} for ${marketplace}`, {
        totalImages: allImages.length,
        marketplace,
        maxImages,
        keptImages: preparedImages.length,
      });
    } else {
      logger.info(`Preparing ${preparedImages.length} images for ${marketplace} publication`, {
        totalImages: preparedImages.length,
        marketplace,
      });
    }

    return preparedImages;
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
    const finalPrice = typeof product?.finalPrice === 'number' && product.finalPrice !== null ? toNumber(product.finalPrice) : 0;
    if (finalPrice > 0 && finalPrice > costNum) return finalPrice;
    const suggestedPrice = typeof product?.suggestedPrice === 'number' ? toNumber(product.suggestedPrice) : 0;
    if (suggestedPrice > 0 && suggestedPrice > costNum) return suggestedPrice;
    if (costNum > 0) {
      const fallbackPrice = Math.round(costNum * 1.45 * 100) / 100;
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
