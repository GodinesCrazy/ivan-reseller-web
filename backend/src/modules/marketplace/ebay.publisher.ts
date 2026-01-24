import { EbayService } from '../../services/ebay.service';
import logger from '../../config/logger';
import type { MarketplacePublisher } from './marketplace.publisher';
import type { PublishMode, PublishResult, PublishableProduct, ValidationResult } from './marketplace.types';
import { toNumber } from '../../utils/decimal.utils';

const REQUIRED_ENV = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN', 'EBAY_ENV'];

export class EbayPublisher implements MarketplacePublisher {
  async validateCredentials(): Promise<ValidationResult> {
    const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        missing,
        message: 'Faltan credenciales de eBay. Configura EBAY_CLIENT_ID, EBAY_CLIENT_SECRET y EBAY_REFRESH_TOKEN.',
      };
    }

    const env = (process.env.EBAY_ENV || '').toLowerCase();
    if (!['sandbox', 'production'].includes(env)) {
      return {
        ok: false,
        status: 'INVALID',
        message: 'EBAY_ENV debe ser "sandbox" o "production".',
      };
    }

    return { ok: true, status: 'OK' };
  }

  async testConnection(): Promise<boolean> {
    try {
      const service = this.buildService();
      const result = await service.testConnection();
      return result.success;
    } catch (error) {
      logger.warn('[MARKETPLACE] eBay testConnection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async publishProduct(product: PublishableProduct, mode: PublishMode): Promise<PublishResult> {
    const service = this.buildService();
    const title = product.title;
    const description =
      product.description || `Producto: ${product.title}. Publicado con control de calidad.`;

    const price = this.resolvePrice(product);
    if (price <= 0) {
      return { status: 'failed', message: 'Precio inválido para publicación.' };
    }

    let categoryId = product.category || undefined;
    if (!categoryId) {
      try {
        categoryId = await service.suggestCategory(title);
      } catch (error) {
        logger.warn('[MARKETPLACE] eBay suggestCategory failed', {
          productId: product.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!categoryId) {
      return { status: 'failed', message: 'No se pudo resolver categoría de eBay.' };
    }

    logger.info('[MARKETPLACE] Publishing product to eBay', {
      productId: product.id,
      mode,
      categoryId,
    });

    const result = await service.createListing(`IVAN-${product.id}`, {
      title,
      description,
      categoryId,
      startPrice: price,
      quantity: 1,
      condition: 'NEW',
      images: this.parseImages(product.images),
    });

    if (result.success && result.itemId) {
      return {
        status: 'published',
        listingId: result.itemId,
        listingUrl: result.listingUrl,
        rawResponse: result,
      };
    }

    return {
      status: 'failed',
      message: result.error || 'Error publicando en eBay',
      rawResponse: result,
    };
  }

  private buildService(): EbayService {
    const appId = process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '';
    const certId = process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '';
    const refreshToken = process.env.EBAY_REFRESH_TOKEN || '';
    const sandbox = (process.env.EBAY_ENV || 'production').toLowerCase() === 'sandbox';
    const devId = process.env.EBAY_DEV_ID || '';

    return new EbayService({
      appId,
      devId,
      certId,
      refreshToken,
      sandbox,
    } as any);
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
