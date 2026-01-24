import axios from 'axios';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import logger from '../../config/logger';
import type { MarketplacePublisher } from './marketplace.publisher';
import type { PublishMode, PublishResult, PublishableProduct, ValidationResult } from './marketplace.types';
import { toNumber } from '../../utils/decimal.utils';

const REQUIRED_ENV = ['ML_CLIENT_ID', 'ML_CLIENT_SECRET'];

export class MercadoLibrePublisher implements MarketplacePublisher {
  async validateCredentials(): Promise<ValidationResult> {
    const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        missing,
        message:
          'Faltan credenciales de MercadoLibre. Configura ML_CLIENT_ID y ML_CLIENT_SECRET antes de publicar.',
      };
    }

    if (!process.env.ML_ACCESS_TOKEN && !process.env.ML_REFRESH_TOKEN) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        missing: ['ML_ACCESS_TOKEN', 'ML_REFRESH_TOKEN'],
        message:
          'Se requiere ML_ACCESS_TOKEN o ML_REFRESH_TOKEN para publicar en MercadoLibre.',
      };
    }

    return { ok: true, status: 'OK' };
  }

  async testConnection(): Promise<boolean> {
    try {
      const credentials = await this.resolveCredentials();
      const mlService = new MercadoLibreService(credentials);
      const result = await mlService.testConnection();
      return result.success;
    } catch (error) {
      logger.warn('[MARKETPLACE] MercadoLibre testConnection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async publishProduct(product: PublishableProduct, mode: PublishMode): Promise<PublishResult> {
    const credentials = await this.resolveCredentials();
    const mlService = new MercadoLibreService(credentials);

    const title = product.title;
    const description =
      product.description || `Producto: ${product.title}. Publicado con control de calidad.`;
    const price = this.resolvePrice(product);
    if (price <= 0) {
      return {
        status: 'failed',
        message: 'Precio inválido para publicación.',
      };
    }

    let categoryId = product.category || undefined;
    if (!categoryId) {
      try {
        categoryId = await mlService.predictCategory(title);
      } catch (error) {
        logger.warn('[MARKETPLACE] MercadoLibre predictCategory failed', {
          productId: product.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!categoryId) {
      return {
        status: 'failed',
        message: 'No se pudo resolver la categoría de MercadoLibre.',
      };
    }

    logger.info('[MARKETPLACE] Publishing product to MercadoLibre', {
      productId: product.id,
      mode,
      categoryId,
    });

    const result = await mlService.createListing({
      title,
      description,
      categoryId,
      price,
      quantity: 1,
      condition: 'new',
      images: this.parseImages(product.images),
      shipping: {
        mode: 'me2',
        freeShipping: false,
      },
    });

    if (result.success && result.itemId) {
      return {
        status: 'published',
        listingId: result.itemId,
        listingUrl: result.permalink,
        rawResponse: result,
      };
    }

    return {
      status: 'failed',
      message: result.error || 'Error publicando en MercadoLibre',
      rawResponse: result,
    };
  }

  private async resolveCredentials() {
    const clientId = process.env.ML_CLIENT_ID || '';
    const clientSecret = process.env.ML_CLIENT_SECRET || '';
    const refreshToken = process.env.ML_REFRESH_TOKEN || undefined;
    const siteId = process.env.ML_SITE_ID || 'MLM';
    let accessToken = process.env.ML_ACCESS_TOKEN || undefined;

    if (!accessToken && refreshToken) {
      const mlService = new MercadoLibreService({
        clientId,
        clientSecret,
        refreshToken,
        siteId,
      });
      const refreshed = await mlService.refreshAccessToken();
      accessToken = refreshed.accessToken;
    }

    const userId = await this.resolveUserId(accessToken);

    if (!accessToken || !userId) {
      throw new Error(
        'MercadoLibre no tiene access token o userId válido. Verifica ML_ACCESS_TOKEN/ML_REFRESH_TOKEN.',
      );
    }

    return {
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      userId,
      siteId,
    };
  }

  private async resolveUserId(accessToken?: string): Promise<string | undefined> {
    if (!accessToken) {
      return undefined;
    }

    if (process.env.ML_USER_ID) {
      return process.env.ML_USER_ID;
    }

    try {
      const response = await axios.get('https://api.mercadolibre.com/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 15000,
      });
      return String(response.data?.id || '');
    } catch (error) {
      logger.warn('[MARKETPLACE] Failed to resolve MercadoLibre userId', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
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
