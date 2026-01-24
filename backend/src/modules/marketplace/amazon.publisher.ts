import { AmazonService } from '../../services/amazon.service';
import logger from '../../config/logger';
import type { MarketplacePublisher } from './marketplace.publisher';
import type { PublishMode, PublishResult, PublishableProduct, ValidationResult } from './marketplace.types';
import { toNumber } from '../../utils/decimal.utils';

const REQUIRED_ENV = [
  'AMAZON_CLIENT_ID',
  'AMAZON_CLIENT_SECRET',
  'AMAZON_REFRESH_TOKEN',
  'AMAZON_SELLER_ID',
  'AMAZON_REGION',
];

const REQUIRED_EXTRA_ENV = ['AMAZON_MARKETPLACE_ID', 'AMAZON_AWS_ACCESS_KEY_ID', 'AMAZON_AWS_SECRET_ACCESS_KEY'];

export class AmazonPublisher implements MarketplacePublisher {
  async validateCredentials(): Promise<ValidationResult> {
    const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        missing,
        message:
          'Amazon SP-API no está configurada. Completa AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN, AMAZON_SELLER_ID y AMAZON_REGION.',
      };
    }

    const extraMissing = REQUIRED_EXTRA_ENV.filter((key) => !process.env[key]);
    if (extraMissing.length > 0) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        missing: extraMissing,
        message:
          'Amazon requiere credenciales AWS y marketplaceId para publicar (AMAZON_AWS_ACCESS_KEY_ID, AMAZON_AWS_SECRET_ACCESS_KEY, AMAZON_MARKETPLACE_ID).',
      };
    }

    return { ok: true, status: 'OK' };
  }

  async testConnection(): Promise<boolean> {
    try {
      const service = await this.buildService();
      return await service.testConnection();
    } catch (error) {
      logger.warn('[MARKETPLACE] Amazon testConnection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async publishProduct(product: PublishableProduct, mode: PublishMode): Promise<PublishResult> {
    const service = await this.buildService();
    const title = product.title;
    const description =
      product.description || `Producto: ${product.title}. Publicado con control de calidad.`;
    const price = this.resolvePrice(product);

    if (price <= 0) {
      return { status: 'failed', message: 'Precio inválido para publicación.' };
    }

    logger.info('[MARKETPLACE] Publishing product to Amazon', {
      productId: product.id,
      mode,
    });

    const result = await service.createListing({
      sku: `IVAN-${product.id}`,
      title,
      description,
      price,
      currency: (product.currency || 'USD').toUpperCase(),
      quantity: 1,
      images: this.parseImages(product.images),
      category: product.category || 'default',
      brand: 'Generic',
      manufacturer: 'Generic',
      attributes: {
        condition: 'New',
      },
    } as any);

    if (result.success && result.asin) {
      return {
        status: 'published',
        listingId: result.asin,
        listingUrl: `https://amazon.com/dp/${result.asin}`,
        rawResponse: result,
      };
    }

    return {
      status: 'failed',
      message: result.message || 'Error publicando en Amazon',
      rawResponse: result,
    };
  }

  private async buildService(): Promise<AmazonService> {
    const service = new AmazonService();
    await service.setCredentials({
      clientId: process.env.AMAZON_CLIENT_ID || '',
      clientSecret: process.env.AMAZON_CLIENT_SECRET || '',
      refreshToken: process.env.AMAZON_REFRESH_TOKEN || '',
      region: (process.env.AMAZON_REGION || 'us-east-1') as any,
      marketplace: process.env.AMAZON_MARKETPLACE_ID as any,
      awsAccessKeyId: process.env.AMAZON_AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AMAZON_AWS_SECRET_ACCESS_KEY,
    } as any);
    return service;
  }

  private resolvePrice(product: PublishableProduct): number {
    const finalPrice = product.finalPrice ? toNumber(product.finalPrice) : 0;
    if (finalPrice > 0) return finalPrice;
    const suggestedPrice = product.suggestedPrice ? toNumber(product.suggestedPrice) : 0;
    return suggestedPrice;
  }

  private parseImages(raw?: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((url) => typeof url === 'string' && url.startsWith('http'));
      }
    } catch {
      // ignore parse errors
    }
    return [];
  }
}
