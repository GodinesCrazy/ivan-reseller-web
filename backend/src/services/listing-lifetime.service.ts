import { trace } from '../utils/boot-trace';
trace('loading listing-lifetime.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { toNumber } from '../utils/decimal.utils';

/**
 * ✅ Optimizador de Tiempo de Publicación (Listing Lifetime Optimizer)
 * 
 * Calcula el tiempo óptimo de permanencia de cada listing en cada marketplace
 * basado en datos reales del sistema (ventas, ganancias, ROI, etc.)
 * 
 * Soporta dos modos:
 * - Automático: el sistema toma decisiones (mantener, ajustar, despublicar)
 * - Manual: el sistema solo sugiere el plazo y explica el motivo
 */
export type ListingLifetimeMode = 'KEEP' | 'IMPROVE' | 'PAUSE' | 'UNPUBLISH';

export interface ListingLifetimeDecision {
  mode: ListingLifetimeMode;
  recommendedDaysToReview: number; // en cuántos días volver a evaluar
  recommendedMaxLifetime: number;  // tiempo total sugerido de permanencia, en días
  reason: string;                  // explicación legible para el usuario
  confidence: number;             // 0–1
}

export interface ListingLifetimeMetrics {
  listingAgeDays: number;
  totalViews?: number; // Si están disponibles desde marketplace APIs
  totalClicks?: number; // Si están disponibles desde marketplace APIs
  totalSalesUnits: number;
  totalNetProfit: number;
  avgDailyProfit: number;
  roiPercent: number;
  stockTurnover?: number; // unidades vendidas por día vs. stock disponible (si aplica)
  capitalLocked: number; // capital invertido en stock/listing que aún no rota
}

export interface ListingLifetimeConfig {
  mode: 'automatic' | 'manual'; // Modo de operación
  minLearningDays: number; // Período mínimo de aprendizaje por categoría/marketplace
  maxLifetimeDaysDefault: number; // Tiempo máximo por defecto
  minRoiPercent: number; // ROI mínimo aceptable
  minDailyProfitUsd: number; // Ganancia diaria mínima aceptable
  minMarginPercent?: number; // Margen mínimo (opcional)
  // Configuración por marketplace (opcional)
  marketplaceConfig?: {
    ebay?: Partial<Omit<ListingLifetimeConfig, 'marketplaceConfig'>>;
    mercadolibre?: Partial<Omit<ListingLifetimeConfig, 'marketplaceConfig'>>;
    amazon?: Partial<Omit<ListingLifetimeConfig, 'marketplaceConfig'>>;
  };
}

class ListingLifetimeService {
  private readonly DEFAULT_CONFIG: ListingLifetimeConfig = {
    mode: 'manual',
    minLearningDays: 7,
    maxLifetimeDaysDefault: 30,
    minRoiPercent: 10,
    minDailyProfitUsd: 0.5,
    minMarginPercent: 20,
  };

  /**
   * Obtener configuración del optimizador
   */
  async getConfig(): Promise<ListingLifetimeConfig> {
    try {
      const config = await prisma.systemConfig.findFirst({
        where: { key: 'listing_lifetime_optimizer' }
      });

      if (config && config.value) {
        const parsed = JSON.parse(config.value) as ListingLifetimeConfig;
        return { ...this.DEFAULT_CONFIG, ...parsed };
      }

      return this.DEFAULT_CONFIG;
    } catch (error) {
      logger.error('Error getting listing lifetime config', { error });
      return this.DEFAULT_CONFIG;
    }
  }

  /**
   * Guardar configuración del optimizador
   */
  async setConfig(config: Partial<ListingLifetimeConfig>): Promise<void> {
    try {
      const currentConfig = await this.getConfig();
      const updatedConfig = { ...currentConfig, ...config };

      await prisma.systemConfig.upsert({
        where: { key: 'listing_lifetime_optimizer' },
        update: { value: JSON.stringify(updatedConfig) },
        create: {
          key: 'listing_lifetime_optimizer',
          value: JSON.stringify(updatedConfig)
        }
      });

      logger.info('Listing lifetime config updated', { config: updatedConfig });
    } catch (error) {
      logger.error('Error setting listing lifetime config', { error });
      throw new Error('Failed to update listing lifetime configuration');
    }
  }

  /**
   * Calcular métricas de un listing
   */
  async calculateMetrics(
    userId: number,
    listingId: number,
    marketplace: string
  ): Promise<ListingLifetimeMetrics> {
    try {
      const listing = await prisma.marketplaceListing.findFirst({
        where: {
          id: listingId,
          userId,
          marketplace
        },
        include: {
          product: {
            include: {
              sales: {
                where: {
                  marketplace,
                  status: {
                    in: ['DELIVERED', 'COMPLETED', 'SHIPPED', 'PROCESSING']
                  }
                }
              }
            }
          }
        }
      });

      if (!listing || !listing.publishedAt) {
        throw new Error('Listing not found or not published');
      }

      const product = listing.product;
      const now = new Date();
      const listingAgeDays = Math.max(
        1,
        Math.ceil((now.getTime() - listing.publishedAt.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Calcular ventas y ganancias
      const sales = product.sales || [];
      const totalSalesUnits = sales.length;
      
      const totalNetProfit = sales.reduce((sum, sale) => {
        return sum + toNumber(sale.netProfit || 0);
      }, 0);

      const avgDailyProfit = listingAgeDays > 0 ? totalNetProfit / listingAgeDays : 0;

      // Calcular ROI
      const productCost = toNumber(product.aliexpressPrice || 0);
      const roiPercent = productCost > 0 
        ? (totalNetProfit / productCost) * 100 
        : 0;

      // Capital bloqueado (costo del producto si no hay ventas suficientes)
      const capitalLocked = productCost;

      // Stock turnover (unidades vendidas por día)
      const stockTurnover = listingAgeDays > 0 ? totalSalesUnits / listingAgeDays : 0;

      // TODO: Obtener views/clicks desde marketplace APIs si están disponibles
      // Por ahora, estos campos quedan undefined

      return {
        listingAgeDays,
        totalSalesUnits,
        totalNetProfit,
        avgDailyProfit,
        roiPercent,
        stockTurnover,
        capitalLocked,
      };
    } catch (error) {
      logger.error('Error calculating listing metrics', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        listingId,
        marketplace
      });
      throw error;
    }
  }

  /**
   * Evaluar listing y tomar decisión
   */
  async evaluateListing(
    userId: number,
    listingId: number,
    marketplace: string
  ): Promise<ListingLifetimeDecision> {
    try {
      const config = await this.getConfig();
      const metrics = await this.calculateMetrics(userId, listingId, marketplace);

      // Obtener configuración específica del marketplace si existe
      const marketplaceSpecificConfig = config.marketplaceConfig?.[marketplace as keyof typeof config.marketplaceConfig];
      const minLearningDays = marketplaceSpecificConfig?.minLearningDays || config.minLearningDays;
      const maxLifetimeDays = marketplaceSpecificConfig?.maxLifetimeDaysDefault || config.maxLifetimeDaysDefault;
      const minRoiPercent = marketplaceSpecificConfig?.minRoiPercent || config.minRoiPercent;
      const minDailyProfit = marketplaceSpecificConfig?.minDailyProfitUsd || config.minDailyProfitUsd;

      // Período mínimo de aprendizaje
      if (metrics.listingAgeDays < minLearningDays) {
        return {
          mode: 'KEEP',
          recommendedDaysToReview: minLearningDays - metrics.listingAgeDays,
          recommendedMaxLifetime: maxLifetimeDays,
          reason: `Período de aprendizaje activo. El listing tiene ${metrics.listingAgeDays} días publicados. Se recomienda esperar al menos ${minLearningDays} días antes de evaluar.`,
          confidence: 0.7
        };
      }

      // Evaluar según métricas
      let mode: ListingLifetimeMode = 'KEEP';
      let reason = '';
      let confidence = 0.5;
      let recommendedDaysToReview = 7;
      let recommendedMaxLifetime = maxLifetimeDays;

      // Caso 1: Sin ventas
      if (metrics.totalSalesUnits === 0) {
        // Si el listing es muy nuevo, dar más tiempo
        if (metrics.listingAgeDays < minLearningDays * 2) {
          mode = 'KEEP';
          reason = `Sin ventas aún después de ${metrics.listingAgeDays} días. Se recomienda esperar hasta ${minLearningDays * 2} días antes de tomar acción.`;
          recommendedDaysToReview = (minLearningDays * 2) - metrics.listingAgeDays;
          confidence = 0.6;
        } else {
          // Sin ventas después del período de aprendizaje extendido
          mode = 'UNPUBLISH';
          reason = `Sin ventas después de ${metrics.listingAgeDays} días. No hay demanda detectada. Se recomienda despublicar para liberar capital.`;
          recommendedDaysToReview = 0;
          recommendedMaxLifetime = metrics.listingAgeDays;
          confidence = 0.8;
        }
      }
      // Caso 2: Con ventas pero bajo rendimiento
      else if (metrics.totalSalesUnits > 0) {
        // ROI bajo
        if (metrics.roiPercent < minRoiPercent) {
          mode = 'IMPROVE';
          reason = `ROI bajo (${metrics.roiPercent.toFixed(1)}% vs. mínimo ${minRoiPercent}%). Se recomienda ajustar precio, mejorar título/descripción o revisar competencia.`;
          recommendedDaysToReview = 3;
          confidence = 0.75;
        }
        // Ganancia diaria baja
        else if (metrics.avgDailyProfit < minDailyProfit) {
          mode = 'IMPROVE';
          reason = `Ganancia diaria baja ($${metrics.avgDailyProfit.toFixed(2)}/día vs. mínimo $${minDailyProfit}/día). Considera optimizar precio o contenido.`;
          recommendedDaysToReview = 5;
          confidence = 0.7;
        }
        // Rendimiento bueno
        else if (metrics.roiPercent >= minRoiPercent * 1.5 && metrics.avgDailyProfit >= minDailyProfit * 2) {
          mode = 'KEEP';
          reason = `Rendimiento excelente: ROI ${metrics.roiPercent.toFixed(1)}%, ganancia diaria $${metrics.avgDailyProfit.toFixed(2)}. Se recomienda mantener y extender tiempo de publicación.`;
          recommendedDaysToReview = 14;
          recommendedMaxLifetime = Math.max(maxLifetimeDays, metrics.listingAgeDays + 30);
          confidence = 0.9;
        }
        // Rendimiento aceptable
        else {
          mode = 'KEEP';
          reason = `Rendimiento aceptable: ${metrics.totalSalesUnits} ventas, ROI ${metrics.roiPercent.toFixed(1)}%, ganancia diaria $${metrics.avgDailyProfit.toFixed(2)}. Mantener publicación.`;
          recommendedDaysToReview = 7;
          confidence = 0.8;
        }
      }

      // Ajustar confianza según cantidad de datos
      if (metrics.totalSalesUnits > 0) {
        confidence = Math.min(0.95, confidence + (metrics.totalSalesUnits * 0.05));
      }

      return {
        mode,
        recommendedDaysToReview,
        recommendedMaxLifetime,
        reason,
        confidence
      };
    } catch (error) {
      logger.error('Error evaluating listing', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        listingId,
        marketplace
      });
      
      // Retornar decisión conservadora en caso de error
      return {
        mode: 'KEEP',
        recommendedDaysToReview: 7,
        recommendedMaxLifetime: 30,
        reason: 'Error al evaluar listing. Se recomienda mantener publicación y revisar manualmente.',
        confidence: 0.3
      };
    }
  }

  /**
   * Evaluar todos los listings publicados de un usuario
   */
  async evaluateAllUserListings(userId: number): Promise<Array<{
    listingId: number;
    productId: number;
    marketplace: string;
    decision: ListingLifetimeDecision;
    metrics: ListingLifetimeMetrics;
  }>> {
    try {
      const listings = await prisma.marketplaceListing.findMany({
        where: {
          userId,
          publishedAt: { not: null }
        },
        include: {
          product: true
        }
      });

      const results = await Promise.all(
        listings.map(async (listing) => {
          try {
            const metrics = await this.calculateMetrics(
              userId,
              listing.id,
              listing.marketplace
            );
            const decision = await this.evaluateListing(
              userId,
              listing.id,
              listing.marketplace
            );

            return {
              listingId: listing.id,
              productId: listing.productId,
              marketplace: listing.marketplace,
              decision,
              metrics
            };
          } catch (error) {
            logger.warn('Error evaluating listing', {
              error: error instanceof Error ? error.message : String(error),
              listingId: listing.id
            });
            return null;
          }
        })
      );

      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    } catch (error) {
      logger.error('Error evaluating all user listings', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return [];
    }
  }

  /**
   * Obtener decisión para un producto específico (puede tener múltiples listings)
   */
  async getProductDecision(
    userId: number,
    productId: number
  ): Promise<Array<{
    marketplace: string;
    listingId: number;
    decision: ListingLifetimeDecision;
    metrics: ListingLifetimeMetrics;
  }>> {
    try {
      const listings = await prisma.marketplaceListing.findMany({
        where: {
          userId,
          productId,
          publishedAt: { not: null }
        }
      });

      const results = await Promise.all(
        listings.map(async (listing) => {
          try {
            const metrics = await this.calculateMetrics(
              userId,
              listing.id,
              listing.marketplace
            );
            const decision = await this.evaluateListing(
              userId,
              listing.id,
              listing.marketplace
            );

            return {
              marketplace: listing.marketplace,
              listingId: listing.id,
              decision,
              metrics
            };
          } catch (error) {
            logger.warn('Error evaluating listing for product', {
              error: error instanceof Error ? error.message : String(error),
              listingId: listing.id,
              productId
            });
            return null;
          }
        })
      );

      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    } catch (error) {
      logger.error('Error getting product decision', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        productId
      });
      return [];
    }
  }
}

export const listingLifetimeService = new ListingLifetimeService();

