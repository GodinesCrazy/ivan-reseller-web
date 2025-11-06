import { EbayService, EbayCredentials, EbayProduct } from './ebay.service';
import { MercadoLibreService, MercadoLibreCredentials, MLProduct } from './mercadolibre.service';
import { AmazonService, AmazonCredentials, AmazonProduct } from './amazon.service';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../config/database';
import crypto from 'crypto';

export interface MarketplaceCredentials {
  id?: number;
  userId: number;
  marketplace: 'ebay' | 'mercadolibre' | 'amazon';
  credentials: any;
  isActive: boolean;
}

export interface PublishProductRequest {
  productId: number;
  marketplace: 'ebay' | 'mercadolibre' | 'amazon';
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
   */
  async getCredentials(userId: number, marketplace: string): Promise<MarketplaceCredentials | null> {
    try {
      const rec = await prisma.apiCredential.findFirst({
        where: { userId, apiName: marketplace },
      });
      if (!rec) return null;
      // Decrypt and parse credentials
      let parsed: any = {};
      try {
        const decrypted = this.decrypt(rec.credentials);
        parsed = JSON.parse(decrypted);
      } catch {
        try { parsed = JSON.parse(rec.credentials); } catch { parsed = {}; }
      }
      return {
        id: rec.id,
        userId: rec.userId,
        marketplace: marketplace as any,
        credentials: parsed,
        isActive: rec.isActive,
      };
    } catch (error) {
      throw new AppError(`Failed to get marketplace credentials: ${error.message}`, 500);
    }
  }

  /**
   * Save or update marketplace credentials
   */
  async saveCredentials(userId: number, marketplace: string, credentials: any, environment?: 'sandbox' | 'production'): Promise<void> {
    try {
      // ✅ Obtener environment del usuario si no se proporciona
      const workflowConfigService = await import('./workflow-config.service');
      const userEnvironment = environment || await workflowConfigService.workflowConfigService.getUserEnvironment(userId);
      
      const data = this.encrypt(JSON.stringify(credentials));
      await prisma.apiCredential.upsert({
        where: { 
          userId_apiName_environment: {
            userId: userId,
            apiName: marketplace,
            environment: userEnvironment
          }
        },
        update: { credentials: data, isActive: true },
        create: { 
          userId, 
          apiName: marketplace, 
          environment: userEnvironment,
          credentials: data, 
          isActive: true 
        },
      });
    } catch (error) {
      throw new AppError(`Failed to save marketplace credentials: ${error.message}`, 500);
    }
  }

