import axios from 'axios';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import logger from '../../config/logger';
import type { MarketplacePublisher } from './marketplace.publisher';
import type { PublishMode, PublishResult, PublishableProduct, ValidationResult } from './marketplace.types';
import { toNumber } from '../../utils/decimal.utils';
import { resolveMercadoLibrePublishImageInputs } from '../../services/mercadolibre-image-remediation.service';
import { hasCompleteMlPhysicalPackage } from '../../utils/ml-physical-package-guard';

export class MercadoLibrePublisher implements MarketplacePublisher {
  private userId?: number;

  setUserId(userId: number) {
    this.userId = userId;
  }

  async validateCredentials(): Promise<ValidationResult> {
    try {
      const creds = await this.resolveCredentials();
      if (!creds.clientId || !creds.clientSecret) {
        return {
          ok: false,
          status: 'NOT_CONFIGURED',
          missing: ['clientId', 'clientSecret'],
          message: 'Faltan credenciales de MercadoLibre. Configura Client ID y Client Secret en API Settings.',
        };
      }
      if (!creds.accessToken && !creds.refreshToken) {
        return {
          ok: false,
          status: 'NOT_CONFIGURED',
          missing: ['accessToken'],
          message: 'Se requiere completar OAuth de MercadoLibre en API Settings.',
        };
      }
      return { ok: true, status: 'OK' };
    } catch (error) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        missing: [],
        message: `Error al resolver credenciales: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
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
    const allowLegacyPublisherPath =
      process.env.ALLOW_LEGACY_ML_BATCH_PUBLISH === 'true' &&
      process.env.ALLOW_UNSAFE_LEGACY_ML_PUBLISHER === 'true';
    if (!allowLegacyPublisherPath) {
      return {
        status: 'failed',
        message:
          'Legacy MercadoLibre publisher path is disabled for safety. Use canonical publish flow (/api/publisher/approve or /api/marketplace/publish).',
      };
    }

    const credentials = await this.resolveCredentials();
    const mlService = new MercadoLibreService(credentials);

    const title = product.title;
    const description =
      product.description || `Producto: ${product.title}. Publicado con control de calidad.`;
    const price = this.resolvePrice(product);
    if (price <= 0) {
      return {
        status: 'failed',
        message: 'Precio inv�lido para publicaci�n.',
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
        message: 'No se pudo resolver la categor�a de MercadoLibre.',
      };
    }

    logger.info('[MARKETPLACE] Publishing product to MercadoLibre', {
      productId: product.id,
      mode,
      categoryId,
    });

    const imageResolution = await resolveMercadoLibrePublishImageInputs({
      userId: this.userId,
      productId: product.id,
      title: product.title,
      images: product.images,
      productData: product.productData,
    });
    if (!imageResolution.publishSafe) {
      return {
        status: 'failed',
        message: `MercadoLibre image remediation blocked publish: ${imageResolution.blockingReason || 'compliant asset pack missing'}`,
        rawResponse: imageResolution.remediation,
      };
    }

    if (!hasCompleteMlPhysicalPackage(product)) {
      return {
        status: 'failed',
        message:
          'MercadoLibre publish blocked: product must have packageWeightGrams, packageLengthCm, packageWidthCm, packageHeightCm, and maxUnitsPerOrder (>=1).',
      };
    }
    const L = Number(product.packageLengthCm);
    const W = Number(product.packageWidthCm);
    const H = Number(product.packageHeightCm);
    const G = Number(product.packageWeightGrams);
    const dimStr = `${L}x${W}x${H},${G}`;
    const maxU = Math.max(1, Number(product.maxUnitsPerOrder ?? 1));

    const result = await mlService.createListing({
      title,
      description,
      categoryId,
      price,
      quantity: maxU,
      condition: 'new',
      images: imageResolution.images,
      shipping: {
        mode: 'me2',
        freeShipping: false,
        dimensions: dimStr,
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
    const { prisma } = await import('../../config/database');

    const dbCred = await prisma.apiCredential.findFirst({
      where: {
        apiName: 'mercadolibre',
        isActive: true,
        ...(this.userId ? { userId: this.userId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    const creds = (dbCred?.credentials as unknown as Record<string, any>) || {};
    const clientId = creds.clientId || process.env.MERCADOLIBRE_CLIENT_ID || '';
    const clientSecret = creds.clientSecret || process.env.MERCADOLIBRE_CLIENT_SECRET || '';
    const refreshToken = creds.refreshToken || undefined;
    const siteId = creds.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC';
    let accessToken = creds.accessToken || undefined;

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
        'MercadoLibre no tiene access token o userId v�lido. Completa OAuth en API Settings.',
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
}
