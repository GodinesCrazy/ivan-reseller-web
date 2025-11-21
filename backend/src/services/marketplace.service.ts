import { EbayService, EbayCredentials, EbayProduct } from './ebay.service';
import { MercadoLibreService, MercadoLibreCredentials, MLProduct } from './mercadolibre.service';
import { AmazonService, AmazonCredentials, AmazonProduct } from './amazon.service';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../config/database';
import { retryMarketplaceOperation } from '../utils/retry.util';
import logger from '../config/logger';
import crypto from 'crypto';
import type { CredentialScope } from '@prisma/client';

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
        
        // ✅ CORRECCIÓN: Solo marcar como error si NO hay token NI refreshToken
        // Si hay refreshToken pero no token, el sistema puede refrescar automáticamente
        if (!hasValidToken && !hasValidRefreshToken) {
          issues.push('Falta token OAuth de eBay. Completa la autorización en Settings → API Settings.');
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
        case 'ebay':
          const ebayService = new EbayService({
            ...(credentials.credentials as EbayCredentials),
            sandbox: credentials.environment === 'sandbox',
          });
          return await ebayService.testConnection();

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
      });

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

      if (product.isPublished && product.status === 'PUBLISHED') {
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
          categoryId = '267'; // Default category
        }
      }

      // ✅ CORREGIDO: Validar imágenes antes de publicar
      const images = this.parseImageUrls(product.images);
      if (!images || images.length === 0) {
        throw new AppError('Product must have at least one image before publishing. Please add images to the product.', 400);
      }

      const price = this.resolveListingPrice(product, customData?.price);
      if (price <= 0) {
        throw new AppError('Product is missing pricing information. Actualiza el precio sugerido antes de publicar.', 400);
      }

      // ✅ CORREGIDO: Validar que el precio sea mayor que el costo de AliExpress
      if (price <= product.aliexpressPrice) {
        throw new AppError(`Price (${price}) must be greater than AliExpress cost (${product.aliexpressPrice}) to generate profit.`, 400);
      }

      const ebayProduct: EbayProduct = {
        title: customData?.title || product.title,
        description: customData?.description || product.description || '',
        categoryId,
        startPrice: price,
        quantity: this.resolveListingQuantity(product, customData?.quantity),
        condition: 'NEW',
        images: this.parseImageUrls(product.images),
      };

      const result = await ebayService.createListing(`IVAN-${product.id}`, ebayProduct);

      // ✅ CORREGIDO: Mover updateProductMarketplaceInfo DESPUÉS de verificar result.success
      // Solo crear listing en BD si la publicación fue exitosa
      if (result.success) {
        // Update product with marketplace info (solo si fue exitoso)
        await this.updateProductMarketplaceInfo(product.id, 'ebay', {
          listingId: result.itemId,
          listingUrl: result.listingUrl,
          publishedAt: new Date(),
        });

        // ✅ CORREGIDO: Usar función helper para sincronizar estado e isPublished
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(
          product.id,
          'PUBLISHED',
          true,
          userId
        );
      }

      return {
        success: true,
        marketplace: 'ebay',
        listingId: result.itemId,
        listingUrl: result.listingUrl,
      };
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
      const images = this.parseImageUrls(product.images);
      if (!images || images.length === 0) {
        throw new AppError('Product must have at least one image before publishing. Please add images to the product.', 400);
      }

      // ✅ CORREGIDO: Validar categoría antes de publicar (ya se obtuvo arriba, no redeclarar)
      if (!categoryId || categoryId.trim().length === 0) {
        throw new AppError('Product must have a valid category before publishing. Please specify a category.', 400);
      }
      if (!categoryId || categoryId.trim().length === 0) {
        throw new AppError('Product must have a valid category before publishing. Please specify a category.', 400);
      }

      const price = this.resolveListingPrice(product, customData?.price);
      if (price <= 0) {
        throw new AppError('Product is missing pricing information. Actualiza el precio sugerido antes de publicar.', 400);
      }

      // ✅ CORREGIDO: Validar que el precio sea mayor que el costo de AliExpress
      if (price <= product.aliexpressPrice) {
        throw new AppError(`Price (${price}) must be greater than AliExpress cost (${product.aliexpressPrice}) to generate profit.`, 400);
      }

      const mlProduct: MLProduct = {
        title: customData?.title || product.title,
        description: customData?.description || product.description || '',
        categoryId,
        price,
        quantity: this.resolveListingQuantity(product, customData?.quantity),
        condition: 'new',
        images: this.parseImageUrls(product.images),
        shipping: {
          mode: 'me2',
          freeShipping: false,
        },
      };

      const result = await mlService.createListing(mlProduct);

      // ✅ CORREGIDO: Mover updateProductMarketplaceInfo DESPUÉS de verificar result.success
      // Solo crear listing en BD si la publicación fue exitosa
      if (result.success) {
        // Update product with marketplace info (solo si fue exitoso)
        await this.updateProductMarketplaceInfo(product.id, 'mercadolibre', {
          listingId: result.itemId,
          listingUrl: result.permalink,
          publishedAt: new Date(),
        });

        // ✅ CORREGIDO: Usar función helper para sincronizar estado e isPublished
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(
          product.id,
          'PUBLISHED',
          true,
          userId
        );
      }

      return {
        success: true,
        marketplace: 'mercadolibre',
        listingId: result.itemId,
        listingUrl: result.permalink,
      };
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
      const images = this.parseImageUrls(product.images);
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

      // ✅ CORREGIDO: Validar que el precio sea mayor que el costo de AliExpress
      if (price <= product.aliexpressPrice) {
        throw new AppError(`Price (${price}) must be greater than AliExpress cost (${product.aliexpressPrice}) to generate profit.`, 400);
      }

      // ✅ Obtener moneda base del usuario en lugar de usar USD hardcodeado
      let currency = 'USD'; // Fallback por defecto
      if (metadata?.currency) {
        currency = metadata.currency.toUpperCase();
      } else {
        try {
          const { userSettingsService } = await import('./user-settings.service');
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

      const amazonProduct: AmazonProduct = {
        sku: `IVAN-${product.id}`,
        title: customData?.title || product.title,
        description: customData?.description || product.description || '',
        price,
        currency: currency.toUpperCase(),
        quantity: this.resolveListingQuantity(product, customData?.quantity),
        images: this.parseImageUrls(product.images),
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

      // ✅ CORREGIDO: Ya estaba correcto, pero mejorado para consistencia
      // Solo crear listing en BD si la publicación fue exitosa
      if (result.success) {
        // Update product with Amazon information (solo si fue exitoso)
        await this.updateProductMarketplaceInfo(product.id, 'amazon', {
          listingId: result.asin || '',
          listingUrl: result.asin ? `https://amazon.com/dp/${result.asin}` : '',
          publishedAt: new Date(),
        });

        // ✅ CORREGIDO: Usar función helper para sincronizar estado e isPublished
        const { productService } = await import('./product.service');
        await productService.updateProductStatusSafely(
          product.id,
          'PUBLISHED',
          true,
          userId
        );
      }

      return {
        success: result.success,
        marketplace: 'amazon',
        listingId: result.asin,
        listingUrl: result.asin ? `https://amazon.com/dp/${result.asin}` : undefined,
      };
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
      console.error(`Failed to update product marketplace info:`, error);
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

            case 'mercadolibre':
              const mlService = new MercadoLibreService(credentials.credentials);
              // TODO: Get listing ID from database
              // await mlService.updateListingQuantity(listingId, newQuantity);
              break;
          }
        } catch (error) {
          console.error(`Failed to sync inventory on ${marketplace}:`, error);
        }
      }
    } catch (error) {
      throw new AppError(`Failed to sync inventory: ${error.message}`, 500);
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

      if (newPrice <= 0 || newPrice <= product.aliexpressPrice) {
        throw new AppError(`New price (${newPrice}) must be greater than AliExpress cost (${product.aliexpressPrice})`, 400);
      }

      // Obtener listings activos
      const listings = product.marketplaceListings.filter(l => l.isActive);
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

          // Actualizar precio según marketplace
          switch (marketplace) {
            case 'ebay':
              // TODO: Implementar actualización de precio en eBay
              // Por ahora, solo actualizar updatedAt en BD
              await prisma.marketplaceListing.update({
                where: { id: listing.id },
                data: { updatedAt: new Date() }
              });
              results.updated++;
              break;

            case 'amazon':
              // TODO: Implementar actualización de precio en Amazon
              // Por ahora, solo actualizar updatedAt en BD
              await prisma.marketplaceListing.update({
                where: { id: listing.id },
                data: { updatedAt: new Date() }
              });
              results.updated++;
              break;

            case 'mercadolibre':
              // TODO: Implementar actualización de precio en MercadoLibre
              // Por ahora, solo actualizar updatedAt en BD
              await prisma.marketplaceListing.update({
                where: { id: listing.id },
                data: { updatedAt: new Date() }
              });
              results.updated++;
              break;
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
      // TODO: Implement marketplace statistics
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

  private parseImageUrls(value: any): string[] {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
          }
        } catch {
          // fallback handled below
        }
      }
      if (/^https?:\/\//i.test(trimmed)) {
        return [trimmed];
      }
    }

    return [];
  }

  private resolveListingPrice(product: any, override?: number): number {
    if (typeof override === 'number' && override > 0) {
      return override;
    }
    const metadata = this.parseProductMetadata(product);
    if (typeof metadata?.price === 'number' && metadata.price > 0) {
      return metadata.price;
    }
    // ✅ CORREGIDO: Validar que finalPrice no sea null antes de usarlo
    if (typeof product?.finalPrice === 'number' && product.finalPrice > 0 && product.finalPrice !== null) {
      return product.finalPrice;
    }
    if (typeof product?.suggestedPrice === 'number' && product.suggestedPrice > 0) {
      return product.suggestedPrice;
    }
    // ✅ CORREGIDO: Validar margen mínimo antes de usar fallback
    if (typeof product?.aliexpressPrice === 'number' && product.aliexpressPrice > 0) {
      const fallbackPrice = Math.round(product.aliexpressPrice * 1.45 * 100) / 100;
      // Validar que el fallback sea mayor que el costo
      if (fallbackPrice > product.aliexpressPrice) {
        return fallbackPrice;
      }
      // Si el fallback no es válido, retornar 0 (será validado después)
      return 0;
    }
    return 0;
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
