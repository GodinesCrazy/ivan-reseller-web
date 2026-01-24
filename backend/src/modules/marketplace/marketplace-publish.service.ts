import { prisma } from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../middleware/error.middleware';
import { MercadoLibrePublisher } from './mercadolibre.publisher';
import { EbayPublisher } from './ebay.publisher';
import { AmazonPublisher } from './amazon.publisher';
import {
  DEFAULT_PUBLISH_MODE,
  PublishMode,
  type PublishResult,
  type PublishableProduct,
  type ValidationResult,
} from './marketplace.types';

export type MarketplaceName = 'mercadolibre' | 'ebay' | 'amazon';

export interface PublishRequest {
  userId: number;
  marketplace: MarketplaceName;
  limit?: number;
  mode?: PublishMode;
}

export interface PublishExecutionResult {
  marketplace: MarketplaceName;
  mode: PublishMode;
  attempted: number;
  results: Array<{
    productId: number;
    status: PublishResult['status'];
    listingId?: string;
    listingUrl?: string;
    message?: string;
  }>;
  skippedReason?: string;
}

export class MarketplacePublishService {
  private publishers: Record<MarketplaceName, MercadoLibrePublisher | EbayPublisher | AmazonPublisher>;

  constructor() {
    this.publishers = {
      mercadolibre: new MercadoLibrePublisher(),
      ebay: new EbayPublisher(),
      amazon: new AmazonPublisher(),
    };
  }

  async publish(request: PublishRequest): Promise<PublishExecutionResult> {
    const mode = request.mode || DEFAULT_PUBLISH_MODE;
    const limit = Math.max(1, Math.min(request.limit || 1, 25));
    const marketplace = request.marketplace;
    const publisher = this.publishers[marketplace];

    logger.info('[MARKETPLACE] Validating credentials', {
      marketplace,
      mode,
    });

    if (mode === PublishMode.FULL_AUTO) {
      throw new AppError('FULL_AUTO no esta habilitado en FASE 4.', 400);
    }

    const validation = await publisher.validateCredentials();
    if (!validation.ok) {
      if (marketplace === 'mercadolibre') {
        throw new AppError(this.formatMissingError('MercadoLibre', validation), 400);
      }
      logger.warn('[MARKETPLACE] Skipped (not configured)', {
        marketplace,
        reason: validation.message,
        missing: validation.missing,
      });
      return {
        marketplace,
        mode,
        attempted: 0,
        results: [],
        skippedReason: validation.message || 'Marketplace no configurado.',
      };
    }

    if (mode !== PublishMode.SIMULATED) {
      const connectionOk = await publisher.testConnection();
      if (!connectionOk) {
        throw new AppError(`No se pudo validar conexion con ${marketplace}.`, 400);
      }
    }

    const shouldPublish = this.ensurePublishingEnabled(marketplace, mode);
    if (!shouldPublish) {
      throw new AppError(`Publicacion bloqueada por flag de seguridad para ${marketplace}.`, 400);
    }

    const effectiveLimit = mode === PublishMode.STAGING_REAL ? 1 : limit;
    const products = await this.getPublishableProducts(request.userId, effectiveLimit);

    const results: PublishExecutionResult['results'] = [];

    if (products.length === 0) {
      return {
        marketplace,
        mode,
        attempted: 0,
        results,
        skippedReason: 'No hay productos publishable para publicar.',
      };
    }

    for (const product of products) {
      logger.info('[MARKETPLACE] Publishing product', {
        marketplace,
        productId: product.id,
        mode,
      });

      let publishResult: PublishResult;
      if (mode === PublishMode.SIMULATED) {
        publishResult = {
          status: 'skipped',
          message: 'SIMULATED mode: no se publico realmente.',
        };
      } else {
        try {
          publishResult = await publisher.publishProduct(product, mode);
        } catch (error) {
          publishResult = {
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      logger.info('[MARKETPLACE] Publish result', {
        marketplace,
        productId: product.id,
        status: publishResult.status,
        listingId: publishResult.listingId,
      });

      if (publishResult.status === 'published') {
        logger.info('[MARKETPLACE] Publish success', {
          marketplace,
          productId: product.id,
          listingId: publishResult.listingId,
        });
      } else if (publishResult.status === 'skipped') {
        logger.warn('[MARKETPLACE] Skipped', {
          marketplace,
          productId: product.id,
          reason: publishResult.message,
        });
      } else {
        logger.error('[MARKETPLACE] Publish failed', {
          marketplace,
          productId: product.id,
          error: publishResult.message,
        });
      }

      await this.persistPublication(product, marketplace, mode, publishResult);
      await this.syncListing(product, marketplace, publishResult);

      results.push({
        productId: product.id,
        status: publishResult.status,
        listingId: publishResult.listingId,
        listingUrl: publishResult.listingUrl,
        message: publishResult.message,
      });
    }

    return {
      marketplace,
      mode,
      attempted: products.length,
      results,
    };
  }

  private async getPublishableProducts(userId: number, limit: number): Promise<PublishableProduct[]> {
    return prisma.product.findMany({
      where: {
        userId,
        status: 'publishable',
        isPublished: false,
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
  }

  private ensurePublishingEnabled(marketplace: MarketplaceName, mode: PublishMode): boolean {
    if (mode === PublishMode.SIMULATED) {
      return true;
    }

    if (marketplace === 'mercadolibre') {
      return process.env.ENABLE_ML_PUBLISH === 'true';
    }

    if (marketplace === 'ebay') {
      return process.env.ENABLE_EBAY_PUBLISH === 'true';
    }

    return true;
  }

  private formatMissingError(label: string, validation: ValidationResult): string {
    const missing = validation.missing?.length ? ` Faltan: ${validation.missing.join(', ')}.` : '';
    return `${label} no esta configurado.${missing} Revisa la documentacion de FASE 4 para obtener credenciales.`;
  }

  private async persistPublication(
    product: PublishableProduct,
    marketplace: MarketplaceName,
    mode: PublishMode,
    result: PublishResult,
  ): Promise<void> {
    try {
      await prisma.marketplacePublication.create({
        data: {
          productId: product.id,
          userId: product.userId,
          marketplace,
          listingId: result.listingId,
          publishStatus: result.status,
          publishedAt: result.status === 'published' ? new Date() : null,
          publishMode: mode,
          rawResponse: result.rawResponse ? JSON.stringify(result.rawResponse) : null,
        },
      });
    } catch (error) {
      logger.warn('[MARKETPLACE] Failed to persist publication', {
        productId: product.id,
        marketplace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async syncListing(
    product: PublishableProduct,
    marketplace: MarketplaceName,
    result: PublishResult,
  ): Promise<void> {
    if (result.status !== 'published' || !result.listingId) {
      return;
    }

    try {
      await prisma.marketplaceListing.create({
        data: {
          productId: product.id,
          userId: product.userId,
          marketplace,
          listingId: result.listingId,
          listingUrl: result.listingUrl,
          publishedAt: new Date(),
        },
      });

      await prisma.product.update({
        where: { id: product.id },
        data: {
          status: 'PUBLISHED',
          isPublished: true,
          publishedAt: new Date(),
        },
      });
    } catch (error) {
      logger.warn('[MARKETPLACE] Failed to sync listing', {
        productId: product.id,
        marketplace,
        listingId: result.listingId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