  /**
   * Test marketplace connection
   */
  async testConnection(userId: number, marketplace: string): Promise<{ success: boolean; message: string }> {
    try {
      const credentials = await this.getCredentials(userId, marketplace);
      if (!credentials) {
        return { success: false, message: 'No credentials found' };
      }

      switch (marketplace) {
        case 'ebay':
          const ebayService = new EbayService(credentials.credentials as EbayCredentials);
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
   */
  async publishProduct(userId: number, request: PublishProductRequest): Promise<PublishResult> {
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

      // Get marketplace credentials
      const credentials = await this.getCredentials(userId, request.marketplace);
      if (!credentials || !credentials.isActive) {
        throw new AppError(`${request.marketplace} credentials not found or inactive`, 400);
      }

      // Publish to specific marketplace
      switch (request.marketplace) {
        case 'ebay':
          return await this.publishToEbay(product, credentials.credentials, request.customData);

        case 'mercadolibre':
          return await this.publishToMercadoLibre(product, credentials.credentials, request.customData);

        case 'amazon':
          return await this.publishToAmazon(product, credentials.credentials, request.customData);

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
   */
  async publishToMultipleMarketplaces(
    userId: number, 
    productId: number, 
    marketplaces: string[]
  ): Promise<PublishResult[]> {
    const results: PublishResult[] = [];

    for (const marketplace of marketplaces) {
      const result = await this.publishProduct(userId, {
        productId,
        marketplace: marketplace as any,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Publish to eBay
   */
  private async publishToEbay(
    product: any, 
    credentials: EbayCredentials, 
    customData?: any
  ): Promise<PublishResult> {
    try {
      const ebayService = new EbayService(credentials);

      // Suggest category if not provided
      let categoryId = customData?.categoryId;
      if (!categoryId) {
        categoryId = await ebayService.suggestCategory(product.title);
      }

      const ebayProduct: EbayProduct = {
        title: customData?.title || product.title,
        description: customData?.description || product.description || '',
        categoryId,
        startPrice: customData?.price || product.price,
        quantity: customData?.quantity || product.stock || 1,
        condition: 'NEW',
        images: Array.isArray(product.imageUrl) ? product.imageUrl : [product.imageUrl].filter(Boolean),
      };

      const result = await ebayService.createListing(`IVAN-${product.id}`, ebayProduct);

      // Update product with marketplace info
      await this.updateProductMarketplaceInfo(product.id, 'ebay', {
        listingId: result.itemId,
        listingUrl: result.listingUrl,
        publishedAt: new Date(),
      });

      if (result.success) {
        // Mark product as published
        await prisma.product.update({ where: { id: product.id }, data: { isPublished: true, publishedAt: new Date(), status: 'PUBLISHED' } });
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
    customData?: any
  ): Promise<PublishResult> {
    try {
      const mlService = new MercadoLibreService(credentials);

      // Predict category if not provided
      let categoryId = customData?.categoryId;
      if (!categoryId) {
        categoryId = await mlService.predictCategory(product.title);
      }

      const mlProduct: MLProduct = {
        title: customData?.title || product.title,
        description: customData?.description || product.description || '',
        categoryId,
        price: customData?.price || product.price,
        quantity: customData?.quantity || product.stock || 1,
        condition: 'new',
        images: Array.isArray(product.imageUrl) ? product.imageUrl : [product.imageUrl].filter(Boolean),
        shipping: {
          mode: 'me2',
          freeShipping: false,
        },
      };

      const result = await mlService.createListing(mlProduct);

      // Update product with marketplace info
      await this.updateProductMarketplaceInfo(product.id, 'mercadolibre', {
        listingId: result.itemId,
        listingUrl: result.permalink,
        publishedAt: new Date(),
      });

      if (result.success) {
        await prisma.product.update({ where: { id: product.id }, data: { isPublished: true, publishedAt: new Date(), status: 'PUBLISHED' } });
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
    customData?: any
  ): Promise<PublishResult> {
    try {
      const amazonService = new AmazonService();
      await amazonService.setCredentials(credentials);

      // Get category suggestions if not provided
      let category = customData?.categoryId;
      if (!category) {
        const categories = await amazonService.getProductCategories(product.title);
        category = categories[0]?.categoryId || 'default';
      }

      const amazonProduct: AmazonProduct = {
        sku: `IVAN-${product.id}`,
        title: customData?.title || product.title,
        description: customData?.description || product.description || '',
        price: customData?.price || product.price,
        currency: 'USD', // Should be configurable based on marketplace
        quantity: customData?.quantity || product.stock || 1,
        images: product.images ? JSON.parse(product.images) : [],
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

      if (result.success) {
        // Update product with Amazon information
        await this.updateProductMarketplaceInfo(product.id, 'amazon', {
          listingId: result.asin || '',
          listingUrl: result.asin ? `https://amazon.com/dp/${result.asin}` : '',
          publishedAt: new Date(),
        });

        await prisma.product.update({ where: { id: product.id }, data: { isPublished: true, publishedAt: new Date(), status: 'PUBLISHED' } });
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
   */
  async syncInventory(userId: number, productId: number, newQuantity: number): Promise<void> {
    try {
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
          const credentials = await this.getCredentials(userId, marketplace);
          if (!credentials) continue;

          switch (marketplace) {
            case 'ebay':
              const ebayService = new EbayService(credentials.credentials);
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
